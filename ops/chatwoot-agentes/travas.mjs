// Travas de texto para o que um agente manda ao cliente pelo Chatwoot.
// D-2233 (Igor 18/11): sem porta de saída ("responda SAIR", "não te chamo mais", "Quer continuar?"), fala de vendedor.
// D-2333: voz natural; se perguntarem, diz a verdade ("sou o assistente virtual da <empresa>"); NUNCA diz que é pessoa
//         nem inventa vida de gente (almoço, trânsito, família, escritório). CDC art. 6º III e 37: sem promessa falsa.
// LGPD/segurança: nunca pedir senha, CPF ou cartão.

const SAIDA = [
  /responda\s+sair/i, /digite\s+sair/i, /fala\s+sair/i, /escreva\s+sair/i, /mande\s+sair/i,
  /n[aã]o\s+te\s+(chamo|incomodo|procuro)\s+mais/i, /[eé]\s+s[oó]\s+avisar\s+que\s+eu\s+paro/i,
  /quer\s+continuar\s*\?/i, /se\s+n[aã]o\s+quiser\s+mais\s+receber/i, /[uú]ltimo\s+lembrete/i,
];
const FINGIR_PESSOA = [
  /\bn[aã]o\s+sou\s+(um\s+)?(rob[oô]|bot|ia|intelig[eê]ncia artificial)(?![a-zà-ú])/i,
  /\bsou\s+(uma\s+pessoa|humano|humana|gente de verdade)(?![a-zà-ú])/i,
  /\b(estou|t[oô])\s+(no\s+escrit[oó]rio|no\s+tr[aâ]nsito|almo[cç]ando|em\s+casa)(?![a-zà-ú])/i,
  /\b(voltei|acabei)\s+do\s+almo[cç]o\b/i, /\bminha\s+(esposa|filha|m[aã]e)\b/i, /\bmeu\s+(filho|marido|pai)\b/i,
];
const PROMESSA = [/\bgaranto\b/i, /\bgarantid[oa]\s+(de\s+)?(venda|resultado|cliente)/i, /100\s*%\s*(garantid|certo|de resultado)/i, /primeir[ao]\s+(p[aá]gina|lugar)\s+do\s+google/i];
const DADOS = [/(manda|envia|passa|informe?|me\s+diz|qual\s+[eé])\s+(o\s+|a\s+)?(seu|sua)\s+(cpf|senha|cart[aã]o|n[uú]mero\s+do\s+cart[aã]o)/i];
const INTERNO = [/\bSalom[aã]o\b/i, /\bMaestro\b/i, /\bMaestri\b/i, /\bClaude\b/i, /\bterminal\b/i];

/** Devolve a lista de motivos para BARRAR o texto (vazia = pode sair). */
export function motivosDeBarrar(texto) {
  const t = String(texto ?? '').trim();
  const m = [];
  if (!t) m.push('texto vazio');
  if (SAIDA.some((re) => re.test(t))) m.push('porta de saída (D-2233)');
  if (FINGIR_PESSOA.some((re) => re.test(t))) m.push('finge ser pessoa ou inventa vida de gente (D-2333)');
  if (PROMESSA.some((re) => re.test(t))) m.push('promessa sem lastro (CDC)');
  if (DADOS.some((re) => re.test(t))) m.push('pede senha/CPF/cartão');
  if (INTERNO.some((re) => re.test(t))) m.push('nome interno da casa (Salomão/Maestro/Claude)');
  return m;
}

/** "TESTE —" só pode ir para número nosso. */
export function ehTeste(texto) { return /^\s*TESTE\b/i.test(String(texto ?? '')); }
