// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import sentry from '@sentry/astro';

// Site de marketing da OLLI — separado do app (react-native-web). Aqui mora o
// design extraordinário: SSG p/ SEO + Lighthouse alto, ilhas React só onde há
// interação, Motion p/ 85% do movimento, 3D só no hero (lazy + fallback).
// https://astro.build/config
export default defineConfig({
  site: 'https://olliorcamentos.online',
  // ST-04: o canonical e o sitemap saem COM barra final (/ajuda/), mas os links
  // internos eram sem barra (/ajuda) — e o Worker de assets responde 307 → /ajuda/
  // em cada clique e em cada aresta que o Googlebot atravessa. `trailingSlash: 'always'`
  // torna a barra a forma canônica; combinado com os hrefs já corrigidos pra ter barra,
  // o 307 some. `build.format: 'directory'` (padrão) já gera /ajuda/index.html.
  trailingSlash: 'always',
  // O sentry() só carrega opções de BUILD (org/project/authToken p/ source map).
  // A DSN e o resto do runtime moram em sentry.client.config.js — passar dsn aqui
  // está deprecado no SDK 10 ("vai parar de funcionar numa versão futura").
  // authToken vem da env SENTRY_AUTH_TOKEN no build; sem ela, só não sobe o source
  // map — a captura de erro continua funcionando.
  integrations: [
    react(),
    sitemap(),
    sentry({
      org: 'olli-p7',
      project: 'olli-landing',
      telemetry: false,
      sourcemaps: {
        // ARMADILHA: ligar o Sentry faz o Vite emitir .map no dist. Sem token não
        // há upload, e o .map ia junto pro ar — expondo o código-fonte da landing
        // (a main não gerava nenhum .map; isso é efeito colateral do SDK).
        // Com token: gera, sobe pro Sentry e APAGA do dist. Sem token: nem gera.
        disable: !process.env.SENTRY_AUTH_TOKEN,
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
    }),
  ],
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
