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

// Cota grátis de IA por mês no plano Grátis. Espelha IA_USOS_GRATIS_MES
// (src/services/planos.ts) — o app conta a MESMA cota localmente só para a UX
// ("2 de 3 usos grátis"); quem ENFORÇA é este número, no servidor.
export const IA_GRATIS_MES = 3;

// Planos com 'ia_ilimitada' (espelha RECURSOS_POR_PLANO em src/services/entitlements.ts):
// quem paga não consome cota nem crédito na IA de voz.
const PLANOS_IA_ILIMITADA = new Set(['pro', 'empresa']);

// Status que contam como pagos (espelha STATUS_PAGOS em src/services/planos.ts).
const STATUS_PAGOS = new Set(['active', 'trialing', 'past_due']);

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
 * ou uma ação reprocessada não credita/debita duas vezes: a violação do índice
 * único é tratada como SUCESSO (já estava lançado). Retorna { ok, duplicado }.
 *
 * SÓ 23505 (unique_violation) é idempotência. O PostgREST responde 409 para MAIS
 * de um erro do Postgres — notadamente 23503 (foreign_key_violation: o user_id não
 * existe mais, conta excluída no meio) e 23514 (check_violation, ex.: `origem` fora
 * da lista, ou o trigger append-only da 20260726). Tratar QUALQUER 409 como
 * "já lançado" fazia um crédito PAGO sumir em silêncio: o webhook do gateway
 * recebia 200, nunca reenviava, e o usuário ficava sem os créditos que comprou.
 * Aqui a gente lê o `code` do corpo: 23505 absorve, o resto propaga como falha
 * (o chamador devolve 5xx e o gateway reenvia).
 */
export async function lancarCreditos(env, { userId, delta, origem, ref, descricao }) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/credit_ledger`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ user_id: userId, delta, origem, ref: ref ?? null, descricao: descricao ?? '' }),
    });
    if (r.ok) return { ok: true, duplicado: false };
    if (r.status === 409) {
      const erro = await r.json().catch(() => null);
      const code = erro && typeof erro.code === 'string' ? erro.code : '';
      if (code === '23505') return { ok: true, duplicado: true };
      // Corpo ilegível (code '') também cai aqui de propósito: "não sei por que
      // deu 409" não pode virar "já estava lançado" — na dúvida, o lançamento
      // NÃO entrou e quem paga tem que poder reenviar.
      console.error('[olli-creditos] 409 que NÃO é unique_violation (crédito não entrou):', code || '(sem code)', origem, ref);
      return { ok: false, duplicado: false };
    }
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
 * Regime de IA da conta, em TRÊS estados (regra "erro nunca vira vazio"):
 *   'ilimitada'     → plano pago e vigente: IA sem cota e sem crédito
 *   'cota'          → grátis (consultado e confirmado): vale a cota mensal
 *   'indeterminado' → não deu para ler a assinatura (rede/PostgREST fora)
 * Colapsar 'indeterminado' em 'cota' cobraria crédito de quem paga por causa de
 * um erro nosso; colapsar em 'ilimitada' abriria a IA de graça. Quem chama
 * decide — e aqui a decisão é fail-open (ver cobrarCreditoVoz).
 *
 * Lê a tabela direto (mesmo padrão autocontido do resto do módulo) e deriva o
 * plano com a MESMA regra do app (derivarPlano em src/services/planos.ts):
 * status pago + vigência não vencida.
 */
async function regimeIa(env, userId) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/assinaturas?user_id=eq.${encodeURIComponent(userId)}` +
        `&select=plano,status,current_period_end&limit=1`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return 'indeterminado';
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return 'indeterminado';
    if (!arr.length) return 'cota'; // sem linha = nunca assinou = grátis (resposta confirmada)
    const row = arr[0];
    if (!row.status || !STATUS_PAGOS.has(row.status)) return 'cota';
    if (row.current_period_end) {
      const fim = Date.parse(row.current_period_end);
      if (!Number.isNaN(fim) && fim < Date.now()) return 'cota'; // vencida
    }
    return PLANOS_IA_ILIMITADA.has(row.plano) ? 'ilimitada' : 'cota';
  } catch {
    return 'indeterminado';
  }
}

/**
 * Consome 1 uso da cota grátis do mês NO SERVIDOR. Três estados:
 *   'consumida'    → tinha cota (ou este `ref` já tinha sido contado): liberado
 *   'esgotada'     → a cota do mês acabou: quem quiser seguir paga crédito
 *   'indisponivel' → a RPC/tabela não existe (migration não aplicada) ou o banco
 *                    falhou — o chamador FAIL-OPEN (ver cobrarCreditoVoz)
 *
 * A contagem é do servidor de propósito: os 3 usos/mês do app vivem em
 * AsyncStorage (src/services/planos.ts) e voltam ao zero a cada reinstalação —
 * cota client-side não é cota, é sugestão.
 *
 * `p_ref` dá idempotência: um retry de rede da MESMA ação não queima um segundo
 * uso grátis (índice único (user_id,acao,ref) — ver a migration 20260727).
 */
async function consumirCotaGratis(env, { userId, ref, acao }) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consumir_cota_ia`, {
      method: 'POST',
      headers: sbHeaders(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_user: userId, p_acao: acao, p_ref: ref ?? null, p_limite: IA_GRATIS_MES }),
    });
    // 404 (PGRST202, função inexistente) cai aqui: é EXATAMENTE o estado do banco
    // antes de a migration ser aplicada, e por isso vira 'indisponivel', não 'esgotada'.
    if (!r.ok) return 'indisponivel';
    const v = await r.json().catch(() => null);
    if (v === 'consumida' || v === 'ja_contada') return 'consumida';
    if (v === 'esgotada') return 'esgotada';
    return 'indisponivel'; // valor desconhecido: não decide às cegas
  } catch {
    return 'indisponivel';
  }
}

/** Debita 1 crédito e traduz o resultado no contrato { bloqueado }. */
async function debitarCreditoVoz(env, userId, ref) {
  const cobranca = await consumirCreditos(env, {
    userId,
    custo: CUSTO.voz_ia || 1,
    acao: 'voz_ia',
    ref,
    descricao: 'OLLI voz — orçamento por IA',
  });
  if (cobranca.ok) return { bloqueado: false };
  if (cobranca.motivo === 'sem_saldo') return { bloqueado: true };
  // 'indisponivel' (saldo ilegível) ou 'falha' (ledger não gravou): infra, não
  // saldo — fail-open, não pune quem já recebeu o resultado da IA.
  console.error('[olli-creditos] falha ao debitar voz_ia (fail-open, não bloqueia):', cobranca.motivo, userId);
  return { bloqueado: false };
}

/**
 * Autorização da IA de voz paga (rotas /voz, /voz/conversa e /transcrever
 * modo=orcamento, cluster V2a). QUEM DECIDE É O SERVIDOR.
 *
 * A versão anterior começava com `if (confirmarCredito !== true) return
 * { bloqueado:false }` — ou seja, qualquer conta com JWT válido que
 * simplesmente NÃO mandasse esse campo usava o Gemini (conta do dono) de graça
 * e sem limite. A intenção do campo era boa (não debitar sem o usuário querer),
 * mas o mecanismo estava do lado errado: o cliente PEDE, o servidor CONCEDE.
 * `confirmarCredito` continua sendo aceito para não quebrar o app, e continua
 * sendo o que faz a tela pedir a confirmação ao usuário — só não autoriza mais
 * nada sozinho.
 *
 * Ordem da decisão (a mesma promessa que a tela de planos faz):
 *  1. plano pago e vigente → IA ilimitada, não cobra nada;
 *  2. senão, cota grátis do mês (contada no servidor) → consome 1 uso;
 *  3. cota esgotada → 1 crédito;
 *  4. sem crédito → BLOQUEIA (`{ bloqueado:true }`), que os chamadores
 *     traduzem para `{ ok:false, erro:'sem_creditos' }` — o vocabulário que o
 *     app já entende hoje (respostaSemCreditos em src/services/creditos.ts leva
 *     o usuário para "Ver planos"). Nenhum código de erro novo foi inventado.
 *
 * FAIL-OPEN é regra de segurança OPERACIONAL, não descuido: se a migration da
 * cota ainda não foi aplicada, se a assinatura não pôde ser lida, ou se o
 * ledger falhou, a resposta SEGUE liberada — este arquivo pode ir para
 * produção ANTES da migration sem derrubar ninguém, e a regra passa a valer
 * sozinha quando o dono aplicar. Erro de infra nunca pode virar "sem saldo"
 * para quem pagou; um bug de billing custa dinheiro do dono, e isso é
 * preferível a punir usuário.
 *
 * Quem chama deve invocar isto SÓ depois que a IA já produziu o resultado
 * (nunca cobra por uma chamada que falhou).
 *
 * Idempotência do `ref` (vale para a cota E para o ledger — um retry não pode
 * queimar dois usos nem cobrar 2x), em duas camadas:
 *  1. `creditoRef` explícito no corpo, se o chamador mandar um (namespaced por
 *     usuário+ação) — é o caso de /voz/conversa, que passa o conversationId.
 *  2. Sem isso — o caso de /voz e /transcrever, cujo app não manda `creditoRef`
 *     (ver src/services/vozNuvem.ts/olliAssistente.ts) — cai num hash do
 *     `conteudo` (transcript ou áudio): um retry de rede reenvia o MESMO corpo,
 *     produz o MESMO hash, e o índice único absorve o duplicado sem cobrar 2x,
 *     SEM exigir nenhuma mudança no cliente.
 * Sem `creditoRef` nem `conteudo`, cai no default do próprio `consumirCreditos`
 * (um UUID por tentativa — sem idempotência; borda defensiva, não esperada).
 */
export async function cobrarCreditoVoz(env, user, { confirmarCredito, creditoRef, conteudo } = {}) {
  if (!user || !user.id) return { bloqueado: false };
  const acao = 'voz_ia';

  // Plano primeiro: quem paga não gasta cota nem crédito — e sai antes de
  // pagarmos o SHA-256 do áudio (o `conteudo` do /transcrever tem MBs).
  const regime = await regimeIa(env, user.id);
  if (regime === 'ilimitada') return { bloqueado: false };
  if (regime === 'indeterminado') {
    console.error('[olli-creditos] assinatura ilegível — liberando IA sem cobrar (fail-open):', user.id);
    return { bloqueado: false };
  }

  const refExplicito = typeof creditoRef === 'string' ? creditoRef.trim().slice(0, 200) : '';
  let ref;
  if (refExplicito) {
    ref = `${acao}:${user.id}:cli:${refExplicito}`;
  } else if (typeof conteudo === 'string' && conteudo) {
    ref = `${acao}:${user.id}:${await hashHex(conteudo)}`;
  }

  const cota = await consumirCotaGratis(env, { userId: user.id, ref, acao });
  if (cota === 'consumida') return { bloqueado: false };
  if (cota === 'indisponivel') {
    // Migration não aplicada (ou banco fora): sem contagem confiável, não dá para
    // afirmar que a cota acabou. Volta ao comportamento de HOJE — só cobra se o
    // cliente pediu explicitamente — para que este deploy seja seguro sozinho.
    console.error('[olli-creditos] cota de IA indisponível (migration 20260727 aplicada?) — fail-open:', user.id);
    if (confirmarCredito !== true) return { bloqueado: false };
    return debitarCreditoVoz(env, user.id, ref);
  }

  // cota === 'esgotada': daqui em diante é crédito, tenha o cliente pedido ou não.
  return debitarCreditoVoz(env, user.id, ref);
}
