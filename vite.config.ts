import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  // Nitro gera o servidor Node (.output/server/index.mjs); troque o preset para Vercel, Netlify etc.
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
})
