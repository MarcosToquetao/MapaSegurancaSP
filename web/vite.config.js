import { defineConfig } from "vite";

export default defineConfig({
  // base relativa: funciona em GitHub Pages de projeto (usuario.github.io/repo/)
  // e em qualquer outro host estático sem ajuste.
  base: "./",
  build: {
    rollupOptions: {
      output: {
        // vendors pesados em chunks próprios: navegador baixa em paralelo e
        // o cache sobrevive a deploys que só mudam o código do app
        manualChunks: {
          echarts: ["echarts"],
          mapa: ["maplibre-gl", "pmtiles"],
        },
      },
    },
  },
});
