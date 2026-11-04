/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the repo at /<repo-name>/ (github.com/sakurasumatra/Lift)
export default defineConfig({
  base: '/Lift/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Lift',
        short_name: 'Lift',
        description: 'Auto-progressing workout tracker',
        theme_color: '#E8452C',
        background_color: '#f1f1f3',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/Lift/',
        scope: '/Lift/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,jpg,jpeg,woff2}'],
        navigateFallback: '/Lift/index.html',
        runtimeCaching: [
          { urlPattern: /\/exercises\//, handler: 'CacheFirst', options: { cacheName: 'exercise-images', expiration: { maxEntries: 200 } } },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
