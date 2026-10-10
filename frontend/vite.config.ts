import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// GitHub Pages serves this app with no control over response headers, so a
// server-side CSP (the kind the backend's helmet config sets) can't reach
// it (SECURITY_AUDIT.md SEC-15's scoping note). A <meta> CSP tag is the one
// security header a static host can still carry — bake it into the
// production build only, so local dev (Vite's own HMR client needs inline
// <style> injection and a same-origin websocket that this policy doesn't
// allow for) is unaffected.
//
// - accounts.google.com: Google Identity Services (@react-oauth/google)
//   loads its script from here and renders the button/consent UI in an
//   iframe from the same origin.
// - the onrender.com origin: the deployed API (frontend/src/services/api.ts
//   hardcodes this same origin for the github.io host today — update both
//   together when the custom domain lands).
// - *.amazonaws.com: S3 signed URLs, fetched directly by VideoPlayer to
//   decrypt client-side.
// - blob: media-src: the decrypted video is played from a blob: URL.
// - fonts.googleapis.com/fonts.gstatic.com: App.css/index.css @import the
//   Space Mono and Inter families from Google Fonts; gstatic serves the
//   actual .woff2 files the googleapis stylesheet references.
// frame-ancestors is omitted here — browsers silently ignore it when
// delivered via <meta> (confirmed: it logs a console warning and does
// nothing), so it would be dead weight. It's still set in vercel.json's
// header-based version, where it actually takes effect.
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://accounts.google.com https://blackbox-2lt5.onrender.com https://*.amazonaws.com",
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
  // Set base path for GitHub Pages deployment
  base: mode === 'production' ? '/Blackbox/' : '/',
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
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
