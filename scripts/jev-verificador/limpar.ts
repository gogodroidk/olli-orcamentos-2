/**
 * Limpeza antes de qualquer chamada ao Jev.
 * O parecer de 25/10 exige tirar identificador do texto e tratar SAIR por regra
 * fixa, sem mandar dado sensível a terceiro. Falha fechada: na dúvida, não chama.
 */

export type Preparo = {
  texto: string;
  optOut: boolean;
  sensivel: boolean;
  mascarou: boolean;
};

const SAIDA = [
  /\bsair\b/i,
  /\bparar\b/i,
  /\bn[aã]o\s+quero\b/i,
  /\bdescadastr/i,
  /\bstop\b/i,
  /\bremover\s+meu\s+contato\b/i,
  /\bn[aã]o\s+me\s+(?:chame|liga|contate|escreva)/i,
];

const SENSIVEL = [
  /\bcrian[cç]as?\b/i,
  /\bmenor(?:es)?\s+de\s+idade\b/i,
  /\bmeu\s+filho\b/i,
  /\bminha\s+filha\b/i,
  /\bdiagn[oó]stic/i,
  /\breceita\s+m[eé]dica\b/i,
  /\bdepress/i,
  /\bsuicid/i,
  /\breligi[aã]o\b/i,
  /\bigreja\b/i,
  /\bpol[ií]tic/i,
  /\bvotei\b/i,
];

function trocar(texto: string, re: RegExp, marca: string): string {
  return texto.replace(re, marca);
}

export function mascararIdentificadores(texto: string): { texto: string; mascarou: boolean } {
  let t = texto;
  t = trocar(t, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]');
  t = trocar(t, /\bhttps?:\/\/\S+/g, '[LINK]');
  t = trocar(t, /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ]');
  t = trocar(t, /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]');
  t = trocar(t, /(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}-?\d{4}\b/g, '[TELEFONE]');
  t = trocar(t, /\b\d{5}-\d{3}\b/g, '[CEP]');
  t = trocar(t, /\b\d{8,}\b/g, '[NUMERO]');
  return { texto: t, mascarou: t !== texto };
}

export function pedeSaida(texto: string): boolean {
  return SAIDA.some((re) => re.test(texto));
}

export function pareceSensivel(texto: string): boolean {
  return SENSIVEL.some((re) => re.test(texto));
}

/** Ainda há e-mail ou sequência longa de dígitos: a limpeza não bastou. */
export function aindaTemIdentificador(texto: string): boolean {
  return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(texto) || /\d{8,}/.test(texto);
}

export function prepararTexto(bruto: string): Preparo {
  const mascarado = mascararIdentificadores(bruto);
  return {
    texto: mascarado.texto,
    optOut: pedeSaida(bruto),
    sensivel: pareceSensivel(bruto),
    mascarou: mascarado.mascarou,
  };
}
