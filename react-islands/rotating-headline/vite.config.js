import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react({
      // ReactBits ships JSX inside a .js file — include .js so the plugin transforms it.
      include: [/\.jsx$/, /\.js$/],
    }),
  ],
  esbuild: {
    jsx: "automatic",
    loader: "jsx",
    include: [/\.jsx$/, /\.js$/],
  },
  build: {
    emptyOutDir: true,
    outDir: path.resolve(__dirname, "../../home/reactbits/dist"),
    rollupOptions: {
      input: path.resolve(__dirname, "main.jsx"),
      output: {
        entryFileNames: "rotating-headline.js",
        assetFileNames: "rotating-headline.[ext]",
      },
    },
  },
});
