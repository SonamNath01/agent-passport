import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The web app never talks to the issuer, passport, or agent origins
// directly — that would need CORS on all three trusted services just to
// satisfy a browser. Instead the dev server proxies same-origin paths
// through to each service, /api/agent/events (SSE) included, so apps/web
// stays what CLAUDE.md's services table says it should be: holds nothing,
// trusts nothing, just renders what the trusted services already return.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api/issuer": { target: "http://localhost:4001", changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/issuer/, "") },
      "/api/passport": { target: "http://localhost:4000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/passport/, "") },
      "/api/agent": { target: "http://localhost:4002", changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/agent/, "") },
    },
  },
});
