import type { VitePWAOptions } from 'vite-plugin-pwa';

/** GitHub Pages serves the repo at /<repo-name>/ (github.com/sakurasumatra/Lift). */
export const BASE = '/Lift/';

/** How often an open (or installed, long-lived) app checks for a new deploy. */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Service worker and web app manifest. `registerType: 'prompt'` keeps a new deploy waiting until the user taps
 * "Reload" (see UpdatePrompt), so the app never swaps code under a workout in progress and never stays silently stale.
 */
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
  manifest: {
    id: BASE,
    name: 'Lift',
    short_name: 'Lift',
    description: 'Auto-progressing workout tracker',
    theme_color: '#E8452C',
    background_color: '#f1f1f3',
    display: 'standalone',
    orientation: 'portrait',
    start_url: BASE,
    scope: BASE,
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,webp,jpg,jpeg,woff2}'],
    navigateFallback: `${BASE}index.html`,
    runtimeCaching: [
      { urlPattern: /\/exercises\//, handler: 'CacheFirst', options: { cacheName: 'exercise-images', expiration: { maxEntries: 200 } } },
    ],
  },
};
