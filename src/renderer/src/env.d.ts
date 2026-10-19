/// <reference types="vite/client" />

import type { ResaleVaultApi } from '@shared/api'
import type { LocaleCode } from '@shared/types'

declare global {
  interface Window {
    /**
     * Unico puente disponible hacia el sistema. Lo expone el preload mediante
     * contextBridge; el renderer no tiene acceso a Node ni a Electron.
     */
    resalevault: ResaleVaultApi
  }
}

export type { LocaleCode }
