import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { DEV_CSP, PROD_CSP } from './src/shared/csp'

/**
 * Inyecta la politica de seguridad de contenido en el HTML compilado.
 *
 * Motivo: la cabecera HTTP que aplica el proceso principal no siempre cubre las
 * cargas por `file://`. La etiqueta <meta> garantiza que, incluso cargando
 * archivos locales, el renderer queda sujeto a una CSP estricta.
 */
function cspPlugin(): Plugin {
  return {
    name: 'resalevault-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const csp = ctx.server ? DEV_CSP : PROD_CSP
        return html.replace(
          '<!--CSP-->',
          `<meta http-equiv="Content-Security-Policy" content="${csp}" />`
        )
      }
    }
  }
}

/**
 * La raiz del proyecto se resuelve con process.cwd(): los scripts de npm
 * siempre se ejecutan desde la raiz del proyecto, de modo que el archivo de
 * configuracion funciona tanto si se carga como CommonJS como si se carga
 * como ESM (Vite no garantiza __dirname en la configuracion).
 */
const root = process.cwd()
const r = (...p: string[]): string => resolve(root, ...p)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': r('src/shared'),
        '@main': r('src/main')
      }
    },
    build: {
      outDir: r('out/main'),
      rollupOptions: {
        input: { index: r('src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': r('src/shared')
      }
    },
    build: {
      outDir: r('out/preload'),
      rollupOptions: {
        input: { index: r('src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: r('src/renderer'),
    plugins: [cspPlugin(), react()],
    resolve: {
      alias: {
        '@renderer': r('src/renderer/src'),
        '@shared': r('src/shared')
      }
    },
    build: {
      outDir: r('out/renderer'),
      rollupOptions: {
        input: { index: r('src/renderer/index.html') }
      }
    }
  }
})
