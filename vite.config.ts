import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// MediaPipe ships large .wasm/.task assets; keep them out of pre-bundling and
// serve the app over a secure context (localhost is treated as secure) so
// getUserMedia + WebGL/Web Audio all work.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },
  worker: {
    format: "es",
  },
});
