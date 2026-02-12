import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/app-check', 'firebase/auth', 'firebase/functions'],
          motion: ['framer-motion'],
          icons: ['lucide-react'],
          router: ['react-router-dom'],
        },
      },
    },
  },
})
