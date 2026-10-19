/**
 * RESALEVAULT - Esquemas de validacion de entrada (zod).
 *
 * Toda entrada que llega por IPC se valida AQUI, en el proceso principal, antes
 * de tocar la base de datos. La validacion del formulario en la interfaz es
 * comodidad para el usuario; esta es la que garantiza la integridad.
 *
 * Este archivo solo se importa desde `main`. El renderer importa unicamente
 * tipos.
 */

import { z } from 'zod'
import {
  ATTRIBUTE_TYPES,
  LISTING_STATUSES,
  LOCATION_KINDS,
  PRODUCT_CONDITIONS,
  PRODUCT_SORTS,
  PRODUCT_STATUSES
} from './types'

export const zId = z.string().min(1).max(64)
export const zIdList = z.array(zId).min(1).max(10_000)
export const zOptionalId = z.union([zId, z.null()]).optional()

export const zShortText = z.string().trim().max(200)
export const zLongText = z.string().max(20_000)
export const zCurrencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'currency')

/** Importe en centimos: entero, con un limite prudente (±1e12 = 10.000M). */
export const zCents = z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000)
export const zOptionalCents = z.union([zCents, z.null()])

export const zIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'isoDate')
  .refine(isRealCalendarDate, 'isoDateReal')

/**
 * Comprueba que la fecha existe de verdad en el calendario. `new Date()` por si
 * solo no sirve: JS convierte "2026-02-30" en el 2 de marzo sin avisar.
 */
export function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

export const zOptionalIsoDate = z.union([zIsoDate, z.null(), z.literal('')]).transform((v) => (v ? v : null))

export const zLocale = z.enum(['es', 'en'])
export const zTheme = z.enum(['dark', 'light'])

export const zSku = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .transform((value) => value.toUpperCase())

export const zAttributes = z.record(
  z.string().min(1).max(64),
  z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()])
)

export const zTagName = z.string().trim().min(1).max(40)

export const zProductCreate = z.object({
  name: z.string().trim().min(1).max(200),
  sku: zSku.optional(),
  description: zLongText.optional(),
  categoryId: zOptionalId,
  brand: zShortText.optional(),
  model: zShortText.optional(),
  size: zShortText.optional(),
  color: zShortText.optional(),
  condition: z.enum(PRODUCT_CONDITIONS).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  attributes: zAttributes.optional(),
  purchaseDate: zOptionalIsoDate.optional(),
  purchasePriceCents: zCents.optional(),
  acquisitionFeesCents: zCents.optional(),
  expectedSalePriceCents: zCents.optional(),
  finalSalePriceCents: zOptionalCents.optional(),
  locationId: zOptionalId,
  privateNotes: zLongText.optional(),
  tags: z.array(zTagName).max(50).optional()
})

export const zProductUpdate = zProductCreate.partial()

export const zProductQuery = z.object({
  search: z.string().max(200).optional(),
  status: z.array(z.enum(PRODUCT_STATUSES)).max(PRODUCT_STATUSES.length).optional(),
  conditions: z.array(z.enum(PRODUCT_CONDITIONS)).max(PRODUCT_CONDITIONS.length).optional(),
  categoryIds: z.array(zId).max(500).optional(),
  locationIds: z.array(zId).max(500).optional(),
  platformIds: z.array(zId).max(200).optional(),
  tagIds: z.array(zId).max(200).optional(),
  minAgeDays: z.number().int().min(0).max(36500).optional(),
  maxAgeDays: z.number().int().min(0).max(36500).optional(),
  includeArchived: z.boolean().optional(),
  onlyArchived: z.boolean().optional(),
  sort: z.enum(PRODUCT_SORTS).optional(),
  page: z.number().int().min(1).max(100_000).optional(),
  pageSize: z.number().int().min(1).max(500).optional()
})

export const zPriceAdjustment = z.object({
  mode: z.enum(['set', 'percent', 'delta']),
  value: z.number().finite().min(-1_000_000).max(1_000_000)
})

export const zBulkUpdate = z
  .object({
    ids: zIdList,
    status: z.enum(PRODUCT_STATUSES).optional(),
    categoryId: zOptionalId,
    locationId: zOptionalId,
    condition: z.enum(PRODUCT_CONDITIONS).optional(),
    priceAdjustment: zPriceAdjustment.optional(),
    addTags: z.array(zTagName).max(50).optional(),
    removeTags: z.array(zTagName).max(50).optional(),
    appendPrivateNote: z.string().max(2000).optional()
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.categoryId !== undefined ||
      value.locationId !== undefined ||
      value.condition !== undefined ||
      value.priceAdjustment !== undefined ||
      (value.addTags?.length ?? 0) > 0 ||
      (value.removeTags?.length ?? 0) > 0 ||
      (value.appendPrivateNote?.length ?? 0) > 0,
    { message: 'no_changes' }
  )

export const zCategoryCreate = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: zOptionalId
})

export const zCategoryUpdate = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  parentId: zOptionalId,
  sortOrder: z.number().int().min(-10_000).max(10_000).optional()
})

export const zLocationCode = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9._-]+$/, 'locationCode')
  .transform((value) => value.toUpperCase())

export const zLocationCreate = z.object({
  kind: z.enum(LOCATION_KINDS),
  code: zLocationCode,
  name: z.string().trim().min(1).max(80),
  parentId: zOptionalId
})

export const zLocationUpdate = z.object({
  code: zLocationCode.optional(),
  name: z.string().trim().min(1).max(80).optional(),
  sortOrder: z.number().int().min(-10_000).max(10_000).optional()
})

export const zTagCreate = z.object({
  name: zTagName,
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'color')
    .optional()
})

export const zPlatformCreate = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[A-Za-z0-9._-]+$/, 'platformCode')
    .transform((value) => value.toLowerCase()),
  name: z.string().trim().min(1).max(60)
})

export const zPlatformUpdate = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(-10_000).max(10_000).optional()
})

export const zAttributeCreate = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(48)
    .regex(/^[a-z0-9_]+$/, 'attributeKey'),
  name: z.string().trim().min(1).max(80),
  type: z.enum(ATTRIBUTE_TYPES),
  options: z.array(z.string().trim().min(1).max(80)).max(500).optional()
})

export const zAttributeUpdate = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  type: z.enum(ATTRIBUTE_TYPES).optional(),
  options: z.array(z.string().trim().min(1).max(80)).max(500).optional(),
  sortOrder: z.number().int().min(-10_000).max(10_000).optional()
})

export const zListingCreate = z.object({
  productId: zId,
  platformId: zId,
  externalId: z.string().trim().max(120).optional(),
  url: z.string().trim().max(2000).optional(),
  listedPriceCents: zOptionalCents.optional(),
  status: z.enum(LISTING_STATUSES).optional(),
  listedAt: zOptionalIsoDate.optional(),
  notes: z.string().max(4000).optional()
})

export const zListingUpdate = z.object({
  externalId: z.string().trim().max(120).optional(),
  url: z.string().trim().max(2000).optional(),
  listedPriceCents: zOptionalCents.optional(),
  status: z.enum(LISTING_STATUSES).optional(),
  listedAt: zOptionalIsoDate.optional(),
  notes: z.string().max(4000).optional()
})

export const zSettingsPatch = z.object({
  locale: zLocale.optional(),
  theme: zTheme.optional(),
  currency: zCurrencyCode.optional(),
  skuPattern: z.string().trim().min(1).max(120).optional(),
  skuPrefix: z
    .string()
    .trim()
    .max(12)
    .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .optional(),
  staleThresholds: z.array(z.number().int().min(1).max(3650)).min(1).max(8).optional(),
  targetMarginPercent: z.number().min(0).max(99).optional(),
  minProfitCents: zCents.min(0).optional(),
  defaultFeePercent: z.number().min(0).max(100).optional(),
  defaultShippingCents: zCents.min(0).optional()
})

/** Esquemas sin argumentos: se usan para validar payloads vacios. */
export const zEmpty = z.undefined().or(z.null()).or(z.object({}).strict())

// ---------------------------------------------------------------------------
// Payloads compuestos (identificador + datos)
//
// Se declaran aqui, y no en el renderer, porque son la frontera de confianza:
// todo lo que cruza el puente IPC pasa por estos esquemas.
// ---------------------------------------------------------------------------

export const zProductUpdatePayload = z.object({ id: zId, patch: zProductUpdate })

export const zCategoryUpdatePayload = z.object({ id: zId, patch: zCategoryUpdate })

export const zLocationUpdatePayload = z.object({ id: zId, patch: zLocationUpdate })

export const zLocationMovePayload = z.object({ id: zId, newParentId: zOptionalId })

export const zPlatformUpdatePayload = z.object({ id: zId, patch: zPlatformUpdate })

export const zAttributeUpdatePayload = z.object({ id: zId, patch: zAttributeUpdate })

export const zListingUpdatePayload = z.object({ id: zId, patch: zListingUpdate })

export const zSuggestSkuPayload = z.object({ categoryId: zOptionalId })

export const zCheckSkuPayload = z.object({ sku: zSku, exceptId: zOptionalId })
