/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Reads the global "/*" block of public/_headers (the Cloudflare Pages header file) so that
 * `vite preview` serves the same security headers as production. In emulator mode the local
 * emulator origins are allowed and HTTPS-only directives are dropped (localhost is plain HTTP).
 */
function productionHeaders(mode: string): Record<string, string> {
  const lines = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8').split(/\r?\n/);
  const headers: Record<string, string> = {};
  let inGlobal = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      inGlobal = line.trim() === '/*';
      continue;
    }
    const idx = line.indexOf(':');
    if (inGlobal && idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  if (mode === 'emulator' && headers['Content-Security-Policy']) {
    headers['Content-Security-Policy'] = headers['Content-Security-Policy']
      .replace('; upgrade-insecure-requests', '')
      .replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:8080 http://127.0.0.1:9099")
      .replace('frame-src', 'frame-src http://127.0.0.1:9099');
    delete headers['Strict-Transport-Security'];
  }
  return headers;
}

export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  preview: {
    headers: productionHeaders(mode),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'theme-init.js'],
      manifest: {
        name: 'Personal Hub',
        short_name: 'Hub',
        description: 'My private cloud workspace for notes, tasks, bookmarks, documents and calendar.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only same-origin static build assets are precached. Firestore/Auth traffic
        // is cross-origin and never cached by the service worker; private data lives
        // only in Firestore's own IndexedDB cache for this origin.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // The Firestore SDK with offline persistence is ~640 kB minified (~190 kB gzip) on its own.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Stable vendor chunks cache well across deploys; Markdown stays lazy with the Notes page.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](@firebase|firebase)[\\/]/.test(id)) return 'firebase';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler|cookie|set-cookie-parser)[\\/]/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/](zod|react-hook-form|@hookform)[\\/]/.test(id)) return 'forms';
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'query';
          return undefined;
        },
      },
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/components/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'emulator',
          environment: 'node',
          include: ['tests/emulator/**/*.test.ts'],
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
}));
