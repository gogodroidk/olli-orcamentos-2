/**
 * Idempotência GLOBAL de webhook de pagamento (item O2-17).
 *
 * O `stripe.js` deduplicava por um `Map` de memória do isolate, e o comentário de
 * lá já era honesto: "não substitui idempotência real (é por isolate, não
 * global)". Cada isolate tem o seu Map, o isolate morre quando quer, e a Stripe
 * reenvia evento por dias — a proteção era acidental.
 *
 * Aqui a proteção é o banco: `webhook_events` tem índice ÚNICO em
 * `(origem, event_id)`. Quem consegue inserir, processa; quem toma 409 sabe que
 * outro isolate já reivindicou aquele evento e responde 200 sem reprocessar.
 * Isso vale entre isolates, entre deploys e entre regiões — coisa que memória de
 * processo nunca vai valer.
 *
 * Mesmo padrão já usado e provado em `creditos.js` (`lancarCreditos`), onde o 409
 * do único `(origem, ref)` é tratado como sucesso idempotente.
 */

/** Cabeçalhos do service_role (o worker é o único que escreve nesta tabela). */
function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
    ...extra,
  };
}

/**
 * Reivindica o evento ANTES de processar.
 *
 * Retorna:
 *  - `{ ok: true,  duplicado: false }` → é seu, pode processar.
 *  - `{ ok: true,  duplicado: true  }` → outro já pegou; responda 200 e NÃO
 *    reprocesse.
 *  - `{ ok: false, duplicado: false }` → não deu para saber (banco fora, rede).
 *
 * O caso `ok:false` é o interessante e por isso é um estado PRÓPRIO, e não um
 * `false` genérico: "não consegui registrar" não é "é duplicado" nem "é novo".
 * Quem chama decide — e a decisão certa para webhook é devolver 5xx para o
 * gateway REENVIAR, em vez de engolir o evento (perder pagamento) ou processar às
 * cegas. Erro nunca vira vazio, nem aqui.
 */
export async function reivindicarEvento(env, { origem, eventId, tipo, payload }) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE) return { ok: false, duplicado: false };
  if (!origem || !eventId) return { ok: false, duplicado: false };
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/webhook_events`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({
        origem,
        event_id: String(eventId),
        tipo: tipo ?? null,
        status: 'recebido',
        payload: payload ?? null,
      }),
    });
    if (r.ok) return { ok: true, duplicado: false }; // primeiro a ver este evento

    // 409 = já existe linha para (origem,event_id). E AQUI MORA A ARMADILHA:
    // "já reivindicado" NÃO é "já processado". Se a primeira tentativa morreu no
    // meio (isolate reciclado, banco fora, exceção), a linha ficou em 'recebido' e
    // o gateway está REENVIANDO justamente porque não recebeu 200. Responder
    // "duplicado → 200" aqui faria o evento nunca mais ser processado: a assinatura
    // paga simplesmente não ligaria, em silêncio, para sempre. O código antigo
    // acertava nisso ("NÃO marca como processado: queremos que o reenvio da Stripe
    // seja tentado de novo") — persistir não pode piorar essa parte.
    // Só é duplicado de verdade quem está 'processado'.
    if (r.status === 409) return await estadoDoEvento(env, origem, eventId);

    return { ok: false, duplicado: false };
  } catch {
    return { ok: false, duplicado: false };
  }
}

/**
 * Lê o estado de um evento já registrado, para decidir entre PULAR (já concluído)
 * e REPROCESSAR (tentativa anterior não terminou).
 *
 * Não conseguir ler devolve `ok:false` — de novo, "não sei" não vira "pode pular".
 * Dois isolates reprocessando o mesmo evento em paralelo é aceitável e é o risco
 * MENOR: os handlers são idempotentes por resultado (assinatura é upsert por
 * `user_id`; crédito passa pelo único `(origem,ref)` do `credit_ledger`). Perder o
 * evento de vez não teria rede nenhuma.
 */
async function estadoDoEvento(env, origem, eventId) {
  try {
    const url =
      `${env.SUPABASE_URL}/rest/v1/webhook_events` +
      `?origem=eq.${encodeURIComponent(origem)}&event_id=eq.${encodeURIComponent(String(eventId))}` +
      `&select=status&limit=1`;
    const r = await fetch(url, { headers: sbHeaders(env, { Accept: 'application/json' }) });
    if (!r.ok) return { ok: false, duplicado: false };
    const linhas = await r.json();
    const status = Array.isArray(linhas) && linhas.length ? linhas[0].status : null;
    if (!status) return { ok: false, duplicado: false }; // sumiu entre o 409 e o GET
    if (status === 'processado') return { ok: true, duplicado: true }; // concluído: pular
    // 'recebido' ou 'falhou' → a tentativa anterior não terminou. Reprocessa.
    return { ok: true, duplicado: false, retentativa: true };
  } catch {
    return { ok: false, duplicado: false };
  }
}

/**
 * Fecha o evento. Best-effort DE PROPÓSITO: a idempotência já foi garantida pelo
 * insert, então uma falha aqui não pode derrubar um webhook que JÁ processou o
 * pagamento — o efeito de negócio está feito; isto é a trilha.
 */
export async function marcarEvento(env, { origem, eventId, status, erro }) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE) return;
  try {
    const url =
      `${env.SUPABASE_URL}/rest/v1/webhook_events` +
      `?origem=eq.${encodeURIComponent(origem)}&event_id=eq.${encodeURIComponent(String(eventId))}`;
    await fetch(url, {
      method: 'PATCH',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({
        status,
        erro: erro ? String(erro).slice(0, 500) : null,
        processado_em: new Date().toISOString(),
      }),
    });
  } catch {
    // trilha não derruba pagamento
  }
}
