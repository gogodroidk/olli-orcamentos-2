/**
 * Rodada agendada do MOTOR DE CONTRATO RECORRENTE: gera as visitas devidas (OS +
 * agendamento) de todos os contratos vigentes, mesmo que ninguém abra o app. É o
 * "nasce sozinha" do plano — o app e o painel também geram ao abrir; a chave única de
 * `contrato_visitas` e os ids determinísticos fazem as três fontes convergirem sem
 * duplicar (ver `src/utils/contratoRecorrenteGeracao.ts`, a MESMA regra).
 *
 * Portões, todos fail-closed:
 *   1. CONTRATOS_MOTOR_MODE = "production" (qualquer outro valor = off). Liga-se só
 *      DEPOIS da migration 20260930130500 (sem ela, a leitura falha e a rodada para);
 *   2. janela: 06:05, 12:05 e 18:05 de Brasília (minuto 5, longe da hora cheia dos
 *      lembretes de e-mail);
 *   3. Supabase configurado (URL https + service_role);
 *   4. tetos: CONTRATOS_MOTOR_MAX_CONTRATOS lidos por rodada (padrão 200) e
 *      CONTRATOS_MOTOR_MAX_VISITAS escritas (padrão 10 — cada visita custa ~4
 *      requisições; o resto fica para a rodada seguinte, contado em `adiadas`).
 *
 * SERVICE_ROLE ignora RLS, então o tenant NÃO é decidido aqui: cada linha nasce com o
 * `user_id` do PRÓPRIO contrato (o dono) — nunca de outro lugar. `criado_por` fica
 * nulo (quem criou foi o sistema).
 *
 * Log só com contagens — nunca id de conta, cliente, endereço ou valor.
 */

import { linhaParaContrato } from '../../src/utils/contratoRecorrente.ts';
import { gerarVisitasDosContratos } from '../../src/utils/contratoRecorrenteGeracao.ts';
import { lerJsonLimitado, sinalTimeout } from './emailRpc.js';

export const CONTRATOS_JOB_VERSION = '2026-09-30.v1';
/** Horas de Brasília (UTC−3 fixo) em que a rodada roda, sempre no minuto 5. */
export const CONTRATOS_HORAS_BRASILIA = [6, 12, 18];
const MINUTO_DA_RODADA = 5;
const LIMITE_BYTES = 2 * 1024 * 1024;

function texto(valor, limite) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite) : '';
}

function inteiroLimitado(valor, fallback, min, max) {
  const parsed = Number.parseInt(String(valor ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function resumo(valor) {
  return Object.freeze({ version: CONTRATOS_JOB_VERSION, ...valor });
}

export function configContratos(env) {
  return Object.freeze({
    maxContratos: inteiroLimitado(env?.CONTRATOS_MOTOR_MAX_CONTRATOS, 200, 1, 1000),
    maxVisitas: inteiroLimitado(env?.CONTRATOS_MOTOR_MAX_VISITAS, 10, 1, 60),
  });
}

/** A rodada roda neste instante? (hora de Brasília ∈ CONTRATOS_HORAS_BRASILIA, minuto 5) */
export function ehHoraDaRodada(agora) {
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return brasilia.getUTCMinutes() === MINUTO_DA_RODADA && CONTRATOS_HORAS_BRASILIA.includes(brasilia.getUTCHours());
}

/** Cliente PostgREST mínimo com service_role. Lança `supabase_<status>` sem corpo nem chave. */
function criarRest(banco, fetchImpl) {
  const cabecalhos = (extra = {}) => ({
    apikey: banco.serviceRoleKey,
    Authorization: `Bearer ${banco.serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extra,
  });
  return async function rest(caminho, { method = 'GET', body, prefer } = {}) {
    const response = await fetchImpl(`${banco.supabaseUrl}/rest/v1/${caminho}`, {
      method,
      headers: cabecalhos(prefer ? { Prefer: prefer } : {}),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: sinalTimeout(10_000),
    });
    const payload = await lerJsonLimitado(response, LIMITE_BYTES);
    if (!response.ok) {
      throw Object.assign(new Error(`supabase_${response.status}`), { codigo: `supabase_${response.status}` });
    }
    return payload;
  };
}

/** Lista PostgREST `in.(...)` com cada id entre aspas (ids têm `_`, `-`). */
function listaIn(ids) {
  return `(${ids.map((id) => `"${String(id).replace(/["\\]/g, '')}"`).join(',')})`;
}

/** Porta de escrita da geração sobre o PostgREST com service_role. */
export function portaServico(rest) {
  const inserirSeNaoExiste = async (tabela, linha) => {
    const r = await rest(`${tabela}?on_conflict=id`, {
      method: 'POST',
      body: [{ criado_por: null, ...linha }],
      prefer: 'resolution=ignore-duplicates,return=representation',
    });
    return Array.isArray(r) && r.length > 0;
  };
  return {
    async reservas(contratoIds) {
      const saida = [];
      for (let i = 0; i < contratoIds.length; i += 50) {
        const lote = contratoIds.slice(i, i + 50);
        const r = await rest(
          `contrato_visitas?select=id,contrato_id,periodo,ordem_criada_em&contrato_id=in.${encodeURIComponent(listaIn(lote))}`,
        );
        if (!Array.isArray(r)) throw Object.assign(new Error('reservas_invalidas'), { codigo: 'reservas_invalidas' });
        for (const x of r) {
          saida.push({ id: x.id, contratoId: x.contrato_id, periodo: x.periodo, ordemCriadaEm: x.ordem_criada_em ?? null });
        }
      }
      return saida;
    },
    reservar: (linha) => inserirSeNaoExiste('contrato_visitas', linha),
    async inserirOrdem(linha) {
      await inserirSeNaoExiste('ordens_servico', linha);
    },
    async inserirAgendamento(linha) {
      await inserirSeNaoExiste('agendamentos', linha);
    },
    async confirmar(reservaId, quando) {
      await rest(`contrato_visitas?id=eq.${encodeURIComponent(reservaId)}`, {
        method: 'PATCH',
        body: { ordem_criada_em: quando, atualizado_em: quando },
        prefer: 'return=minimal',
      });
    },
    async proximoSequencialOs(userId) {
      const r = await rest(
        `ordens_servico?select=numero&user_id=eq.${encodeURIComponent(userId)}&order=criado_em.desc&limit=1000`,
      );
      const linhas = Array.isArray(r) ? r : [];
      const maior = linhas.reduce((max, l) => {
        const m = /(\d+)\s*$/.exec(String(l?.numero ?? ''));
        return m ? Math.max(max, Number(m[1])) : max;
      }, 0);
      return maior + 1;
    },
  };
}

/**
 * O motor está ligado neste ambiente? Só o valor exato "production" liga (fail-closed).
 * Exposto também no GET / público (`contratos_motor: on|off`) para a tela de Contratos
 * dizer a verdade sobre a geração automática em vez de prometer o que está desligado.
 */
export function modoMotorContratos(env) {
  return texto(env?.CONTRATOS_MOTOR_MODE, 20).toLowerCase() === 'production' ? 'production' : 'off';
}

export async function processarContratos(env, dependencias = {}) {
  const modo = modoMotorContratos(env);
  if (modo === 'off') return resumo({ mode: 'off', motivo: 'desligado', contratos: 0, criadas: 0 });

  const now = dependencias.now || (() => new Date());
  const fetchImpl = dependencias.fetchImpl || fetch;
  const agora = now();
  if (!ehHoraDaRodada(agora)) return resumo({ mode: modo, motivo: 'fora_da_rodada', contratos: 0, criadas: 0 });

  const supabaseUrl = texto(env?.SUPABASE_URL, 2048).replace(/\/+$/, '');
  const serviceRoleKey = texto(env?.SUPABASE_SERVICE_ROLE_KEY, 4096);
  if (!/^https:\/\/[^/]+/.test(supabaseUrl) || serviceRoleKey.length < 20) {
    return resumo({ mode: modo, motivo: 'supabase_nao_configurado', contratos: 0, criadas: 0 });
  }

  const cfg = configContratos(env);
  const rest = criarRest({ supabaseUrl, serviceRoleKey }, fetchImpl);
  try {
    const linhas = await rest(
      `service_contracts?select=*&excluido_em=is.null&situacao=eq.vigente&periodicidade=not.is.null&order=criado_em.asc&limit=${cfg.maxContratos}`,
    );
    if (!Array.isArray(linhas)) throw Object.assign(new Error('contratos_invalidos'), { codigo: 'contratos_invalidos' });
    // Sem user_id não há tenant: a linha é descartada (nunca "adivinhamos" o dono).
    const contratos = linhas.filter((l) => l && typeof l.user_id === 'string').map(linhaParaContrato);
    const r = await gerarVisitasDosContratos(portaServico(rest), contratos, { agora, limite: cfg.maxVisitas });
    const saida = resumo({
      mode: modo,
      motivo: 'ok',
      contratos: contratos.length,
      truncado: linhas.length >= cfg.maxContratos,
      criadas: r.criadas,
      recuperadas: r.recuperadas,
      jaExistiam: r.jaExistiam,
      falhas: r.falhas,
      adiadas: r.adiadas,
    });
    console.log(JSON.stringify({ event: 'contratos_motor_rodada', ...saida }));
    return saida;
  } catch (erro) {
    const codigo = texto(erro?.codigo || erro?.message, 60).replace(/[^a-zA-Z0-9._:-]/g, '_') || 'erro';
    console.error(JSON.stringify({ event: 'contratos_motor_rodada_falhou', code: codigo }));
    return resumo({ mode: modo, motivo: 'falhou', codigo, contratos: 0, criadas: 0 });
  }
}
