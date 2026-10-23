import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const headers = {
  Referer: 'https://hemiswap.app',
  Accept: 'application/json',
}

const proxy = {
  '/api/quote': {
    target: 'https://api.nordstern.finance',
    changeOrigin: true,
    secure: true,
    headers,
    rewrite: (path: string) => path.replace(/^\/api\/quote/, '/aggregator/43111'),
  },
  '/api/prices': {
    target: 'https://api.nordstern.finance',
    changeOrigin: true,
    secure: true,
    headers,
    rewrite: (path: string) => path.replace(/^\/api\/prices/, '/prices/43111'),
  },
}

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, proxy },
  preview: { host: '0.0.0.0', port: 4173, proxy },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
