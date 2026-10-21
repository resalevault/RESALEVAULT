/**
 * RESALEVAULT - Registro ordenado de migraciones.
 *
 * Para anadir una migracion nueva: crear el archivo `00X-nombre.ts` y anadirlo
 * al final de esta lista. La version debe ser mayor que la anterior. Nunca se
 * modifica una migracion ya publicada: si hay que corregir algo, se anade una
 * migracion nueva.
 */

import { migration001 } from './001-initial'
import { migration002 } from './002-seed'
import { migration003 } from './003-commerce'
import { migration004 } from './004-tracking'
import { migration005 } from './005-license-online'
import type { Migration } from '../migrator'

export const MIGRATIONS: readonly Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005
]

export const LATEST_SCHEMA_VERSION: number =
  MIGRATIONS.length > 0 ? (MIGRATIONS[MIGRATIONS.length - 1] as Migration).version : 0
