import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  base: './',
  plugins: [svelte()],
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
})
