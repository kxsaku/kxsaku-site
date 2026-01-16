import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/home/react-headline/',
  build: {
    outDir: '../home/react-headline',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/rotating-headline.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
})
