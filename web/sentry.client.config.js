import * as Sentry from '@sentry/astro';
import { limparBreadcrumbSentry, limparEventoSentry } from '../src/services/sentryScrub.ts';

/**
 * Sentry do CLIENTE da landing (SSG — não há runtime de servidor aqui, então não
 * existe sentry.server.config).
 *
 * Este arquivo é o lugar canônico do SDK 10: a integração `sentry()` no
 * astro.config.mjs cuida só do build (source maps); o runtime mora aqui.
 *
 * CARREGADO SOB DEMANDA (30/09/2026): quem importa este arquivo é
 * `src/scripts/sentry-sob-demanda.ts`, e só quando a página dá erro — o SDK
 * saiu do caminho de toda visita. Por isso ele exporta `capturarExcecao`: o
 * carregador reenvia a fila de erros que aconteceram antes do download.
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
  beforeSend: (event) => limparEventoSentry(event),
  beforeSendTransaction: (event) => limparEventoSentry(event),
  beforeBreadcrumb: (breadcrumb) => limparBreadcrumbSentry(breadcrumb),
  // Plano grátis = 5k eventos/mês. Erro vai 100%; trace é amostrado.
  tracesSampleRate: 0.1,
});

/**
 * Só a função que o carregador usa. NÃO exporte o namespace (`export { Sentry }`):
 * reexportado inteiro, ele desliga o tree-shaking e o chunk sob demanda triplica
 * (medido: 48 → 143 KB gzip).
 */
export function capturarExcecao(erro, contexto) {
  Sentry.captureException(erro, contexto);
}
