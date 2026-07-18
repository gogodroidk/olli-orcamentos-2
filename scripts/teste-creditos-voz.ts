/**
 * Teste da cobrança OPT-IN de crédito na IA de voz (cluster V2a):
 * "/voz e /transcrever(modo=orcamento) cobram 1 crédito SÓ com
 * confirmarCredito:true, nunca 2x no mesmo ref (explícito OU pelo hash do
 * conteúdo — o app hoje só manda `confirmarCredito`, não `creditoRef`), e
 * nunca punem o usuário por um bug de billing (fail-open na infra,
 * fail-closed só em saldo zero)."
 *
 *     node scripts/teste-creditos-voz.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita `cobrarCreditoVoz` REAL (worker/src/creditos.js — a mesma função
 * que handleVoz/handleTranscrever em worker/src/index.js chamam antes de
 * responder o sucesso) contra um Supabase FALSO (fetch trocado), mesmo
 * padrão de teste-webhook-events.ts. Não importa index.js: ele carrega
 * @sentry/cloudflare (dependência só do worker/, fora do `npm ci` da raiz —
 * mesma razão pela qual teste-rate-limit.ts/teste-webhook-events.ts também
 * testam o módulo isolado, não o handler HTTP inteiro).
 */
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { cobrarCreditoVoz, CUSTO } from '../worker/src/creditos.js';

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

// ── "banco" falso: saldo atual + refs já lançados (idempotência real do
// índice único (origem,ref) do credit_ledger, emulada com um Set) ────────
let saldo = 0;
let saldoIndisponivel = false;
let ledgerRefs = new Set<string>();
let ledgerChamadas = 0;

function resetBanco(saldoInicial: number, opts: { indisponivel?: boolean } = {}) {
  saldo = saldoInicial;
  saldoIndisponivel = !!opts.indisponivel;
  ledgerRefs = new Set();
  ledgerChamadas = 0;
}

function fingirFetch() {
  (globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
    const u = String(url);

    // saldoCreditos (RPC): banco fora derruba a LEITURA do saldo.
    if (u.includes('/rest/v1/rpc/saldo_creditos')) {
      if (saldoIndisponivel) return { ok: false, status: 500 } as Response;
      return { ok: true, status: 200, json: async () => saldo } as unknown as Response;
    }

    // lancarCreditos (INSERT no ledger): índice único (origem,ref) emulado.
    if (u.includes('/rest/v1/credit_ledger')) {
      ledgerChamadas++;
      const body = init?.body ? JSON.parse(init.body) : {};
      const ref = String(body.ref);
      if (ledgerRefs.has(ref)) return { ok: false, status: 409 } as Response;
      ledgerRefs.add(ref);
      saldo -= Math.abs(Number(body.delta) || 0);
      return { ok: true, status: 201 } as unknown as Response;
    }

    throw new Error(`fetch fake não sabe responder por: ${u}`);
  };
}

fingirFetch();

console.log('\n0) sanidade: o custo cobrado é o mesmo da tabela de preços');
checar('CUSTO.voz_ia === 1', CUSTO.voz_ia, 1);

console.log('\n1) confirmarCredito=true + saldo>0: cobra 1x e libera (não bloqueia)');
resetBanco(10);
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-A' });
  checar('não bloqueia', r.bloqueado, false);
  checar('debitou 1 do saldo', saldo, 9);
  checar('lançou 1x no ledger', ledgerChamadas, 1);
}

console.log('\n2) retry com o MESMO creditoRef: idempotente, não cobra 2x');
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-A' });
  checar('retry ainda não bloqueia (não pune o usuário pelo retry)', r.bloqueado, false);
  checar('tentou lançar de novo (2ª tentativa no ledger)', ledgerChamadas, 2);
  checar('mas o índice único bateu: saldo NÃO mudou de novo', saldo, 9);
}

console.log('\n3) creditoRef DIFERENTE é uma cobrança nova de verdade');
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-A2' });
  checar('não bloqueia', r.bloqueado, false);
  checar('debitou de novo (ref diferente = ação diferente)', saldo, 8);
}

console.log('\n3b) SEM creditoRef (o app hoje não manda): cai no hash do conteúdo — mesmo transcript');
// Este é o caminho REAL de hoje (src/services/olliAssistente.ts/vozNuvem.ts só
// mandam `confirmarCredito`, nunca `creditoRef`) — a idempotência tem que vir
// do fallback por conteúdo, não do campo explícito testado acima.
resetBanco(10);
{
  const r1 = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'troca de capacitor no split' });
  checar('1ª chamada não bloqueia', r1.bloqueado, false);
  checar('debitou 1', saldo, 9);
  checar('lançou 1x', ledgerChamadas, 1);

  // Retry de rede: MESMO transcript reenviado (o app não muda o corpo).
  const r2 = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'troca de capacitor no split' });
  checar('retry (mesmo conteúdo) não bloqueia', r2.bloqueado, false);
  checar('tentou de novo no ledger', ledgerChamadas, 2);
  checar('mas NÃO debitou 2x — hash do conteúdo deduplicou sozinho, sem o app mudar nada', saldo, 9);
}

console.log('\n3c) conteúdo DIFERENTE (fala nova) é cobrança nova de verdade');
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, conteudo: 'instalação de disjuntor novo' });
  checar('não bloqueia', r.bloqueado, false);
  checar('debitou de novo (fala diferente = ação diferente)', saldo, 8);
}

console.log('\n4) saldo=0: bloqueia (sem_creditos), sem sequer tentar o ledger');
resetBanco(0);
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-B' });
  checar('bloqueia', r.bloqueado, true);
  checar('nunca tentou o ledger (saldo insuficiente barra antes)', ledgerChamadas, 0);
}

console.log('\n5) banco fora (infra) ao ler o saldo: FAIL-OPEN — não bloqueia, não cobra');
resetBanco(10, { indisponivel: true });
{
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-C' });
  checar('não bloqueia mesmo com o banco fora (não pune por bug de billing)', r.bloqueado, false);
  checar('nem chegou no ledger (a leitura de saldo já falhou)', ledgerChamadas, 0);
  checar('saldo (que nem foi lido de verdade) segue intacto no nosso fake', saldo, 10);
}

console.log('\n6) banco fora (infra) SÓ na escrita do ledger (saldo lê OK): também FAIL-OPEN');
resetBanco(10);
{
  // Sabota só o POST do ledger nesta chamada, simulando escrita falhando com
  // o saldo ainda legível — sem alterar `fingirFetch` global.
  const fetchOriginal = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (String(url).includes('/rest/v1/credit_ledger')) {
      ledgerChamadas++;
      return { ok: false, status: 500 } as Response;
    }
    return fetchOriginal(url, init);
  };
  const r = await cobrarCreditoVoz(env, USER, { confirmarCredito: true, creditoRef: 'sessao-D' });
  (globalThis as any).fetch = fetchOriginal;
  checar('não bloqueia (a IA já entregou o resultado)', r.bloqueado, false);
  checar('tentou escrever 1x e falhou', ledgerChamadas, 1);
  checar('saldo não mudou (a escrita falhou de verdade)', saldo, 10);
}

console.log('\n7) sem confirmarCredito (ausente ou false): nunca cobra — nem toca no banco');
resetBanco(10);
{
  const r1 = await cobrarCreditoVoz(env, USER, {});
  checar('não bloqueia', r1.bloqueado, false);
  const r2 = await cobrarCreditoVoz(env, USER, { confirmarCredito: false, creditoRef: 'sessao-E' });
  checar('confirmarCredito:false explícito também não bloqueia', r2.bloqueado, false);
  checar('nenhuma das duas tocou o banco (nem saldo, nem ledger)', ledgerChamadas, 0);
  checar('saldo intacto', saldo, 10);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
// `process.exitCode` (não `process.exit()`): deixa o event loop drenar sozinho
// em vez de forçar o encerramento — em Windows, matar o processo com fetch
// (undici) ainda fechando handles no meio já produziu um crash de libuv
// (`UV_HANDLE_CLOSING`) flaky aqui; isto evita a corrida sem mudar o contrato
// (mesmo exit code 0/1 pro `npm test`).
process.exitCode = falhas === 0 ? 0 : 1;
