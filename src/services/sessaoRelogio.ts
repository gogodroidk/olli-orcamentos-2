/**
 * Sessão do Supabase que aguenta relógio errado no aparelho — a regra pura.
 *
 *     testado por: node scripts/teste-relogio-sessao.ts
 *
 * O BUG (rejeição da Play, 02/10/2026). O `expires_at` da sessão vem do servidor
 * (iat + 3600, no relógio DO SERVIDOR), e o auth-js 2.108 considera a sessão
 * vencida quando `expires_at*1000 - Date.now() < 90 s` — com o relógio DO
 * APARELHO. No celular do revisor, 21 dias adiantado, todo token chegava "vencido":
 * cada `getSession()` (inclusive o que o supabase-js faz antes de CADA requisição)
 * disparava um refresh. Foram 86 refreshes em 7 min; um 429 do limite de taxa
 * apagaria a sessão e jogaria a pessoa de volta na tela Entrar.
 *
 * A CORREÇÃO, no storage da sessão (services/authStorageCore.ts):
 *  1. GRAVAÇÃO de uma sessão recém-emitida (login ou refresh): mede a defasagem
 *     `agora − iat` do access token. Se passar de 60 s, grava
 *     `expires_at = exp + defasagem` (e guarda o `exp` em `expires_at_servidor`).
 *     Assim o auth-js mede a validade no relógio do próprio aparelho. O servidor
 *     continua validando `exp` no relógio dele: não há ganho de validade.
 *     A marca `olli_relogio` (com o `iat` do token) impede reajustar uma sessão
 *     já ajustada quando o auth-js grava de novo o objeto que leu do storage.
 *  2. LEITURA: refaz o `expires_at` a partir do `exp` com a defasagem ATUAL (a
 *     pessoa pode ter acertado o relógio depois do ajuste — sem isso o app
 *     acharia o token válido por mais 21 dias e o servidor recusaria tudo). E
 *     aplica o PISO de 30 s: uma sessão gravada há menos de 30 s nunca é lida
 *     como vencida, então não há dois refreshes em menos de 30 s por esse caminho.
 *  3. Sessão antiga (gravada por versão anterior, sem marca): a leitura só põe a
 *     marca "não sei" (`defasagemSeg: null`) e NÃO mexe no prazo. Não dá para
 *     saber a idade desse token; ajustar pelo `iat` daria a um token de 50 min
 *     mais 50 min de vida falsa. No próximo refresh ela vira uma sessão marcada.
 *
 * Valor que não é sessão (code-verifier, usuário, JSON qualquer) passa intacto,
 * byte a byte.
 */

/** Abaixo disso a diferença é ruído (latência, relógio quase certo): não ajusta. */
export const TOLERANCIA_DEFASAGEM_SEG = 60;
/** Piso entre refreshes pelo caminho do storage. */
export const PISO_ENTRE_REFRESH_MS = 30_000;
/** Margem que o auth-js usa para achar a sessão vencida (EXPIRY_MARGIN_MS). */
const MARGEM_AUTH_JS_MS = 90_000;
/** Recuo de relógio a partir do qual a defasagem guardada deixa de valer. */
const RECUO_RELOGIO_MS = 60_000;

export const CAMPO_MARCA_RELOGIO = 'olli_relogio';
export const CAMPO_EXPIRA_SERVIDOR = 'expires_at_servidor';

export interface MarcaRelogio {
  v: 1;
  /** `iat` do access token a que esta marca se refere. */
  iat: number;
  /** aparelho − servidor, em segundos, medida quando o token chegou. `null` = não sei. */
  defasagemSeg: number | null;
  /** Quando a sessão foi gravada, no relógio do aparelho. `null` = sessão antiga. */
  gravadaEm: number | null;
}

interface SessaoGuardada {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  [CAMPO_EXPIRA_SERVIDOR]?: number;
  [CAMPO_MARCA_RELOGIO]?: MarcaRelogio;
  [outro: string]: unknown;
}

const ALFABETO_B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * base64url → texto com um caractere por byte. Sem `atob`/`Buffer`/`TextDecoder`:
 * tem de rodar igual no Hermes e no `node` do gate. Bytes UTF-8 de nomes com
 * acento viram caracteres soltos, o que não atrapalha o JSON nem `iat`/`exp`.
 */
function base64UrlParaBytes(segmento: string): string | null {
  let bits = 0;
  let acumulado = 0;
  let saida = '';
  for (const caractere of segmento.replace(/=+$/, '')) {
    const valor = ALFABETO_B64URL.indexOf(caractere);
    if (valor < 0) return null;
    acumulado = (acumulado << 6) | valor;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      saida += String.fromCharCode((acumulado >> bits) & 0xff);
    }
  }
  return saida;
}

/** `iat` e `exp` (segundos) do access token, ou `null` se não for um JWT legível. */
export function lerClaimsJwt(token: unknown): { iat: number; exp: number } | null {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3 || !partes[1]) return null;
  const texto = base64UrlParaBytes(partes[1]);
  if (!texto) return null;
  try {
    const claims = JSON.parse(texto) as { iat?: unknown; exp?: unknown };
    const { iat, exp } = claims;
    if (typeof iat !== 'number' || typeof exp !== 'number') return null;
    if (!Number.isFinite(iat) || !Number.isFinite(exp) || exp <= iat) return null;
    return { iat, exp };
  } catch {
    return null;
  }
}

function lerSessao(valor: string): SessaoGuardada | null {
  if (!valor || valor[0] !== '{') return null;
  try {
    const obj = JSON.parse(valor) as Partial<SessaoGuardada> | null;
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.access_token !== 'string' || typeof obj.refresh_token !== 'string') return null;
    if (typeof obj.expires_at !== 'number') return null;
    return obj as SessaoGuardada;
  } catch {
    return null;
  }
}

function marcaValida(m: unknown): m is MarcaRelogio {
  if (!m || typeof m !== 'object') return false;
  const marca = m as Partial<MarcaRelogio>;
  return marca.v === 1 && typeof marca.iat === 'number';
}

export interface ResultadoGravacao {
  valor: string;
  /** Defasagem medida AGORA (token recém-emitido); `null` quando nada foi medido. */
  defasagemMedidaSeg: number | null;
}

/**
 * Prepara a sessão para gravar. Só mede/ajusta um token que ainda não passou por
 * aqui (sem marca para o mesmo `iat`): é o token que acabou de chegar do servidor.
 */
export function ajustarSessaoParaGravar(valor: string, agoraMs: number): ResultadoGravacao {
  const intacto: ResultadoGravacao = { valor, defasagemMedidaSeg: null };
  const sessao = lerSessao(valor);
  if (!sessao) return intacto;
  const claims = lerClaimsJwt(sessao.access_token);
  if (!claims) return intacto;

  const marca = sessao[CAMPO_MARCA_RELOGIO];
  // Já passou por aqui (o auth-js regravou o objeto que leu do storage): não
  // reajusta. Reajustar mediria a IDADE do token como se fosse defasagem.
  if (marcaValida(marca) && marca.iat === claims.iat) return intacto;

  const defasagemSeg = Math.round(agoraMs / 1000) - claims.iat;
  // `expires_at` calculado no próprio aparelho (resposta sem `expires_at`, o
  // auth-js soma `expires_in` ao Date.now()) já está no relógio do aparelho.
  const jaNoRelogioDoAparelho = Math.abs(sessao.expires_at - claims.exp) > TOLERANCIA_DEFASAGEM_SEG;
  const ajustada: SessaoGuardada = { ...sessao };
  if (!jaNoRelogioDoAparelho && Math.abs(defasagemSeg) > TOLERANCIA_DEFASAGEM_SEG) {
    ajustada.expires_at = claims.exp + defasagemSeg;
    ajustada[CAMPO_EXPIRA_SERVIDOR] = claims.exp;
  } else {
    delete ajustada[CAMPO_EXPIRA_SERVIDOR];
  }
  ajustada[CAMPO_MARCA_RELOGIO] = { v: 1, iat: claims.iat, defasagemSeg, gravadaEm: agoraMs };
  return { valor: JSON.stringify(ajustada), defasagemMedidaSeg: defasagemSeg };
}

/**
 * Prepara a sessão lida do storage para o auth-js. `defasagemAtualMs` é a medida
 * mais recente do relógio (services/relogioServidor.ts) ou `null` se ainda não há.
 */
export function prepararSessaoParaLeitura(valor: string, agoraMs: number, defasagemAtualMs: number | null): string {
  const sessao = lerSessao(valor);
  if (!sessao) return valor;
  const claims = lerClaimsJwt(sessao.access_token);
  if (!claims) return valor;

  const marca = sessao[CAMPO_MARCA_RELOGIO];
  if (!marcaValida(marca) || marca.iat !== claims.iat) {
    // Sessão de versão anterior (ou marca de outro token): marca como "não sei"
    // e deixa o prazo como veio. Se o auth-js regravar este objeto, a marca
    // impede que a gravação trate um token velho como recém-emitido.
    const marcada: SessaoGuardada = {
      ...sessao,
      [CAMPO_MARCA_RELOGIO]: { v: 1, iat: claims.iat, defasagemSeg: null, gravadaEm: null },
    };
    return JSON.stringify(marcada);
  }
  if (marca.defasagemSeg === null) return valor;

  // Defasagem que vale AGORA: a medida mais recente; sem ela, a da gravação —
  // a não ser que o relógio tenha recuado desde então (a pessoa acertou a hora),
  // caso em que a defasagem guardada é velha e o prazo volta ao do servidor.
  let defasagemSeg: number;
  if (defasagemAtualMs !== null) defasagemSeg = Math.round(defasagemAtualMs / 1000);
  else if (marca.gravadaEm !== null && agoraMs < marca.gravadaEm - RECUO_RELOGIO_MS) defasagemSeg = 0;
  else defasagemSeg = marca.defasagemSeg;

  let expiraEm = Math.abs(defasagemSeg) > TOLERANCIA_DEFASAGEM_SEG ? claims.exp + defasagemSeg : claims.exp;

  // Piso de 30 s: token gravado há pouco é novo por definição (vale 1 h no
  // servidor). Lê-lo como vencido só geraria outro refresh em seguida.
  const idadeMs = marca.gravadaEm === null ? -1 : agoraMs - marca.gravadaEm;
  if (idadeMs >= 0 && idadeMs < PISO_ENTRE_REFRESH_MS && expiraEm * 1000 - agoraMs < MARGEM_AUTH_JS_MS + 1_000) {
    expiraEm = Math.ceil((agoraMs + MARGEM_AUTH_JS_MS + PISO_ENTRE_REFRESH_MS) / 1000);
  }

  if (expiraEm === sessao.expires_at) return valor;
  return JSON.stringify({ ...sessao, expires_at: expiraEm });
}
