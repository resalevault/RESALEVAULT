/**
 * RESALEVAULT - Configuracion de ESLint (formato plano, ESLint 9).
 *
 * Objetivo: detectar errores reales sin ahogar el proyecto en avisos de estilo.
 * Las reglas de formato no se incluyen a proposito (eso es trabajo de Prettier y
 * aqui no se usa). Se prioriza:
 *  - Variables y parametros sin usar.
 *  - Promesas y comparaciones peligrosas.
 *  - `any` implicito o explicito.
 *  - Reglas de hooks de React (la causa mas comun de bugs en la interfaz).
 *
 * Uso:  npm run lint
 */

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'release/**',
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.vite/**',
      'build/**'
    ]
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Proceso principal, preload y codigo compartido: entorno Node.
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'src/shared/**/*.ts',
      'scripts/**/*.ts',
      'electron.vite.config.ts',
      'vitest.config.ts'
    ],
    languageOptions: {
      globals: { ...globals.node }
    }
  },

  // Scripts en CommonJS/ESM puro (herramientas de build y mantenimiento).
  {
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module'
    },
    rules: {
      // Estos scripts usan `require` a proposito (Electron los carga como CJS).
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off'
    }
  },

  // Interfaz: entorno navegador + hooks de React.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser }
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },

  // Pruebas.
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },

  {
    rules: {
      // Se avisa, no se bloquea: hay parametros de interfaz sin usar a proposito.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      // `any` es una deuda, no un error de compilacion: se vigila.
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'warn',
      'no-var': 'error',
      // Un catch vacio oculta errores: aqui se permite solo si se comenta.
      'no-empty': ['error', { allowEmptyCatch: false }]
    }
  },

  // Herramientas de linea de comandos: su salida por consola ES el resultado
  // que lee el usuario, asi que aqui `console` esta permitido. Va despues del
  // bloque global de reglas para que no lo sobrescriba.
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.cjs'],
    rules: {
      'no-console': 'off'
    }
  }
)
