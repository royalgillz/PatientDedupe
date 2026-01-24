import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// During development the API runs separately on :8787; proxy /api to it so the app
// can use same-origin requests, exactly as it will in production where the Node
// server serves both the API and the built frontend.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: {
    // Defaults to the local API on :8787; the e2e harness overrides the target so it can
    // run its own backend on a free port.
    proxy: { "/api": process.env.VITE_API_PROXY ?? "http://localhost:8787" },
  },
});
