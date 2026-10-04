/**
 * Retorno do login social (Google/Apple) — lógica PURA compartilhada entre o app
 * nativo (`src/services/supabase.ts`) e o painel (`webapp`, alias `@oauth-retorno`).
 *
 * Por que existe (incidente 16–25/09/2026): 13 de 18 cadastros pelo Google criaram
 * o usuário no Supabase e nunca ganharam sessão. Causa provada em `auth.flow_state`:
 * o painel pedia `redirectTo=https://app.../auth/login`, que NÃO estava na allowlist
 * de Redirect URLs; o GoTrue então cai no Site URL (`https://olliorcamentos.online`,
 * a landing), entrega o `?code=` lá, e a landing não sabe trocar o code. Usuário
 * criado, sessão nunca criada, e NENHUMA mensagem na tela — o pior tipo de falha.
 * A mesma armadilha continua viva para qualquer redirect com query
 * (`/auth/login?plano=pro`): a allowlist compara a URL INTEIRA.
 *
 * Três regras daqui pra frente:
 *  1. O redirect do OAuth é SEMPRE uma URL fixa, sem query (`CAMINHO_RETORNO_AUTH`).
 *  2. Todo retorno é lido e classificado: erro vira mensagem em pt-BR, nunca silêncio.
 *  3. O funil (iniciado → sessão criada | erro) é registrado SEM PII: só evento,
 *     plataforma, provedor, um motivo de uma lista fechada e um id aleatório da
 *     tentativa (não liga a pessoa nenhuma). Sem a tabela, o registro desliga sozinho.
 *
 * Nada aqui importa React, React Native nem Supabase — roda em `node` no teste.
 */

/** Único caminho de retorno do OAuth no painel. SEM query, de propósito (ver regra 1). */
export const CAMINHO_RETORNO_AUTH = '/auth/login';

/** Motivos fechados — o que vai para a telemetria e escolhe a mensagem. */
export type MotivoErroOAuth =
  | 'cancelado' // a pessoa fechou/negou no Google (ou o Android fechou a aba)
  | 'provedor' // o Google/Apple devolveu erro
  | 'codigo_expirado' // o code já foi usado ou venceu
  | 'navegador_trocado' // o code chegou num navegador sem o code_verifier (PKCE)
  | 'sem_codigo' // voltou "sucesso" mas sem code nem erro
  | 'sem_sessao' // havia code e mesmo assim a sessão não apareceu
  | 'rede'
  | 'navegador_falhou' // o navegador/Custom Tab nem abriu (sem navegador, aba já aberta, erro nativo)
  | 'sem_retorno' // a aba fechou/resolveu cedo demais e nenhum retorno chegou no tempo de espera
  | 'desconhecido';

export const MOTIVOS_ERRO_OAUTH: readonly MotivoErroOAuth[] = [
  'cancelado', 'provedor', 'codigo_expirado', 'navegador_trocado',
  'sem_codigo', 'sem_sessao', 'rede', 'navegador_falhou', 'sem_retorno', 'desconhecido',
];

export type ProvedorOAuth = 'google' | 'apple';

const NOME_PROVEDOR: Record<ProvedorOAuth, string> = { google: 'Google', apple: 'Apple' };

/** Erro com mensagem já pronta para a tela (pt-BR) e motivo para a telemetria. */
export class ErroOAuth extends Error {
  readonly motivo: MotivoErroOAuth;
  readonly mensagemUsuario: string;
  constructor(motivo: MotivoErroOAuth, provedor: ProvedorOAuth = 'google') {
    const mensagem = mensagemErroOAuth(motivo, provedor);
    super(mensagem);
    this.name = 'ErroOAuth';
    this.motivo = motivo;
    this.mensagemUsuario = mensagem;
  }
}

/** Texto para a pessoa. Sempre diz o que fazer em seguida. */
export function mensagemErroOAuth(motivo: MotivoErroOAuth, provedor: ProvedorOAuth = 'google'): string {
  const nome = NOME_PROVEDOR[provedor];
  switch (motivo) {
    case 'cancelado':
      return `O login com o ${nome} foi fechado antes de terminar. Toque em ${nome} para tentar de novo.`;
    case 'provedor':
      return `O ${nome} não confirmou o seu acesso. Tente de novo ou entre com e-mail e senha.`;
    case 'codigo_expirado':
      return `O login com o ${nome} expirou. Toque em ${nome} de novo para entrar.`;
    case 'navegador_trocado':
      return `O login com o ${nome} terminou em outro navegador. Abra o OLLI neste mesmo navegador e toque em ${nome} de novo.`;
    case 'rede':
      return 'Sem conexão para concluir o login. Verifique sua internet e tente de novo.';
    case 'navegador_falhou':
      return `Não conseguimos abrir o navegador para o login com o ${nome}. Tente de novo; se continuar, entre com e-mail e senha.`;
    case 'sem_retorno':
      return `O login com o ${nome} não voltou para o app. Toque em ${nome} para tentar de novo.`;
    case 'sem_codigo':
    case 'sem_sessao':
    case 'desconhecido':
      return `Não conseguimos concluir o login com o ${nome}. Tente de novo; se continuar, entre com e-mail e senha.`;
  }
}

/**
 * Texto para um retorno (`?code=`/`?error=`) que NÃO nasceu de um botão Google/Apple
 * nesta aba — na prática, o link de confirmação de cadastro por e-mail, que também
 * volta para `/auth/login` (`emailRedirectTo`) e muitas vezes é aberto no app de
 * e-mail, sem o code_verifier. Não pode culpar o "login com o Google" de quem se
 * cadastrou por e-mail.
 */
export function mensagemRetornoSemOrigem(motivo: MotivoErroOAuth): string {
  switch (motivo) {
    case 'codigo_expirado':
      return 'Este link de acesso expirou ou já foi usado. Entre com seu e-mail e senha ou peça um novo link.';
    case 'rede':
      return mensagemErroOAuth('rede');
    case 'navegador_trocado':
      return 'Este link foi aberto em um navegador diferente de onde você começou. Entre com seu e-mail e senha para continuar.';
    default:
      return 'Não conseguimos concluir o acesso por este link. Entre com seu e-mail e senha para continuar.';
  }
}

/**
 * Classifica o erro que o GoTrue/provedor devolve na URL (`error`, `error_code`,
 * `error_description`) ou o erro da troca do code (`exchangeCodeForSession`).
 * Entrada crua em inglês → motivo fechado. Nunca devolve o texto cru.
 */
export function classificarErroOAuth(codigo: string | null | undefined, descricao?: string | null): MotivoErroOAuth {
  const c = (codigo ?? '').toLowerCase();
  const d = (descricao ?? '').toLowerCase();
  const tudo = `${c} ${d}`;
  if (c === 'access_denied' || /cancel|denied|consent/.test(d)) return 'cancelado';
  if (/code verifier|code_verifier|pkce|bad_code_verifier/.test(tudo)) return 'navegador_trocado';
  if (/flow_state|expired|already (been )?used|invalid flow|not found|bad_oauth_state|invalid.*code|otp_expired/.test(tudo)) {
    return 'codigo_expirado';
  }
  if (/network|fetch|timeout|offline|failed to fetch/.test(tudo)) return 'rede';
  if (c === 'server_error' || c === 'temporarily_unavailable' || /provider|oauth|unexpected_failure/.test(tudo)) return 'provedor';
  return 'desconhecido';
}

export type RetornoOAuth =
  | { tipo: 'nenhum' }
  | { tipo: 'codigo'; codigo: string }
  | { tipo: 'erro'; motivo: MotivoErroOAuth };

/**
 * Lê uma URL de retorno (web: `window.location.href`; nativo: a URL do deep link).
 * PKCE devolve `?code=` / `?error=` na query; o fluxo implícito e alguns erros do
 * GoTrue vêm no `#hash`. Olha os dois. URL inválida → `nenhum` (nunca lança).
 */
export function lerRetornoOAuth(url: string | null | undefined): RetornoOAuth {
  if (!url) return { tipo: 'nenhum' };
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return { tipo: 'nenhum' };
  }
  const query = alvo.searchParams;
  const hash = new URLSearchParams(alvo.hash.startsWith('#') ? alvo.hash.slice(1) : alvo.hash);
  const pegar = (k: string) => query.get(k) ?? hash.get(k);

  const erro = pegar('error');
  const erroCodigo = pegar('error_code');
  const erroDescricao = pegar('error_description');
  if (erro || erroCodigo || erroDescricao) {
    return { tipo: 'erro', motivo: classificarErroOAuth(erroCodigo ?? erro, erroDescricao) };
  }
  const codigo = query.get('code');
  if (codigo) return { tipo: 'codigo', codigo };
  return { tipo: 'nenhum' };
}

/** A mesma URL sem os parâmetros do OAuth — para limpar a barra de endereço. */
export function urlSemParametrosOAuth(url: string): string {
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return url;
  }
  for (const k of ['code', 'error', 'error_code', 'error_description', 'state']) alvo.searchParams.delete(k);
  if (/(^|[#&])(error|error_description|access_token)=/.test(alvo.hash)) alvo.hash = '';
  return alvo.toString();
}

/** Resultado de `WebBrowser.openAuthSessionAsync` (só o que usamos). */
export interface ResultadoSessaoNavegador {
  type: string;
  url?: string | null;
}

/**
 * Janela (ms) em que um `dismiss`/`cancel` sem URL no Android NÃO é confiável.
 * O polyfill Android do expo-web-browser resolve `dismiss` em QUALQUER AppState
 * 'active' (WebBrowser.ts `_onAppStateChangeAndroid`), inclusive um 'active'
 * espúrio logo após abrir a Custom Tab. Humano nenhum fecha a aba e desiste em
 * menos de 2 s (incidente 03/10: `cancelado` 0,16 s após `oauth_iniciado`).
 */
export const JANELA_DISMISS_ESPURIO_MS = 2000;

/** Quanto esperar o deep link tardio depois de um dismiss espúrio (a aba segue aberta). */
export const ESPERA_RETORNO_TARDIO_MS = 180_000;

/** `dismiss`/`cancel` sem URL, vindo cedo demais para ter sido um gesto humano? */
export function dismissEspurio(res: ResultadoSessaoNavegador, decorridoMs: number, urlCapturada: string | null): boolean {
  if (urlCapturada || res.type === 'success' || res.type === 'locked') return false;
  return decorridoMs < JANELA_DISMISS_ESPURIO_MS;
}

export type DecisaoRetornoNativo =
  | { tipo: 'codigo'; codigo: string }
  | { tipo: 'cancelado' }
  | { tipo: 'erro'; motivo: MotivoErroOAuth };

/**
 * Decide o que fazer quando a aba do navegador fecha no app nativo.
 *
 * `urlCapturada` é a URL do deep link que o `Linking` recebeu enquanto a aba estava
 * aberta. No Android, a Custom Tab às vezes resolve `dismiss` MESMO tendo entregado
 * o deep link com o code — tratar isso como "cancelado" jogava o code fora e o
 * usuário ficava criado sem sessão. Então: vale a URL do resultado; se não houver,
 * vale a capturada; só sem nenhuma das duas é cancelamento.
 */
export function decidirRetornoNativo(
  res: ResultadoSessaoNavegador,
  urlCapturada: string | null,
): DecisaoRetornoNativo {
  const url = res.type === 'success' && res.url ? res.url : urlCapturada;
  // `locked` = já existe outra sessão de navegador aberta: o nosso NÃO abriu, ninguém cancelou.
  if (!url && res.type === 'locked') return { tipo: 'erro', motivo: 'navegador_falhou' };
  if (!url) return res.type === 'success' ? { tipo: 'erro', motivo: 'sem_codigo' } : { tipo: 'cancelado' };
  const retorno = lerRetornoOAuth(url);
  if (retorno.tipo === 'codigo') return retorno;
  if (retorno.tipo === 'erro') return retorno.motivo === 'cancelado' ? { tipo: 'cancelado' } : retorno;
  return { tipo: 'erro', motivo: 'sem_codigo' };
}

// ─── Funil de auth (telemetria mínima, sem PII) ───────────────────────────────

export type EventoFunilAuth = 'oauth_iniciado' | 'oauth_sessao_criada' | 'oauth_erro';
export type PlataformaFunilAuth = 'web' | 'android' | 'ios' | 'unknown';

/** Linha gravada em `public.auth_funil_eventos`. Nada que identifique a pessoa. */
export interface LinhaFunilAuth {
  evento: EventoFunilAuth;
  plataforma: PlataformaFunilAuth;
  provedor: ProvedorOAuth;
  motivo: MotivoErroOAuth | null;
  tentativa: string;
}

export type InserirFunilAuth = (linha: LinhaFunilAuth) => PromiseLike<{ error: unknown }>;

/** A tabela ainda não existe (migration não aplicada)? Então o registro desliga. */
export function erroDeTabelaAusente(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined;
  if (!e) return false;
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST204') return true;
  return /does not exist|could not find the table|schema cache/i.test(e.message ?? '');
}

export function normalizarPlataforma(os: string | null | undefined): PlataformaFunilAuth {
  return os === 'web' || os === 'android' || os === 'ios' ? os : 'unknown';
}

/** Id aleatório da tentativa (liga iniciado → resultado; não liga a nenhum usuário). */
export function novaTentativaOAuth(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback sem crypto (Hermes antigo): formato UUID v4, aleatoriedade comum —
  // é só um id de correlação, não segredo.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Cria o registrador do funil. NUNCA lança e NUNCA bloqueia a UX (fire-and-forget).
 * Tolerante à ausência da tabela: no primeiro erro de "tabela não existe" ele se
 * desliga pelo resto da sessão, em vez de martelar o PostgREST a cada clique.
 */
export function criarRegistroFunilAuth(inserir: InserirFunilAuth | null) {
  let desligado = !inserir;
  return function registrar(
    evento: EventoFunilAuth,
    dados: { plataforma: PlataformaFunilAuth; provedor?: ProvedorOAuth; tentativa: string; motivo?: MotivoErroOAuth | null },
  ): Promise<void> {
    if (desligado || !inserir) return Promise.resolve();
    const motivo = dados.motivo && MOTIVOS_ERRO_OAUTH.includes(dados.motivo) ? dados.motivo : null;
    const linha: LinhaFunilAuth = {
      evento,
      plataforma: dados.plataforma,
      provedor: dados.provedor ?? 'google',
      motivo: evento === 'oauth_erro' ? (motivo ?? 'desconhecido') : null,
      tentativa: dados.tentativa,
    };
    try {
      return Promise.resolve(inserir(linha))
        .then(({ error }) => {
          if (error && erroDeTabelaAusente(error)) desligado = true;
        })
        .catch(() => {});
    } catch {
      return Promise.resolve();
    }
  };
}
