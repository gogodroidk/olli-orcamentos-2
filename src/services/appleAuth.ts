import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { ResultadoOAuth } from './supabase';

/**
 * "Sign in with Apple" — exigência da App Store, não escolha nossa.
 *
 * A Guideline 4.8 da Apple obriga qualquer app que ofereça login social de
 * terceiros (o OLLI oferece Google) a oferecer também o login da Apple, com
 * peso equivalente. Sem isto a revisão do iOS reprova na primeira leva.
 *
 * SÓ EXISTE NO iOS. `expo-apple-authentication` não suporta Android nem web
 * (docs SDK 56), e importá-lo no topo derrubaria o bundle do APK. Por isso o
 * módulo é carregado com `require` preguiçoso, dentro de uma guarda de
 * plataforma — mesmo padrão do `expo-web-browser` em `signInWithGoogle`.
 *
 * DEPENDE DE CONFIGURAÇÃO HUMANA: o provider Apple precisa estar habilitado no
 * painel do Supabase (Services ID + Team ID + Key .p8), e isso exige a conta
 * Apple Developer paga. Enquanto ela não existir, a Apple devolve um token
 * válido e o Supabase recusa: tratamos esse caso com mensagem clara em vez de
 * um erro cru.
 */

/** Módulo nativo carregado só no iOS (require preguiçoso; ver cabeçalho). */
type ModuloApple = typeof import('expo-apple-authentication');

function moduloApple(): ModuloApple | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-apple-authentication') as ModuloApple;
  } catch {
    // Build sem o módulo nativo (ex.: Expo Go antigo): degrada escondendo o botão.
    return null;
  }
}

/**
 * `true` quando o aparelho sabe fazer Sign in with Apple (iOS 13+).
 * NÃO diz que o Supabase está configurado — isso só se descobre ao tentar.
 * A Apple exige que o botão apareça em todo iOS elegível, então é este o gate
 * de exibição, e o erro de configuração vira mensagem no fluxo.
 */
export async function appleSignInDisponivel(): Promise<boolean> {
  const Apple = moduloApple();
  if (!Apple) return false;
  try {
    return await Apple.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Nonce aleatório em hex. Cru vai ao Supabase; o SHA-256 dele vai à Apple. */
async function gerarNonce(): Promise<{ cru: string; hash: string }> {
  const Crypto = await import('expo-crypto');
  const bytes = await Crypto.getRandomBytesAsync(32);
  const cru = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, cru);
  return { cru, hash };
}

/**
 * Login/cadastro com a Apple. Cancelamento do usuário NÃO é erro (devolve
 * 'cancelado'), igual ao fluxo do Google.
 *
 * O nonce impede REPLAY: mandamos o SHA-256 para a Apple (que o embute como
 * claim no `identityToken`) e o valor CRU para o Supabase, que compara o hash.
 * Sem ele, um `identityToken` interceptado valeria enquanto não expirasse.
 */
export async function signInWithApple(): Promise<ResultadoOAuth> {
  const Apple = moduloApple();
  if (!Apple) throw new Error('Login com a Apple não está disponível neste aparelho.');
  if (!supabase) throw new Error('Backup na nuvem não configurado.');

  const { cru, hash } = await gerarNonce();

  let credencial: Awaited<ReturnType<ModuloApple['signInAsync']>>;
  try {
    credencial = await Apple.signInAsync({
      requestedScopes: [
        Apple.AppleAuthenticationScope.FULL_NAME,
        Apple.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hash,
    });
  } catch (e: unknown) {
    // Documentado no SDK 56: cancelar levanta ERR_REQUEST_CANCELED.
    if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return 'cancelado';
    throw e;
  }

  if (!credencial.identityToken) {
    throw new Error('A Apple não devolveu o token de identidade. Tente de novo.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credencial.identityToken,
    nonce: cru, // valor CRU: o Supabase compara o hash dele com o claim do token
  });
  if (error) {
    // O primeiro teste real só acontece quando a conta Apple Developer existir.
    // Sem este log, "provider desligado no Supabase", "nonce trocado" e "Client ID
    // errado" produzem a MESMA frase, e o debug vira adivinhação. Só em DEV: a
    // mensagem do GoTrue não vai para produção nem para analytics.
    if (__DEV__) console.warn('[apple] signInWithIdToken falhou:', error.message);
    throw new Error(
      'Não consegui concluir o login com a Apple. Se o problema continuar, entre com e-mail ou Google.',
    );
  }

  // A Apple só manda nome e e-mail na PRIMEIRA autorização daquele Apple ID —
  // nas seguintes `fullName` vem nulo. Se não guardarmos agora, o nome some para
  // sempre. A chave é `full_name`: é a que o cadastro por e-mail grava
  // (supabase.ts), a que a ContaScreen lê e a que o painel admin lê. Gravar em
  // `nome` seria escrever numa chave que ninguém consulta.
  const nome = [credencial.fullName?.givenName, credencial.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (nome) {
    try {
      await supabase.auth.updateUser({ data: { full_name: nome } });
    } catch {
      // best-effort: não travamos o login por causa do nome.
    }
  }

  return 'ok';
}
