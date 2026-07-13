// CRÉDITOS OLLI — primitivos do worker (F2 da estratégia). Falam com o ledger
// imutável (public.credit_ledger, migration 20260720). REGRA: só o worker escreve
// (service_role); nunca conceder crédito otimista — o chamador (webhook/ação) só
// grava APÓS confirmação do gateway / execução da ação.
//
// Pesos por ação (a "tabela de preços" interna — ver docs/ESTRATEGIA_SUPERIOR.md).
// Manter em UM lugar; o consumo cita a CHAVE, nunca um número solto.
export const CUSTO = {
  voz_ia: 1,
  whatsapp_utilidade: 1,
  whatsapp_marketing: 5,
  cnpj_consulta: 1,
  review_google: 3,
};

// headers de service_role — o mesmo padrão dos outros módulos (sbHeaders vive em
// index.js; aqui recebemos `env` e montamos direto para o módulo ser autocontido).
function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

/**
 * Saldo de créditos de um usuário. Retorna um número (>=0) ou null em falha de
 * backend — o chamador decide (para AÇÃO PAGA, null deve falhar FECHADO: não
 * liberar de graça por um erro transitório).
 */
export async function saldoCreditos(env, userId) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/saldo_creditos`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_user: userId }),
    });
    if (!r.ok) return null;
    const n = await r.json().catch(() => null);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Concede (delta>0) ou registra consumo (delta<0) no ledger. `ref` é a chave de
 * idempotência ((origem,ref) é ÚNICO no banco) — um evento reenviado (webhook)
 * ou uma ação reprocessada não credita/debita duas vezes: o 409 do índice único
 * é tratado como SUCESSO (já estava lançado). Retorna { ok, duplicado }.
 */
export async function lancarCreditos(env, { userId, delta, origem, ref, descricao }) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/credit_ledger`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ user_id: userId, delta, origem, ref: ref ?? null, descricao: descricao ?? '' }),
    });
    if (r.ok) return { ok: true, duplicado: false };
    // 409 = violação do índice único (origem,ref): já foi lançado → idempotente.
    if (r.status === 409) return { ok: true, duplicado: true };
    return { ok: false, duplicado: false };
  } catch {
    return { ok: false, duplicado: false };
  }
}

/**
 * Tenta CONSUMIR `custo` créditos de uma ação. Fluxo seguro: (1) lê o saldo;
 * (2) se insuficiente ou indeterminado, NÃO consome e devolve o motivo; (3) senão
 * lança o débito com `ref` de idempotência. Não é uma transação atômica (o ledger
 * é append-only e o saldo é derivado) — o `ref` único evita débito duplo, e um
 * saldo levemente negativo por corrida é aceitável e se autocorrige. Retorna
 * { ok, motivo?: 'sem_saldo'|'indisponivel'|'falha', saldo? }.
 */
export async function consumirCreditos(env, { userId, custo, acao, ref, descricao }) {
  const saldo = await saldoCreditos(env, userId);
  if (saldo === null) return { ok: false, motivo: 'indisponivel' }; // fail-closed
  if (saldo < custo) return { ok: false, motivo: 'sem_saldo', saldo };
  const res = await lancarCreditos(env, {
    userId,
    delta: -Math.abs(custo),
    origem: 'consumo',
    // Idempotência é do CHAMADOR: passe `ref` = id único da ação (ex.: id da mensagem/
    // requisição) para que UMA ação não seja debitada 2x num retry. Sem `ref`, o default é
    // um UUID POR TENTATIVA — NUNCA derivado do saldo (duas ações concorrentes leem o mesmo
    // saldo e produziriam o MESMO ref, colidindo no índice único e "sumindo" um débito real).
    ref: ref ?? `${acao}:${userId}:${crypto.randomUUID()}`,
    descricao: descricao ?? acao ?? 'consumo',
  });
  if (!res.ok) return { ok: false, motivo: 'falha', saldo };
  return { ok: true, saldo: saldo - custo };
}
