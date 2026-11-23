import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

function nojekyllPlugin(): Plugin {
  let rootDir = resolve(__dirname, 'portfolio')
  let outDir = '../dist-portfolio'
  return {
    name: 'portfolio-nojekyll',
    configResolved(config) {
      rootDir = config.root
      outDir = config.build.outDir
    },
    writeBundle() {
      const target = resolve(rootDir, outDir)
      mkdirSync(target, { recursive: true })
      writeFileSync(resolve(target, '.nojekyll'), '')
    },
  }
}

export default defineConfig({
  root: 'portfolio',
  base: './',
  build: {
    outDir: '../dist-portfolio',
    emptyOutDir: true,
    minify: 'esbuild',
  },
  plugins: [react(), nojekyllPlugin()],
})
