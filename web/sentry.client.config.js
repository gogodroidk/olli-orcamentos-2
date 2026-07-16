import * as Sentry from '@sentry/astro';

/**
 * Sentry do CLIENTE da landing (SSG — não há runtime de servidor aqui, então não
 * existe sentry.server.config).
 *
 * Este arquivo é o lugar canônico do SDK 10: a integração `sentry()` no
 * astro.config.mjs cuida só do build (source maps); o runtime mora aqui.
 *
 * A DSN é pública por natureza (vai no bundle do site de qualquer jeito) e está
 * fixa de propósito: em env var, uma variável faltando desligaria o monitoramento
 * em silêncio — o padrão "erro vira vazio" que estamos matando.
 */
Sentry.init({
  dsn: 'https://691e2a87bb02bd972e49a94ed87f43d1@o4511745793327104.ingest.us.sentry.io/4511745839726593',
  environment: import.meta.env.PROD ? 'production' : 'development',
  // LGPD: nada de IP/dado pessoal.
  sendDefaultPii: false,
  // Plano grátis = 5k eventos/mês. Erro vai 100%; trace é amostrado.
  tracesSampleRate: 0.1,
});
