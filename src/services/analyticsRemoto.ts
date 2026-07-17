/**
 * PostHog — o destino REMOTO do funil (P9 do plano: "Sentry + PostHog").
 *
 * Implementa a porta `ports/AnalyticsProvider.ts`, que já previa isto: "o adaptador
 * PostHog fará dupla escrita (local + remoto) sem trocar os call-sites de
 * `track(...)`". É o que acontece — `analytics.ts` continua sendo a API pública e
 * ninguém precisou mudar de chamada.
 *
 * SEM SDK, de propósito: a API `/capture` do PostHog é um POST com JSON, e o
 * `posthog-react-native` traz dependência nativa + fila própria + autocapture (que
 * captura TELA e TEXTO — exatamente o que a regra de PII proíbe aqui). Mesmo
 * critério do worker, que fala com Stripe/MP por fetch puro.
 *
 * DESLIGADO por padrão: sem `EXPO_PUBLIC_POSTHOG_KEY`, tudo aqui é no-op silencioso.
 * O código pode ser mergeado e publicado hoje; a chave entra quando o dono criar o
 * projeto. É o oposto do risco de "sobe com a chave errada e vaza".
 *
 * NUNCA lança e NUNCA bloqueia: analytics não pode quebrar (nem atrasar) a UX.
 */
import * as Crypto from 'expo-crypto';
import { limparProps, nomeEventoSeguro } from './analyticsScrub';

/**
 * ⚠️ DÍVIDA CONSCIENTE — env var vs. chave fixa.
 *
 * O `App.tsx` fixa a DSN do Sentry no código e explica por quê: *"em env var, uma
 * variável faltando desligaria o monitoramento em silêncio — que é o bug 'erro vira
 * vazio'"*. O mesmo risco existe aqui: um build EAS sem `EXPO_PUBLIC_POSTHOG_KEY`
 * sobe com o funil desligado e ninguém percebe (foi assim que a IA já subiu muda,
 * por falta de `EXPO_PUBLIC_DIAGNOSTICO_URL`).
 *
 * Está em env var porque o projeto PostHog AINDA NÃO EXISTE — não há chave para
 * fixar. **Quando o dono criar o projeto, siga o precedente do Sentry**: a chave de
 * ingestão do PostHog é pública por natureza (vai no bundle de qualquer jeito), então
 * fixá-la aqui remove a única forma de isto desligar sozinho.
 *
 * Até lá, o desligado é ao menos VISÍVEL: `analyticsRemotoLigado()` é público e o
 * boot avisa em dev (abaixo), em vez de fingir que está medindo.
 */
const CHAVE = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');

if (__DEV__ && !CHAVE) {
  // Não é erro: é o estado esperado até o projeto existir. Mas é dito em voz alta —
  // "sem funil" nunca deve ser descoberto três meses depois, olhando um painel vazio.
  console.warn('[olli-analytics] PostHog DESLIGADO (sem EXPO_PUBLIC_POSTHOG_KEY). Eventos só no SQLite local.');
}

/** Sal fixo do app: o mesmo user_id vira o mesmo pseudônimo, sempre. */
const SAL = 'olli-analytics-v1';

/** Está ligado? Sem chave, o módulo inteiro é inerte. */
export function analyticsRemotoLigado(): boolean {
  return typeof CHAVE === 'string' && CHAVE.length > 0;
}

// Cache do pseudônimo: o hash é assíncrono e o `track` é síncrono (fire-and-forget).
let pseudonimoCache: { userId: string; hash: string } | null = null;

/**
 * `user_id` → pseudônimo estável (SHA-256 de `sal:userId`, 32 hex).
 *
 * Por que não mandar o `user_id` cru: ele é a chave que liga esse funil ao BANCO —
 * quem tivesse acesso ao PostHog conseguiria cruzar evento com pessoa. O pseudônimo
 * preserva o que o funil precisa (contar a MESMA pessoa ao longo do tempo) e joga
 * fora o que ele não precisa (saber QUEM ela é).
 */
export async function pseudonimo(userId: string): Promise<string> {
  if (pseudonimoCache && pseudonimoCache.userId === userId) return pseudonimoCache.hash;
  const hash = (
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${SAL}:${userId}`)
  ).slice(0, 32);
  pseudonimoCache = { userId, hash };
  return hash;
}

/** Some com o pseudônimo em memória no logout (o próximo usuário não herda o dele). */
export function esquecerPseudonimo(): void {
  pseudonimoCache = null;
}

/**
 * Envia UM evento. `distinctId` já deve vir pseudonimizado (ver `pseudonimo`).
 * Fire-and-forget: erro de rede não vira erro de app, e não há retry — perder um
 * evento de funil é irrelevante perto de segurar a UI ou empilhar fila em disco.
 */
export function enviarEvento(evento: string, distinctId: string, props?: Record<string, unknown>): void {
  if (!analyticsRemotoLigado()) return;
  try {
    void fetch(`${HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: CHAVE,
        event: nomeEventoSeguro(evento),
        distinct_id: distinctId,
        // A faxina roda AQUI, na última porta antes da rede — não no call site.
        // Ninguém vai reauditar 20 call sites a cada prop nova.
        properties: { ...limparProps(props), $lib: 'olli-app' },
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch {
    // idem: nunca sobe
  }
}
