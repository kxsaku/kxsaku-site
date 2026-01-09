import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: path.resolve(__dirname, "../../home/reactbits/dist"),
    rollupOptions: {
      input: path.resolve(__dirname, "main.jsx"),
      output: {
        entryFileNames: "rotating-headline.js",
        assetFileNames: "rotating-headline.[ext]"
      }
    }
  }
});
