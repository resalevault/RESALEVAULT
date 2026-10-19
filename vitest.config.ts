import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = process.cwd()
const r = (...p: string[]): string => resolve(root, ...p)

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
      // Se mide lo que puede causar perdida de datos o errores financieros.
      // Las pantallas de React se excluyen: su valor esta en las pruebas de
      // humo de interfaz, no en el porcentaje de lineas.
      include: [
        'src/shared/**/*.ts',
        'src/main/db/**/*.ts',
        'src/main/services/**/*.ts',
        'src/main/errors.ts'
      ],
      exclude: [
        'src/main/services/paths.ts',
        'src/main/services/security.ts',
        'src/main/services/browser/**',
        'src/main/services/ai/os-secret-store.ts',
        'src/**/*.d.ts'
      ],
      thresholds: {
        // Umbral bajo y honesto: se sube cuando de verdad se pruebe mas.
        lines: 50,
        functions: 50,
        statements: 50,
        branches: 40
      }
    }
  },
  resolve: {
    alias: {
      '@shared': r('src/shared'),
      '@main': r('src/main')
    }
  }
})
