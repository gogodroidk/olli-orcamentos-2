/**
 * Rodada agendada de LEMBRETES por e-mail: seleciona candidatos e enfileira na
 * mesma outbox das boas-vindas (quem envia é o consumer, no minuto seguinte).
 *
 * Portões, todos fail-closed:
 *   1. EMAIL_LEMBRETES_MODE = "production" (staging e qualquer outro valor = off); o sufixo
 *      opcional limita QUAIS tipos saem: "production:ativacao,assinatura" (tipos: ativacao,
 *      assinatura, reengajamento; sufixo sem tipo conhecido = nenhum);
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
import { marcarEvento, reivindicarEvento } from './webhookEvents.js';
import { lerTiposPermitidos, rodadaDeSelecao, selecionarPedidos } from './emailLembretesPolicy.js';
import { selecionarNaoAbertos } from './orcamentoNaoAbertoPolicy.js';

export const EMAIL_LEMBRETES_JOB_VERSION = '2026-09-29.v1';
const LIMITE_CANDIDATOS = 50;
/**
 * Teto de leitura da lista de candidatos. O padrão do cliente RPC (32 KB) estourou em 06/10/2026
 * (40 contas = 34 KB → `resposta_grande`, régua parada em silêncio). Cada candidato pesa até ~1,1 KB,
 * então 50 cabem em ~55 KB; 128 KB dá folga sem abrir a porta para resposta sem limite.
 */
const LIMITE_BYTES_CANDIDATOS = 128 * 1024;

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

async function executarRodada(env, dependencias = {}) {
  // "production" = todos os tipos; "production:ativacao,..." = só os listados; qualquer outra coisa = off.
  const [baseModo, ...restoModo] = texto(env?.EMAIL_LEMBRETES_MODE, 80).toLowerCase().split(':');
  const modo = baseModo === 'production' ? 'production' : 'off';
  const tiposPermitidos = lerTiposPermitidos(restoModo.length > 0 ? restoModo.join(':') : undefined);
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
    }, { limiteBytes: LIMITE_BYTES_CANDIDATOS });
    if (!Array.isArray(linhas)) throw Object.assign(new Error('candidatos_resposta_invalida'), { codigo: 'candidatos_resposta_invalida' });
    const candidatos = linhas.map((linha) => (linha && typeof linha === 'object' ? linha.candidato : null));

    const { pedidos, motivos: motivosBase } = selecionarPedidos(candidatos, {
      agora,
      precoProMensal: reais(PRECO_PRO.mensalCentavos),
      ativacaoMaxDias,
      tetoRodada,
      tiposPermitidos,
    });

    const motivos = { ...motivosBase };
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

    // "Orçamento não aberto em 48 h" (Z-123): aviso ao PRESTADOR, nunca ao cliente. Só roda com o tipo
    // `nao_aberto` listado EXPLICITAMENTE no sufixo do MODE ("production" sozinho NÃO liga) e usa o que
    // sobrou do teto da rodada.
    let naoAbertos = 0;
    if (restoModo.length > 0 && tiposPermitidos.has('nao_aberto') && enfileirados < tetoRodada) {
      const lista = await chamarRpcServico(config, fetchImpl, 'listar_nao_abertos_email', {
        p_now: agoraIso,
        p_limit: LIMITE_CANDIDATOS,
      }, { limiteBytes: LIMITE_BYTES_CANDIDATOS });
      if (!Array.isArray(lista)) throw Object.assign(new Error('nao_abertos_resposta_invalida'), { codigo: 'nao_abertos_resposta_invalida' });
      const sel = selecionarNaoAbertos(lista.map((l) => (l && typeof l === 'object' ? l.candidato : null)), {
        agora,
        teto: tetoRodada - enfileirados,
      });
      for (const [m, n] of Object.entries(sel.motivos)) motivos[`nao_aberto_${m}`] = n;
      for (const p of sel.pedidos) {
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
        if (r && r.enfileirado === true) { enfileirados += 1; naoAbertos += 1; }
        if (motivo === 'teto_diario') break;
      }
    }

    const saida = resumo({ mode: modo, motivo: 'ok', candidatos: candidatos.length, enfileirados, naoAbertos, decisoes: motivos, banco });
    console.log(JSON.stringify({ event: 'email_lembretes_rodada', ...saida }));
    return saida;
  } catch (erro) {
    const codigo = texto(erro?.codigo || erro?.message, 60).replace(/[^a-zA-Z0-9._:-]/g, '_') || 'erro';
    console.error(JSON.stringify({ event: 'email_lembretes_rodada_falhou', code: codigo }));
    return resumo({ mode: modo, motivo: 'falhou', codigo, candidatos: 0, enfileirados: 0 });
  }
}

export const ORIGEM_BATIMENTO_LEMBRETES = 'lembretes_cron';
const ROTULO = /^[a-z0-9_:.-]{1,60}$/i;

/** Só números e rótulos curtos (nada de id de conta, e-mail ou nome): o que vai para a linha de batimento. */
export function resumoSeguroRodada(r) {
  const n = (v) => (Number.isFinite(v) ? v : null);
  const rotulo = (v) => (typeof v === 'string' && ROTULO.test(v) ? v : null);
  const contagens = (o) => {
    const saida = {};
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o).slice(0, 30)) if (ROTULO.test(k) && Number.isFinite(v)) saida[k] = v;
    }
    return saida;
  };
  return {
    modo: rotulo(r?.mode),
    motivo: rotulo(r?.motivo),
    codigo: rotulo(r?.codigo),
    candidatos: n(r?.candidatos),
    enfileirados: n(r?.enfileirados),
    decisoes: contagens(r?.decisoes),
    banco: contagens(r?.banco),
  };
}

/**
 * BATIMENTO da seleção de lembretes (07/10/2026): em 06/10 a rodada das 21:00 UTC não enfileirou
 * nada e não havia como saber por quê sem acesso aos logs do Cloudflare. Agora toda rodada REAL (hora
 * cheia, 8h–20h, modo ligado) deixa duas linhas em `webhook_events` (origem 'lembretes_cron'),
 * consultáveis por SQL: `ini|<hora>` ANTES de trabalhar e `fim|<hora>` DEPOIS, com contagens e o
 * motivo (ok, falhou, descadastro_nao_configurado...). Ini sem fim = a invocação morreu no meio.
 * Fora da hora cheia ou com o modo off não grava nada (nada de 1.440 linhas por dia). Melhor esforço:
 * falha de gravação não derruba nem atrasa a seleção.
 */
export async function processarLembretesEmail(env, dependencias = {}) {
  const modoLigado = texto(env?.EMAIL_LEMBRETES_MODE, 80).toLowerCase().split(':')[0] === 'production';
  const agora = (dependencias.now || (() => new Date()))();
  const ehRodada = modoLigado && rodadaDeSelecao(agora);
  const hora = ehRodada ? agora.toISOString().slice(0, 13) : '';
  if (ehRodada) {
    try {
      await reivindicarEvento(env, { origem: ORIGEM_BATIMENTO_LEMBRETES, eventId: `ini|${hora}`, tipo: 'cron', payload: null });
    } catch {
      /* melhor esforço */
    }
  }
  const resultado = await executarRodada(env, dependencias);
  if (ehRodada) {
    try {
      const resumo = resumoSeguroRodada(resultado);
      const eventId = `fim|${hora}`;
      await reivindicarEvento(env, { origem: ORIGEM_BATIMENTO_LEMBRETES, eventId, tipo: 'cron', payload: resumo });
      const falhou = resumo.motivo === 'falhou';
      await marcarEvento(env, { origem: ORIGEM_BATIMENTO_LEMBRETES, eventId, status: falhou ? 'falhou' : 'processado', erro: falhou ? resumo.codigo || 'falhou' : undefined });
      await marcarEvento(env, { origem: ORIGEM_BATIMENTO_LEMBRETES, eventId: `ini|${hora}`, status: 'processado' });
    } catch {
      /* melhor esforço */
    }
  }
  return resultado;
}
