/**
 * RESALEVAULT - Esquemas de validacion del Shipping Tracker.
 */

import { z } from 'zod'
import {
  CARRIER_REGIONS,
  CARRIER_STRATEGIES,
  TRACKCODE_STATUSES
} from './types-tracking'
import { zId, zOptionalId, zOptionalIsoDate } from './schemas'

const zShort = z.string().trim().max(120)
const zNote = z.string().max(4000)

/** Codigo tal y como lo escribe el usuario; se normaliza en el repositorio. */
export const zTrackcodeCode = z.string().trim().min(1).max(80)

export const zTrackcodeCreate = z.object({
  code: zTrackcodeCode,
  carrierId: zId,
  name: zShort.optional(),
  orderRef: zShort.optional(),
  orderId: zOptionalId,
  purchaseDate: zOptionalIsoDate.optional(),
  expectedDate: zOptionalIsoDate.optional(),
  status: z.enum(TRACKCODE_STATUSES).optional(),
  notes: zNote.optional()
})

export const zTrackcodeUpdate = z.object({
  id: zId,
  patch: z.object({
    code: zTrackcodeCode.optional(),
    carrierId: zId.optional(),
    name: zShort.optional(),
    orderRef: zShort.optional(),
    orderId: z.union([zId, z.null()]).optional(),
    purchaseDate: zOptionalIsoDate.optional(),
    expectedDate: zOptionalIsoDate.optional(),
    status: z.enum(TRACKCODE_STATUSES).optional(),
    notes: zNote.optional()
  })
})

export const zTrackcodeQuery = z.object({
  search: z.string().max(200).optional(),
  carrierIds: z.array(zId).max(200).optional(),
  statuses: z.array(z.enum(TRACKCODE_STATUSES)).max(TRACKCODE_STATUSES.length).optional(),
  from: zOptionalIsoDate.optional(),
  to: zOptionalIsoDate.optional(),
  includeArchived: z.boolean().optional(),
  onlyArchived: z.boolean().optional(),
  sort: z
    .enum(['created_desc', 'created_asc', 'expected_asc', 'code_asc', 'carrier_asc'])
    .optional(),
  page: z.number().int().min(1).max(100000).optional(),
  pageSize: z.number().int().min(1).max(200).optional()
})

export const zCarrierQuery = z.object({
  search: z.string().max(120).optional(),
  region: z.union([z.enum(CARRIER_REGIONS), z.literal('ALL')]).optional(),
  includeDisabled: z.boolean().optional()
})

export const zCarrierCreate = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9-]+$/, 'carrierId')
    .optional(),
  name: z.string().trim().min(1).max(80),
  region: z.enum(CARRIER_REGIONS),
  country: z.string().trim().max(60).optional(),
  trackUrl: z.string().url().max(2000),
  urlTemplate: z.string().max(2000).optional(),
  strategy: z.enum(CARRIER_STRATEGIES).optional(),
  notes: z.string().max(500).optional()
})

export const zCarrierUpdate = z.object({
  id: zId,
  patch: z.object({
    name: z.string().trim().min(1).max(80).optional(),
    region: z.enum(CARRIER_REGIONS).optional(),
    country: z.string().trim().max(60).optional(),
    trackUrl: z.string().url().max(2000).optional(),
    urlTemplate: z.string().max(2000).optional(),
    strategy: z.enum(CARRIER_STRATEGIES).optional(),
    notes: z.string().max(500).optional(),
    enabled: z.boolean().optional()
  })
})

export const zTrackNow = z.object({ id: zId })

export const zResolveUrl = z.object({ carrierId: zId, code: zTrackcodeCode })

export const zBrowserOpen = z.object({
  url: z.string().url().max(2000),
  carrierId: z.string().max(64),
  carrierName: z.string().max(80)
})

export const zDuplicateCheck = z.object({
  code: zTrackcodeCode,
  carrierId: zId,
  exceptId: z.union([zId, z.null()]).optional()
})

export const zTrackcodeStatusPayload = z.object({
  id: zId,
  status: z.enum(TRACKCODE_STATUSES)
})
