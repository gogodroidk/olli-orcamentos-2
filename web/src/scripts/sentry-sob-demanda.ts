/**
 * Sentry da landing SOB DEMANDA — o SDK só baixa quando acontece um erro.
 *
 * Até 30/09/2026 a integração `sentry()` injetava o SDK inteiro em TODA página:
 * ~48 KB gzip de JavaScript no caminho de quem só queria ler um post do blog ou
 * ver os planos (nessas páginas era o ÚNICO script). Uma landing que funciona
 * não gera erro nenhum — e pagava o monitoramento a cada visita.
 *
 * Agora a integração injeta ESTE arquivo (ver `clientInitPath` no
 * astro.config.mjs), que custa algumas centenas de bytes: dois ouvintes nativos
 * que GUARDAM o erro e só então buscam o SDK (`sentry.client.config.js`, em
 * chunk próprio). Quando ele chega, a fila é enviada com o stack original e o
 * SDK assume os próximos erros sozinho. O erro nunca some: se o SDK não baixar
 * (rede caiu, bloqueador), perde-se o relato, nunca a página.
 *
 * O que se perde de propósito: a amostra de trace de carregamento (10%) e os
 * breadcrumbs anteriores ao erro. O desempenho real da landing é medido pelo
 * Lighthouse/CrUX; o Sentry aqui existe para erro.
 */

type Relato = { erro: unknown; origem: 'error' | 'unhandledrejection' };

/** Teto da fila enquanto o SDK não chega: um laço de erro não vira vazamento de memória. */
const FILA_MAX = 20;
const fila: Relato[] = [];
let carregando: Promise<void> | null = null;

function carregarSdk(): Promise<void> {
  carregando ??= import('../../sentry.client.config.js')
    .then(({ capturarExcecao }) => {
      // Daqui em diante quem escuta é o SDK (as integrações globais dele):
      // sair de cena evita relato em dobro.
      window.removeEventListener('error', aoErro);
      window.removeEventListener('unhandledrejection', aoRejeitar);
      for (const { erro, origem } of fila.splice(0)) {
        capturarExcecao(erro, { tags: { origem, carregado_sob_demanda: 'sim' } });
      }
    })
    .catch(() => {
      // SDK indisponível: os ouvintes continuam de pé e a próxima falha tenta de novo.
      carregando = null;
    });
  return carregando;
}

function guardar(relato: Relato) {
  if (fila.length < FILA_MAX) fila.push(relato);
}

function aoErro(e: ErrorEvent) {
  guardar({ erro: e.error ?? e.message, origem: 'error' });
  void carregarSdk();
}

function aoRejeitar(e: PromiseRejectionEvent) {
  guardar({ erro: e.reason, origem: 'unhandledrejection' });
  void carregarSdk();
}

window.addEventListener('error', aoErro);
window.addEventListener('unhandledrejection', aoRejeitar);
