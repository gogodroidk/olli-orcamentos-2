/**
 * PORTÃO DE PRIVACIDADE — roda ANTES de gravar cada imagem.
 *
 * Screenshot publicado não se despublica: já foi para o cache do Google, para o
 * Wayback e para o print de alguém. Por isso aqui a regra é FALHAR, não avisar.
 *
 * Duas checagens sobre o texto visível da tela:
 *   (a) PADRÃO SENSÍVEL — CPF, CNPJ, CEP e e-mail que não estejam no elenco;
 *   (b) TELEFONE fora da lista — qualquer telefone brasileiro impresso na tela
 *       tem de ser um dos de `elenco.mjs`.
 *
 * LIMITAÇÕES CONHECIDAS, documentadas de propósito:
 *
 *  (1) `innerText` não enxerga texto dentro de `<canvas>` nem dentro de imagem
 *      embutida. Hoje o app é DOM puro (os gráficos são react-native-svg, que é
 *      DOM e é lido), então o portão cobre o que existe. No dia em que um
 *      gráfico virar canvas, esta checagem fica cega naquele pedaço.
 *
 *  (2) `innerText` também não enxergava o VALOR de campo de formulário — e essa
 *      era a mais grave, porque o pipeline digita em campo de propósito. O
 *      `value` de um `<input>`/`<textarea>` não é nó de texto filho, então ele
 *      simplesmente não entrava no que o portão avaliava. Duas telas publicadas
 *      dependem disso: `07-diagnostico-ia` (marca, modelo, código e sintoma) e
 *      `06-codigos-erro` ("E4" na busca). Um CEP digitado num campo passava
 *      direto — e o app acabou de ganhar preenchimento de endereço por CEP.
 *      Corrigido em `lerTextoVisivel`: o valor de todo campo entra na avaliação.
 *
 *  (3) O que continua fora do alcance: `value` de campo dentro de `shadow DOM`
 *      fechado e conteúdo em iframe de outra origem. Nenhum dos dois existe no
 *      app hoje; se algum dia existir, esta lista é o lugar de dizer.
 *
 * O portão NÃO substitui uma conferência humana da primeira leva. Ele pega o
 * previsível (o telefone num toast, o nome num autocomplete fora do foco do
 * olhar); olho humano pega o resto (um avatar com foto de gente de verdade).
 */
import { CONTATOS_PERMITIDOS, NOMES_PERMITIDOS } from './elenco.mjs';

const PADROES = [
  { nome: 'CPF', re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
  { nome: 'CNPJ', re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g },
  { nome: 'CEP', re: /\b\d{5}-\d{3}\b/g },
  { nome: 'e-mail', re: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g },
  { nome: 'telefone', re: /\(\d{2}\)\s?\d{4,5}-\d{4}/g },
];

const normalizar = (s) => s.replace(/\s+/g, ' ').trim();

const PERMITIDOS = new Set(CONTATOS_PERMITIDOS.map(normalizar));

/**
 * @returns {string[]} lista de violações; vazia = pode gravar.
 */
export function conferirTexto(texto) {
  const violacoes = [];
  for (const { nome, re } of PADROES) {
    for (const achado of texto.matchAll(re)) {
      const valor = normalizar(achado[0]);
      if (!PERMITIDOS.has(valor)) violacoes.push(`${nome} fora do elenco: "${valor}"`);
    }
  }
  return violacoes;
}

/**
 * Todo o texto que o olho vê na tela: o dos nós de texto MAIS o valor de cada
 * campo de formulário.
 *
 * A segunda metade não é zelo: `innerText` devolve só o que é nó de texto, e o
 * `value` de um `<input>` não é filho dele. Medido com o próprio Playwright do
 * pipeline, numa página com um telefone num `<input>` e um CEP num `<textarea>`:
 *
 *   innerText            -> "Cliente: Fulano"
 *   o que está na tela   -> "Cliente: Fulano (11) 98765-4321 ... 01310-100 ..."
 *   violações vistas     -> nenhuma          (as regex nunca receberam o texto)
 *
 * `placeholder` fica de FORA de propósito: ele é texto do app, não dado, e o do
 * app é cheio de exemplo com cara de dado real ("(11) 99999-9999",
 * "000.000.000-00", "00000-000"). Incluí-lo faria o portão reprovar toda tela
 * com formulário em branco — e portão que grita errado toda vez é portão que
 * ninguém lê.
 */
async function lerTextoVisivel(page) {
  return page.evaluate(() => {
    const valores = [...document.querySelectorAll('input, textarea, select')]
      .map((e) => e.value)
      .filter(Boolean);
    return [document.body.innerText, ...valores].join('\n');
  });
}

export async function conferirPagina(page, idDaTela) {
  const texto = await lerTextoVisivel(page);
  const violacoes = conferirTexto(texto);
  if (violacoes.length) {
    console.error(`\nPORTÃO DE PRIVACIDADE reprovou a tela "${idDaTela}":`);
    for (const v of violacoes) console.error(`  - ${v}`);
    console.error('\nNenhuma imagem foi gravada. Corrija o elenco ou a semeadura e rode de novo.');
    process.exit(1);
  }
  return texto;
}

/** Confere que os nomes que a landing vai publicar são mesmo os do elenco. */
export function nomesDoElencoPresentes(texto) {
  return NOMES_PERMITIDOS.filter((n) => texto.includes(n));
}
