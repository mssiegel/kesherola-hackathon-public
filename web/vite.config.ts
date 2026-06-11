import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies API + WebSocket to the Express backend on :8000, and
// exposes the repo's shared/ types via the "@shared" alias.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@shared": new URL("../shared", import.meta.url).pathname },
  },
  server: {
    port: 5173,
    fs: { allow: [".", ".."] },
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
});
