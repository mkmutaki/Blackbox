import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Set base path for GitHub Pages deployment
  base: mode === 'production' ? '/Blackbox/' : '/',
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [
      'b4790d00-fefc-4827-8f59-6deba984cfd6.lovableproject.com',
    ],
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
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
