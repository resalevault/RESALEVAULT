import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = process.cwd()
const r = (...p: string[]): string => resolve(root, ...p)

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default']
  },
  resolve: {
    alias: {
      '@shared': r('src/shared'),
      '@main': r('src/main')
    }
  }
})
