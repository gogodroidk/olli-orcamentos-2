/**
 * Teste PONTA A PONTA da cobrança de IA pela rota /voz — o caminho de dinheiro
 * que a migration ligou em 19/07/2026 e que, até agora, **nunca rodou em
 * produção** (docs/ENXAME/POS_DEPLOY.md, achado A3: `credit_ledger` e
 * `ia_uso_gratis` com 0 linhas).
 *
 *     node scripts/teste-cobranca-ia-ponta-a-ponta.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE, SE JÁ HÁ DOIS TESTES DE CRÉDITO ──────────
 * Ele não repete nenhum dos dois. O que estava descoberto era o meio da corrente:
 *
 *  • `scripts/teste-creditos-voz.ts` prova a DECISÃO — chama `cobrarCreditoVoz`
 *    direto e confere o `{ bloqueado }` que sai. Nunca vê uma resposta HTTP.
 *  • `scripts/teste-voz-conversa.ts` prova a rota /voz/conversa (handleVozConversa).
 *  • **`handleVoz` — a rota /voz de tiro único, a mais usada — não era exercida
 *    por teste nenhum.** Nada provava que ela TRADUZ a decisão: `{bloqueado:true}`
 *    tem que virar `{ok:false, erro:'sem_creditos'}` no corpo (o vocabulário que
 *    `respostaSemCreditos` em src/services/creditos.ts leva para "Ver planos"), e
 *    a cobrança tem que acontecer DEPOIS de a IA ter produzido resultado.
 *    Apagar a linha 104 de voz.js — `if (cobranca.bloqueado) return …` — passava
 *    limpo por toda a suíte: IA de graça para quem não tem saldo, sem um teste
 *    vermelho. (Medido: ver MUTATION CHECK no rodapé.)
 *
 * Então aqui a asserção é sempre sobre **o corpo que o app recebe**, percorrendo
 * o ciclo inteiro numa sequência contínua, sem resetar o banco no meio:
 *
 *     3 usos grátis  →  cota esgota  →  cai para crédito  →  crédito acaba  →  BLOQUEIA
 *
 * ─── OS RETORNOS SÃO OS REAIS, E ISSO É VERIFICADO, NÃO PROMETIDO ──────────
 * Um mock de RPC só vale enquanto casar com a função que está no banco. A seção 0
 * lê `supabase/migrations/20260727_ia_cota_gratis.sql` — a migration APLICADA em
 * produção (POS_DEPLOY conferiu assinatura, grants e objetos um a um) — e exige
 * que os quatro literais que `consumir_cota_ia` pode devolver sejam exatamente os
 * quatro em que `creditos.js` ramifica: `consumida`, `ja_contada`, `esgotada`,
 * `indisponivel`. Se alguém mudar o texto de um lado, este teste fica vermelho em
 * vez de o mock envelhecer em silêncio.
 *
 * `indisponivel` merece nota: é o retorno REAL do ramo `p_user is null` da
 * função, e o worker nunca o exercitou em teste — ele cai no `return
 * 'indisponivel'` genérico de `consumirCotaGratis` e vira fail-open.
 *
 * ─── O QUE ESTE TESTE NÃO PROVA ────────────────────────────────────────────
 * Continua sendo mock: nenhuma linha entra no `credit_ledger` de produção e
 * nenhum crédito real é debitado. O que ele fecha é o buraco entre "o contrato
 * está certo" (POS_DEPLOY provou) e "a rota age conforme o contrato" (ninguém
 * tinha provado). A primeira ação de voz de um usuário grátis continua sendo a
 * primeira execução real.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { handleVoz } from '../worker/src/voz.js';
// @ts-expect-error — idem.
import { IA_GRATIS_MES, JANELA_IDEM_MS } from '../worker/src/creditos.js';

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

const AQUI = dirname(fileURLToPath(import.meta.url));

const env: any = {
  SUPABASE_URL: 'https://falso.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso',
  GEMINI_API_KEY: 'gemini-falso',
  GEMINI_MODEL: 'gemini-2.5-flash',
};
const USER = { id: 'user-ponta-a-ponta' };

// ── relógio controlado (a janela de idempotência é regra sobre TEMPO) ──────
const DateNowReal = Date.now;
let relogio = DateNowReal();
Date.now = () => relogio;
function avancar(ms: number) {
  relogio += ms;
}

// ═══════════════════════════════════════════════════════════════════════════
// "BANCO" FALSO — emula o que a decisão consulta, com a semântica da migration
// ═══════════════════════════════════════════════════════════════════════════
type EstadoRpc = 'viva' | 'ausente' | 'fora_do_ar' | 'user_nulo' | 'valor_desconhecido';

let saldo = 0;
let saldoIndisponivel = false;
let ledgerLinhas: { ref: string; criadoEm: number }[] = [];
let ledgerChamadas = 0;
let cotaLinhas: { ref: string | null; criadoEm: number }[] = [];
let cotaChamadas = 0;
let cotaRpc: EstadoRpc = 'viva';
let lookupRpc: EstadoRpc = 'viva';
let chamadasGemini = 0;
/** '' = o Gemini FALHA (a API responde 500 e gemini() lança). */
let respostaGeminiFake = '';
let geminiQuebrado = false;

function resetBanco(saldoInicial: number, opts: { cotaRpc?: EstadoRpc; lookupRpc?: EstadoRpc; usosJaFeitos?: number; saldoIndisponivel?: boolean } = {}) {
  saldo = saldoInicial;
  saldoIndisponivel = !!opts.saldoIndisponivel;
  ledgerLinhas = [];
  ledgerChamadas = 0;
  cotaLinhas = Array.from({ length: opts.usosJaFeitos ?? 0 }, (_, i) => ({ ref: `pre-${i}`, criadoEm: relogio }));
  cotaChamadas = 0;
  cotaRpc = opts.cotaRpc ?? 'viva';
  lookupRpc = opts.lookupRpc ?? 'viva';
  chamadasGemini = 0;
  geminiQuebrado = false;
  respostaGeminiFake = JSON.stringify({
    titulo: 'Limpeza de split',
    clienteNome: 'Dona Marta',
    itens: [{ descricao: 'Limpeza completa 12.000 BTU', quantidade: 1, valorUnitario: 180, tipo: 'servico' }],
  });
}

function respostaJson(valor: unknown) {
  return { ok: true, status: 200, json: async () => valor } as unknown as Response;
}

(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = String(url);

  // ── Gemini ──
  if (u.includes('generativelanguage.googleapis.com')) {
    chamadasGemini++;
    if (geminiQuebrado) {
      // 500 → gemini() LANÇA. É o caminho que prova "IA que falhou não cobra".
      return { ok: false, status: 500, text: async () => 'erro interno' } as unknown as Response;
    }
    return respostaJson({ candidates: [{ content: { parts: [{ text: respostaGeminiFake }] } }] });
  }

  // ── regimeIa: sem linha em `assinaturas` = plano Grátis CONFIRMADO ──
  if (u.includes('/rest/v1/assinaturas')) return respostaJson([]);

  // ── consumir_cota_ia (migration 20260727) ──
  // A ordem é a MESMA do SQL e importa: retry-na-janela primeiro, contagem do
  // mês depois. Os literais devolvidos são os da função real (seção 0 prova).
  if (u.includes('/rest/v1/rpc/consumir_cota_ia')) {
    cotaChamadas++;
    if (cotaRpc === 'ausente') return { ok: false, status: 404 } as Response; // PGRST202
    if (cotaRpc === 'fora_do_ar') return { ok: false, status: 500 } as Response;
    // `p_user is null` na função real → ela devolve a STRING 'indisponivel'
    // (HTTP 200). É o único retorno dela que não é um dos três do contrato.
    if (cotaRpc === 'user_nulo') return respostaJson('indisponivel');
    // Um valor que a função não devolve hoje (versão futura, deploy pela metade).
    if (cotaRpc === 'valor_desconhecido') return respostaJson('talvez');

    const body = init?.body ? JSON.parse(init.body) : {};
    const ref = body.p_ref == null ? null : String(body.p_ref);
    // `and u.criado_em > now() - v_janela` — janela DESLIZANTE.
    const repetida = ref !== null && cotaLinhas.some((l) => l.ref === ref && l.criadoEm > relogio - JANELA_IDEM_MS);
    if (repetida) return respostaJson('ja_contada');
    if (cotaLinhas.length >= Number(body.p_limite)) return respostaJson('esgotada');
    cotaLinhas.push({ ref, criadoEm: relogio });
    return respostaJson('consumida');
  }

  // ── ref_cobranca_ia_recente: a janela do LEDGER ──
  if (u.includes('/rest/v1/rpc/ref_cobranca_ia_recente')) {
    if (lookupRpc === 'ausente') return { ok: false, status: 404 } as Response;
    if (lookupRpc === 'fora_do_ar') return { ok: false, status: 500 } as Response;
    const body = init?.body ? JSON.parse(init.body) : {};
    const prefixo = String(body.p_prefixo ?? '');
    const achada = ledgerLinhas
      .filter((l) => l.ref.startsWith(prefixo) && l.criadoEm > relogio - JANELA_IDEM_MS)
      .sort((a, b) => b.criadoEm - a.criadoEm)[0];
    return respostaJson(achada?.ref ?? null);
  }

  // ── saldo_creditos ──
  if (u.includes('/rest/v1/rpc/saldo_creditos')) {
    if (saldoIndisponivel) return { ok: false, status: 500 } as Response;
    return respostaJson(saldo);
  }

  // ── credit_ledger (INSERT): índice único (origem,ref) emulado ──
  if (u.includes('/rest/v1/credit_ledger')) {
    ledgerChamadas++;
    const body = init?.body ? JSON.parse(init.body) : {};
    const ref = String(body.ref);
    if (ledgerLinhas.some((l) => l.ref === ref)) {
      return { ok: false, status: 409, json: async () => ({ code: '23505' }) } as unknown as Response;
    }
    ledgerLinhas.push({ ref, criadoEm: relogio });
    saldo -= Math.abs(Number(body.delta) || 0);
    return { ok: true, status: 201 } as unknown as Response;
  }

  throw new Error(`fetch fake não sabe responder por: ${u}`);
};

/** Uma chamada REAL de POST /voz. Devolve status + corpo, como o app vê. */
async function falar(transcript: string, extra: Record<string, unknown> = {}) {
  const r = await handleVoz(JSON.stringify({ transcript, ...extra }), env, USER);
  return { status: r.status, body: (await r.json()) as any };
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n0) o mock fala a MESMA língua da RPC que está no banco');
// Sem esta seção, todo o resto do arquivo prova apenas que o worker concorda com
// as suposições do autor do mock. Aqui as suposições viram asserção contra a
// migration aplicada em produção.
{
  const sql = readFileSync(join(AQUI, '..', 'supabase', 'migrations', '20260727_ia_cota_gratis.sql'), 'utf8');
  const worker = readFileSync(join(AQUI, '..', 'worker', 'src', 'creditos.js'), 'utf8');

  for (const literal of ['consumida', 'ja_contada', 'esgotada', 'indisponivel']) {
    checar(
      `consumir_cota_ia devolve '${literal}' (migration 20260727)`,
      new RegExp(`return\\s+'${literal}'`).test(sql),
      true,
    );
    checar(`e creditos.js ramifica em '${literal}'`, worker.includes(`'${literal}'`), true);
  }
  // A janela vive em três lugares e discordar é uma cobrança que ninguém explica.
  const janelas = sql.match(/interval\s+'10 minutes'/g) || [];
  checar('a migration aplica a janela de 10 min nas DUAS funções', janelas.length, 2);
  checar('e JANELA_IDEM_MS espelha os mesmos 10 min', JANELA_IDEM_MS, 10 * 60 * 1000);
  checar('IA_GRATIS_MES === 3 (o p_limite que vai na RPC)', IA_GRATIS_MES, 3);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) CICLO COMPLETO em UMA sequência: 3 grátis → cota esgota → crédito → acaba → bloqueia');
// Sem reset no meio de propósito: o valor deste bloco está na continuidade. Cada
// chamada é um POST /voz de verdade, e a asserção é o corpo que o app recebe.
resetBanco(2); // 2 créditos comprados, cota do mês zerada em usos
{
  for (const n of [1, 2, 3]) {
    const { status, body } = await falar(`fala grátis ${n}`);
    checar(`uso ${n}/3 — HTTP 200`, status, 200);
    checar(`uso ${n}/3 — resposta útil (ok + itens)`, [body.ok, Array.isArray(body.itens)], [true, true]);
  }
  checar('gastou os 3 usos da cota do mês', cotaLinhas.length, 3);
  checar('e NÃO tocou no ledger (grátis é grátis)', ledgerChamadas, 0);
  checar('saldo de créditos intacto', saldo, 2);

  // 4ª: a RPC responde 'esgotada' e daqui em diante é crédito — o cliente não
  // precisou pedir nada (o servidor é quem decide; era este o buraco original).
  const q = await falar('fala paga 1');
  checar('4ª chamada ainda entrega o resultado', q.body.ok, true);
  checar('mas cobrou 1 crédito', saldo, 1);
  checar('1 lançamento no ledger', ledgerLinhas.length, 1);

  const c = await falar('fala paga 2');
  checar('5ª chamada entrega e cobra o último crédito', [c.body.ok, saldo], [true, 0]);

  // 6ª: cota esgotada E saldo 0. É AQUI que o app tem que ouvir 'sem_creditos'.
  const bloqueada = await falar('fala paga 3');
  checar('6ª chamada BLOQUEIA com o vocabulário que o app entende', bloqueada.body, {
    ok: false,
    erro: 'sem_creditos',
  });
  checar('sem nenhum item vazado na resposta bloqueada', bloqueada.body.itens, undefined);
  checar('não lançou débito sem saldo (a leitura barra antes)', ledgerLinhas.length, 2);
  checar('saldo não ficou negativo', saldo, 0);
}

console.log('\n2) retry DENTRO da janela do mesmo trabalho pago: entrega de novo e NÃO cobra 2x');
// O caso que mais dói se errar: quem pagou o último crédito e deu retry recebia
// "você não tem créditos" por um trabalho que acabou de pagar.
resetBanco(1, { usosJaFeitos: IA_GRATIS_MES });
{
  const primeira = await falar('mesma fala paga');
  checar('cobrou o único crédito', [primeira.body.ok, saldo], [true, 0]);

  avancar(60_000); // 1 min — o retry honesto do timeout de 60s do app
  const retry = await falar('mesma fala paga');
  checar('retry NÃO vira "sem_creditos"', retry.body.ok, true);
  checar('e não cobrou de novo', saldo, 0);
  checar('nenhum lançamento novo no ledger', ledgerLinhas.length, 1);
}

console.log('\n3) MESMA fala FORA da janela é trabalho NOVO — e sem saldo, bloqueia');
// A outra ponta da mesma regra: idempotência eterna seria 1 crédito comprando IA
// para sempre. Passada a janela, a chave repetida deixa de ser retry.
{
  avancar(JANELA_IDEM_MS + 1000);
  const depois = await falar('mesma fala paga');
  checar('fora da janela, sem saldo: bloqueia', depois.body, { ok: false, erro: 'sem_creditos' });
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n4) IA que FALHOU nunca cobra — a cobrança vem depois do resultado');
resetBanco(5, { usosJaFeitos: IA_GRATIS_MES });
{
  geminiQuebrado = true;
  let lancou = false;
  try {
    await falar('fala que o Gemini derruba');
  } catch {
    lancou = true; // gemini() lança; index.js traduz em 502/503 lá fora
  }
  checar('a chamada falhou (o erro sobe, não vira sucesso)', lancou, true);
  checar('e o Gemini foi mesmo tentado', chamadasGemini, 1);
  checar('nenhum crédito debitado por trabalho que não saiu', saldo, 5);
  checar('nenhum uso de cota queimado', cotaChamadas, 0);
  checar('ledger intocado', ledgerChamadas, 0);
}

console.log('\n4b) resposta ILEGÍVEL do Gemini também não cobra');
resetBanco(5, { usosJaFeitos: IA_GRATIS_MES });
{
  respostaGeminiFake = 'isto não é json';
  const { body } = await falar('fala com resposta quebrada');
  checar('erro de parse é reportado, não mascarado', body, { ok: false, erro: 'resposta_invalida' });
  checar('e não cobrou por resposta que o app não pode usar', saldo, 5);
  checar('sem consultar cota (o retorno é antes da cobrança)', cotaChamadas, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n5) ERRO DE INFRA NUNCA vira "sem_creditos" (P0: erro não vira vazio)');
// Quatro maneiras diferentes de a RPC não dar uma resposta utilizável. Nenhuma
// pode chegar ao usuário como falta de saldo — é a diferença entre "você não
// pagou" e "nós quebramos", e só uma delas é verdade.
{
  const cenarios: { nome: string; estado: EstadoRpc }[] = [
    { nome: 'migration ausente (404 PGRST202)', estado: 'ausente' },
    { nome: 'banco fora do ar (500)', estado: 'fora_do_ar' },
    { nome: "a própria RPC devolvendo 'indisponivel' (ramo p_user null)", estado: 'user_nulo' },
    { nome: 'valor que a função não devolve hoje', estado: 'valor_desconhecido' },
  ];
  for (const c of cenarios) {
    resetBanco(0, { cotaRpc: c.estado }); // saldo ZERO: se colapsasse em "esgotada", bloquearia
    const { body } = await falar(`fala com ${c.nome}`);
    checar(`${c.nome}: libera (fail-open), não bloqueia`, body.ok, true);
    checar(`${c.nome}: e não inventou cobrança`, ledgerChamadas, 0);
  }
}

console.log('\n5b) saldo ILEGÍVEL na hora de debitar: a IA já entregou — libera');
resetBanco(0, { usosJaFeitos: IA_GRATIS_MES, saldoIndisponivel: true });
{
  const { body } = await falar('fala com saldo ilegível');
  checar('não bloqueia por erro de leitura do saldo', body.ok, true);
  checar('e nem tentou lançar às cegas', ledgerChamadas, 0);
}

console.log('\n5c) a RPC da JANELA fora do ar (cota respondendo): cobra, mas não duas vezes');
// Degradar o lookup não pode virar cobrança dupla do mesmo trabalho: sem
// consulta, a chave volta a ser a ESTÁVEL, e o índice único absorve o retry.
resetBanco(3, { usosJaFeitos: IA_GRATIS_MES, lookupRpc: 'fora_do_ar' });
{
  await falar('fala com lookup fora');
  checar('cobrou uma vez', saldo, 2);
  await falar('fala com lookup fora');
  checar('retry no estado degradado NÃO cobrou de novo', saldo, 2);
  checar('e o ledger tem 1 linha só', ledgerLinhas.length, 1);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n6) plano PAGO passa livre — sem cota, sem crédito, sem round-trip');
{
  resetBanco(7);
  const guardado = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (String(url).includes('/rest/v1/assinaturas')) {
      return respostaJson([{ plano: 'pro', status: 'active', current_period_end: new Date(relogio + 30 * 864e5).toISOString() }]);
    }
    return guardado(url, init);
  };
  const { body } = await falar('fala do assinante');
  checar('entrega normal', body.ok, true);
  checar('não consultou a cota', cotaChamadas, 0);
  checar('não tocou no ledger', ledgerChamadas, 0);
  checar('saldo intacto', saldo, 7);
  (globalThis as any).fetch = guardado;
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION CHECK — rodado em 19/07/2026 contra este arquivo.
// Cada mutação foi aplicada a worker/src/, `node scripts/teste-cobranca-ia-ponta-a-ponta.ts`
// rodou, e o resultado abaixo é o medido (o script fica em
// scripts/mutar-cobranca-ia.mjs, para repetir):
//
//   1. voz.js:104   apagar `if (cobranca.bloqueado) return …`      → PEGA (seção 1)
//   2. creditos.js  `cota === 'esgotada'` liberar em vez de cobrar → PEGA (seção 1)
//   3. creditos.js  'indisponivel' tratado como 'esgotada'         → PEGA (seção 5)
//   4. creditos.js  `jaCobrada` ignorado (sempre cobra de novo)    → PEGA (seção 2)
//   5. voz.js       cobrar ANTES de chamar o Gemini                → PEGA (seção 4)
//   6. creditos.js  `refCobrancaRecente` erro → null (não 'indisponivel') → PEGA (seção 5c)
//
// A #6 é a que justifica a seção 5c existir: ela não foi pega pela primeira
// versão deste arquivo, que só olhava o saldo final da primeira chamada.
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
// `process.exitCode` (não `process.exit()`): deixa o event loop drenar sozinho.
process.exitCode = falhas === 0 ? 0 : 1;
DateNowReal; // silencia "declarado e não usado" sem esconder a captura do relógio real
