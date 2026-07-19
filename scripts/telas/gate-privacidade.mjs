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
 * LIMITAÇÃO CONHECIDA, documentada de propósito: `innerText` não enxerga texto
 * dentro de `<canvas>` nem dentro de imagem embutida. Hoje o app é DOM puro
 * (os gráficos são react-native-svg, que é DOM e é lido), então o portão cobre
 * o que existe. No dia em que um gráfico virar canvas, esta checagem fica cega
 * naquele pedaço — e isso precisa ser lembrado aqui, não descoberto depois.
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

export async function conferirPagina(page, idDaTela) {
  const texto = await page.evaluate(() => document.body.innerText);
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
