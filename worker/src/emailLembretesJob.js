/**
 * Rodada agendada de LEMBRETES por e-mail: seleciona candidatos e enfileira na
 * mesma outbox das boas-vindas (quem envia é o consumer, no minuto seguinte).
 *
 * Portões, todos fail-closed:
 *   1. EMAIL_LEMBRETES_MODE = "production" (staging e qualquer outro valor = off);
 *   2. WELCOME_DISPATCH_MODE = "production" — sem dispatch real, não acumula fila;
 *   3. hora cheia entre 8h e 20h de Brasília (uma rodada por hora);
 *   4. link de descadastro configurado (URL + chave) — lembrete sem "parar de
 *      receber" não sai;
 *   5. tetos: por rodada (EMAIL_LEMBRETES_MAX_POR_RODADA, padrão 3) e diário
 *      global (EMAIL_LEMBRETES_TETO_DIARIO, padrão 40, conferido no banco).
 *
 * Log só com contagens e motivos — nunca id de conta, e-mail ou nome.
 */

import { PRECO_PRO, reais } from '../../src/services/precosPlanos.ts';
import { chamarRpcServico } from './emailRpc.js';
import { chaveDescadastro, EMAIL_DESCADASTRO_PATH } from './emailDescadastro.js';
import { rodadaDeSelecao, selecionarPedidos } from './emailLembretesPolicy.js';

export const EMAIL_LEMBRETES_JOB_VERSION = '2026-09-29.v1';
const LIMITE_CANDIDATOS = 50;

function texto(valor, limite) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite) : '';
}

function inteiroLimitado(valor, fallback, min, max) {
  const parsed = Number.parseInt(String(valor ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function resumo(valor) {
  return Object.freeze({ version: EMAIL_LEMBRETES_JOB_VERSION, ...valor });
}

function descadastroUrlValida(valor) {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && url.pathname === EMAIL_DESCADASTRO_PATH && !url.username && !url.password;
  } catch {
    return false;
  }
}

export async function processarLembretesEmail(env, dependencias = {}) {
  const modo = texto(env?.EMAIL_LEMBRETES_MODE, 20).toLowerCase() === 'production' ? 'production' : 'off';
  if (modo === 'off') return resumo({ mode: 'off', motivo: 'desligado', candidatos: 0, enfileirados: 0 });
  if (texto(env?.WELCOME_DISPATCH_MODE, 20).toLowerCase() !== 'production') {
    return resumo({ mode: modo, motivo: 'dispatch_nao_production', candidatos: 0, enfileirados: 0 });
  }

  const now = dependencias.now || (() => new Date());
  const fetchImpl = dependencias.fetchImpl || fetch;
  const agora = now();
  if (!rodadaDeSelecao(agora)) return resumo({ mode: modo, motivo: 'fora_da_rodada', candidatos: 0, enfileirados: 0 });

  const supabaseUrl = texto(env?.SUPABASE_URL, 2048).replace(/\/+$/, '');
  const serviceRoleKey = texto(env?.SUPABASE_SERVICE_ROLE_KEY, 4096);
  if (!/^https:\/\/[^/]+/.test(supabaseUrl) || serviceRoleKey.length < 20) {
    return resumo({ mode: modo, motivo: 'supabase_nao_configurado', candidatos: 0, enfileirados: 0 });
  }
  if (!descadastroUrlValida(texto(env?.EMAIL_DESCADASTRO_URL, 2048)) || !(await chaveDescadastro(env))) {
    return resumo({ mode: modo, motivo: 'descadastro_nao_configurado', candidatos: 0, enfileirados: 0 });
  }

  const config = { supabaseUrl, serviceRoleKey };
  const tetoRodada = inteiroLimitado(env?.EMAIL_LEMBRETES_MAX_POR_RODADA, 3, 1, 10);
  const tetoDiario = inteiroLimitado(env?.EMAIL_LEMBRETES_TETO_DIARIO, 40, 1, 500);
  const ativacaoMaxDias = inteiroLimitado(env?.EMAIL_LEMBRETES_ATIVACAO_MAX_DIAS, 30, 7, 60);
  const agoraIso = agora.toISOString();

  try {
    const linhas = await chamarRpcServico(config, fetchImpl, 'listar_candidatos_lembrete_email', {
      p_now: agoraIso,
      p_ativacao_max_dias: ativacaoMaxDias,
      p_limit: LIMITE_CANDIDATOS,
    });
    if (!Array.isArray(linhas)) throw Object.assign(new Error('candidatos_resposta_invalida'), { codigo: 'candidatos_resposta_invalida' });
    const candidatos = linhas.map((linha) => (linha && typeof linha === 'object' ? linha.candidato : null));

    const { pedidos, motivos } = selecionarPedidos(candidatos, {
      agora,
      precoProMensal: reais(PRECO_PRO.mensalCentavos),
      ativacaoMaxDias,
      tetoRodada,
    });

    const banco = {};
    let enfileirados = 0;
    for (const p of pedidos) {
      const r = await chamarRpcServico(config, fetchImpl, 'enqueue_lembrete_email', {
        p_user_id: p.userId,
        p_template: p.template,
        p_template_version: p.templateVersion,
        p_purpose: p.purpose,
        p_idempotency_key: p.idempotencyKey,
        p_template_dados: p.dados,
        p_teto_diario: tetoDiario,
        p_now: agoraIso,
      });
      const motivo = r && typeof r.motivo === 'string' ? r.motivo.replace(/[^a-z_]/g, '').slice(0, 40) : 'resposta_invalida';
      banco[motivo] = (banco[motivo] || 0) + 1;
      if (r && r.enfileirado === true) enfileirados += 1;
      if (motivo === 'teto_diario') break;
    }

    const saida = resumo({ mode: modo, motivo: 'ok', candidatos: candidatos.length, enfileirados, decisoes: motivos, banco });
    console.log(JSON.stringify({ event: 'email_lembretes_rodada', ...saida }));
    return saida;
  } catch (erro) {
    const codigo = texto(erro?.codigo || erro?.message, 60).replace(/[^a-zA-Z0-9._:-]/g, '_') || 'erro';
    console.error(JSON.stringify({ event: 'email_lembretes_rodada_falhou', code: codigo }));
    return resumo({ mode: modo, motivo: 'falhou', codigo, candidatos: 0, enfileirados: 0 });
  }
}
