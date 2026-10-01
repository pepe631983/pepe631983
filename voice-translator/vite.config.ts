import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.BASE_PATH ?? '/'
const normalizedBase = base.endsWith('/') ? base : `${base}/`

// https://vite.dev/config/
export default defineConfig({
  base: normalizedBase,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pawa-icon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        id: normalizedBase,
        name: 'PAWA — Traductor de voz en vivo',
        short_name: 'PAWA',
        description:
          'Escucha, transcribe y traduce tu voz al instante. Instálala como app.',
        theme_color: '#0f1419',
        background_color: '#0f1419',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: normalizedBase,
        scope: normalizedBase,
        lang: 'es',
        categories: ['utilities', 'productivity'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: `${normalizedBase}index.html`,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.mymemory\.translated\.net\/get/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pawa-translate',
              networkTimeoutSeconds: 8,
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    proxy: {
      '/api/translate': {
        target: 'https://api.mymemory.translated.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/translate/, '/get'),
      },
    },
  },
  preview: {
    proxy: {
      '/api/translate': {
        target: 'https://api.mymemory.translated.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/translate/, '/get'),
      },
    },
  },
})
