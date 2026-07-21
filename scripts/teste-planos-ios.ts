/**
 * Teste da guardrail 3.1.1 (App Store) nas telas de plano/assinatura.
 *
 *     node scripts/teste-planos-ios.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * JÁ ESTÁ wireado em `npm test` (via `test:planos-ios` no package.json) — o aviso
 * anterior, de que o script rodava só à mão, ficou obsoleto quando alguém com
 * permissão sobre a raiz religou a cadeia. O roteamento de PAGAMENTO (cartão →
 * Stripe, Pix → Mercado Pago) é assunto de outro script:
 * `scripts/teste-roteamento-pagamento.ts`.
 *
 * O QUE ESTÁ SENDO TRANCADO: a Guideline 3.1.1 da Apple proíbe, no iOS, tanto o
 * link-out de checkout quanto qualquer caminho que SUBSTITUA a compra (um
 * "fale conosco" que fecha por fora) ou que ANUNCIE troca/upgrade de plano por
 * fora do StoreKit (que este app não implementa). Isso já vazou pra produção
 * duas vezes na mesma rodada de revisão — uma vez por arquivo sem a guarda
 * nenhuma, outra vez por um texto de apoio que sobreviveu à guarda do botão ao
 * lado dele. Este script não prova comportamento em runtime (não há um iPhone
 * aqui) — é a rede de origem que pega "alguém mexeu no JSX e a guarda não
 * seguiu junto", igual ao papel da seção 5 de teste-backup-equipe.ts:191-195.
 */
import { readFileSync } from 'node:fs';

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

console.log('\n1) PlanosScreen.tsx — venda escondida por completo no iOS');
const planosSrc = ler('../src/screens/PlanosScreen.tsx');
checar('COMPRA_NO_APP está definido', planosSrc.includes("const COMPRA_NO_APP = Platform.OS !== 'ios';"), true);
checar('assinarPlano tem o early-return de defesa em profundidade', (() => {
  const inicio = planosSrc.indexOf('async function assinarPlano(');
  const corpo = planosSrc.slice(inicio, planosSrc.indexOf('\n  }', inicio));
  return corpo.includes('if (!COMPRA_NO_APP) return;');
})(), true);
checar('falarComSuporte tem o mesmo early-return (achado da rodada 2)', (() => {
  const inicio = planosSrc.indexOf('function falarComSuporte(');
  const corpo = planosSrc.slice(inicio, planosSrc.indexOf('\n  }', inicio));
  return corpo.includes('if (!COMPRA_NO_APP) return;');
})(), true);
checar('o CTA de compra do PlanoCard é condicionado a COMPRA_NO_APP', planosSrc.includes(') : !COMPRA_NO_APP ? ('), true);
checar('o WhatsApp da Empresa é condicionado a COMPRA_NO_APP', planosSrc.includes("COMPRA_NO_APP && !plano.atual && plano.id === 'empresa'"), true);
checar('o toggle de período é condicionado a COMPRA_NO_APP', planosSrc.includes('{COMPRA_NO_APP && (') , true);
// As frases de venda de OUTRAS telas não têm por que aparecer aqui — se
// aparecerem, é copy vazada por copiar-colar sem trazer a guarda junto.
for (const frase of ['Assinando o Pro', 'Assine direto no app']) {
  checar(`"${frase}" não aparece em PlanosScreen.tsx (é copy de outra tela)`, planosSrc.includes(frase), false);
}
// "troca de plano" É esperado uma vez nesta tela (a variante Android/web do
// hero do pagante) — mas precisa estar guardada pelo ternário COMPRA_NO_APP
// logo acima dela, não solta.
{
  const trocaIdx = planosSrc.indexOf('troca de plano/cartão');
  checar('"troca de plano/cartão" existe (variante Android/web do hero)', trocaIdx >= 0, true);
  const janela = planosSrc.slice(Math.max(0, trocaIdx - 200), trocaIdx);
  checar('...e está atrás de um `{COMPRA_NO_APP`  nas linhas anteriores', janela.includes('{COMPRA_NO_APP'), true);
}

console.log('\n2) AssinaturaScreen.tsx — portal tolerado, upsell de compra nova escondido');
const assinaturaSrc = ler('../src/screens/AssinaturaScreen.tsx');
checar('ANUNCIA_TROCA_PLANO está definido (hint do portal)', assinaturaSrc.includes("const ANUNCIA_TROCA_PLANO = Platform.OS !== 'ios';"), true);
checar('COMPRA_NO_APP está definido (upsell do Grátis)', assinaturaSrc.includes("const COMPRA_NO_APP = Platform.OS !== 'ios';"), true);
checar('o botão "Gerenciar assinatura" NÃO tem guarda de plataforma (portal é tolerado no iOS)', (() => {
  const inicio = assinaturaSrc.indexOf('async function gerenciar()');
  const corpo = assinaturaSrc.slice(inicio, assinaturaSrc.indexOf('\n  }', inicio));
  return corpo.includes('Platform.OS');
})(), false);
checar('a dica do portal é condicionada a ANUNCIA_TROCA_PLANO', assinaturaSrc.includes('{ANUNCIA_TROCA_PLANO'), true);
checar('o texto do upsell ("Assinando o Pro...") é condicionado a COMPRA_NO_APP', (() => {
  const idx = assinaturaSrc.indexOf('Assinando o Pro');
  if (idx < 0) return false;
  const janela = assinaturaSrc.slice(Math.max(0, idx - 150), idx);
  return janela.includes('{COMPRA_NO_APP');
})(), true);
checar('o rótulo do botão do upsell é condicionado a COMPRA_NO_APP', assinaturaSrc.includes("label={COMPRA_NO_APP ? 'Ver planos e assinar' : 'Ver os planos'}"), true);

console.log('\n3) ContaScreen.tsx — mesmo interruptor, mesmo tratamento (regressão do achado 4 da rodada 1)');
const contaSrc = ler('../src/screens/ContaScreen.tsx');
checar('COMPRA_NO_APP está definido', contaSrc.includes("const COMPRA_NO_APP = Platform.OS !== 'ios';"), true);
checar('"Assine direto no app" é condicionado a COMPRA_NO_APP', (() => {
  // `indexOf` pegaria a menção no docblock (comentário, não código) lá em cima
  // — a ocorrência real no JSX é a ÚLTIMA no arquivo.
  const idx = contaSrc.lastIndexOf('Assine direto no app');
  if (idx < 0) return false;
  const janela = contaSrc.slice(Math.max(0, idx - 150), idx);
  return janela.includes('{COMPRA_NO_APP');
})(), true);
checar('o rótulo do botão de upsell é condicionado a COMPRA_NO_APP', contaSrc.includes("COMPRA_NO_APP ? 'Ver planos e assinar' : 'Ver os planos'"), true);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
