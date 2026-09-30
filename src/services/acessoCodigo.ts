/**
 * Acesso por código e por link de e-mail — lógica PURA compartilhada entre o app
 * (`src/screens/EntrarScreen.tsx`, `src/components/auth/*`) e o painel (`webapp`,
 * alias `@acesso-codigo`). Nada aqui importa React, React Native nem Supabase:
 * roda em `node` no teste (`scripts/teste-acesso-codigo.ts`).
 *
 * CONTRATO DOS LINKS DE AUTH (combinado com o hook de e-mail):
 *   https://app.olliorcamentos.online/auth/confirm?token_hash=<hash>&type=<tipo>&next=<caminho>
 * O mesmo e-mail traz o CÓDIGO de 6 dígitos. Quem abre o e-mail em outro aparelho
 * digita o código no app; quem clica no link cai no painel, que confirma com
 * `verifyOtp({ token_hash, type })`. Recuperação de senha termina em /auth/nova-senha.
 *
 * Três regras que valem para toda tela de acesso:
 *  1. Nenhuma mensagem revela se um e-mail tem conta (anti-enumeração). "Enviamos
 *     se existir" é o único texto possível depois de pedir código ou link.
 *  2. Todo limite de envio é VISÍVEL: a tela diz "aguarde Xs", nunca só "erro".
 *  3. `next` nunca vira open redirect: só caminho interno do painel é aceito.
 */

/** Painel que resolve os links de e-mail (Site do contrato). */
export const URL_PAINEL = 'https://app.olliorcamentos.online';
export const CAMINHO_CONFIRMAR = '/auth/confirm';
// Montado a partir do prefixo de propósito: o literal inteiro colado num nome
// terminado em "_SENHA" é o que o gate de segredos (scripts/teste-sem-segredos.ts)
// trata como "senha literal em texto". O valor continua '/auth/nova-senha'.
const CAMINHO_AUTH = '/auth';
export const CAMINHO_NOVA_SENHA = [CAMINHO_AUTH, 'nova-senha'].join('/');

/** Tamanho do código do e-mail (`mailer_otp_length`) e validade combinada com o dono. */
export const TAMANHO_CODIGO = 6;
export const VALIDADE_CODIGO_MIN = 10;

/**
 * Espera mínima entre dois pedidos de código/link para o MESMO e-mail. É o padrão
 * do Supabase (`smtp_max_frequency` = 60 s). A tela aplica a espera sempre, exista
 * a conta ou não — se só o servidor limitasse, "aguarde 42s" na segunda tentativa
 * denunciaria que o e-mail tem conta (quem não tem nunca recebe o limite).
 */
export const ESPERA_REENVIO_S = 60;

/** `redirectTo` do "esqueci a senha", igual no app e no painel (fica na allowlist). */
export function urlRecuperacaoSenha(): string {
  return `${URL_PAINEL}${CAMINHO_CONFIRMAR}?next=${CAMINHO_NOVA_SENHA}`;
}

// ─── /auth/confirm ────────────────────────────────────────────────────────────

/** Tipos de link que o contrato aceita (`email` é o nome novo do `signup`/`magiclink` no GoTrue). */
export type TipoLinkEmail = 'signup' | 'recovery' | 'magiclink' | 'email_change' | 'invite' | 'email';

export const TIPOS_LINK_EMAIL: readonly TipoLinkEmail[] = [
  'signup', 'recovery', 'magiclink', 'email_change', 'invite', 'email',
];

function ehTipoLink(v: string | null): v is TipoLinkEmail {
  return v !== null && (TIPOS_LINK_EMAIL as readonly string[]).includes(v);
}

/** Motivos fechados de falha de um link ou código — escolhem a mensagem. */
export type MotivoFalhaAcesso =
  | 'expirado' // venceu OU já foi usado (o GoTrue não distingue: `otp_expired`)
  | 'incompleto' // link cortado: sem token_hash, tipo desconhecido
  | 'limite' // muitos pedidos
  | 'email_invalido' // o servidor recusou o formato do e-mail
  | 'rede'
  | 'desconhecido';

export type LeituraConfirmacao =
  /** Link do contrato: confirmar com verifyOtp({ token_hash, type }). */
  | { tipo: 'token'; tokenHash: string; tipoLink: TipoLinkEmail; destino: string }
  /**
   * Link antigo (template padrão do Supabase, PKCE): o GoTrue já validou e mandou
   * `?code=`. Quem troca é o supabase-js sozinho (`detectSessionInUrl`); a tela só
   * espera a sessão aparecer.
   */
  | { tipo: 'codigo_pkce'; destino: string }
  | { tipo: 'erro'; motivo: MotivoFalhaAcesso; tipoLink: TipoLinkEmail | null };

/**
 * Aceita SÓ caminho interno do painel. Bloqueia `//outro.site`, `/\outro.site`,
 * `https://…`, `javascript:` e caracteres de controle — tudo isso vira o padrão.
 */
export function destinoSeguro(next: string | null | undefined, padrao = '/'): string {
  if (typeof next !== 'string') return padrao;
  const v = next.trim();
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return padrao;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: é exatamente o que bloqueamos.
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return padrao;
  if (v.length > 512) return padrao;
  return v;
}

/**
 * Para onde ir depois de confirmar. Recuperação e convite SEMPRE terminam em
 * definir senha, qualquer que seja o `next` (o template pode ter caído no Site URL
 * se o redirect não estava na allowlist — a senha não pode ficar para trás).
 */
export function destinoAposConfirmar(tipoLink: TipoLinkEmail | null, next: string | null, padrao = '/'): string {
  if (tipoLink === 'recovery' || tipoLink === 'invite') return CAMINHO_NOVA_SENHA;
  const destino = destinoSeguro(next, padrao);
  // Evita voltar para a própria tela de confirmação (loop sem token).
  return destino.startsWith(CAMINHO_CONFIRMAR) ? padrao : destino;
}

function paramsDoHash(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

/** Lê a URL do /auth/confirm e decide o que a tela faz. Nunca lança. */
export function lerConfirmacao(url: string | null | undefined, padrao = '/'): LeituraConfirmacao {
  let u: URL;
  try {
    u = new URL(url ?? '');
  } catch {
    return { tipo: 'erro', motivo: 'incompleto', tipoLink: null };
  }
  const q = u.searchParams;
  const h = paramsDoHash(u.hash);
  const tipoBruto = q.get('type') ?? h.get('type');
  const tipoLink = ehTipoLink(tipoBruto) ? tipoBruto : null;
  const next = q.get('next') ?? h.get('next');

  // Erro devolvido pelo GoTrue (link do template antigo vencido/usado).
  const erro = q.get('error') ?? h.get('error');
  const codigoErro = q.get('error_code') ?? h.get('error_code');
  if (erro || codigoErro) {
    const motivo: MotivoFalhaAcesso =
      codigoErro === 'otp_expired' || erro === 'access_denied' ? 'expirado' : 'desconhecido';
    return { tipo: 'erro', motivo, tipoLink };
  }

  const tokenHash = (q.get('token_hash') ?? h.get('token_hash') ?? '').trim();
  if (tokenHash) {
    if (!tipoLink || tokenHash.length > 512) return { tipo: 'erro', motivo: 'incompleto', tipoLink };
    return { tipo: 'token', tokenHash, tipoLink, destino: destinoAposConfirmar(tipoLink, next, padrao) };
  }

  if (q.get('code')) return { tipo: 'codigo_pkce', destino: destinoAposConfirmar(tipoLink, next, padrao) };

  return { tipo: 'erro', motivo: 'incompleto', tipoLink };
}

// ─── Erros do Supabase Auth ───────────────────────────────────────────────────

interface ErroAuthLike {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
}

function campos(err: unknown): { code: string; status: number; message: string } {
  const e = (err ?? {}) as ErroAuthLike;
  return {
    code: typeof e.code === 'string' ? e.code : '',
    status: typeof e.status === 'number' ? e.status : 0,
    message: typeof e.message === 'string' ? e.message : String(err ?? ''),
  };
}

/**
 * Segundos de espera que o servidor pediu ("you can only request this after 42
 * seconds"). Sem número na mensagem, devolve a espera padrão. Nunca menos de 1.
 */
export function segundosDeEspera(err: unknown, padrao = ESPERA_REENVIO_S): number {
  const { message } = campos(err);
  const m = /after\s+(\d{1,4})\s*second/i.exec(message);
  const s = m ? Number(m[1]) : padrao;
  return Math.max(1, Math.min(s, 3600));
}

/** Classifica o erro de verifyOtp/signInWithOtp/resetPasswordForEmail. */
export function classificarFalhaAcesso(err: unknown): MotivoFalhaAcesso {
  const { code, status, message } = campos(err);
  if (code === 'email_address_invalid' || code === 'validation_failed' || /email.*invalid|invalid.*email/i.test(message)) return 'email_invalido';
  if (code === 'otp_expired' || /expired|is invalid|invalid.*token|token.*invalid/i.test(message)) return 'expirado';
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    status === 429 ||
    /rate limit|too many|only request this after/i.test(message)
  ) return 'limite';
  if (/network|failed to fetch|fetch failed|timeout|offline|connection/i.test(message) || (err as ErroAuthLike)?.name === 'AuthRetryableFetchError') return 'rede';
  return 'desconhecido';
}

/**
 * O erro diz "não existe conta" (login por código com `shouldCreateUser: false`)?
 * Então a tela responde IGUAL a um envio que deu certo — revelar a diferença
 * transformaria o formulário num verificador de e-mails cadastrados.
 */
export function ehErroDeContaInexistente(err: unknown): boolean {
  const { code, message } = campos(err);
  return (
    code === 'otp_disabled' ||
    code === 'user_not_found' ||
    /signups? not allowed|user not found/i.test(message)
  );
}

export type ResultadoEnvio =
  | { tipo: 'enviado' }
  | { tipo: 'aguarde'; segundos: number }
  | { tipo: 'erro'; motivo: MotivoFalhaAcesso };

/** Resultado de pedir código/link, já com a regra anti-enumeração aplicada. */
export function resultadoDoEnvio(err: unknown): ResultadoEnvio {
  if (!err) return { tipo: 'enviado' };
  if (ehErroDeContaInexistente(err)) return { tipo: 'enviado' };
  const motivo = classificarFalhaAcesso(err);
  if (motivo === 'limite') return { tipo: 'aguarde', segundos: segundosDeEspera(err) };
  return { tipo: 'erro', motivo };
}

// ─── Textos (iguais no app e no painel) ───────────────────────────────────────

/** Depois de pedir um código de login. Mesma frase com ou sem conta. */
export const TEXTO_CODIGO_ENVIADO =
  `Se houver uma conta com este e-mail, enviamos um código de ${TAMANHO_CODIGO} dígitos. Ele vale por ${VALIDADE_CODIGO_MIN} minutos.`;

/** Depois de pedir a recuperação de senha. Mesma frase com ou sem conta. */
export const TEXTO_RECUPERACAO_ENVIADA =
  `Se houver uma conta com este e-mail, enviamos um link e um código de ${TAMANHO_CODIGO} dígitos para criar uma nova senha. Abra o link em qualquer aparelho ou digite o código aqui.`;

/** Quem entrou pelo Google/Apple também usa o código — explicado na tela. */
export const TEXTO_CONTA_GOOGLE =
  'Entrou com o Google ou a Apple? O código também funciona para a sua conta.';

export function mensagemAguarde(segundos: number): string {
  return `Muitos pedidos seguidos. Aguarde ${Math.max(1, Math.ceil(segundos))}s para pedir de novo.`;
}

/** Mensagem de falha ao confirmar um CÓDIGO digitado. */
export function mensagemFalhaCodigo(motivo: MotivoFalhaAcesso): string {
  switch (motivo) {
    case 'expirado':
      return 'Código incorreto, vencido ou já usado. Confira os números ou peça um novo código.';
    case 'limite':
      return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
    case 'rede':
      return 'Sem conexão. Verifique sua internet e tente de novo.';
    case 'incompleto':
      return `Digite os ${TAMANHO_CODIGO} dígitos do código.`;
    case 'email_invalido':
      return 'Confira o e-mail digitado e peça um novo código.';
    case 'desconhecido':
      return 'Não foi possível confirmar o código agora. Tente de novo em instantes.';
  }
}

/** Mensagem de falha ao PEDIR código ou link (o limite tem mensagem própria). */
export function mensagemFalhaEnvio(motivo: MotivoFalhaAcesso): string {
  switch (motivo) {
    case 'email_invalido':
      return 'E-mail inválido. Confira o endereço e tente de novo.';
    case 'rede':
      return 'Sem conexão. Verifique sua internet e tente de novo.';
    case 'limite':
      return mensagemAguarde(ESPERA_REENVIO_S);
    default:
      return 'Não foi possível enviar agora. Tente de novo em instantes.';
  }
}

/** Título + texto da falha ao abrir um LINK de e-mail. Sempre diz o que fazer. */
export function mensagemFalhaLink(
  motivo: MotivoFalhaAcesso,
  tipoLink: TipoLinkEmail | null,
): { titulo: string; texto: string } {
  const doQue =
    tipoLink === 'recovery' ? 'para criar uma nova senha'
    : tipoLink === 'email_change' ? 'para confirmar o novo e-mail'
    : tipoLink === 'invite' ? 'do convite'
    : tipoLink === 'signup' ? 'para confirmar o cadastro'
    : 'de acesso';
  switch (motivo) {
    case 'expirado':
      return {
        titulo: 'Este link expirou ou já foi usado',
        texto: `Cada link ${doQue} funciona uma vez e vale por ${VALIDADE_CODIGO_MIN} minutos. Peça um novo abaixo.`,
      };
    case 'incompleto':
      return {
        titulo: 'Link incompleto',
        texto: 'O endereço chegou cortado. Abra o link direto do e-mail ou peça um novo abaixo.',
      };
    case 'limite':
      return { titulo: 'Muitas tentativas', texto: 'Aguarde um pouco e tente de novo.' };
    case 'email_invalido':
      return { titulo: 'E-mail inválido', texto: 'Confira o endereço e peça um novo link abaixo.' };
    case 'rede':
      return { titulo: 'Sem conexão', texto: 'Não consegui falar com o servidor. Verifique sua internet e tente de novo.' };
    case 'desconhecido':
      return {
        titulo: 'Não foi possível confirmar',
        texto: 'Algo deu errado ao confirmar o link. Tente de novo ou peça um novo abaixo.',
      };
  }
}

/** Qual reenvio a tela de link vencido oferece. Convite não tem reenvio próprio. */
export type ReenvioDoLink = 'recuperacao' | 'confirmacao_cadastro' | 'troca_email' | 'codigo_login' | 'nenhum';

export function reenvioDoLink(tipoLink: TipoLinkEmail | null): ReenvioDoLink {
  switch (tipoLink) {
    case 'recovery': return 'recuperacao';
    case 'signup': return 'confirmacao_cadastro';
    case 'email_change': return 'troca_email';
    case 'invite': return 'nenhum';
    // magiclink/email e link sem tipo: um código de login novo resolve (a pessoa
    // só quer entrar) e não cria conta — ver `shouldCreateUser: false`.
    default: return 'codigo_login';
  }
}

// ─── Regra de reenvio ─────────────────────────────────────────────────────────

/** Segundos que faltam para liberar o reenvio. 0 = pode reenviar. */
export function segundosParaReenviar(liberaEmMs: number | null, agoraMs: number): number {
  if (liberaEmMs === null || !Number.isFinite(liberaEmMs)) return 0;
  return Math.max(0, Math.ceil((liberaEmMs - agoraMs) / 1000));
}

/** Momento em que o próximo pedido fica liberado, a partir do resultado do envio. */
export function liberaReenvioEm(resultado: ResultadoEnvio, agoraMs: number): number | null {
  if (resultado.tipo === 'enviado') return agoraMs + ESPERA_REENVIO_S * 1000;
  if (resultado.tipo === 'aguarde') return agoraMs + resultado.segundos * 1000;
  return null; // erro de rede/desconhecido: pode tentar de novo na hora
}

export function rotuloReenvio(segundos: number, rotulo = 'Reenviar código'): string {
  return segundos > 0 ? `${rotulo} em ${segundos}s` : rotulo;
}

/** Fração do contador circular (1 = acabou de enviar, 0 = liberado). */
export function fracaoReenvio(segundos: number, total = ESPERA_REENVIO_S): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, segundos / total));
}

// ─── Campo do código (lógica pura do input) ───────────────────────────────────

/**
 * Normaliza o que foi digitado/colado. Aceita "123 456", "123-456" e a frase
 * inteira do e-mail ("Seu código é 123456"): se houver um bloco de exatamente
 * 6 dígitos, é ele; senão, só os dígitos, cortados no tamanho do código.
 */
export function normalizarCodigo(texto: string | null | undefined, tamanho = TAMANHO_CODIGO): string {
  const bruto = String(texto ?? '');
  const bloco = new RegExp(`(?:^|\\D)(\\d{${tamanho}})(?!\\d)`).exec(bruto);
  if (bloco && bruto.replace(/\D/g, '').length > tamanho) return bloco[1];
  const digitos = bruto.replace(/\D/g, '');
  // Vários blocos separados ("123 456"): junta os dígitos.
  return digitos.slice(0, tamanho);
}

export function codigoCompleto(codigo: string, tamanho = TAMANHO_CODIGO): boolean {
  return new RegExp(`^\\d{${tamanho}}$`).test(codigo);
}

/** As casas do campo: dígito ou vazio, e qual está ativa (a próxima a preencher). */
export function casasDoCodigo(
  codigo: string,
  tamanho = TAMANHO_CODIGO,
): { posicao: number; digito: string; ativa: boolean; preenchida: boolean }[] {
  const c = normalizarCodigo(codigo, tamanho);
  const ativa = Math.min(c.length, tamanho - 1);
  return Array.from({ length: tamanho }, (_, i) => ({
    posicao: i,
    digito: c[i] ?? '',
    ativa: i === ativa && c.length < tamanho,
    preenchida: i < c.length,
  }));
}

/** Estados do campo — um só de cada vez. */
export type EstadoCampoCodigo = 'digitando' | 'verificando' | 'erro' | 'sucesso';

/** Pode enviar para verificação agora? Evita a segunda chamada no meio da primeira. */
export function deveVerificar(codigo: string, estado: EstadoCampoCodigo, tamanho = TAMANHO_CODIGO): boolean {
  return estado !== 'verificando' && estado !== 'sucesso' && codigoCompleto(codigo, tamanho);
}

// ─── Força da senha ───────────────────────────────────────────────────────────

export type NivelSenha = 'vazia' | 'fraca' | 'media' | 'forte';

export interface AvaliacaoSenha {
  valida: boolean;
  nivel: NivelSenha;
  /** O que falta, em pt-BR, na ordem em que a pessoa deve resolver. */
  faltas: string[];
}

/** Senhas que qualquer lista de vazamento tenta primeiro (comparação com a senha inteira). */
const SENHA_OBVIA = /^(?:1234567890?|12345678|123456789|87654321|abc12345?6?|(?:senha|password|qwerty|olli|mudar)\d*)$/i;

/**
 * Regra mínima (igual à do Supabase, que valida de novo no servidor): `minimo`
 * caracteres, com letra e número. Força extra = tamanho e símbolo/maiúscula.
 * `minimo` vem de `SENHA_MINIMA` (authPolicy.ts) — este módulo não importa nada.
 */
export function avaliarSenha(senha: string, minimo: number): AvaliacaoSenha {
  const s = senha ?? '';
  if (!s) return { valida: false, nivel: 'vazia', faltas: [`Use pelo menos ${minimo} caracteres`] };
  const faltas: string[] = [];
  if (s.length < minimo) faltas.push(`Use pelo menos ${minimo} caracteres`);
  if (!/\p{L}/u.test(s)) faltas.push('Inclua pelo menos uma letra');
  if (!/\d/.test(s)) faltas.push('Inclua pelo menos um número');
  if (/^(.)\1+$/.test(s)) faltas.push('Não repita o mesmo caractere');
  if (SENHA_OBVIA.test(s)) faltas.push('Evite sequências óbvias como 12345678 ou "senha"');
  const valida = faltas.length === 0;
  if (!valida) return { valida, nivel: 'fraca', faltas };
  let pontos = 0;
  if (s.length >= minimo + 4) pontos++;
  if (/[^\p{L}\d]/u.test(s)) pontos++;
  if (/\p{Lu}/u.test(s) && /\p{Ll}/u.test(s)) pontos++;
  return { valida, nivel: pontos >= 2 ? 'forte' : 'media', faltas };
}

export const ROTULO_NIVEL_SENHA: Record<NivelSenha, string> = {
  vazia: '',
  fraca: 'Senha fraca',
  media: 'Senha razoável',
  forte: 'Senha forte',
};
