/**
 * Teste da AUTORIZAÇÃO da IA de voz paga (cluster V2a):
 * "quem decide se a IA roda é o SERVIDOR — plano pago passa livre, grátis gasta a
 * cota do mês contada no banco, cota esgotada gasta 1 crédito, e sem crédito
 * bloqueia; nunca cobra 2x no mesmo ref; e NENHUM erro de infra vira 'sem saldo'."
 *
 *     node scripts/teste-creditos-voz.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita `cobrarCreditoVoz` e `lancarCreditos` REAIS (worker/src/creditos.js — as
 * mesmas funções que handleVoz/handleVozConversa/handleTranscrever chamam antes de
 * responder o sucesso) contra um Supabase FALSO (fetch trocado), mesmo padrão de
 * teste-webhook-events.ts. Não importa index.js: ele carrega @sentry/cloudflare
 * (dependência só do worker/, fora do `npm ci` da raiz — mesma razão pela qual
 * teste-rate-limit.ts/teste-webhook-events.ts também testam o módulo isolado).
 *
 * O que está em jogo, nos dois sentidos: antes, QUALQUER conta com JWT válido que
 * não mandasse `confirmarCredito` usava o Gemini (conta do dono) de graça e sem
 * limite. E, se o conserto errar a mão, um erro de banco vira "você não tem
 * créditos" para quem pagou. Os dois lados estão testados aqui.
 */
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { cobrarCreditoVoz, lancarCreditos, CUSTO, IA_GRATIS_MES } from '../worker/src/creditos.js';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const env: any = { SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso' };
const USER = { id: 'user-teste-1' };

const DAQUI_UM_MES = new Date(Date.now() + 30 * 864e5).toISOString();

// ── "banco" falso ────────────────────────────────────────────────────────
// Emula as três coisas que a decisão consulta: a linha de `assinaturas`, a RPC
// `consumir_cota_ia` (com o índice único de idempotência) e o `credit_ledger`.
let saldo = 0;
let saldoIndisponivel = false;
let ledgerRefs = new Set<string>();
let ledgerChamadas = 0;

/** null = grátis (consultado); 'erro' = PostgREST fora; objeto = linha real. */
let assinatura: any = null;
/** false emula a MIGRATION 20260727 AINDA NÃO APLICADA (RPC inexistente → 404). */
let cotaExiste = true;
let cotaUsos: string[] = []; // um item por uso do mês
let cotaRefs = new Set<string>();
let cotaChamadas = 0;

function resetBanco(
  saldoInicial: number,
  opts: { indisponivel?: boolean; assinatura?: any; cotaExiste?: boolean; usosJaFeitos?: number } = {},
) {
  saldo = saldoInicial;
  saldoIndisponivel = !!opts.indisponivel;
  ledgerRefs = new Set();
  ledgerChamadas = 0;
  assinatura = opts.assinatura ?? null;
  cotaExiste = opts.cotaExiste !== false;
  cotaUsos = Array.from({ length: opts.usosJaFeitos ?? 0 }, (_, i) => `pre-${i}`);
  cotaRefs = new Set(cotaUsos);
  cotaChamadas = 0;
}

function fingirFetch() {
  (globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
    const u = String(url);

    // regimeIa: a linha de assinaturas (3 estados — erro NÃO é "grátis").
    if (u.includes('/rest/v1/assinaturas')) {
      if (assinatura === 'erro') return { ok: false, status: 500 } as Response;
      return { ok: true, status: 200, json: async () => (assinatura ? [assinatura] : []) } as unknown as Response;
    }

    // consumirCotaGratis: a RPC do servidor (emula a função da migration 20260727).
    if (u.includes('/rest/v1/rpc/consumir_cota_ia')) {
      cotaChamadas++;
      // Migration não aplicada: PostgREST devolve 404 (PGRST202).
      if (!cotaExiste) return { ok: false, status: 404 } as Response;
      const body = init?.body ? JSON.parse(init.body) : {};
      const ref = body.p_ref == null ? null : String(body.p_ref);
      if (ref !== null && cotaRefs.has(ref)) {
        return { ok: true, status: 200, json: async () => 'ja_contada' } as unknown as Response;
      }
      if (cotaUsos.length >= Number(body.p_limite)) {
        return { ok: true, status: 200, json: async () => 'esgotada' } as unknown as Response;
      }
      cotaUsos.push(ref ?? `sem-ref-${cotaUsos.length}`);
      if (ref !== null) cotaRefs.add(ref);
      return { ok: true, status: 200, json: async () => 'consumida' } as unknown as Response;
    }

    // saldoCreditos (RPC): banco fora derruba a LEITURA do saldo.
    if (u.includes('/rest/v1/rpc/saldo_creditos')) {
      if (saldoIndisponivel) return { ok: false, status: 500 } as Response;
      return { ok: true, status: 200, json: async () => saldo } as unknown as Response;
    }

    // lancarCreditos (INSERT no ledger): índice único (origem,ref) emulado, com o
    // CORPO que o PostgREST manda de verdade (o `code` decide se é idempotência).
    if (u.includes('/rest/v1/credit_ledger')) {
      ledgerChamadas++;
      const body = init?.body ? JSON.parse(init.body) : {};
      const ref = String(body.ref);
      if (ledgerRefs.has(ref)) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ code: '23505', message: 'duplicate key value violates unique constraint' }),
        } as unknown as Response;
      }
      ledgerRefs.add(ref);
      saldo -= Math.abs(Number(body.delta) || 0);
      return { ok: true, status: 201 } as unknown as Response;
    }

    throw new Error(`fetch fake não sabe responder por: ${u}`);
  };
}

fingirFetch();

console.log('\n0) sanidade: custo e cota são os mesmos das tabelas de preço');
checar('CUSTO.voz_ia === 1', CUSTO.voz_ia, 1);
checar('IA_GRATIS_MES === 3 (espelha IA_USOS_GRATIS_MES do app)', IA_GRATIS_MES, 3);

// ═══ A) O BURACO QUE ISTO FECHA — servidor decide, cliente só pede ═════════
console.log('\nA1) SEM confirmarCredito (o buraco): agora consome COTA do servidor, não é grátis infinito');
resetBanco(10);
{
  const r1 = await cobrarCreditoVoz(env, USER, { conteudo: 'fala 1' });
  checar('1º uso do mês: libera', r1.bloqueado, false);
  checar('e a cota do SERVIDOR foi consultada', cotaChamadas, 1);
  checar('gastou 1 uso grátis', cotaUsos.length, 1);
  checar('não tocou no ledger (uso grátis não custa crédito)', ledgerChamadas, 0);

  await cobrarCreditoVoz(env, USER, { conteudo: 'fala 2' });
  await cobrarCreditoVoz(env, USER, { conteudo: 'fala 3' });
  checar('3 usos grátis no mês', cotaUsos.length, 3);
  checar('ainda sem cobrar crédito', ledgerChamadas, 0);

  // 4ª chamada: cota esgotada. ANTES isto era liberado de graça só por não mandar
  // `confirmarCredito`; agora o servidor decide e debita o crédito.
  const r4 = await cobrarCreditoVoz(env, USER, { conteudo: 'fala 4' });
  checar('4ª chamada não bloqueia (tem crédito)', r4.bloqueado, false);
  checar('mas COBROU, mesmo sem o cliente ter pedido', saldo, 9);
}

console.log('\nA2) cota esgotada E sem crédito: BLOQUEIA de verdade');
resetBanco(0, { usosJaFeitos: 3 });
{
  const r = await cobrarCreditoVoz(env, USER, { conteudo: 'fala paga' });
  checar('bloqueia (o chamador traduz para erro:"sem_creditos")', r.bloqueado, true);
  checar('nem tentou lançar no ledger (saldo insuficiente barra antes)', ledgerChamadas, 0);
}

console.log('\nA3) idempotência da COTA: retry da mesma ação não queima 2 usos grátis');
resetBanco(10);
{
  await cobrarCreditoVoz(env, USER, { conteudo: 'mesma fala' });
  const r = await cobrarCreditoVoz(env, USER, { conteudo: 'mesma fala' });
  checar('retry não bloqueia', r.bloqueado, false);
  checar('consultou a cota 2x', cotaChamadas, 2);
  checar('mas gastou 1 uso só (ref igual = ação igual)', cotaUsos.length, 1);
}

console.log('\nA4) plano PAGO e vigente: IA livre — não gasta cota nem crédito');
resetBanco(10, {
  assinatura: { plano: 'pro', status: 'active', current_period_end: DAQUI_UM_MES },
  usosJaFeitos: 3,
});
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'fala do assinante' });
  checar('não bloqueia', r.bloqueado, false);
  checar('nem consultou a cota (quem paga tem ia_ilimitada)', cotaChamadas, 0);
  checar('e o saldo de créditos ficou intacto', saldo, 10);
}

console.log('\nA5) plano pago VENCIDO não vale como pago (cai na cota)');
resetBanco(10, {
  assinatura: { plano: 'pro', status: 'active', current_period_end: new Date(Date.now() - 864e5).toISOString() },
});
{
  await cobrarCreditoVoz(env, USER, { conteudo: 'fala de plano vencido' });
  checar('consumiu cota grátis, não passou livre', cotaUsos.length, 1);
}

// ═══ B) FAIL-OPEN — erro de infra NUNCA vira "sem saldo" ═══════════════════
console.log('\nB1) migration da cota NÃO aplicada (RPC 404): FAIL-OPEN — libera como hoje');
resetBanco(10, { cotaExiste: false });
{
  const r = await cobrarCreditoVoz(env, USER, { conteudo: 'fala sem migration' });
  checar('não bloqueia (este commit pode ir para produção antes da migration)', r.bloqueado, false);
  checar('tentou a RPC', cotaChamadas, 1);
  checar('e NÃO cobrou crédito de quem não pediu', saldo, 10);
  checar('nem tocou no ledger', ledgerChamadas, 0);
}

console.log('\nB2) sem migration + confirmarCredito:true: cobra (comportamento de hoje, preservado)');
resetBanco(10, { cotaExiste: false });
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-A' });
  checar('não bloqueia', r.bloqueado, false);
  checar('debitou 1 do saldo', saldo, 9);
  checar('lançou 1x no ledger', ledgerChamadas, 1);

  // Retry de rede com o MESMO ref explícito.
  const r2 = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-A' });
  checar('retry não bloqueia', r2.bloqueado, false);
  checar('tentou lançar de novo', ledgerChamadas, 2);
  checar('mas o índice único (23505) absorveu: saldo não mudou', saldo, 9);

  // ref DIFERENTE é ação diferente.
  await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-A2' });
  checar('ref diferente debita de novo', saldo, 8);
}

console.log('\nB3) sem migration + saldo 0 + confirmarCredito: bloqueia (o cliente PEDIU e não há saldo)');
resetBanco(0, { cotaExiste: false });
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-B' });
  checar('bloqueia', r.bloqueado, true);
  checar('nunca tentou o ledger', ledgerChamadas, 0);
}

console.log('\nB4) assinatura ILEGÍVEL (PostgREST fora): FAIL-OPEN — não cobra de quem talvez pague');
resetBanco(10, { assinatura: 'erro', usosJaFeitos: 3 });
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'fala com banco meio fora' });
  checar('não bloqueia', r.bloqueado, false);
  checar('não seguiu para a cota (não sabe se é grátis)', cotaChamadas, 0);
  checar('saldo intacto', saldo, 10);
}

console.log('\nB5) saldo ilegível na hora de debitar: FAIL-OPEN (a IA já entregou o resultado)');
resetBanco(10, { indisponivel: true, usosJaFeitos: 3 });
{
  const r = await cobrarCreditoVoz(env, USER, { conteudo: 'fala com saldo ilegível' });
  checar('não bloqueia mesmo com o banco fora (não pune por bug de billing)', r.bloqueado, false);
  checar('nem chegou no ledger (a leitura de saldo já falhou)', ledgerChamadas, 0);
}

console.log('\nB6) escrita do ledger falhando (saldo lê OK): também FAIL-OPEN');
resetBanco(10, { usosJaFeitos: 3 });
{
  const fetchOriginal = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (String(url).includes('/rest/v1/credit_ledger')) {
      ledgerChamadas++;
      return { ok: false, status: 500 } as Response;
    }
    return fetchOriginal(url, init);
  };
  const r = await cobrarCreditoVoz(env, USER, { conteudo: 'fala com ledger fora' });
  (globalThis as any).fetch = fetchOriginal;
  checar('não bloqueia', r.bloqueado, false);
  checar('tentou escrever 1x e falhou', ledgerChamadas, 1);
  checar('saldo não mudou (a escrita falhou de verdade)', saldo, 10);
}

// ═══ C) 409 do PostgREST: só 23505 é idempotência ═════════════════════════
console.log('\nC1) 409 com code 23505 (unique_violation): absorve como "já lançado"');
{
  (globalThis as any).fetch = async () =>
    ({ ok: false, status: 409, json: async () => ({ code: '23505', message: 'duplicate key' }) }) as unknown as Response;
  const r = await lancarCreditos(env, { userId: USER.id, delta: 50, origem: 'pix', ref: 'mp:1', descricao: 'x' });
  checar('ok + duplicado (o gateway não precisa reenviar)', r, { ok: true, duplicado: true });
}

console.log('\nC2) 409 com code 23503 (foreign key): o crédito PAGO não entrou — propaga a falha');
{
  (globalThis as any).fetch = async () =>
    ({ ok: false, status: 409, json: async () => ({ code: '23503', message: 'violates foreign key constraint' }) }) as unknown as Response;
  const r = await lancarCreditos(env, { userId: 'fantasma', delta: 50, origem: 'pix', ref: 'mp:2', descricao: 'x' });
  checar('NÃO é ok (o webhook devolve 5xx e o MP reenvia)', r, { ok: false, duplicado: false });
}

console.log('\nC3) 409 sem corpo legível: na dúvida, NÃO é idempotência');
{
  (globalThis as any).fetch = async () =>
    ({ ok: false, status: 409, json: async () => { throw new Error('sem corpo'); } }) as unknown as Response;
  const r = await lancarCreditos(env, { userId: USER.id, delta: 50, origem: 'pix', ref: 'mp:3', descricao: 'x' });
  checar('falha (crédito comprado não some em silêncio)', r, { ok: false, duplicado: false });
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
// `process.exitCode` (não `process.exit()`): deixa o event loop drenar sozinho
// em vez de forçar o encerramento — em Windows, matar o processo com fetch
// (undici) ainda fechando handles no meio já produziu um crash de libuv
// (`UV_HANDLE_CLOSING`) flaky aqui; isto evita a corrida sem mudar o contrato
// (mesmo exit code 0/1 pro `npm test`).
process.exitCode = falhas === 0 ? 0 : 1;
