/**
 * RESALEVAULT - Empaquetado de las pruebas de humo.
 *
 * Estas pruebas importan los modulos TypeScript del proceso principal
 * (repositorios, migraciones, IPC). Electron no ejecuta TypeScript, asi que se
 * empaquetan con esbuild a archivos CommonJS antes de lanzarlos.
 *
 * Se generan dos artefactos:
 *   out/smoke.cjs     prueba de humo de la capa de datos
 *   out/ui-smoke.cjs  prueba de humo de la interfaz (HTML compilado + IPC)
 */

import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: false,
  logLevel: 'warning',
  // Electron solo existe dentro del runtime de Electron.
  external: ['electron'],
  alias: {
    '@shared': './src/shared',
    '@main': './src/main'
  }
}

await build({ ...shared, entryPoints: ['scripts/electron-smoke.ts'], outfile: 'out/smoke.cjs' })
await build({ ...shared, entryPoints: ['scripts/ui-smoke.ts'], outfile: 'out/ui-smoke.cjs' })
await build({ ...shared, entryPoints: ['scripts/benchmark.ts'], outfile: 'out/benchmark.cjs' })

process.stdout.write(
  'Empaquetadas las pruebas de humo y el banco de pruebas en out/smoke.cjs, out/ui-smoke.cjs y out/benchmark.cjs\n'
)
