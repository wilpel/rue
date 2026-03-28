import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3100,
    proxy: {
      '/api/ws': {
        target: 'http://127.0.0.1:18800',
        ws: true,
        rewrite: (path) => path.replace(/^\/api\/ws/, ''),
      },
    },
  },
})
