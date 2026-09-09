import { defineConfig } from 'vitest/config'
import path from 'path'

// Test runner mínimo — no corre en el build de Next ni en producción, solo
// vía `npm test`. Pensado para casos de regresión puntuales (bugs de
// timing ya diagnosticados), no para cobertura general del repo.
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
