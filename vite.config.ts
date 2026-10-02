import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  test: {
    environment: 'node',
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' so a new version waits for a safe moment to reload instead
      // of interrupting a run (see src/utils/updateGate.ts).
      registerType: 'prompt',
      includeAssets: ['favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: '英単語ならべ',
        short_name: '英単語ならべ',
        description: '英語の語順パズルゲーム。並べ替えて正しい英文を作ろう！',
        start_url: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#2c1c9c',
        theme_color: '#4b32e0',
        lang: 'ja',
        categories: ['education', 'games'],
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Audio extensions are deliberately left out of the precache glob: any
        // future read-aloud voice clips (e.g. pre-rendered character-voice
        // audio) should be fetched and cached lazily per question via the
        // runtimeCaching rule below, not eagerly downloaded on first install.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\.(?:mp3|ogg|wav|m4a)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'voice-clips',
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 180,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
