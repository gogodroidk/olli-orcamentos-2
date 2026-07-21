// Helpers puros de parsing/sanitização, compartilhados por index.js e voz.js.
// Extraídos de index.js pra permitir importar a lógica de voz (voz.js) sem
// arrastar @sentry/cloudflare — só instalado em worker/node_modules, fora do
// `npm ci` da raiz. Sem isto, testar handleVozConversa exigiria importar
// index.js inteiro e quebraria a mesma forma que já está documentada em
// scripts/teste-creditos-voz.ts ("Não importa index.js: ele carrega
// @sentry/cloudflare..."). Puros: nenhuma rede, nenhum estado.

/**
 * MÉTODOS ACEITOS POR ROTA — só das rotas resolvidas no roteador de topo
 * (index.js). As delegadas (/admin, /stripe/, /mp/, /equipe/, /conta/, /o/, /q/)
 * respondem o próprio 405 e nunca chegam a esta tabela.
 *
 * POR QUE EXISTE. O roteador julgava o MÉTODO antes da EXISTÊNCIA: um único
 * `if (request.method !== 'POST') return 405` pegava tudo que não tivesse casado
 * com nada acima. Consequência medida em produção
 * (docs/ENXAME/POS_DEPLOY.md, achado A4):
 *
 *     GET /rota-que-nao-existe → 405 {"erro":"metodo_nao_suportado"}
 *
 * Duas coisas erradas numa. A primeira é que a resposta é falsa: não existe
 * método que faça aquele path funcionar. A segunda é que 405 é uma AFIRMAÇÃO
 * sobre um recurso que EXISTE — respondê-lo a um path inventado conta ao curioso
 * que ele existe para algum outro verbo, que é exatamente o que uma varredura
 * quer descobrir. 404 não conta nada.
 *
 * Não é padrão novo: o despacho de `mercadopago.js` (e o do `stripe.js`) já faz
 * isto (`ROUTES.has(p) ? 405 : 404`) desde sempre. O roteador de topo era o único
 * lugar que tinha ficado de fora.
 *
 * Mora aqui, e não em index.js, pela mesma razão de `tresEstados`/`empresaAtiva`:
 * é a parte do roteador que MERECE teste unitário, e index.js não é importável
 * pelo teste (carrega @sentry/cloudflare, fora do `npm ci` da raiz).
 */
const METODOS_POR_ROTA = new Map([
  // GET '/' = health público; POST '/' = diagnóstico por IA. Ver IA_ROUTES.
  ['/', 'GET, POST'],
  ['/voz', 'POST'],
  ['/voz/conversa', 'POST'],
  ['/chat', 'POST'],
  ['/transcrever', 'POST'],
  ['/eta', 'POST'],
  ['/eta/saida', 'POST'],
  ['/geocodificar', 'POST'],
]);

/**
 * Famílias de path variável: o que vem depois da barra é DADO (um CEP, um CNPJ,
 * um ano), não rota. `/cep/` existe como recurso mesmo que aquele CEP não
 * exista — quem responde "esse CEP não existe" é o handler, com 404 e o estado
 * certo no corpo; o roteador só decide se o VERBO cabe.
 */
const METODOS_POR_PREFIXO = [
  ['/cep/', 'GET'],
  ['/cnpj/', 'GET'],
  ['/feriados/', 'GET'],
];

/**
 * Métodos aceitos neste path (string pronta para o header `Allow`), ou `null`
 * quando o path não existe — e `null` aqui significa 404, nunca 405.
 */
export function metodosDaRota(pathname) {
  const exato = METODOS_POR_ROTA.get(pathname);
  if (exato) return exato;
  for (const [prefixo, metodos] of METODOS_POR_PREFIXO) {
    if (String(pathname || '').startsWith(prefixo)) return metodos;
  }
  return null;
}

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
