import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-512.png',
      ],
      manifest: {
        name: 'OLLI Orçamentos',
        short_name: 'OLLI',
        description: 'Painel web para gerenciar orçamentos, clientes e catálogo da OLLI.',
        lang: 'pt-BR',
        theme_color: '#0A2540',
        background_color: '#0A2540',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache the built app shell for offline use. Navigation requests fall
        // back to index.html so the SPA works offline once installed.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        // Never let the SW serve index.html for Supabase API navigations.
        navigateFallbackDenylist: [/^\/api/, /supabase\.co/],
        // Precaching (globPatterns above) already covers the built shell. Add a
        // runtime cache for same-origin static assets requested after load.
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css|html|svg|png|ico|woff2)$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'app-shell' },
          },
        ],
      },
      devOptions: {
        // Keep the SW off in dev to avoid stale-cache confusion while coding.
        enabled: false,
      },
    }),
  ],
});
