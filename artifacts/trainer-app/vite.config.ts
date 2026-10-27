import { frontendSecurityHeaders } from '../../scripts/security-headers.mjs';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

// Outside Replit there is no path router in front of the artifacts, so the
// trainer app's dev server plays that role: /api → API server and
// /client-landing → client portal dev server. Keeps everything on one origin,
// which invite links (window.location.origin + /client-landing/...) rely on.
const localApiServerUrl = process.env.LOCAL_API_SERVER_URL;
const localClientPortalDevUrl = process.env.LOCAL_CLIENT_PORTAL_DEV_URL;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    headers: frontendSecurityHeaders(),
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      ...(localApiServerUrl
        ? { '/api': { target: localApiServerUrl, changeOrigin: true } }
        : {}),
      ...(localClientPortalDevUrl
        ? {
            '/client-landing': {
              target: localClientPortalDevUrl,
              changeOrigin: true,
              ws: true,
            },
          }
        : {}),
    },
  },
  preview: {
    headers: frontendSecurityHeaders(),
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
