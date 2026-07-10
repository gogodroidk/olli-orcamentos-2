import { Platform } from 'react-native';

/**
 * SEO por rota na web.
 *
 * `web.output: 'single'` (app.json) + `public/_redirects` ("/* /index.html 200")
 * fazem TODAS as rotas públicas (/, /planos, /ajuda, /privacidade, /termos)
 * servirem o MESMO index.html — mesmo <title>, mesma meta description e o mesmo
 * <link rel="canonical"> fixo na home. Sem esta função o Google enxerga as quatro
 * páginas do sitemap.xml como duplicatas da home e nenhuma ranqueia sozinha.
 *
 * Cada tela pública chama `aplicarSeo()` ao montar, com seu próprio título,
 * descrição e caminho. Hoje chamam: LandingScreen ("/"), PlanosScreen ("/planos"),
 * AjudaScreen ("/ajuda") e LegalScreen ("/privacidade" e "/termos" — é a MESMA
 * tela, que decide o documento pelo nome da rota).
 *
 * LIMITE CONHECIDO: isto é SPA. O Googlebot renderiza JavaScript e enxerga as tags
 * atualizadas, mas crawlers que só leem o HTML cru (vários previews de link) veem o
 * `index.html` estático. Pré-renderizar por rota (SSG) é a solução completa; esta
 * função é o que dá para fazer sem trocar o pipeline de build.
 */

const URL_BASE = 'https://olliorcamentos.online';

interface AplicarSeoParams {
  /** Vira o <title> da aba e o título do resultado de busca. */
  titulo: string;
  /** Vira o conteúdo da <meta name="description">. */
  descricao: string;
  /** Caminho público da rota, começando com "/" (ex.: "/", "/planos"). */
  caminho: string;
}

/** Devolve a tag existente, ou cria e insere no <head> antes de devolver. */
function garantirTag(seletor: string, criar: () => HTMLElement): Element {
  const existente = document.querySelector(seletor);
  if (existente) return existente;
  const nova = criar();
  document.head.appendChild(nova);
  return nova;
}

/**
 * Atualiza `document.title`, a meta description, o canonical e as tags de
 * compartilhamento (Open Graph + Twitter) para refletir a rota pública atual.
 * No-op fora da web (`Platform.OS !== 'web'`) — o nativo não tem essas tags.
 *
 * As tags de Open Graph precisam ir JUNTO com o canonical: indexar `/planos` como
 * página própria não adianta se o link compartilhado no WhatsApp continua mostrando
 * o cartão da home. `og:image` não é tocada de propósito — a arte é a mesma em todas
 * as rotas.
 */
export function aplicarSeo({ titulo, descricao, caminho }: AplicarSeoParams): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  const url = `${URL_BASE}${caminho}`;

  document.title = titulo;

  garantirTag('meta[name="description"]', () => {
    const el = document.createElement('meta');
    el.setAttribute('name', 'description');
    return el;
  }).setAttribute('content', descricao);

  garantirTag('link[rel="canonical"]', () => {
    const el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    return el;
  }).setAttribute('href', url);

  // Open Graph (WhatsApp, Facebook, LinkedIn) — o cartão do link compartilhado.
  const og: [string, string][] = [
    ['og:title', titulo],
    ['og:description', descricao],
    ['og:url', url],
  ];
  for (const [prop, valor] of og) {
    garantirTag(`meta[property="${prop}"]`, () => {
      const m = document.createElement('meta');
      m.setAttribute('property', prop);
      return m;
    }).setAttribute('content', valor);
  }

  const twitter: [string, string][] = [
    ['twitter:title', titulo],
    ['twitter:description', descricao],
  ];
  for (const [nome, valor] of twitter) {
    garantirTag(`meta[name="${nome}"]`, () => {
      const m = document.createElement('meta');
      m.setAttribute('name', nome);
      return m;
    }).setAttribute('content', valor);
  }
}
