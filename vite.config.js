import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "three",
              test: /[\\/]node_modules[\\/]three[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
});
