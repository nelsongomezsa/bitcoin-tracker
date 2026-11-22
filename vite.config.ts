/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // 'prompt': el service worker nuevo espera hasta que la usuaria pulsa «Actualizar» (lo gestiona AvisoActualizacion).
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: { maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 },
      manifest: {
        name: 'Bitcoin Tracker',
        short_name: 'BTC Tracker',
        description: 'Seguimiento manual de compras y ventas de bitcoin',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#05070A',
        theme_color: '#05070A',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'jobs/**/*.test.mjs'],
  },
})
