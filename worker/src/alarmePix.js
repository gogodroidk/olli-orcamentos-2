/**
 * ALARME DO PIX (AbacatePay) — duas perguntas por dia, com resposta em `webhook_events`:
 *
 *   1. `sem_pix_na_janela`  — nenhuma cobrança Pix PAGA (modo real) nos últimos N dias.
 *   2. `pago_sem_credito`   — o provedor diz PAID, mas a tabela não tem o consumo
 *                             (`webhook_events` origem 'abacate', status 'processado'):
 *                             o cliente pagou e o plano pode não ter ligado.
 *
 * ⚠ TRÊS ESTADOS, sempre (regra P0 do projeto). "Não consegui ler o provedor/o banco" é
 * `indisponivel` — NUNCA "sem Pix" e NUNCA "tudo certo". Só `ok` quando as DUAS leituras
 * deram certo e nada divergiu.
 *
 * Só LÊ (GET na AbacatePay, GET/POST em `webhook_events`). Não cria cobrança, não
 * credita, não muda plano. Cobrança `devMode` não conta como pagamento real.
 *
 * Saída: uma linha por dia em `webhook_events` (origem 'alarme_pix', event_id AAAA-MM-DD):
 * status 'processado' = ok, 'falhou' = alerta ou indisponível, com os códigos em `erro`.
 * Consulta: select * from webhook_events where origem='alarme_pix' order by recebido_em desc.
 * Só números e códigos: nada de id de cobrança, e-mail ou valor por cliente.
 */
import { marcarEvento, reivindicarEvento } from './webhookEvents.js';

export const ORIGEM_ALARME_PIX = 'alarme_pix';
export const ORIGEM_CONSUMO_PIX = 'abacate';
export const DIAS_SEM_PIX_PADRAO = 7;
/** Folga para o webhook/polling creditar antes de chamar de divergência. */
export const FOLGA_CREDITO_MS = 15 * 60 * 1000;
/** Hora do dia (UTC) em que o cron diário roda o alarme: 11:23 UTC = 08:23 em Brasília. */
export const HORA_UTC_ALARME = 11;
export const MINUTO_UTC_ALARME = 23;

const ABACATE_API = 'https://api.abacatepay.com/v2';

/** Está na hora do alarme diário? (o cron do Play dispara de 20 em 20 min) */
export function horaDoAlarmePix(quando) {
  const d = quando instanceof Date ? quando : new Date(quando);
  return d.getUTCHours() === HORA_UTC_ALARME && d.getUTCMinutes() === MINUTO_UTC_ALARME;
}

/** `AAAA-MM-DD` no fuso de Brasília (a AbacatePay interpreta startDate em America/Sao_Paulo). */
export function dataBrasilia(quando) {
  const d = quando instanceof Date ? quando : new Date(quando);
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Decisão pura. Entradas:
 *   provedor: { estado:'ok'|'indisponivel', pagas:[{id, devMode, criadoEm}] }
 *   banco:    { estado:'ok'|'indisponivel', consumidos:Set<string> }  (ids já consumidos)
 * Saída: { estado:'ok'|'alerta'|'indisponivel', codigos:string[], pagasReais, semCredito }
 */
export function avaliarAlarmePix({ agora, diasSemPix = DIAS_SEM_PIX_PADRAO, provedor, banco }) {
  const t = agora instanceof Date ? agora.getTime() : new Date(agora).getTime();
  if (provedor?.estado !== 'ok') {
    return { estado: 'indisponivel', codigos: ['provedor_indisponivel'], pagasReais: null, semCredito: null };
  }
  const reais = (provedor.pagas || []).filter((p) => p && p.id && p.devMode !== true);
  const codigos = [];
  if (reais.length === 0) codigos.push('sem_pix_na_janela');

  let semCredito = null;
  if (reais.length > 0) {
    if (banco?.estado !== 'ok') {
      return { estado: 'indisponivel', codigos: ['banco_indisponivel'], pagasReais: reais.length, semCredito: null };
    }
    const maduras = reais.filter((p) => {
      const criado = p.criadoEm ? new Date(p.criadoEm).getTime() : NaN;
      // Sem data legível NÃO é "recente": conta como madura (melhor alarmar que calar).
      return !Number.isFinite(criado) || t - criado >= FOLGA_CREDITO_MS;
    });
    semCredito = maduras.filter((p) => !banco.consumidos.has(p.id)).length;
    if (semCredito > 0) codigos.push('pago_sem_credito');
  }
  return { estado: codigos.length ? 'alerta' : 'ok', codigos, pagasReais: reais.length, semCredito, diasSemPix };
}

/** Lê as cobranças PAID da janela. `indisponivel` em qualquer falha (nunca lista vazia fingida). */
export async function lerPagasDoProvedor(env, { agora, diasSemPix = DIAS_SEM_PIX_PADRAO }) {
  const chave = typeof env?.ABACATEPAY_API_KEY === 'string' ? env.ABACATEPAY_API_KEY.trim() : '';
  if (!chave) return { estado: 'indisponivel', pagas: [] };
  const inicio = dataBrasilia(new Date(agora.getTime() - diasSemPix * 864e5));
  try {
    const r = await fetch(`${ABACATE_API}/transparents/list?status=PAID&limit=100&startDate=${inicio}`, {
      headers: { Authorization: `Bearer ${chave}` },
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.error || !Array.isArray(j.data)) return { estado: 'indisponivel', pagas: [] };
    return {
      estado: 'ok',
      pagas: j.data.map((p) => ({ id: p.id, devMode: p.devMode === true, criadoEm: p.createdAt || p.created_at || null })),
    };
  } catch {
    return { estado: 'indisponivel', pagas: [] };
  }
}

/** Quais destes ids já têm o consumo gravado (status 'processado')? */
export async function lerConsumidos(env, ids) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return { estado: 'indisponivel', consumidos: new Set() };
  if (!ids.length) return { estado: 'ok', consumidos: new Set() };
  try {
    const lista = ids.map((i) => `"${String(i).replace(/[^A-Za-z0-9_-]/g, '')}"`).join(',');
    const url =
      `${env.SUPABASE_URL}/rest/v1/webhook_events?origem=eq.${ORIGEM_CONSUMO_PIX}` +
      `&status=eq.processado&event_id=in.(${encodeURIComponent(lista)})&select=event_id`;
    const r = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!r.ok) return { estado: 'indisponivel', consumidos: new Set() };
    const linhas = await r.json();
    if (!Array.isArray(linhas)) return { estado: 'indisponivel', consumidos: new Set() };
    return { estado: 'ok', consumidos: new Set(linhas.map((l) => l.event_id)) };
  } catch {
    return { estado: 'indisponivel', consumidos: new Set() };
  }
}

/** Roda o alarme inteiro e grava a linha do dia. Nunca lança. */
export async function rodarAlarmePix(env, { agora = new Date(), diasSemPix = DIAS_SEM_PIX_PADRAO } = {}) {
  const quando = agora instanceof Date ? agora : new Date(agora);
  let resultado;
  try {
    const provedor = await lerPagasDoProvedor(env, { agora: quando, diasSemPix });
    const reais = provedor.pagas.filter((p) => p.id && !p.devMode).map((p) => p.id);
    const banco = provedor.estado === 'ok' ? await lerConsumidos(env, reais) : { estado: 'ok', consumidos: new Set() };
    resultado = avaliarAlarmePix({ agora: quando, diasSemPix, provedor, banco });
  } catch {
    resultado = { estado: 'indisponivel', codigos: ['excecao'], pagasReais: null, semCredito: null };
  }
  try {
    const eventId = dataBrasilia(quando);
    const payload = {
      estado: resultado.estado,
      codigos: resultado.codigos,
      pagas_reais: resultado.pagasReais,
      sem_credito: resultado.semCredito,
      dias: diasSemPix,
    };
    await reivindicarEvento(env, { origem: ORIGEM_ALARME_PIX, eventId, tipo: 'diario', payload });
    await marcarEvento(env, {
      origem: ORIGEM_ALARME_PIX,
      eventId,
      status: resultado.estado === 'ok' ? 'processado' : 'falhou',
      erro: resultado.estado === 'ok' ? undefined : resultado.codigos.join(','),
      payload,
    });
  } catch {
    /* melhor esforço: a linha é a trilha, não o trabalho */
  }
  if (resultado.estado !== 'ok') {
    console.error('[olli-alarme-pix]', JSON.stringify({ estado: resultado.estado, codigos: resultado.codigos }));
  }
  return resultado;
}
