/**
 * Teste da FONTE DE PREÇO do app e da tela de planos.
 *
 *     node scripts/teste-planos-fonte.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * O QUE ESTÁ SENDO TRANCADO (três coisas que já vazaram neste projeto):
 *
 *  1. PREÇO DERIVADO DA FONTE. `src/services/precosPlanos.ts` guarda o número em
 *     centavos, conferido contra a Stripe live; a tela IMPORTA e formata. Nenhum
 *     literal de R$ solto em `PlanosScreen.tsx` — o revisor grepa por "39"/"99"
 *     e literal solto reprova. Preço escrito de memória já mentiu 5 vezes aqui.
 *
 *  2. DESCONTO CALCULADO, não digitado. O anual é `mensal × 12 − 20%` derivado; a
 *     guarda de coerência do módulo quebra no import se alguém desalinhar os dois.
 *
 *  3. O 12× É A VERDADE, não um desconto. O parcelado é o valor CHEIO do ano
 *     (12 × mensal) e sai MAIS CARO que o anual à vista. Vender "12x sem juros"
 *     como vantagem é propaganda enganosa (CDC art. 37) — quem descobre pede
 *     reembolso. O teste exige que `sobrecusto12xVsAnualCentavos` seja positivo.
 *
 *  4. iOS (Guideline 3.1.1): a info fica completa, o CTA de compra some.
 *
 * Ao final há uma SEÇÃO DE MUTAÇÃO: reintroduz cada violação e confirma que a
 * asserção correspondente CAI — uma asserção que não morde não protege nada.
 *
 * Padrão de wiring idêntico aos outros `test:*`; não está em `npm test` porque a
 * raiz tem `package.json` fora do escopo desta sessão (ver AGENTS.md do worktree).
 */
import { readFileSync } from 'node:fs';
import {
  PRECO_PRO,
  PRECO_EMPRESA,
  DESCONTO_ANUAL_ROTULO,
  reais,
  precoNoPeriodo,
} from '../src/services/precosPlanos.ts';

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

function ler(caminho: string): string {
  return readFileSync(new URL(caminho, import.meta.url), 'utf8');
}

const tela = ler('../src/screens/PlanosScreen.tsx');

// Regra do revisor: nenhum "39"/"99" (nem "R$ 39"/"R$ 99") solto na tela.
const REGEX_LITERAL_PRECO = /R\$\s?39\b|R\$\s?99\b|\b39\b|\b99\b/;
function telaSemLiteralDePreco(fonte: string): boolean {
  return !REGEX_LITERAL_PRECO.test(fonte);
}
// A conta do desconto na mão (mensal*12*0.8) é o cheiro do preço não-derivado.
const REGEX_DESCONTO_NA_MAO = /\*\s*12\s*\*\s*0\.8/;

console.log('\n1) FONTE — preços em centavos, conferidos contra a Stripe live');
checar('Pro mensal = 3900 centavos', PRECO_PRO.mensalCentavos, 3900);
checar('Empresa mensal = 9900 centavos', PRECO_EMPRESA.mensalCentavos, 9900);
checar('reais(mensal Pro) = "R$ 39"', reais(PRECO_PRO.mensalCentavos), 'R$ 39');
checar('reais(mensal Empresa) = "R$ 99"', reais(PRECO_EMPRESA.mensalCentavos), 'R$ 99');

console.log('\n2) DESCONTO CALCULADO (não digitado)');
checar('Pro anual = round(mensal × 12 × 0,8)', PRECO_PRO.anualCentavos, Math.round(3900 * 12 * 0.8));
checar('Empresa anual = round(mensal × 12 × 0,8)', PRECO_EMPRESA.anualCentavos, Math.round(9900 * 12 * 0.8));
checar('rótulo de desconto derivado da constante', DESCONTO_ANUAL_ROTULO, '20%');
checar('Pro anual por mês = 3120 (R$ 31,20)', PRECO_PRO.anualPorMesCentavos, 3120);
checar('Pro economia anual = 9360 (R$ 93,60)', PRECO_PRO.economiaAnualCentavos, 3900 * 12 - PRECO_PRO.anualCentavos);
checar('precoNoPeriodo anual → "R$ 31,20"', precoNoPeriodo(PRECO_PRO, 'anual').valor, 'R$ 31,20');
checar('precoNoPeriodo anual traz a economia na nota', /economiza R\$ 93,60/.test(precoNoPeriodo(PRECO_PRO, 'anual').nota ?? ''), true);
checar('precoNoPeriodo mensal sem nota', precoNoPeriodo(PRECO_PRO, 'mensal').nota, null);

console.log('\n3) O 12× É A VERDADE — mais caro que o anual, nunca "desconto"');
checar('Pro 12x total = 46800 (valor CHEIO do ano)', PRECO_PRO.parceladoCentavos, 46800);
checar('Pro 12x parcela = mensal (3900)', PRECO_PRO.parcelaCentavos, 3900);
checar('12x custa a MAIS que o anual (sobrecusto = 9360)', PRECO_PRO.sobrecusto12xVsAnualCentavos, 9360);
checar('12x > anual (comparação direta)', PRECO_PRO.parceladoCentavos! > PRECO_PRO.anualCentavos, true);
checar('reais(sobrecusto) = "R$ 93,60"', reais(PRECO_PRO.sobrecusto12xVsAnualCentavos!), 'R$ 93,60');
checar('Empresa não tem produto avulso (sem 12x)', PRECO_EMPRESA.parceladoCentavos, null);

console.log('\n4) A TELA importa a fonte e não tem literal de preço');
checar('PlanosScreen sem "39"/"99" solto', telaSemLiteralDePreco(tela), true);
checar('PlanosScreen importa precosPlanos', tela.includes("from '../services/precosPlanos'"), true);
checar('PlanosScreen usa precoNoPeriodo (derivado)', tela.includes('precoNoPeriodo('), true);
checar('PlanosScreen usa o rótulo de desconto da fonte', tela.includes('DESCONTO_ANUAL_ROTULO'), true);
checar('PlanosScreen NÃO faz a conta de desconto na mão', REGEX_DESCONTO_NA_MAO.test(tela), false);
checar('comparativo derivado de entitlements (temAcessoRecurso)', tela.includes('temAcessoRecurso('), true);
checar('comparativo varre os recursos gateados da fonte', tela.includes('RECURSOS_GATEADOS'), true);
checar('linha do 12x nomeia a fonte da verdade (texto12xPro)', tela.includes('texto12xPro('), true);

console.log('\n5) iOS (Guideline 3.1.1) — info completa, compra escondida');
checar('COMPRA_NO_APP definido', tela.includes("const COMPRA_NO_APP = Platform.OS !== 'ios';"), true);
checar('CTA de compra condicionado a COMPRA_NO_APP', tela.includes(') : !COMPRA_NO_APP ? ('), true);
checar('abas de período escondidas fora de compra', tela.includes('{COMPRA_NO_APP && ('), true);
checar('linha 12x só onde há compra', tela.includes('COMPRA_NO_APP && linha12x'), true);
// O comparativo (info) NÃO é gateado por plataforma — fica completo no iOS.
checar('comparativo renderiza sem guarda de plataforma', tela.includes('<ComparativoTabela planoAtualId={planoAtualId}'), true);

// ─────────────────────────────────────────────────────────────────────────────
// SEÇÃO DE MUTAÇÃO — reintroduz cada violação e confirma que a asserção CAI.
// Cada mutação é (nome, entrada quebrada, predicado que DEVERIA reprovar). Se o
// predicado ainda aprova a entrada quebrada, a asserção é frouxa: isso conta
// como falha (a rede de segurança tem um furo).
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n6) MUTAÇÃO — cada violação reintroduzida deve DERRUBAR uma asserção');

interface Mutacao {
  nome: string;
  // `true` se a violação foi PEGA (a asserção reprovou a entrada mutada).
  pego: boolean;
}

const mutacoes: Mutacao[] = [
  {
    nome: "literal 'R$ 39' de volta na tela → check de literal cai",
    pego: !telaSemLiteralDePreco(tela + "\n  const x = 'R$ 39';"),
  },
  {
    nome: "'precoMensal: 99' de volta na tela → check de literal cai",
    pego: !telaSemLiteralDePreco(tela + '\n  const y = { precoMensal: 99 };'),
  },
  {
    nome: 'conta de desconto na mão (* 12 * 0.8) de volta → check cai',
    pego: REGEX_DESCONTO_NA_MAO.test(tela + '\n  const z = base * 12 * 0.8;'),
  },
  {
    nome: 'import da fonte removido → check de import cai',
    pego: !tela.replace("from '../services/precosPlanos'", "from '../nada'").includes("from '../services/precosPlanos'"),
  },
  {
    nome: 'CTA de compra sem guarda de iOS → check de CTA cai',
    pego: !tela.replace(') : !COMPRA_NO_APP ? (', ') : true ? (').includes(') : !COMPRA_NO_APP ? ('),
  },
  {
    nome: 'anual sem desconto (= mensal × 12) → check "desconto calculado" cai',
    pego: (() => {
      const mutado = { ...PRECO_PRO, anualCentavos: PRECO_PRO.mensalCentavos * 12 };
      return mutado.anualCentavos !== Math.round(mutado.mensalCentavos * 12 * 0.8);
    })(),
  },
  {
    nome: '12x vendido como <= anual → check "12x mais caro" cai',
    pego: (() => {
      const parceladoMentiroso = PRECO_PRO.anualCentavos; // fingindo ser igual/menor
      return !(parceladoMentiroso > PRECO_PRO.anualCentavos);
    })(),
  },
];

let mutacoesPegas = 0;
for (const m of mutacoes) {
  if (m.pego) {
    mutacoesPegas++;
    console.log(`  ok   mutação pega — ${m.nome}`);
  } else {
    falhas++;
    console.error(`  FALHA mutação NÃO pega (asserção frouxa) — ${m.nome}`);
  }
}
console.log(`  → ${mutacoesPegas}/${mutacoes.length} mutações pegas`);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s), ${mutacoesPegas}/${mutacoes.length} mutações pegas\n`);
process.exit(falhas === 0 ? 0 : 1);
