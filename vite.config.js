import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react') || id.includes('/node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('/node_modules/firebase/auth') || id.includes('/node_modules/@firebase/auth')) {
            return 'firebase-auth';
          }
          if (id.includes('/node_modules/firebase/firestore') || id.includes('/node_modules/@firebase/firestore')) {
            return 'firebase-firestore';
          }
          if (id.includes('/node_modules/firebase') || id.includes('/node_modules/@firebase')) {
            return 'firebase-core';
          }
          if (id.includes('/node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('/src/data/basic_kanji.json')) {
            return 'data-basic-kanji';
          }
          if (id.includes('/src/data/bim_kanji.json')) {
            return 'data-bim-kanji';
          }
          if (id.includes('/src/data/basic_page_meta.json')) {
            return 'data-basic-pages';
          }
          if (id.includes('/src/data/vocab.json')) {
            return 'data-vocab';
          }
        },
      },
    },
  },
})
