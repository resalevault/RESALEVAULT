/**
 * RESALEVAULT - Almacen de secretos del sistema operativo.
 *
 * Usa `safeStorage` de Electron, que en Windows se apoya en DPAPI (cifrado
 * ligado al usuario de Windows). La clave de IA nunca se guarda en claro ni en
 * la base de datos ni en un archivo de texto.
 *
 * Este archivo es el UNICO que importa Electron para esto, de modo que la logica
 * de AI Studio (`service.ts`) se puede probar sin Electron inyectando otro
 * almacen.
 */

import { safeStorage } from 'electron'
import type { SecretStore } from './service'

export function createOsSecretStore(): SecretStore {
  return {
    available(): boolean {
      try {
        return safeStorage.isEncryptionAvailable()
      } catch {
        return false
      }
    },

    encrypt(plain: string): string {
      // `encryptString` devuelve un Buffer con el blob cifrado.
      return safeStorage.encryptString(plain).toString('base64')
    },

    decrypt(cipher: string): string {
      return safeStorage.decryptString(Buffer.from(cipher, 'base64'))
    },

    hint(plain: string): string {
      const value = plain.trim()
      if (value.length <= 4) return '••••'
      return `••••${value.slice(-4)}`
    }
  }
}
