import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the React app runs on :5173 and forwards API calls to FastAPI on :8000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          mediapipe: ['@mediapipe/tasks-vision'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
