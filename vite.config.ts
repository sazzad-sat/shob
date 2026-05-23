import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  build: {
    outDir: 'dist-renderer',
  },
  server: {
    port: 5180,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@opencode-ai/sdk': fileURLToPath(new URL('./packages/sdk/js/src', import.meta.url)),
      '@opencode-ai/plugin': fileURLToPath(new URL('./packages/plugin/src', import.meta.url)),
      '@opencode-ai/server': fileURLToPath(new URL('./packages/server/src', import.meta.url)),
      '@opencode-ai/ui/hooks': fileURLToPath(new URL('./packages/ui/src/hooks/index.ts', import.meta.url)),
      '@opencode-ai/ui/i18n': fileURLToPath(new URL('./packages/ui/src/i18n', import.meta.url)),
      '@opencode-ai/ui/context': fileURLToPath(new URL('./packages/ui/src/context', import.meta.url)),
      '@opencode-ai/ui': fileURLToPath(new URL('./packages/ui/src/components', import.meta.url)),
      '@opencode-ai/util': fileURLToPath(new URL('./packages/util/src', import.meta.url)),
      '@shikijs/core': fileURLToPath(new URL('./node_modules/shiki/node_modules/@shikijs/core', import.meta.url)),
      '@shikijs/types': fileURLToPath(new URL('./node_modules/shiki/node_modules/@shikijs/types', import.meta.url)),
    },
    dedupe: ['solid-js'],
  },
})
