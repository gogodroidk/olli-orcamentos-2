import { Platform } from 'react-native';

/**
 * SEO por rota na web (gate MEDIUM/LOW — ver AGENTS/relatório de gate).
 *
 * `web.output: 'single'` (app.json) + `public/_redirects` ("/* /index.html
 * 200") fazem TODAS as rotas públicas (/, /planos, /ajuda, /privacidade,
 * /termos) servirem o MESMO index.html — mesmo <title>, mesma meta
 * description, mesmo <link rel="canonical"> fixo na home. Sem esta função, o
 * Google enxerga as 4 páginas do sitemap.xml como duplicatas da home.
 *
 * Cada tela pública deve chamar `aplicarSeo()` ao montar, com seu próprio
 * título/descrição/caminho. Hoje só LandingScreen chama (rota "/"). AS
 * TELAS ABAIXO AINDA PRECISAM CHAMAR — não foram editadas aqui porque não
 * fazem parte do escopo permitido desta mudança:
 *   - src/screens/AjudaScreen.tsx        (rota pública "/ajuda")
 *   - src/screens/PrivacidadeScreen.tsx  (rota pública "/privacidade")
 *   - src/screens/TermosScreen.tsx       (rota pública "/termos")
 *   - src/screens/PlanosScreen.tsx       (rota pública "/planos")
 */

const URL_BASE = 'https://olliorcamentos.online';

interface AplicarSeoParams {
  /** Vira o <title> da aba/resultado de busca. */
  titulo: string;
  /** Vira o conteúdo da <meta name="description">. */
  descricao: string;
  /** Caminho público da rota, começando com "/" (ex.: "/", "/planos"). */
  caminho: string;
}

/**
 * Atualiza document.title, a <meta name="description"> e o <link
 * rel="canonical"> para refletir a rota pública atual. No-op fora da web
 * (Platform.OS !== 'web') — nativo não tem essas tags.
 */
export function aplicarSeo({ titulo, descricao, caminho }: AplicarSeoParams): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  document.title = titulo;

  let metaDescricao = document.querySelector('meta[name="description"]');
  if (!metaDescricao) {
    metaDescricao = document.createElement('meta');
    metaDescricao.setAttribute('name', 'description');
    document.head.appendChild(metaDescricao);
  }
  metaDescricao.setAttribute('content', descricao);

  let linkCanonical = document.querySelector('link[rel="canonical"]');
  if (!linkCanonical) {
    linkCanonical = document.createElement('link');
    linkCanonical.setAttribute('rel', 'canonical');
    document.head.appendChild(linkCanonical);
  }
  linkCanonical.setAttribute('href', `${URL_BASE}${caminho}`);
}
