/**
 * Rodada agendada do RESUMO DIÁRIO "dinheiro parado": seleciona contas, calcula o
 * resumo de cada uma com a regra do painel (`resumoDinheiroPolicy.js` →
 * `src/services/radarDinheiro.ts`) e enfileira na MESMA outbox dos lembretes (quem
 * envia é o consumer, no minuto seguinte, com o link "parar de receber o resumo").
 *
 * Portões, todos fail-closed:
 *   1. EMAIL_RESUMO_MODE = "production" (qualquer outro valor = off);
 *   2. WELCOME_DISPATCH_MODE = "production" — sem dispatch real, não acumula fila;
 *   3. janela: 7h00–7h50 de Brasília, de 10 em 10 minutos, segunda a sábado;
 *   4. link de descadastro configurado (URL + chave) — resumo sem "parar de
 *      receber" não sai;
 *   5. tetos: 1 por conta por dia (idempotência), EMAIL_RESUMO_MAX_SEMANA por conta
 *      em 7 dias (padrão 3), EMAIL_RESUMO_INTERVALO_MIN_HORAS entre dois resumos
 *      (padrão 44), EMAIL_RESUMO_MAX_POR_RODADA (padrão 8) e EMAIL_RESUMO_TETO_DIARIO
 *      global (padrão 100, conferido no banco);
 *   6. nada acionável ou lista truncada = nenhum e-mail.
 *
 * Custo por rodada (limite de subrequests do Worker): 1 listagem + até
 * EMAIL_RESUMO_MAX_AVALIACOES leituras de conta (padrão 15) + até 8 enfileiramentos.
 * Cada conta cai em UMA das 6 rodadas do dia (sorteio por conta + dia no banco).
 *
 * Log só com contagens e motivos — nunca id de conta, e-mail, nome ou valor.
 */

import { chamarRpcServico } from './emailRpc.js';
import { chaveDescadastro, EMAIL_DESCADASTRO_PATH } from './emailDescadastro.js';
import { decidirResumo, RESUMO_RODADAS, rodadaDoResumo } from './resumoDinheiroPolicy.js';

export const RESUMO_DINHEIRO_JOB_VERSION = '2026-09-30.v1';
/** Teto de linhas por tabela lido do banco para UMA conta (acima disso: não sei). */
const MAX_LINHAS_POR_TABELA = 2000;
/** Teto de leitura da resposta de uma conta (2000 linhas × ~300 B cabem folgados). */
const LIMITE_BYTES_DADOS = 2 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function texto(valor, limite) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite) : '';
}

function inteiroLimitado(valor, fallback, min, max) {
  const parsed = Number.parseInt(String(valor ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function resumo(valor) {
  return Object.freeze({ version: RESUMO_DINHEIRO_JOB_VERSION, ...valor });
}

function descadastroUrlValida(valor) {
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && url.pathname === EMAIL_DESCADASTRO_PATH && !url.username && !url.password;
  } catch {
    return false;
  }
}

function contar(mapa, motivo) {
  mapa[motivo] = (mapa[motivo] || 0) + 1;
}

/** Configuração lida do env (exportada para o teste conferir os padrões e os limites). */
export function configResumo(env) {
  return Object.freeze({
    maxSemana: inteiroLimitado(env?.EMAIL_RESUMO_MAX_SEMANA, 3, 1, 7),
    intervaloMinHoras: inteiroLimitado(env?.EMAIL_RESUMO_INTERVALO_MIN_HORAS, 44, 20, 168),
    tetoRodada: inteiroLimitado(env?.EMAIL_RESUMO_MAX_POR_RODADA, 8, 1, 20),
    maxAvaliacoes: inteiroLimitado(env?.EMAIL_RESUMO_MAX_AVALIACOES, 15, 1, 30),
    tetoDiario: inteiroLimitado(env?.EMAIL_RESUMO_TETO_DIARIO, 100, 1, 1000),
  });
}

export async function processarResumoDinheiro(env, dependencias = {}) {
  const modo = texto(env?.EMAIL_RESUMO_MODE, 20).toLowerCase() === 'production' ? 'production' : 'off';
  if (modo === 'off') return resumo({ mode: 'off', motivo: 'desligado', candidatos: 0, enfileirados: 0 });
  if (texto(env?.WELCOME_DISPATCH_MODE, 20).toLowerCase() !== 'production') {
    return resumo({ mode: modo, motivo: 'dispatch_nao_production', candidatos: 0, enfileirados: 0 });
  }

  const now = dependencias.now || (() => new Date());
  const fetchImpl = dependencias.fetchImpl || fetch;
  const agora = now();
  const rodada = rodadaDoResumo(agora);
  if (rodada === null) return resumo({ mode: modo, motivo: 'fora_da_rodada', candidatos: 0, enfileirados: 0 });

  const supabaseUrl = texto(env?.SUPABASE_URL, 2048).replace(/\/+$/, '');
  const serviceRoleKey = texto(env?.SUPABASE_SERVICE_ROLE_KEY, 4096);
  if (!/^https:\/\/[^/]+/.test(supabaseUrl) || serviceRoleKey.length < 20) {
    return resumo({ mode: modo, motivo: 'supabase_nao_configurado', candidatos: 0, enfileirados: 0 });
  }
  if (!descadastroUrlValida(texto(env?.EMAIL_DESCADASTRO_URL, 2048)) || !(await chaveDescadastro(env))) {
    return resumo({ mode: modo, motivo: 'descadastro_nao_configurado', candidatos: 0, enfileirados: 0 });
  }

  const banco = { supabaseUrl, serviceRoleKey };
  const cfg = configResumo(env);
  const agoraIso = agora.toISOString();

  try {
    const linhas = await chamarRpcServico(banco, fetchImpl, 'listar_candidatos_resumo_dinheiro', {
      p_now: agoraIso,
      p_max_semana: cfg.maxSemana,
      p_intervalo_min_horas: cfg.intervaloMinHoras,
      p_rodada: rodada,
      p_rodadas: RESUMO_RODADAS,
      p_limit: cfg.maxAvaliacoes,
    });
    if (!Array.isArray(linhas)) throw Object.assign(new Error('candidatos_resposta_invalida'), { codigo: 'candidatos_resposta_invalida' });

    const vistos = new Set();
    const candidatos = [];
    for (const linha of linhas) {
      const id = linha && typeof linha === 'object' ? linha.user_id : null;
      if (typeof id !== 'string' || !UUID_RE.test(id) || vistos.has(id)) continue;
      vistos.add(id);
      candidatos.push(id);
    }

    const decisoes = {};
    const respostas = {};
    let enfileirados = 0;
    let pararNoTeto = false;
    for (const userId of candidatos.slice(0, cfg.maxAvaliacoes)) {
      if (pararNoTeto) break;
      if (enfileirados >= cfg.tetoRodada) {
        contar(decisoes, 'teto_da_rodada');
        continue;
      }
      let dados;
      try {
        dados = await chamarRpcServico(
          banco,
          fetchImpl,
          'dados_resumo_dinheiro',
          { p_user_id: userId, p_max_linhas: MAX_LINHAS_POR_TABELA },
          { limiteBytes: LIMITE_BYTES_DADOS },
        );
      } catch {
        // Uma conta que não deu para ler não derruba a rodada: fica sem resumo hoje.
        contar(decisoes, 'dados_erro');
        continue;
      }
      const d = decidirResumo(userId, dados, { agora });
      contar(decisoes, d.motivo);
      if (!d.enfileirar) continue;

      const r = await chamarRpcServico(banco, fetchImpl, 'enqueue_resumo_dinheiro_email', {
        p_user_id: d.pedido.userId,
        p_idempotency_key: d.pedido.idempotencyKey,
        p_template_dados: d.pedido.dados,
        p_max_semana: cfg.maxSemana,
        p_intervalo_min_horas: cfg.intervaloMinHoras,
        p_teto_diario: cfg.tetoDiario,
        p_now: agoraIso,
      });
      const motivo = r && typeof r.motivo === 'string' ? r.motivo.replace(/[^a-z_]/g, '').slice(0, 40) : 'resposta_invalida';
      contar(respostas, motivo);
      if (r && r.enfileirado === true) enfileirados += 1;
      if (motivo === 'teto_diario') pararNoTeto = true;
    }

    const saida = resumo({
      mode: modo,
      motivo: 'ok',
      rodada,
      candidatos: candidatos.length,
      enfileirados,
      decisoes,
      banco: respostas,
    });
    console.log(JSON.stringify({ event: 'email_resumo_dinheiro_rodada', ...saida }));
    return saida;
  } catch (erro) {
    const codigo = texto(erro?.codigo || erro?.message, 60).replace(/[^a-zA-Z0-9._:-]/g, '_') || 'erro';
    console.error(JSON.stringify({ event: 'email_resumo_dinheiro_rodada_falhou', code: codigo }));
    return resumo({ mode: modo, motivo: 'falhou', codigo, candidatos: 0, enfileirados: 0 });
  }
}
