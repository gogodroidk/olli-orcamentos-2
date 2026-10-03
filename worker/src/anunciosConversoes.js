/**
 * Conversões de anúncio pelo servidor — Meta Conversions API (CAPI).
 *
 * Por que no servidor também: o Pixel do navegador perde evento (adblock, aba
 * fechada logo após o cadastro, Safari). O servidor manda o MESMO evento com o MESMO
 * `event_id` e o Meta conta um só (deduplicação navegador × servidor).
 *
 *   CompleteRegistration  event_id 'cadastro-<user_id>'   = o do navegador
 *                          (web/src/lib/... → webapp/src/lib/marketing.ts)
 *   Subscribe             event_id 'assinatura-<user_id>' — só o servidor sabe que pagou
 *                          (funil_marcos 'pagou', que já descarta teste e fictício)
 *
 * QUEM ENTRA: só quem aceitou o aviso de cookies (`medicao_anuncios.consentimento =
 * 'sim'`) e não está em `funil_exclusoes` — o filtro mora no SQL
 * (`anuncios_conversoes_pendentes`, migration 20261005090000).
 *
 * LIGA/DESLIGA: o token vem do segredo `META_CAPI_TOKEN` ou, como o Workers Free já está
 * no teto de 64 variáveis, do Supabase Vault (`meta_capi_token`, migration 20261005090100).
 * Sem nenhum dos dois o job não faz nada e diz isso no log.
 * Nada de modo sombra. `META_CAPI_TEST_CODE` (opcional) manda tudo como evento de TESTE
 * (aparece só em Events Manager > Testar eventos) — para verificar sem poluir.
 *
 * ORÇAMENTO (plano Free, 50 subrequests por invocação, divididos com os outros jobs do
 * cron de minuto): roda 1 vez a cada 10 min. Rodada vazia = 1 subrequest (pendências);
 * com o que enviar = até 4 (pendências, token no Vault, envio em lote, registro).
 *
 * PRIVACIDADE: e-mail e id da conta vão como SHA-256 (exigência do Meta e da nossa
 * política); nome, telefone e dados dos clientes nunca saem.
 */

import { PRECO_EMPRESA, PRECO_PRO } from '../../src/services/precosPlanos.ts';

export const META_PIXEL_ID = '4793168394059665';
const GRAPH_VERSAO = 'v23.0';
const SETE_DIAS_S = 7 * 24 * 60 * 60;

/** Minuto 3, 13, 23… — fora deles o job sai sem gastar subrequest. */
export function horaDeEnviarConversoes(agora) {
  return agora.getUTCMinutes() % 10 === 3;
}

async function sha256(texto) {
  const dados = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function texto(valor, max = 400) {
  return typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, max) : null;
}

/** Valor mensal de referência do plano (fonte: src/services/precosPlanos.ts). */
export function valorDoPlano(plano) {
  if (plano === 'pro') return PRECO_PRO.mensalCentavos / 100;
  if (plano === 'empresa') return PRECO_EMPRESA.mensalCentavos / 100;
  return null;
}

/**
 * Uma pendência do SQL → evento da CAPI, ou `{ pular: motivo }` quando não dá para
 * mandar (o Meta rejeita evento de site sem user agent ou fora da janela de 7 dias).
 */
export async function montarEventoMeta(item, agoraMs = Date.now()) {
  const ua = texto(item?.medicao?.ua);
  if (!ua) return { pular: 'sem_user_agent' };
  const eventTime = Math.floor(Date.parse(item?.event_time ?? '') / 1000);
  const agoraS = Math.floor(agoraMs / 1000);
  if (!Number.isFinite(eventTime) || eventTime > agoraS + 60 || eventTime < agoraS - SETE_DIAS_S) {
    return { pular: 'fora_da_janela' };
  }

  const userData = { client_user_agent: ua, external_id: [await sha256(String(item.user_id))] };
  const email = texto(item.email, 320);
  if (email) userData.em = [await sha256(email.toLowerCase())];
  const fbp = texto(item?.origem?.fbp, 200);
  const fbc = texto(item?.origem?.fbc, 300);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const evento = {
    event_name: item.evento,
    event_time: Math.min(eventTime, agoraS),
    event_id: item.event_id,
    action_source: 'website',
    event_source_url:
      item.evento === 'CompleteRegistration'
        ? 'https://app.olliorcamentos.online/auth/login'
        : 'https://app.olliorcamentos.online/',
    user_data: userData,
  };
  if (item.evento === 'CompleteRegistration') {
    evento.custom_data = { status: true };
  } else {
    const valor = valorDoPlano(item.plano);
    evento.custom_data = { currency: 'BRL', ...(valor ? { value: valor } : {}), ...(item.plano ? { content_name: item.plano } : {}) };
  }
  return { evento };
}

async function rpc(env, f, nome, corpo) {
  return f(`${env.SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corpo),
  });
}

/**
 * Job do cron. Devolve um resumo (testes e log). Nunca lança: medição não derruba
 * os outros jobs da mesma invocação.
 */
export async function processarConversoesAnuncios(env, { agora = new Date(), forcar = false, fetchImpl } = {}) {
  if (!forcar && !horaDeEnviarConversoes(agora)) return { estado: 'fora_do_horario' };
  const desligado = () => {
    console.log('[anuncios] Conversions API DESLIGADA: sem token (segredo META_CAPI_TOKEN ou Vault meta_capi_token).');
    return { estado: 'desligado' };
  };
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    return env?.META_CAPI_TOKEN ? { estado: 'sem_supabase' } : desligado();
  }
  const f = fetchImpl ?? fetch;
  try {
    const rPend = await rpc(env, f, 'anuncios_conversoes_pendentes', { p_limite: 20 });
    if (!rPend.ok) {
      console.log(`[anuncios] erro ao ler pendências: HTTP ${rPend.status}`);
      return { estado: 'erro_pendencias' };
    }
    const pendencias = await rPend.json();
    if (!Array.isArray(pendencias) || pendencias.length === 0) return { estado: 'nada', enviados: 0 };

    // Token: segredo do worker, ou o Vault do Supabase (o Workers Free tem teto de 64
    // variáveis e já estava cheio). Só busca quando há o que enviar: 1 subrequest a
    // menos nas rodadas vazias. Erro ao ler o Vault ≠ token ausente (três estados).
    let token = env.META_CAPI_TOKEN || null;
    if (!token) {
      const rTok = await rpc(env, f, 'anuncios_meta_token', {});
      if (!rTok.ok) {
        console.log(`[anuncios] erro ao ler o token no Vault: HTTP ${rTok.status}`);
        return { estado: 'erro_token' };
      }
      const valor = await rTok.json().catch(() => null);
      token = typeof valor === 'string' && valor.trim() ? valor.trim() : null;
    }
    if (!token) return desligado();

    const resultado = [];
    const eventos = [];
    for (const item of pendencias) {
      const montado = await montarEventoMeta(item, agora.getTime());
      if (montado.pular) {
        resultado.push({ event_id: item.event_id, user_id: item.user_id, evento: item.evento, estado: 'pulado', detalhe: montado.pular });
      } else {
        eventos.push({ item, evento: montado.evento });
      }
    }

    if (eventos.length > 0) {
      const corpo = { data: eventos.map((e) => e.evento) };
      if (env.META_CAPI_TEST_CODE) corpo.test_event_code = env.META_CAPI_TEST_CODE;
      let estado = 'erro';
      let detalhe = '';
      try {
        const r = await f(`https://graph.facebook.com/${GRAPH_VERSAO}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
        });
        const json = await r.json().catch(() => ({}));
        if (r.ok && Number(json?.events_received) === eventos.length) {
          estado = 'enviado';
          detalhe = `fbtrace ${json.fbtrace_id ?? '-'}${env.META_CAPI_TEST_CODE ? ' (teste)' : ''}`;
        } else {
          detalhe = `HTTP ${r.status}: ${String(json?.error?.message ?? 'resposta inesperada').slice(0, 300)}`;
        }
      } catch (erro) {
        detalhe = `rede: ${String(erro?.message ?? erro).slice(0, 200)}`;
      }
      // Evento de teste não é o envio de verdade: não fecha a pendência.
      if (env.META_CAPI_TEST_CODE && estado === 'enviado') estado = 'erro';
      for (const { item } of eventos) {
        resultado.push({ event_id: item.event_id, user_id: item.user_id, evento: item.evento, estado, detalhe });
      }
    }

    const rReg = await rpc(env, f, 'anuncios_conversoes_registrar', { p_itens: resultado });
    if (!rReg.ok) console.log(`[anuncios] erro ao registrar resultado: HTTP ${rReg.status}`);
    const enviados = resultado.filter((x) => x.estado === 'enviado').length;
    console.log(`[anuncios] CAPI: ${enviados} enviado(s), ${resultado.length - enviados} pulado(s)/erro.`);
    return { estado: 'ok', enviados, resultado };
  } catch (erro) {
    console.log(`[anuncios] falha: ${String(erro?.message ?? erro).slice(0, 200)}`);
    return { estado: 'falha' };
  }
}
