import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    build: { minify: 'esbuild' },
    plugins: [
      react(),
      {
        name: 'dev-refresh-policy',
        apply: 'serve',
        transformIndexHtml: (html) => html
          .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
          .replace("connect-src 'none'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"),
      },
    ],
  },
})
