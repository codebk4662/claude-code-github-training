import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "renderer",
  // 패키징 후 file:// 로 열리므로 상대 경로
  base: "./",
  plugins: [react()],
  envDir: "..",
  server: { port: 5173, strictPort: true },
  build: { outDir: "../dist", emptyOutDir: true },
});
