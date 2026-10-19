/**
 * RESALEVAULT - Limites por plan. FUENTE UNICA DE VERDAD.
 *
 * Cualquier comprobacion de limites (en el proceso principal o en la interfaz)
 * debe leer de aqui. Si los limites estuvieran escritos en varios sitios, se
 * desincronizarian y la documentacion mentiria.
 *
 * Convencion: `-1` significa ILIMITADO.
 */

import type { LicensePlan, PlanLimits } from './types-modules'

export const UNLIMITED = -1

export function isUnlimited(value: number): boolean {
  return value === UNLIMITED
}

/** Comprueba si un uso cabe dentro de un limite que puede ser ilimitado. */
export function withinLimit(usage: number, limit: number): boolean {
  if (isUnlimited(limit)) return true
  return usage < limit
}

export const PLAN_LIMITS: Record<LicensePlan, PlanLimits> = {
  /**
   * Vault Free: para probar el producto y organizar un inventario basico.
   * Incluye el ciclo completo de compraventa con limites de volumen.
   */
  free: {
    maxProducts: 150,
    maxUploads: 200,
    bulkEdit: false,
    media: true,
    purchases: true,
    orders: true,
    analytics: false,
    csvImport: false,
    barcodes: true,
    intelligence: false,
    aiStudio: false,
    aiMonthlyCalls: 0,
    multiUser: false,
    sync: false
  },

  /**
   * Vault Pro: reventendedores individuales y vendedores de gran volumen.
   * Anade edicion masiva, analitica, inteligencia, importacion y AI Studio
   * (con la clave propia del usuario).
   */
  pro: {
    maxProducts: 20000,
    maxUploads: 50000,
    bulkEdit: true,
    media: true,
    purchases: true,
    orders: true,
    analytics: true,
    csvImport: true,
    barcodes: true,
    intelligence: true,
    aiStudio: true,
    aiMonthlyCalls: 2000,
    multiUser: false,
    sync: false
  },

  /**
   * Vault Business: negocios con almacen y equipo.
   * La colaboracion real exige backend; hasta entonces las capacidades
   * multiusuario aparecen como no disponibles en lugar de fingirse.
   */
  business: {
    maxProducts: UNLIMITED,
    maxUploads: UNLIMITED,
    bulkEdit: true,
    media: true,
    purchases: true,
    orders: true,
    analytics: true,
    csvImport: true,
    barcodes: true,
    intelligence: true,
    aiStudio: true,
    aiMonthlyCalls: UNLIMITED,
    multiUser: true,
    sync: true
  }
}

/** Cuotas de licencias fundadoras permanentes (maximo, por contrato). */
export const FOUNDER_QUOTA = {
  pro: 200,
  business: 200
} as const

export const PLAN_DISPLAY_ORDER: LicensePlan[] = ['free', 'pro', 'business']

/** Etiquetas de las capacidades, para las tablas comparativas de la interfaz. */
export const PLAN_FEATURE_KEYS: Array<{ key: keyof PlanLimits; labelKey: string }> = [
  { key: 'media', labelKey: 'plan.featureMedia' },
  { key: 'purchases', labelKey: 'plan.featurePurchases' },
  { key: 'orders', labelKey: 'plan.featureOrders' },
  { key: 'barcodes', labelKey: 'plan.featureBarcodes' },
  { key: 'csvImport', labelKey: 'plan.featureCsv' },
  { key: 'bulkEdit', labelKey: 'plan.featureBulkEdit' },
  { key: 'analytics', labelKey: 'plan.featureAnalytics' },
  { key: 'intelligence', labelKey: 'plan.featureIntelligence' },
  { key: 'aiStudio', labelKey: 'plan.featureAi' },
  { key: 'multiUser', labelKey: 'plan.featureMultiUser' },
  { key: 'sync', labelKey: 'plan.featureSync' }
]
