const lider = (terminal, nome, fala, aliases = []) =>
  Object.freeze({ terminal, nome, fala, aliases: Object.freeze(aliases) });

export const LIDERES = Object.freeze([
  lider("SALOMÃO — Maestro", "Salomão", "o Salomão", ["maestro"]),
  lider("MAQUIAVEL — Co-líder", "Maquiavel", "o Maquiavel", ["co-líder", "colíder"]),
  lider("MKT — CMO", "Camila", "a Camila", ["mkt", "cmo"]),
  lider("SALES — Diretor Comercial", "Bruno", "o Bruno", ["sales", "diretor comercial"]),
  lider("OPS — COO", "Diego", "o Diego", ["ops", "coo"]),
  lider("TECH — CTO", "Rafael", "o Rafael", ["tech", "cto"]),
  lider("FIN — CFO", "Helena", "a Helena", ["fin", "cfo"]),
  lider("PRODUCT — CPO", "Marina", "a Marina", ["product", "cpo"]),
]);

function normalizar(nome) {
  return String(nome ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

const porNome = new Map(LIDERES.flatMap((l) =>
  [l.terminal, l.nome, l.fala, ...l.aliases].map((nome) => [normalizar(nome), l])));

export function resolverLider(nome) {
  return typeof nome === "string" ? porNome.get(normalizar(nome)) || null : null;
}

export function leuDestino(pergunta, l) {
  const frase = normalizar(pergunta);
  return [l.fala, l.nome].some((nome) => frase.startsWith(`recado para ${normalizar(nome)} `));
}

export function textoConfirmacao(l, texto) {
  const frase = /[.!?]$/.test(texto) ? texto : `${texto}.`;
  return `Recado para ${l.fala}: ${frase} Confirma?`;
}
