/**
 * Número em pt-BR ↔ texto. Módulo próprio, puro e SEM dependências — para poder
 * ser testado sozinho (`npm run test:numero-web`, na raiz).
 *
 * Isto aqui é código de DINHEIRO: o resultado vai para a quantidade, o desconto e
 * o total do PDF que o cliente final recebe. Um erro aqui não dá tela vermelha —
 * ele emite um documento errado, em silêncio, com aparência de certo. Por isso
 * mora fora do formulário e tem teste de regressão.
 */

/** Quantidade em pt-BR: 2,5 (e não 2.5). O valor guardado continua sendo `number`. */
export const qtdParaTexto = (n: number): string => String(n).replace(".", ",");

/**
 * Texto → número. Devolve NaN quando não dá para ler — quem chama decide o que fazer.
 *
 * O ponto do teclado numérico é DECIMAL, não separador de milhar: quando não há
 * vírgula e há exatamente UM ponto ("2.5"), ele é a vírgula decimal (2,5). Sem
 * este caso, `replace(/\./g,"")` transformaria "2.5" em 25 e multiplicaria por 10
 * a quantidade/desconto em silêncio, indo pro PDF do cliente. O formato pt-BR
 * completo ("1.234,56", com vírgula) continua caindo no ramo de baixo.
 *
 * Ambiguidade assumida: "1.234" (sem vírgula, um ponto) é lido como 1,234 e não
 * como 1234. É deliberado — no teclado do celular o usuário digita o ponto
 * QUERENDO decimal ("2.5"), e quem quer milhar digita "1234" ou "1.234,00".
 * Errar para o lado do decimal mantém a ordem de grandeza; errar para o outro
 * multiplicaria por 1000.
 */
export const textoParaNumero = (t: string): number => {
  const s = (t ?? "").trim();
  // Campo vazio é "não digitou", não "digitou zero". Sem esta linha o `Number("")`
  // do JS devolve 0 — um valor FINITO, que passa direto pelo `Number.isFinite(n)`
  // de quem chama. Efeito real: limpar a quantidade para redigitar zerava o item
  // (quantidade 0 → linha valendo R$ 0 no PDF do cliente), em silêncio. Devolvendo
  // NaN, o `isFinite` reprova e o valor anterior é mantido até vir número válido.
  if (!s) return Number.NaN;
  if (!s.includes(",") && (s.match(/\./g) ?? []).length === 1) return Number(s);
  return Number(s.replace(/\./g, "").replace(",", "."));
};
