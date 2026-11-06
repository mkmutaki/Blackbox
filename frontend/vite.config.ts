import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Vercel sends this policy as a real response header (root vercel.json).
// This <meta> copy is a fallback for any static host that can't set
// headers (GitHub Pages can't) — keep the two in sync. Production build
// only, so local dev (Vite's own HMR client needs inline <style> injection
// and a same-origin websocket that this policy doesn't allow for) is
// unaffected.
//
// - accounts.google.com: Google Identity Services (@react-oauth/google)
//   loads its script from here and renders the button/consent UI in an
//   iframe from the same origin.
// - api.blackb0x.app: the deployed API (Render custom domain). The build
//   reaches it via VITE_API_BASE_URL — keep the two in agreement.
// - *.amazonaws.com: S3 signed URLs, fetched directly by VideoPlayer to
//   decrypt client-side.
// - blob: media-src: the decrypted video is played from a blob: URL.
// - fonts.googleapis.com/fonts.gstatic.com: App.css/index.css @import the
//   Space Mono and Inter families from Google Fonts; gstatic serves the
//   actual .woff2 files the googleapis stylesheet references.
// frame-ancestors is omitted here — browsers silently ignore it when
// delivered via <meta> (confirmed: it logs a console warning and does
// nothing), so it would be dead weight. It's still set in the root vercel.json's
// header-based version, where it actually takes effect.
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://accounts.google.com https://api.blackb0x.app https://*.amazonaws.com",
  "media-src 'self' blob:",
  "frame-src https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const injectProductionCSP = (mode: string): Plugin => ({
  name: 'inject-production-csp',
  transformIndexHtml(html) {
    if (mode !== 'production') return html;
    return html.replace(
      '</head>',
      `  <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />\n  </head>`
    );
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Production is served at <domain>/try-web on Vercel (the landing owns
  // the root — see the root build:site script). App.tsx derives the router
  // basename from this via import.meta.env.BASE_URL.
  base: mode === 'production' ? '/try-web/' : '/',
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Proxy API requests to backend server
      '/api': {
        target: 'http://localhost:5100',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  plugins: [
    react(),
    injectProductionCSP(mode),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
}));
