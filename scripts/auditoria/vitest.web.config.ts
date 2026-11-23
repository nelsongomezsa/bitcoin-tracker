import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(__dirname, '../..'),
  test: { environment: 'node', include: ['scripts/auditoria/navegador.test.ts', 'scripts/auditoria/cuenta-vacia.test.ts', 'scripts/auditoria/demo-real.test.ts'], testTimeout: 180000, hookTimeout: 60000 },
})
