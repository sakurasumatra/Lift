/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { BASE, pwaOptions } from './src/pwa/config.ts';

export default defineConfig({
  base: BASE,
  plugins: [react(), VitePWA(pwaOptions)],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
