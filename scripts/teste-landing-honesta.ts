/**
 * LANDING HONESTA (auditoria 29/09, item 10) — a landing não publica bastidores e
 * não promete o que o produto não entrega.
 *
 * O que este teste trava, lendo a FONTE (roda sem build):
 *  1. Nenhum comentário de HTML (`<!-- -->`) nas páginas e componentes Astro: esse
 *     comentário vai para o HTML de toda visita — foi assim que "0 pagante" e nome de
 *     concorrente chegaram ao público. Comentário de bastidor é `{/* *\/}`, que o Astro
 *     remove no build.
 *  2. Offline só como do app Android; nada de "funciona sem internet" solto nem
 *     benchmark de concorrente na FAQ (que vira FAQPage no Google).
 *  3. "0 calculadora" / "0 ferramenta": o ofício sem calculadora não pode estampar zero.
 *  4. IA dos pagos é "uso justo diário", não "Ilimitada" (o worker aplica cota diária).
 *  5. Pix: a copy só fala de Pix atrás do `PIX_PLANO_LIGADO` (fail-closed no build), e o
 *     preço do Pix no worker é o MESMO preço da landing — por isso a copy pode dizer
 *     "pelo mesmo preço" sem digitar número.
 *  6. Termos e Privacidade declaram o Pix e a AbacatePay.
 *  7. Na Central de Ajuda (compartilhada com o app das lojas), Pix só em bloco `soNaWeb`.
 *
 * A saída pública de verdade (dist/) é conferida por `web/scripts/verificar-saida-publica.mjs`,
 * que roda dentro do `npm run build` da landing e derruba o build se algo vazar.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANO_PIX } from '../worker/src/mercadopago.js';
import { PRECO_EMPRESA, PRECO_PRO } from '../web/src/data/planos.ts';

// CRLF → LF: com `core.autocrlf=true` (o padrão do Git no Windows, e o desta máquina)
// o checkout vem em CRLF e as regex ancoradas em `\n` (blocos da Central de Ajuda)
// não casavam — o teste falhava no PC do dono e passava no Linux.
const ler = (caminho: string) =>
  readFileSync(new URL(caminho, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const RAIZ_WEB = fileURLToPath(new URL('../web/src/', import.meta.url));

function arquivos(dir: string, ext: RegExp): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho, ext));
    else if (ext.test(nome)) saida.push(caminho);
  }
  return saida;
}

// ─── 1. Nenhum comentário de HTML em .astro ────────────────────────────────────
for (const arquivo of arquivos(RAIZ_WEB, /\.astro$/)) {
  const texto = readFileSync(arquivo, 'utf8');
  assert.doesNotMatch(
    texto,
    /<!--/,
    `${arquivo}: comentário de HTML vai para o HTML público — use {/* */}`,
  );
}

const home = ler('../web/src/pages/index.astro');
const oficio = ler('../web/src/pages/para/[oficio].astro');
const planosPagina = ler('../web/src/pages/planos.astro');
const llms = ler('../web/src/pages/llms.txt.ts');
const recursos = ler('../web/src/data/recursos.ts');
const cartoes = ler('../web/src/components/PlanosPrecos.astro');
const oficios = ler('../web/src/data/oficios.ts');
const ajuda = ler('../src/content/ajuda/index.ts');
const termos = ler('../src/content/legal/termos.ts');
const privacidade = ler('../src/content/legal/privacidade.ts');

// ─── 2. Offline é do app Android, não da web ───────────────────────────────────
assert.doesNotMatch(home, /a: "Funciona\. O app guarda tudo/, 'FAQ de offline não pode responder "Funciona." sem dizer que é só no app');
assert.match(home, /No aplicativo Android \(em teste fechado\)/, 'FAQ de offline deve limitar a promessa ao app Android');
assert.match(home, /Pelo navegador — no celular ou no computador — a OLLI precisa de internet/, 'FAQ de offline deve dizer que a web precisa de internet');
assert.doesNotMatch(home, /benchmark|das 25 ferramentas/i, 'benchmark de concorrente é bastidor, não copy');
assert.doesNotMatch(oficio, /sem sinal\./, 'página de ofício leva à web, que não funciona sem sinal');
assert.doesNotMatch(ajuda, /Tudo funciona offline/, 'Central de Ajuda não pode prometer offline sem dizer que é do app');
assert.match(ajuda, /pelo navegador, o OLLI precisa de conexão/, 'Central de Ajuda deve dizer que a web precisa de internet');

// Nada de "abaixo do DAS do MEI": o Empresa custa mais que o DAS.
assert.doesNotMatch(home, /DAS do MEI/, 'comparação com o DAS era falsa para o plano Empresa');
// Contagem de calculadoras derivada, nunca digitada.
assert.doesNotMatch(home, /21 calculadoras|3 de elétrica/, 'contagem de calculadoras tem de vir de data/oficios.ts');
assert.match(home, /\$\{TOTAL_CALCULADORAS\} calculadoras de campo divididas por ofício/, 'FAQ de calculadoras deve usar TOTAL_CALCULADORAS');

// ─── 3. Zero não vira copy ─────────────────────────────────────────────────────
assert.match(oficio, /calculos\.length > 0\s*\?\s*`\$\{dor\} Grátis para começar/, 'meta description precisa de ramo sem calculadora');
assert.match(llms, /n > 0\s*\?\s*` Inclui \$\{n\} ferramenta/, 'llms.txt não pode dizer "Inclui 0 ferramenta"');
assert.doesNotMatch(oficios, /Do áudio do cliente/, 'a OLLI não lê áudio do cliente — frase ambígua');
assert.doesNotMatch(oficio, /Do áudio do cliente/, 'a OLLI não lê áudio do cliente — frase ambígua');

// ─── 4. IA dos pagos: uso justo, não ilimitada ────────────────────────────────
assert.doesNotMatch(recursos, /valor: "Ilimitada"/, 'o worker aplica cota diária — não é ilimitada');
assert.match(recursos, /valor: "Uso justo diário"/, 'comparativo deve dizer "Uso justo diário"');
assert.doesNotMatch(planosPagina, /a IA tem 3 usos/, 'cota do Grátis vem de IA_USOS_GRATIS_MES');
// Item "em breve" não ganha o ✓ de pronto no cartão do plano.
assert.match(cartoes, /b\.emBreve \?/, 'cartão de plano precisa de terceiro estado para "em breve"');

// ─── 5. Pix: condicionado e pelo mesmo preço ──────────────────────────────────
for (const [nome, fonte] of [['home', home], ['planos', planosPagina], ['cartões', cartoes], ['llms.txt', llms]] as const) {
  assert.match(fonte, /PIX_PLANO_LIGADO/, `${nome}: copy de Pix tem de ficar atrás do PIX_PLANO_LIGADO`);
}
const pix = ler('../web/src/data/pix.ts');
assert.match(pix, /obj\.ok !== true \|\| typeof obj\.pix !== "boolean"\) return "desconhecido"/, 'resposta estranha do worker é "não sei", não "ligado"');
assert.match(pix, /export const PIX_PLANO_LIGADO = ESTADO_PIX === "ligado"/, 'só "ligado" explícito libera a copy de Pix');

const centavos = (reais: number) => Math.round(reais * 100);
assert.equal(centavos(PLANO_PIX.pro_mensal.valor), PRECO_PRO.mensalCentavos, 'Pix Pro mensal = preço da landing');
assert.equal(centavos(PLANO_PIX.pro_anual.valor), PRECO_PRO.anualCentavos, 'Pix Pro anual = preço da landing');
assert.equal(centavos(PLANO_PIX.empresa_mensal.valor), PRECO_EMPRESA.mensalCentavos, 'Pix Empresa mensal = preço da landing');
assert.equal(centavos(PLANO_PIX.empresa_anual.valor), PRECO_EMPRESA.anualCentavos, 'Pix Empresa anual = preço da landing');

// A Central de Ajuda também roda no app das LOJAS (iOS e Android da Play), que não
// tem Pix nem pode mandar pagar por fora (regra de lembreteAssinaturaLoja.ts). O
// bloco que fala de Pix/AbacatePay tem de ser `soNaWeb`, e as duas telas do app
// têm de filtrar com `corpoVisivel` + `plataformaPodeVender`.
const blocosAjuda = [...ajuda.matchAll(/\n {6}\{\n([\s\S]*?)\n {6}\},?/g)].map((m) => m[1]);
const blocosComPix = blocosAjuda.filter((b) => /Pix|AbacatePay/.test(b) && /tipo: '(paragrafo|passos|aviso)'/.test(b));
assert.ok(blocosComPix.length > 0, 'esperava ao menos um bloco de ajuda falando de Pix');
for (const b of blocosComPix) {
  assert.match(b, /soNaWeb: true/, `bloco da Central de Ajuda com Pix sem soNaWeb (apareceria no app das lojas): ${b.slice(0, 120)}`);
}
for (const tela of ['../src/screens/AjudaScreen.tsx', '../src/screens/desktop/AjudaDesktopScreen.tsx']) {
  const fonte = ler(tela);
  assert.match(fonte, /corpoVisivel\([^)]*plataformaPodeVender\(Platform\.OS\)\)/, `${tela}: corpo do artigo tem de passar por corpoVisivel`);
  assert.doesNotMatch(fonte, /\.corpo\.map\(/, `${tela}: renderizar .corpo direto mostra o Pix nas lojas`);
}

// ─── 6. Documentos legais declaram o Pix ──────────────────────────────────────
assert.match(termos, /por Pix, processado pela AbacatePay/, 'Termos §4 devem declarar o Pix do plano');
assert.match(termos, /não se renova automaticamente/, 'Termos devem dizer que o Pix não renova');
assert.match(privacidade, /AbacatePay — processamento das cobranças Pix/, 'Privacidade deve listar a AbacatePay como operadora');

console.log('OK — landing sem bastidores, offline só no app, Pix condicionado e pelo mesmo preço.');
