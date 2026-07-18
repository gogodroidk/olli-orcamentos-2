/**
 * Teste do modo CONVERSA de /voz (Tier B, cluster T3a,
 * docs/ENXAME/OLLI_VOZ_CONVERSA.md — Fase 3):
 * "faltando cliente OU item a Olli pergunta de volta (nunca cobra); quando
 * fecha (pronto:true) cobra 1 crédito por CONVERSA (idempotente pelo
 * conversationId, nunca 2x); no teto de turnos fecha à força, mesmo que o
 * Gemini insista em perguntar."
 *
 *     node scripts/teste-voz-conversa.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita `handleVozConversa` REAL (worker/src/voz.js) contra um Gemini e um
 * Supabase FALSOS (fetch trocado), mesmo padrão de teste-creditos-voz.ts. Não
 * importa worker/src/index.js: ele carrega @sentry/cloudflare (dependência só
 * de worker/, fora do `npm ci` da raiz) — por isso handleVoz/handleVozConversa
 * viraram um módulo próprio (voz.js), testável isolado, igual creditos.js.
 */
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { handleVozConversa, VOZ_CONVERSA_MAX } from '../worker/src/voz.js';

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

const env: any = {
  SUPABASE_URL: 'https://falso.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso',
  GEMINI_API_KEY: 'gemini-falso',
  GEMINI_MODEL: 'gemini-2.5-flash',
};
const USER = { id: 'user-teste-voz-conversa' };

// ── "bancos" falsos: Gemini (texto controlado pelo teste) + créditos (saldo +
// refs já lançados, idempotência real do índice único (origem,ref) do
// credit_ledger, emulada com um Set) ─────────────────────────────────────
let saldo = 0;
let ledgerRefs = new Set<string>();
let ledgerChamadas = 0;
let chamadasGemini = 0;
let respostaGeminiFake = '';
// Cota grátis de IA do mês, contada NO SERVIDOR (migration 20260727). O default é
// 0 (esgotada) porque quase todo caso aqui exercita a COBRANÇA do fechamento; os
// casos que testam o uso grátis passam o valor explicitamente.
let cotaRestante = 0;
let cotaRefs = new Set<string>();

function resetBanco(saldoInicial: number, cotaGratisRestante = 0) {
  saldo = saldoInicial;
  ledgerRefs = new Set();
  ledgerChamadas = 0;
  chamadasGemini = 0;
  cotaRestante = cotaGratisRestante;
  cotaRefs = new Set();
}

function fingirFetch() {
  (globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
    const u = String(url);

    // gemini() → generateContent: devolve o texto que o teste armou.
    if (u.includes('generativelanguage.googleapis.com')) {
      chamadasGemini++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: respostaGeminiFake }] } }] }),
      } as unknown as Response;
    }

    // regimeIa (creditos.js): sem linha em `assinaturas` = plano Grátis
    // CONFIRMADO — é quem tem cota mensal e, esgotada ela, paga crédito.
    if (u.includes('/rest/v1/assinaturas')) {
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    }

    // consumir_cota_ia (RPC da migration 20260727): a cota grátis do mês, contada
    // no servidor. `ref` (aqui, o conversationId) dá a idempotência do retry.
    if (u.includes('/rest/v1/rpc/consumir_cota_ia')) {
      const body = init?.body ? JSON.parse(init.body) : {};
      const ref = body.p_ref == null ? null : String(body.p_ref);
      if (ref !== null && cotaRefs.has(ref)) {
        return { ok: true, status: 200, json: async () => 'ja_contada' } as unknown as Response;
      }
      if (cotaRestante <= 0) {
        return { ok: true, status: 200, json: async () => 'esgotada' } as unknown as Response;
      }
      cotaRestante--;
      if (ref !== null) cotaRefs.add(ref);
      return { ok: true, status: 200, json: async () => 'consumida' } as unknown as Response;
    }

    // saldoCreditos (RPC).
    if (u.includes('/rest/v1/rpc/saldo_creditos')) {
      return { ok: true, status: 200, json: async () => saldo } as unknown as Response;
    }

    // lancarCreditos (INSERT no ledger): índice único (origem,ref) emulado, com o
    // corpo que o PostgREST manda de verdade (o `code` é o que distingue
    // idempotência de "o lançamento não entrou" — ver lancarCreditos).
    if (u.includes('/rest/v1/credit_ledger')) {
      ledgerChamadas++;
      const body = init?.body ? JSON.parse(init.body) : {};
      const ref = String(body.ref);
      if (ledgerRefs.has(ref)) {
        return { ok: false, status: 409, json: async () => ({ code: '23505' }) } as unknown as Response;
      }
      ledgerRefs.add(ref);
      saldo -= Math.abs(Number(body.delta) || 0);
      return { ok: true, status: 201 } as unknown as Response;
    }

    throw new Error(`fetch fake não sabe responder por: ${u}`);
  };
}
fingirFetch();

async function chamar(corpo: unknown) {
  const r = await handleVozConversa(JSON.stringify(corpo), env, USER);
  const body = await r.json();
  return { status: r.status, body };
}

console.log('\n0) sanidade: o teto de turnos é o combinado (6)');
checar('VOZ_CONVERSA_MAX.turnos === 6', VOZ_CONVERSA_MAX.turnos, 6);

console.log('\n1) faltando cliente/item: Olli pergunta de volta — NÃO cobra');
resetBanco(10);
respostaGeminiFake = JSON.stringify({ pergunta: 'Qual o nome do cliente?' });
{
  const { body } = await chamar({
    conversa: [{ papel: 'user', texto: 'preciso trocar um disjuntor' }],
    conversationId: 'conv-1',
    confirmarCredito: true,
  });
  checar('ok', body.ok, true);
  checar('pronto: false', body.pronto, false);
  checar('devolve a pergunta da Olli', body.pergunta, 'Qual o nome do cliente?');
  checar('não tocou o ledger (pergunta nunca cobra)', ledgerChamadas, 0);
  checar('saldo intacto', saldo, 10);
}

console.log('\n2) conversa completa (cliente + item): pronto:true, itens, cobra 1x');
resetBanco(10);
const conversaCompleta = [
  { papel: 'user', texto: 'preciso trocar um disjuntor pra dona Helena' },
  { papel: 'olli', texto: 'Qual o valor do serviço?' },
  { papel: 'user', texto: 'R$150' },
];
respostaGeminiFake = JSON.stringify({
  pronto: true,
  clienteNome: 'Dona Helena',
  titulo: 'Troca de disjuntor',
  itens: [{ descricao: 'Troca de disjuntor', quantidade: 1, valorUnitario: 150, tipo: 'servico' }],
});
{
  const { body } = await chamar({
    conversa: conversaCompleta,
    conversationId: 'conv-2',
    confirmarCredito: true,
  });
  checar('ok', body.ok, true);
  checar('pronto: true', body.pronto, true);
  checar('clienteNome', body.clienteNome, 'Dona Helena');
  checar('1 item, no mesmo shape do /voz de hoje', body.itens, [
    { descricao: 'Troca de disjuntor', quantidade: 1, valorUnitario: 150, tipo: 'servico' },
  ]);
  checar('cobrou 1x no ledger', ledgerChamadas, 1);
  checar('debitou 1 do saldo', saldo, 9);
}

console.log('\n3) 2ª chamada "pronto:true" com o MESMO conversationId: idempotente, não cobra 2x');
{
  // Mesma conversa (ex.: um retry de rede do turno final, ou uma 2ª leva de
  // turnos que também já fecha) — o conversationId é o mesmo da conversa.
  const { body } = await chamar({
    conversa: conversaCompleta,
    conversationId: 'conv-2',
    confirmarCredito: true,
  });
  checar('ainda pronto: true (não bloqueia o retry)', body.pronto, true);
  checar('tentou lançar de novo no ledger', ledgerChamadas, 2);
  checar('mas o índice único bateu: saldo NÃO mudou de novo', saldo, 9);
}

console.log('\n4) conversationId DIFERENTE é uma conversa nova de verdade: cobra de novo');
{
  const { body } = await chamar({
    conversa: conversaCompleta,
    conversationId: 'conv-3',
    confirmarCredito: true,
  });
  checar('pronto: true', body.pronto, true);
  checar('debitou de novo (conversa diferente = cobrança diferente)', saldo, 8);
}

console.log('\n5) teto de turnos: no 6º turno do técnico, FORÇA pronto:true mesmo com Gemini teimoso');
resetBanco(10);
// Simula um modelo que se recusa a fechar (continua pedindo mais um dado) —
// o teto tem que vencer a instrução do prompt, não só confiar nela.
respostaGeminiFake = JSON.stringify({ pergunta: 'ainda preciso saber mais um detalhe' });
const conversaLonga: Array<{ papel: string; texto: string }> = [];
for (let i = 1; i <= VOZ_CONVERSA_MAX.turnos; i++) {
  conversaLonga.push({ papel: 'user', texto: `fala do técnico, turno ${i}` });
  if (i < VOZ_CONVERSA_MAX.turnos) conversaLonga.push({ papel: 'olli', texto: `pergunta da Olli, turno ${i}` });
}
{
  const { body } = await chamar({
    conversa: conversaLonga,
    conversationId: 'conv-teto',
    confirmarCredito: true,
  });
  checar('teto força pronto: true (ignora o "pergunta" do Gemini)', body.pronto, true);
  checar('sem campo pergunta na resposta forçada', body.pergunta, undefined);
  checar('mesmo forçado, cobra 1x (é o fechamento da conversa)', ledgerChamadas, 1);
  checar('saldo debitado', saldo, 9);
}

console.log('\n6) abaixo do teto (5 turnos): NÃO força — segue perguntando');
resetBanco(10);
respostaGeminiFake = JSON.stringify({ pergunta: 'e o nome do cliente?' });
const conversaQuaseNoTeto: Array<{ papel: string; texto: string }> = [];
for (let i = 1; i <= VOZ_CONVERSA_MAX.turnos - 1; i++) {
  conversaQuaseNoTeto.push({ papel: 'user', texto: `fala ${i}` });
  conversaQuaseNoTeto.push({ papel: 'olli', texto: `pergunta ${i}` });
}
{
  const { body } = await chamar({
    conversa: conversaQuaseNoTeto,
    conversationId: 'conv-quase-teto',
    confirmarCredito: true,
  });
  checar('ainda pergunta (não bateu o teto)', body.pronto, false);
  checar('não cobrou', ledgerChamadas, 0);
}

// ATENÇÃO — este caso mudou de expectativa de propósito. Ele afirmava que sem
// `confirmarCredito` a conversa fechava DE GRAÇA. Isso não era uma regra: era o
// buraco. Qualquer conta com JWT válido que só omitisse o campo usava o Gemini
// (conta do dono) ilimitado. Autorização é decisão do SERVIDOR — o cliente pede,
// não concede. Ver cobrarCreditoVoz em worker/src/creditos.js.
console.log('\n7) sem confirmarCredito NÃO é passe livre: cota esgotada = cobra do mesmo jeito');
resetBanco(10);
respostaGeminiFake = JSON.stringify({
  pronto: true,
  clienteNome: 'Seu Zé',
  itens: [{ descricao: 'Reparo hidráulico', quantidade: 1, valorUnitario: 200, tipo: 'servico' }],
});
{
  const { body } = await chamar({
    conversa: [{ papel: 'user', texto: 'reparo hidráulico pro Seu Zé, R$200' }],
    conversationId: 'conv-sem-confirmar',
    confirmarCredito: false,
  });
  checar('pronto: true (a IA já entregou o resultado)', body.pronto, true);
  checar('cobrou mesmo sem o cliente pedir', ledgerChamadas, 1);
  checar('saldo debitado', saldo, 9);
}

console.log('\n7b) com cota grátis do mês disponível: fecha SEM gastar crédito');
resetBanco(10, 3);
{
  const { body } = await chamar({
    conversa: [{ papel: 'user', texto: 'reparo hidráulico pro Seu Zé, R$200' }],
    conversationId: 'conv-com-cota',
  });
  checar('pronto: true', body.pronto, true);
  checar('gastou 1 uso grátis (sobraram 2)', cotaRestante, 2);
  checar('ledger intocado', ledgerChamadas, 0);
  checar('saldo intacto', saldo, 10);
}

console.log('\n7c) cota esgotada E sem crédito: bloqueia com sem_creditos (o app leva pra "Ver planos")');
resetBanco(0);
{
  const { body } = await chamar({
    conversa: [{ papel: 'user', texto: 'reparo hidráulico pro Seu Zé, R$200' }],
    conversationId: 'conv-sem-saldo',
  });
  checar('erro sem_creditos', body, { ok: false, erro: 'sem_creditos' });
  checar('nem tentou lançar (saldo insuficiente barra antes)', ledgerChamadas, 0);
}

console.log('\n8) conversa vazia: erro, não chama o Gemini');
resetBanco(10);
{
  const { body } = await chamar({ conversa: [], conversationId: 'conv-vazia', confirmarCredito: true });
  checar('erro sem_conversa', body, { ok: false, erro: 'sem_conversa' });
  checar('nunca chamou o Gemini', chamadasGemini, 0);
}

// ── Compat com o cluster T3b (src/services/olliAssistente.ts): o próprio
// arquivo documenta que suas suposições de contrato podem precisar ajuste
// ("ajustar aqui se o T3a fechar diferente") — em vez disso, o worker aceita
// os dois nomes de campo (`conversa`/`historico`) e o `fechar` que o app já
// manda, sem exigir mudança no lado do app. Ver o comentário em voz.js.
console.log('\n9) campo "historico" (alias do cluster T3b) funciona igual a "conversa"');
resetBanco(10);
respostaGeminiFake = JSON.stringify({ pergunta: 'e qual o nome do cliente?' });
{
  const { body } = await chamar({
    historico: [{ papel: 'user', texto: 'preciso fazer uma poda' }],
    conversationId: 'conv-historico',
    confirmarCredito: true,
  });
  checar('funciona igual ao campo "conversa"', body, { ok: true, pronto: false, pergunta: 'e qual o nome do cliente?' });
  checar('não cobrou', ledgerChamadas, 0);
}

console.log('\n10) fechar:true força pronto:true mesmo no 1º turno (abaixo do teto)');
resetBanco(10);
respostaGeminiFake = JSON.stringify({ pergunta: 'ainda falta um dado' }); // Gemini teimoso de novo
{
  const { body } = await chamar({
    conversa: [{ papel: 'user', texto: 'conserto de torneira' }],
    conversationId: 'conv-fechar',
    confirmarCredito: true,
    fechar: true,
  });
  checar('fechar:true força pronto: true mesmo no turno 1', body.pronto, true);
  checar('sem pergunta na resposta forçada', body.pergunta, undefined);
  checar('cobrou (é o fechamento da conversa)', ledgerChamadas, 1);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
// `process.exitCode` (não `process.exit()`): mesma razão de teste-creditos-voz.ts
// — deixa o event loop drenar sozinho em vez de forçar o encerramento com
// fetch (undici) ainda fechando handles no meio (evita o crash flaky no Windows).
process.exitCode = falhas === 0 ? 0 : 1;
