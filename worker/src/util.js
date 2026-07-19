// Helpers puros de parsing/sanitização, compartilhados por index.js e voz.js.
// Extraídos de index.js pra permitir importar a lógica de voz (voz.js) sem
// arrastar @sentry/cloudflare — só instalado em worker/node_modules, fora do
// `npm ci` da raiz. Sem isto, testar handleVozConversa exigiria importar
// index.js inteiro e quebraria a mesma forma que já está documentada em
// scripts/teste-creditos-voz.ts ("Não importa index.js: ele carrega
// @sentry/cloudflare..."). Puros: nenhuma rede, nenhum estado.

/** Parseia o texto já lido por bodyMuitoGrande (index.js). Nunca lança — {} em JSON inválido. */
export function parseJsonBody(raw) {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Parser de JSON tolerante (remove cercas ```json e lixo em volta). */
export function parseJsonLoose(s) {
  if (!s) return null;
  const cleaned = s.replace(/```json\s*|\s*```/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)); } catch {} }
  return null;
}

/** Trunca uma string (proteção de payload gigante / prompt injection). '' se não for string. */
export function cortar(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * 'sim' | 'nao' | 'desconhecido' — normalização de flag de terceiro que tem
 * TRÊS valores possíveis, não dois.
 *
 * Nasceu do `mei: !!d.opcao_pelo_mei` do handleCnpj: a BrasilAPI devolve `null`
 * quando a Receita não informou (confirmado ao vivo em 2026-07-18 num CNPJ
 * real), e `!!null` é `false` — "não sei se é MEI" chegando na tela como "não é
 * MEI". É o bug recorrente da casa (`olli-gate-erro-vira-vazio`) na sua versão
 * de uma linha só.
 *
 * Deixou de ser detalhe em 1º de setembro de 2026: pela Resolução CGSN nº
 * 189/2026 o regime de NFS-e do cliente depende justamente de ser MEI/ME/EPP do
 * Simples. Afirmar "não é" sem saber manda o prestador pro caminho fiscal errado.
 */
export function tresEstados(v) {
  if (v === true) return 'sim';
  if (v === false) return 'nao';
  return 'desconhecido';
}

/**
 * A empresa está ativa na Receita? `true` | `false` | `null`.
 *
 * O `null` é o ponto do exercício: "esta empresa foi BAIXADA" e "não consegui
 * confirmar a situação" pedem coisas diferentes de quem vai emitir a nota. A
 * Receita publica os dois formatos — código numérico (2 = ATIVA) e texto — e só
 * afirmamos quando pelo menos um deles falou. Nenhum dos dois presente = `null`,
 * nunca `false`.
 *
 * Códigos: 1 NULA · 2 ATIVA · 3 SUSPENSA · 4 INAPTA · 8 BAIXADA.
 */
export function empresaAtiva(d) {
  const codigo = Number(d && d.situacao_cadastral);
  if (Number.isFinite(codigo) && codigo > 0) return codigo === 2;
  const texto = String((d && d.descricao_situacao_cadastral) || '').trim().toUpperCase();
  if (texto) return texto === 'ATIVA';
  return null;
}
