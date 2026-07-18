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

/** SHA-256 em hex — usado só para derivar um `ref` idempotente do CONTEÚDO do
 * pedido (ver `cobrarCreditoVoz`). `crypto.subtle` é nativo do runtime do
 * Worker (mesmo objeto global já usado em mercadopago.js pro HMAC do webhook). */
async function hashHex(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cobrança OPT-IN da IA de voz (rotas /voz e /transcrever modo=orcamento,
 * cluster V2a). O chamador manda `confirmarCredito:true` no corpo SÓ quando
 * o usuário já confirmou explicitamente que quer gastar 1 crédito (regra de
 * rocha: nunca auto-debitar) — sem o campo (ausente ou false), não cobra
 * nada: é o cliente quem decide, pela cota grátis local, se precisa pedir
 * essa confirmação.
 *
 * // FOLLOWUP: a cota grátis (3/mês, IA_USOS_GRATIS_MES em src/services/planos.ts,
 * // consumida em src/hooks/usePlano.ts) ainda é 100% CLIENT-SIDE — fechar esse
 * // vazamento (qualquer JWT válido bate no worker direto) exige uma tabela/
 * // migration nova de contagem por período no servidor. Passo humano.
 *
 * Quem chama deve invocar isto SÓ depois que a IA já produziu o resultado
 * (nunca cobra por uma chamada que falhou) — e só bloquear a resposta
 * quando `bloqueado` vier `true` (SALDO ZERO). Falha de INFRA (saldo
 * indisponível / escrita no ledger falhou) é FAIL-OPEN por design: loga pro
 * dono reconciliar, mas não impede a resposta — o risco de um bug de
 * billing é dinheiro do dono, nunca dano ao usuário.
 *
 * Idempotência do `ref` (índice único (origem,ref) do ledger — um retry NÃO
 * pode cobrar 2x), em duas camadas:
 *  1. `creditoRef` explícito no corpo, se o chamador mandar um (namespaced por
 *     usuário+ação) — mesmo padrão de `mp:${paymentId}` em mercadopago.js.
 *  2. Sem isso — que é o caso de hoje: o app ainda NÃO manda `creditoRef` (só
 *     `confirmarCredito`, ver src/services/vozNuvem.ts/olliAssistente.ts) —
 *     cai num hash do `conteudo` (transcript ou áudio) que o chamador passar:
 *     um retry de rede reenvia o MESMO corpo, produz o MESMO hash, e o índice
 *     único absorve o duplicado sem cobrar 2x, SEM exigir nenhuma mudança no
 *     cliente.
 * Sem `creditoRef` nem `conteudo`, cai no default do próprio `consumirCreditos`
 * (um UUID por tentativa — sem idempotência; borda defensiva, não esperada).
 */
export async function cobrarCreditoVoz(env, user, { confirmarCredito, creditoRef, conteudo }) {
  if (confirmarCredito !== true || !user || !user.id) return { bloqueado: false };
  const acao = 'voz_ia';
  const refExplicito = typeof creditoRef === 'string' ? creditoRef.trim().slice(0, 200) : '';
  let ref;
  if (refExplicito) {
    ref = `${acao}:${user.id}:cli:${refExplicito}`;
  } else if (typeof conteudo === 'string' && conteudo) {
    ref = `${acao}:${user.id}:${await hashHex(conteudo)}`;
  }
  const cobranca = await consumirCreditos(env, {
    userId: user.id,
    custo: CUSTO.voz_ia || 1,
    acao,
    ref,
    descricao: 'OLLI voz — orçamento por IA',
  });
  if (cobranca.ok) return { bloqueado: false };
  if (cobranca.motivo === 'sem_saldo') return { bloqueado: true };
  // 'indisponivel' (saldo ilegível) ou 'falha' (ledger não gravou): infra, não
  // saldo — fail-open, não pune quem já recebeu o resultado da IA.
  console.error('[olli-creditos] falha ao debitar voz_ia (fail-open, não bloqueia):', cobranca.motivo, user.id);
  return { bloqueado: false };
}
