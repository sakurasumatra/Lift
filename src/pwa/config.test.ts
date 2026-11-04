import { describe, expect, it } from 'vitest';
import type { ManifestOptions } from 'vite-plugin-pwa';
import { BASE, pwaOptions } from './config';

const publicFiles = new Set(Object.keys(import.meta.glob('../../public/*.{png,svg}')).map((p) => p.split('/').pop()!));
const manifest = pwaOptions.manifest as Partial<ManifestOptions>;

describe('service worker updates', () => {
  it('waits for the user ("new version available, tap to reload") instead of auto-reloading or staying stale', () => {
    // 'autoUpdate' makes the new worker skipWaiting + clientsClaim and reloads the page on its own, mid-workout included.
    expect(pwaOptions.registerType).toBe('prompt');
    expect(pwaOptions.workbox?.skipWaiting).not.toBe(true);
    expect(pwaOptions.workbox?.clientsClaim).not.toBe(true);
  });
});

describe('offline', () => {
  it('precaches the app shell, images and icons, and serves index.html for any in-scope navigation', () => {
    for (const ext of ['js', 'css', 'html', 'png', 'jpg', 'svg']) expect(pwaOptions.workbox?.globPatterns?.join()).toContain(ext);
    expect(pwaOptions.workbox?.navigateFallback).toBe(`${BASE}index.html`);
  });
});

describe('home-screen install', () => {
  it('manifest is standalone and scoped to the GitHub Pages base path', () => {
    expect(manifest).toMatchObject({ display: 'standalone', start_url: BASE, scope: BASE, name: 'Lift', short_name: 'Lift' });
  });
  it('Android: 192 and 512 icons plus a maskable one, all present in public/', () => {
    const icons = manifest.icons ?? [];
    expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const i of icons) expect(publicFiles.has(i.src), i.src).toBe(true);
  });
  it('iPhone: the apple-touch-icon is bundled and precached', () => {
    expect(pwaOptions.includeAssets).toContain('apple-touch-icon.png');
    expect(publicFiles.has('apple-touch-icon.png')).toBe(true);
  });
});
