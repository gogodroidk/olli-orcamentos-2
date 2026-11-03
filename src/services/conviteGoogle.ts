/**
 * Login do funcionário pelo convite de equipe (D1438-G23).
 *
 * Convite com e-mail: só entra quem usar o Google dessa conta.
 * Convite sem e-mail: o link continua valendo para quem o receber.
 * Módulo puro — sem rede, sem Supabase e sem React.
 */

export const CHAVE_CONVITE_PENDENTE = 'olli:convite-equipe';

const VALIDADE_MS = 2 * 60 * 60 * 1000;
const PAINEL_LOGIN = 'https://app.olliorcamentos.online/auth/login';
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CodigoFalhaAceite =
  | 'nao_autenticado'
  | 'invalido'
  | 'usado'
  | 'expirado'
  | 'outro_email'
  | 'exige_google'
  | 'desconhecido';

export type ResultadoAceite =
  | { ok: true; jaAceito: boolean }
  | { ok: false; codigo: CodigoFalhaAceite };

export type ResumoConvite =
  | {
      ok: true;
      temEmail: boolean;
      email: string;
      papel: 'admin' | 'gestor' | 'tecnico' | '';
      empresa: string;
    }
  | { ok: false; erro: 'invalido' | 'usado' | 'expirado' | 'indisponivel' };

type Armazenamento = {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
};

export function tokenConviteValido(bruto: string | null | undefined): string {
  const s = String(bruto ?? '').trim();
  return TOKEN_RE.test(s) ? s : '';
}

export function normalizarEmailConvite(bruto: string | null | undefined): string {
  const s = String(bruto ?? '').trim().toLowerCase().slice(0, 160);
  return EMAIL_RE.test(s) ? s : '';
}

/** Primeira letra e o domínio. O restante do nome fica de fora da tela. */
export function mascararEmailConvite(bruto: string | null | undefined): string {
  const email = normalizarEmailConvite(bruto);
  if (!email) return '';
  const separador = email.indexOf('@');
  const local = email.slice(0, separador);
  const dominio = email.slice(separador + 1);
  return `${local.slice(0, 1)}•••@${dominio}`;
}

export function emailsDoConviteConferem(
  conta: string | null | undefined,
  convite: string | null | undefined,
): boolean {
  const a = normalizarEmailConvite(conta);
  const b = normalizarEmailConvite(convite);
  return a !== '' && a === b;
}

/**
 * Dica para o Google abrir a conta certa. Sem escopo extra: não pedimos Gmail,
 * Drive nem contatos. `select_account` deixa a pessoa trocar se a conta aberta
 * no navegador for outra.
 */
export function queryParamsGoogleConvite(
  email: string | null | undefined,
): { login_hint: string; prompt: 'select_account' } | undefined {
  const hint = normalizarEmailConvite(email);
  if (!hint) return undefined;
  return { login_hint: hint, prompt: 'select_account' };
}

export function queryParamsEscolherContaGoogle(): { prompt: 'select_account' } {
  return { prompt: 'select_account' };
}

export function urlPainelLoginConvite(tokenBruto: string): string {
  const token = tokenConviteValido(tokenBruto);
  if (!token) return '';
  return `${PAINEL_LOGIN}?convite=${encodeURIComponent(token)}`;
}

export function decidirPaginaConvite(
  email: string | null | undefined,
  token: string,
): { emailMascarado: string; urlGoogle: string; abrirAppSozinho: boolean } {
  const normalizado = normalizarEmailConvite(email);
  const urlGoogle = normalizado ? urlPainelLoginConvite(token) : '';
  return {
    emailMascarado: mascararEmailConvite(normalizado),
    urlGoogle,
    abrirAppSozinho: urlGoogle === '',
  };
}

export function extrairTokenConviteDaBusca(search: string | null | undefined): string {
  const bruto = String(search ?? '');
  const q = bruto.startsWith('?') ? bruto.slice(1) : bruto;
  return tokenConviteValido(new URLSearchParams(q).get('convite'));
}

export function buscaSemParametroConvite(search: string | null | undefined): string {
  const bruto = String(search ?? '');
  const q = bruto.startsWith('?') ? bruto.slice(1) : bruto;
  const params = new URLSearchParams(q);
  params.delete('convite');
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function guardarConvitePendente(
  armazenamento: Armazenamento | null | undefined,
  tokenBruto: string,
  agora = Date.now(),
): void {
  try {
    if (!armazenamento) return;
    const token = tokenConviteValido(tokenBruto);
    if (!token) {
      armazenamento.removeItem(CHAVE_CONVITE_PENDENTE);
      return;
    }
    armazenamento.setItem(CHAVE_CONVITE_PENDENTE, JSON.stringify({ token, em: agora }));
  } catch {
    // storage bloqueado: o link do convite continua sendo o caminho
  }
}

export function lerConvitePendente(
  armazenamento: Armazenamento | null | undefined,
  agora = Date.now(),
): string {
  try {
    if (!armazenamento) return '';
    const cru = armazenamento.getItem(CHAVE_CONVITE_PENDENTE);
    if (!cru) return '';
    const dado = JSON.parse(cru) as { token?: unknown; em?: unknown };
    const token = tokenConviteValido(typeof dado.token === 'string' ? dado.token : '');
    const em = typeof dado.em === 'number' ? dado.em : 0;
    if (!token || em <= 0 || agora < em || agora - em > VALIDADE_MS) {
      armazenamento.removeItem(CHAVE_CONVITE_PENDENTE);
      return '';
    }
    return token;
  } catch {
    return '';
  }
}

export function consumirConvitePendente(armazenamento: Armazenamento | null | undefined): void {
  try {
    armazenamento?.removeItem(CHAVE_CONVITE_PENDENTE);
  } catch {
    // segue sem apagar
  }
}

export function destinoDoConvitePendente(
  armazenamento: Armazenamento | null | undefined,
  agora = Date.now(),
): '/equipe/aceitar' | null {
  return lerConvitePendente(armazenamento, agora) ? '/equipe/aceitar' : null;
}

const FALHAS: Record<string, CodigoFalhaAceite> = {
  'erro:nao_autenticado': 'nao_autenticado',
  'erro:convite_invalido': 'invalido',
  'erro:convite_ja_usado': 'usado',
  'erro:convite_expirado': 'expirado',
  'erro:convite_outro_email': 'outro_email',
  'erro:convite_exige_google': 'exige_google',
};

/**
 * A função do banco devolve texto (`ok` ou `erro:…`) e o PostgREST não trata
 * isso como falha. Sem esta leitura, e-mail trocado parecia convite aceito.
 */
export function interpretarAceiteConvite(retorno: unknown): ResultadoAceite {
  if (retorno === 'ok') return { ok: true, jaAceito: false };
  if (retorno === 'ja_aceito') return { ok: true, jaAceito: true };
  if (typeof retorno === 'string' && FALHAS[retorno]) return { ok: false, codigo: FALHAS[retorno] };
  return { ok: false, codigo: 'desconhecido' };
}

export function mensagemAceiteConvite(codigo: CodigoFalhaAceite): string {
  switch (codigo) {
    case 'nao_autenticado':
      return 'Entre com o Google do e-mail que recebeu o convite antes de aceitar.';
    case 'invalido':
      return 'Convite não encontrado. Confira o link que você recebeu.';
    case 'usado':
      return 'Este convite já foi usado.';
    case 'expirado':
      return 'Este convite expirou. Peça um novo para quem te chamou.';
    case 'outro_email':
      return 'Esta conta não é a do convite. Saia e entre com o Google do e-mail que recebeu o convite.';
    case 'exige_google':
      return 'Este convite pede entrada com o Google. Use o Google do e-mail que recebeu o convite.';
    default:
      return 'Não consegui aceitar o convite agora. Tente de novo.';
  }
}

export function sessaoTemGoogle(
  user:
    | {
        identities?: Array<{ provider?: string | null }> | null;
        app_metadata?: { provider?: unknown; providers?: unknown } | null;
      }
    | null
    | undefined,
): boolean {
  if (!user) return false;
  if (user.identities?.some((item) => item?.provider === 'google')) return true;
  const meta = user.app_metadata;
  if (!meta) return false;
  if (meta.provider === 'google') return true;
  return Array.isArray(meta.providers) && meta.providers.includes('google');
}

/**
 * `sabeEmail` falso = o resumo do convite não carregou. Aí quem decide é o
 * banco, quando a migration estiver aplicada. Sem essa distinção, uma falha de
 * rede bloquearia o convite antigo, que não tem e-mail.
 */
export function podeAceitarConvite(entrada: {
  sabeEmail: boolean;
  temEmail: boolean;
  emailConvite?: string | null;
  emailConta?: string | null;
  temGoogle: boolean;
}): { ok: true } | { ok: false; codigo: 'outro_email' | 'exige_google' } {
  if (!entrada.sabeEmail || !entrada.temEmail) return { ok: true };
  if (!emailsDoConviteConferem(entrada.emailConta, entrada.emailConvite)) {
    return { ok: false, codigo: 'outro_email' };
  }
  if (!entrada.temGoogle) return { ok: false, codigo: 'exige_google' };
  return { ok: true };
}

const PAPEIS = new Set(['admin', 'gestor', 'tecnico']);

export function lerResumoConvite(status: number, dados: unknown): ResumoConvite {
  if (status === 404) return { ok: false, erro: 'invalido' };
  if (status === 0 || status === 429 || status >= 500) return { ok: false, erro: 'indisponivel' };
  if (!dados || typeof dados !== 'object') return { ok: false, erro: 'indisponivel' };
  const corpo = dados as {
    ok?: unknown;
    erro?: unknown;
    email?: unknown;
    papel?: unknown;
    empresa?: unknown;
  };
  if (corpo.ok === false) {
    if (corpo.erro === 'expirado') return { ok: false, erro: 'expirado' };
    if (corpo.erro === 'usado') return { ok: false, erro: 'usado' };
    if (corpo.erro === 'invalido') return { ok: false, erro: 'invalido' };
    return { ok: false, erro: 'indisponivel' };
  }
  if (corpo.ok !== true || status !== 200) return { ok: false, erro: 'indisponivel' };
  const email = normalizarEmailConvite(typeof corpo.email === 'string' ? corpo.email : '');
  const papelBruto = typeof corpo.papel === 'string' ? corpo.papel : '';
  const papel = PAPEIS.has(papelBruto) ? (papelBruto as 'admin' | 'gestor' | 'tecnico') : '';
  const empresa = typeof corpo.empresa === 'string' ? limparTextoPublico(corpo.empresa) : '';
  return { ok: true, temEmail: email !== '', email, papel, empresa };
}

function limparTextoPublico(bruto: string): string {
  let saida = '';
  for (const char of bruto) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 32 && code !== 127) saida += char;
  }
  return saida.trim().slice(0, 120);
}
