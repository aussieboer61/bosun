import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      include: '**/*.{jsx,js}',
    })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:4080',
      '/socket.io': {
        target: 'http://localhost:4080',
        ws: true
      }
    }
  }
})
