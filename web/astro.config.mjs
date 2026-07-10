// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Site de marketing da OLLI — separado do app (react-native-web). Aqui mora o
// design extraordinário: SSG p/ SEO + Lighthouse alto, ilhas React só onde há
// interação, Motion p/ 85% do movimento, 3D só no hero (lazy + fallback).
// https://astro.build/config
export default defineConfig({
  site: 'https://olliorcamentos.online',
  integrations: [react(), sitemap()],
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
