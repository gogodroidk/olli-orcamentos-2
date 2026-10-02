import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';
import { authStorage } from './authStorage';
import {
  classificarErroOAuth,
  criarRegistroFunilAuth,
  decidirRetornoNativo,
  ErroOAuth,
  type MotivoErroOAuth,
  normalizarPlataforma,
  novaTentativaOAuth,
} from './oauthRetorno';
import { urlRecuperacaoSenha } from './acessoCodigo';
import { decidirSessaoNoBoot, erroDeRenovacaoEhDeRede, interpretarSessaoGuardada, type DecisaoSessao } from './sessaoOffline';
import { criarFetchResiliente } from './refreshResiliente';
import { registrarHoraDoServidor } from './relogioServidor';

export function isSupabaseConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY && SUPABASE_URL.startsWith('http');
}

/**
 * Fetch de TODO o cliente (auth, banco, storage). Duas coisas além do fetch
 * normal (ver services/refreshResiliente.ts):
 *  - refresh recusado por "servidor ocupado" (429, 5xx, resposta estranha) não
 *    vira logout: só a credencial morta (`invalid_grant`, refresh token
 *    inexistente) desloga; o resto mantém a sessão e espera ≥ 30 s;
 *  - o cabeçalho `Date` de cada resposta mede o relógio do celular (aviso de
 *    data/hora errada e decisões que comparam datas com o servidor).
 * O `fetch` global é lido na hora da chamada, não na criação, para não prender
 * uma referência antiga caso algum polyfill o troque depois do import.
 */
const fetchDoCliente = criarFetchResiliente(
  (input, init) => fetch(input, init),
  { aoReceberDataServidor: registrarHoraDoServidor },
);

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { fetch: fetchDoCliente },
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        // OAuth por deep link (Google) usa PKCE: o app abre o navegador, recebe
        // o `code` no retorno (olliorcamentos://auth/callback) e troca por sessão
        // manualmente via exchangeCodeForSession. detectSessionInUrl fica desligado
        // porque QUEM captura a URL de retorno é o WebBrowser/Linking, não o client.
        flowType: 'pkce',
        // Nativo: o WebBrowser captura a URL de retorno e trocamos o code
        // manualmente (exchangeCodeForSession) — a deteccao automatica fica OFF.
        // Web: o retorno do OAuth e um redirect de pagina inteira com ?code na
        // URL; a deteccao automatica PRECISA estar ligada, senao o usuario volta
        // do Google e permanece deslogado (tambem vale pro link de reset de senha).
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;

/**
 * Normaliza um telefone brasileiro para SÓ dígitos com DDI 55. Regras:
 * remove tudo que não é dígito; se já vem com 12-13 dígitos começando em 55,
 * mantém; se tem 10-11 dígitos (DDD + número), prefixa 55. Caso contrário
 * devolve os dígitos como estão (não força um DDI que não sabemos).
 * Preparado para o OTP por SMS (pendência humana) — hoje só é semeado/salvo.
 */
export function normalizarTelefoneBR(bruto: string): string {
  const digitos = (bruto ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

// ─── Auth helpers ──────────────────────────────────────────────
export async function signUp(email: string, password: string, nome?: string, telefone?: string) {
  if (!supabase) throw new Error('Backup na nuvem não configurado.');
  // Telefone entra em user_metadata (zero mudança de schema), já normalizado com
  // DDI 55. full_name e telefone só são incluídos quando informados.
  const meta: Record<string, string> = {};
  if (nome && nome.trim()) meta.full_name = nome.trim();
  if (telefone) {
    const tel = normalizarTelefoneBR(telefone);
    if (tel) meta.telefone = tel;
  }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: Object.keys(meta).length > 0 ? { data: meta } : undefined,
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Backup na nuvem não configurado.');
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

// ─── Acesso por código (e-mail) ────────────────────────────────
// Regras e textos em acessoCodigo.ts (os mesmos do painel). Estas funções só
// falam com o Supabase e devolvem o erro cru — quem decide a mensagem é a tela,
// passando pelo `resultadoDoEnvio`, que aplica a regra anti-enumeração.

/**
 * Pede um código de login por e-mail. `shouldCreateUser: false` de propósito: o
 * cadastro do OLLI pede nome e WhatsApp (e é por ele que o funil mede o signup);
 * um código digitado num e-mail com erro de digitação criaria uma conta fantasma
 * sem nada disso. Quem não tem conta recebe a MESMA resposta na tela (ver
 * `ehErroDeContaInexistente`) e é convidado a criar conta.
 */
export async function enviarCodigoLogin(email: string): Promise<{ error: unknown }> {
  if (!supabase) return { error: new Error('Backup na nuvem não configurado.') };
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false },
  });
  return { error };
}

/**
 * "Esqueci a senha": o e-mail traz o link (resolvido pelo painel, em qualquer
 * aparelho) e o código de 6 dígitos (digitado aqui mesmo).
 */
export async function pedirRecuperacaoSenha(email: string): Promise<{ error: unknown }> {
  if (!supabase) return { error: new Error('Backup na nuvem não configurado.') };
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: urlRecuperacaoSenha(),
  });
  return { error };
}

/**
 * Confirma o código de 6 dígitos. `email` = login por código; `recovery` = esqueci
 * a senha (a sessão criada aqui só serve para definir a senha nova em seguida).
 */
export async function confirmarCodigoEmail(
  email: string,
  codigo: string,
  tipo: 'email' | 'recovery',
): Promise<{ ok: boolean; error: unknown }> {
  if (!supabase) return { ok: false, error: new Error('Backup na nuvem não configurado.') };
  const { data, error } = tipo === 'recovery'
    ? await supabase.auth.verifyOtp({ email: email.trim(), token: codigo, type: 'recovery' })
    : await supabase.auth.verifyOtp({ email: email.trim(), token: codigo, type: 'email' });
  // Sem erro e sem sessão = "não sei": não deixa passar como se tivesse entrado.
  if (!error && !data?.session) return { ok: false, error: new Error('sem_sessao') };
  return { ok: !error, error };
}

/** Define a senha nova da conta com sessão ativa (depois do código de recuperação). */
export async function definirNovaSenha(senha: string): Promise<void> {
  if (!supabase) throw new Error('Backup na nuvem não configurado.');
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  // "Sair" encerra apenas este aparelho. O default do Supabase e `global` e
  // revogava tambem o refresh token do painel e dos outros aparelhos, que
  // deslogavam na renovacao seguinte sem explicar o motivo.
  await supabase.auth.signOut({ scope: 'local' });
}

export async function getCurrentUser() {
  if (!supabase) return null;
  try {
    // getSession() lê a sessão do storage local protegido (LOCAL, sem rede).
    // um GET /auth/v1/user a CADA chamada — e este helper é usado em dezenas de
    // pontos (sidebar, telas, serviços, o sync), o que gerava um FLOOD de
    // /auth/v1/user a cada login/carga (parte do "app arrasta ao logar"). Para
    // obter id/e-mail do usuário logado a sessão local basta; a segurança real é a
    // RLS no servidor, não a revalidação do getUser. Mesmo racional já aplicado em
    // sessaoAtiva() e documentado em useTipoConta.ts.
    const { data } = await supabase.auth.getSession();
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Sessão persistida atual (ou null). É a ÚNICA porta do app: App.tsx decide a
 * rota inicial por ela. Nunca lança — em qualquer erro (client ausente, storage
 * corrompido) devolve null, que é fail-closed (cai na tela Entrar, nunca dentro
 * do app). No nativo a sessão vem de SecureStore; no web, do storage do
 * navegador. Assim funciona offline depois do primeiro login sem plaintext no
 * sandbox nativo.
 */
export async function sessaoAtiva(): Promise<Session | null> {
  return (await sessaoComOrigem()).sessao;
}

/**
 * Lê a sessão GUARDADA no aparelho, sem rede. Só é usada quando a renovação
 * falhou por falta de internet (ver services/sessaoOffline.ts). Nunca lança.
 */
async function lerSessaoGuardada(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const chave = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    if (!chave) return null;
    return await authStorage.getItem(chave);
  } catch {
    return null;
  }
}

/**
 * Sessão + de onde ela veio. `guardada_offline` = o token venceu e não havia
 * internet para renovar, mas a sessão continua no aparelho: o app abre em modo
 * avião em vez de pedir login. O sync segue parado até a renovação dar certo
 * (ele usa `getCurrentUser`, que continua estrito) — é só a PORTA que não fecha.
 */
export async function sessaoComOrigem(): Promise<DecisaoSessao<Session>> {
  if (!supabase) return { origem: 'nenhuma', sessao: null };
  try {
    const { data, error } = await supabase.auth.getSession();
    if (data.session) return { origem: 'servidor', sessao: data.session };
    // Só lê o storage quando o motivo do null foi REDE — evita IO à toa no
    // caminho comum (deslogado de verdade não tem erro nenhum).
    if (!erroDeRenovacaoEhDeRede(error)) return { origem: 'nenhuma', sessao: null };
    return decidirSessaoNoBoot<Session>(null, error, await lerSessaoGuardada());
  } catch {
    return { origem: 'nenhuma', sessao: null };
  }
}

/**
 * Usuário da sessão para IDENTIFICAR quem está no aparelho (filtro "minhas OS"
 * do técnico, chave da fila de fotos) — inclusive offline com o token vencido.
 * NÃO use para decidir se pode falar com a nuvem: para isso é `getCurrentUser`,
 * que devolve null enquanto a sessão não for renovada.
 *
 * Lê a sessão GUARDADA primeiro, sem passar pelo `getSession()`: com o token
 * vencido e sem rede, cada `getSession()` tenta renovar com espera crescente
 * (até ~25 s no auth-js) — e este helper roda a cada foto registrada e a cada
 * leitura do selo. Para saber QUEM está no aparelho a sessão guardada basta (o
 * auth-js a apaga quando o servidor a recusa ou no "sair"). Sem nada guardado,
 * cai no caminho normal.
 */
export async function usuarioDaSessaoLocal(): Promise<{ id: string; email?: string | null } | null> {
  const guardada = interpretarSessaoGuardada(await lerSessaoGuardada());
  if (guardada) return guardada.user;
  const { sessao } = await sessaoComOrigem();
  return sessao?.user ?? null;
}

/**
 * Há dados locais dignos de proteção? (empresa cadastrada OU ao menos 1 orçamento).
 * Usado pelo banner de migração da EntrarScreen: quem já usou o app offline vê o
 * convite para criar conta e vincular o que já fez. Import dinâmico do database
 * de propósito — evita um ciclo estático supabase → database → cloudSync → supabase.
 * Nunca lança: em erro devolve false (sem banner, degradação segura).
 *
 * Só vale num aparelho onde NINGUÉM nunca entrou (mapa de partições vazio). Se
 * alguém já entrou, os dados no aparelho são de uma conta que já existe — a
 * partição de quem saiu, ou o banco legado que o primeiro login adotou — e o
 * convite a "criar conta" atrapalhava quem só queria entrar de novo. "Não sei"
 * (mapa ilegível) também não mostra o banner.
 */
export async function temDadosLocais(): Promise<boolean> {
  try {
    const db = await import('../database/database');
    if ((await db.alguemJaEntrouNesteAparelho()) !== false) return false;
    const empresa = await db.getEmpresa();
    if (empresa !== null) return true;
    const orcamentos = await db.getOrcamentos();
    return orcamentos.length > 0;
  } catch {
    return false;
  }
}

/**
 * Login/cadastro com o Google (OAuth). O provider já está ATIVO no Supabase.
 *
 * Nativo (Android/iOS): PKCE + deep link. Abrimos o navegador do sistema com a
 * URL de autorização do Supabase (skipBrowserRedirect para nós controlarmos o
 * retorno), o Google devolve para `olliorcamentos://auth/callback` com um `code`,
 * e trocamos esse code por sessão via exchangeCodeForSession.
 *
 * NUNCA falha em silêncio (incidente 16–25/09, ver oauthRetorno.ts): erro do
 * Google na URL de retorno, code ausente ou troca recusada viram `ErroOAuth` com
 * mensagem pt-BR pronta. Fechar a aba devolve `cancelado` — quem chama AVISA
 * (no Android a aba às vezes fecha sozinha e a pessoa precisa saber que não entrou).
 * Enquanto a aba está aberta, escutamos o deep link pelo Linking: se a Custom Tab
 * resolver `dismiss` depois de já ter entregado o code, o code é aproveitado.
 *
 * Web: fluxo redirect simples (a própria página captura o retorno) — sem
 * skipBrowserRedirect, redirectTo = origem atual.
 *
 * Funil sem PII: oauth_iniciado → oauth_sessao_criada | oauth_erro (motivo fechado).
 * Import dinâmico de expo-web-browser/expo-linking para o bundle não carregá-los à
 * toa fora do fluxo.
 */
export type ResultadoOAuth = 'ok' | 'cancelado';

// A tabela `auth_funil_eventos` aceita INSERT de anon (sem SELECT). Sem a
// migration aplicada, o registrador se desliga no primeiro erro.
const registrarFunilAuth = criarRegistroFunilAuth(
  supabase ? (linha) => supabase!.from('auth_funil_eventos').insert(linha) : null,
);

export async function signInWithGoogle(): Promise<ResultadoOAuth> {
  if (!supabase) throw new Error('Backup na nuvem não configurado.');
  const plataforma = normalizarPlataforma(Platform.OS);
  const tentativa = novaTentativaOAuth();
  void registrarFunilAuth('oauth_iniciado', { plataforma, tentativa });

  if (Platform.OS === 'web') {
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) {
      void registrarFunilAuth('oauth_erro', { plataforma, tentativa, motivo: classificarErroOAuth(error.code, error.message) });
      throw error;
    }
    // Na web o próprio navegador redireciona; a sessão é resolvida no retorno.
    return 'ok';
  }

  const Linking = await import('expo-linking');
  const WebBrowser = await import('expo-web-browser');
  const redirectTo = Linking.createURL('auth/callback');

  const falhar: (motivo: MotivoErroOAuth) => never = (motivo) => {
    void registrarFunilAuth('oauth_erro', { plataforma, tentativa, motivo });
    throw new ErroOAuth(motivo);
  };

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) falhar(classificarErroOAuth(error.code, error.message));
  if (!data?.url) falhar('desconhecido');

  // Rede de segurança do Android: guarda o deep link que chegar enquanto a aba
  // estiver aberta (a Custom Tab pode resolver `dismiss` mesmo tendo entregue o code).
  let urlCapturada: string | null = null;
  const assinatura = Linking.addEventListener('url', ({ url }) => {
    if (url.startsWith(redirectTo)) urlCapturada = url;
  });
  let res: { type: string; url?: string | null };
  try {
    res = await WebBrowser.openAuthSessionAsync(data!.url, redirectTo);
  } catch (e) {
    return falhar(classificarErroOAuth(null, (e as Error)?.message));
  } finally {
    assinatura.remove();
  }

  const decisao = decidirRetornoNativo(res, urlCapturada);
  if (decisao.tipo === 'cancelado') {
    void registrarFunilAuth('oauth_erro', { plataforma, tentativa, motivo: 'cancelado' });
    return 'cancelado';
  }
  if (decisao.tipo === 'erro') return falhar(decisao.motivo);

  const { data: troca, error: exchangeError } = await supabase.auth.exchangeCodeForSession(decisao.codigo);
  if (exchangeError) falhar(classificarErroOAuth(exchangeError.code, exchangeError.message));
  if (!troca?.session) falhar('sem_sessao');
  void registrarFunilAuth('oauth_sessao_criada', { plataforma, tentativa });
  return 'ok';
}
