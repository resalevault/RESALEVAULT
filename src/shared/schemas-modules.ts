/**
 * RESALEVAULT - Esquemas de validacion de los modulos nuevos.
 *
 * Igual que `schemas.ts`: esta es la frontera de confianza. Todo lo que cruza
 * el puente IPC pasa por aqui, en el proceso principal.
 */

import { z } from 'zod'
import {
  AI_PROVIDERS,
  ALLOCATION_METHODS,
  BARCODE_SYMBOLOGIES,
  EXPENSE_CATEGORIES,
  EXPENSE_RECURRENCE,
  LABEL_TARGETS,
  ORDER_FEE_KINDS,
  ORDER_STATUSES
} from './types-modules'
import { zCents, zId, zIdList, zOptionalCents, zOptionalId, zOptionalIsoDate } from './schemas'

const zNote = z.string().max(4000)
const zShort = z.string().trim().max(120)

// ---------------------------------------------------------------------------
// Multimedia
// ---------------------------------------------------------------------------

export const zMediaImport = z.object({ productId: zId })
export const zMediaRemove = zId
export const zMediaReorder = z.object({
  productId: zId,
  orderedIds: z.array(zId).min(1).max(200)
})
export const zMediaSetCover = z.object({ productId: zId, mediaId: zId })

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export const zSupplierCreate = z.object({
  name: z.string().trim().min(1).max(120),
  contact: z.string().trim().max(300).optional(),
  notes: zNote.optional()
})

export const zSupplierUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  contact: z.string().trim().max(300).optional(),
  notes: zNote.optional()
})

export const zSupplierUpdatePayload = z.object({ id: zId, patch: zSupplierUpdate })

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------

const zPurchaseLine = z.object({
  productId: zOptionalId,
  description: z.string().trim().max(200).optional(),
  quantity: z.number().int().min(1).max(100000),
  unitCostCents: zCents
})

export const zPurchaseDraft = z.object({
  reference: zShort.optional(),
  supplierId: zOptionalId,
  supplierName: z.string().trim().max(120).optional(),
  purchasedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shippingCents: zCents.optional(),
  otherCents: zCents.optional(),
  discountCents: zCents.optional(),
  allocationMethod: z.enum(ALLOCATION_METHODS).optional(),
  notes: zNote.optional(),
  items: z.array(zPurchaseLine).min(1).max(2000)
})

export const zPurchaseUpdatePayload = z.object({
  id: zId,
  patch: z.object({
    reference: zShort.optional(),
    notes: zNote.optional(),
    purchasedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
})

export const zPurchaseMaterialize = z.object({
  purchaseId: zId,
  itemIds: zIdList,
  categoryId: zOptionalId
})

export const zPurchaseQuery = z.object({
  search: z.string().max(200).optional(),
  from: zOptionalIsoDate.optional(),
  to: zOptionalIsoDate.optional(),
  limit: z.number().int().min(1).max(1000).optional()
})

// ---------------------------------------------------------------------------
// Gastos generales
// ---------------------------------------------------------------------------

export const zExpenseCreate = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().max(200).optional(),
  amountCents: zCents.min(0),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recurring: z.enum(EXPENSE_RECURRENCE).optional(),
  notes: zNote.optional()
})

export const zExpenseUpdatePayload = z.object({
  id: zId,
  patch: z.object({
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    description: z.string().trim().max(200).optional(),
    amountCents: zCents.min(0).optional(),
    incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    recurring: z.enum(EXPENSE_RECURRENCE).optional(),
    notes: zNote.optional()
  })
})

export const zExpenseQuery = z.object({
  from: zOptionalIsoDate.optional(),
  to: zOptionalIsoDate.optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(2000).optional()
})

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export const zOrderCreate = z.object({
  platformId: zOptionalId,
  soldAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  buyer: zShort.optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  shippingChargedCents: zCents.optional(),
  shippingCostCents: zCents.optional(),
  discountCents: zCents.optional(),
  otherCents: zCents.optional(),
  paymentReference: zShort.optional(),
  trackingNumber: zShort.optional(),
  carrier: zShort.optional(),
  notes: zNote.optional(),
  items: z
    .array(
      z.object({
        productId: zId,
        unitPriceCents: zCents,
        quantity: z.number().int().min(1).max(1000).optional()
      })
    )
    .min(1)
    .max(500),
  fees: z
    .array(
      z.object({
        kind: z.enum(ORDER_FEE_KINDS),
        label: zShort.optional(),
        amountCents: zCents
      })
    )
    .max(50)
    .optional()
})

export const zOrderUpdatePayload = z.object({
  id: zId,
  patch: z.object({
    platformId: zOptionalId,
    soldAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    buyer: zShort.optional(),
    shippingChargedCents: zCents.optional(),
    shippingCostCents: zCents.optional(),
    discountCents: zCents.optional(),
    otherCents: zCents.optional(),
    paymentReference: zShort.optional(),
    trackingNumber: zShort.optional(),
    carrier: zShort.optional(),
    notes: zNote.optional()
  })
})

export const zOrderStatus = z.object({
  id: zId,
  status: z.enum(ORDER_STATUSES),
  /** Confirmacion explicita: sin ella no se marca como enviado. */
  confirm: z.boolean().optional(),
  trackingNumber: zShort.optional(),
  carrier: zShort.optional()
})

export const zOrderCancel = z.object({ id: zId, reason: z.string().trim().min(1).max(400) })

export const zOrderQuery = z.object({
  search: z.string().max(200).optional(),
  status: z.array(z.enum(ORDER_STATUSES)).max(ORDER_STATUSES.length).optional(),
  platformIds: z.array(zId).max(100).optional(),
  from: zOptionalIsoDate.optional(),
  to: zOptionalIsoDate.optional(),
  onlyWithReturns: z.boolean().optional(),
  sort: z.enum(['date_desc', 'date_asc', 'profit_desc', 'profit_asc', 'number_asc']).optional(),
  page: z.number().int().min(1).max(100000).optional(),
  pageSize: z.number().int().min(1).max(200).optional()
})

export const zOrderFeeCreate = z.object({
  orderId: zId,
  kind: z.enum(ORDER_FEE_KINDS),
  label: zShort.optional(),
  amountCents: zCents
})

export const zOrderFeeUpdate = z.object({
  feeId: zId,
  patch: z.object({
    kind: z.enum(ORDER_FEE_KINDS).optional(),
    label: zShort.optional(),
    amountCents: zCents.optional()
  })
})

export const zOrderReturnCreate = z.object({
  orderId: zId,
  returnedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(400).optional(),
  refundCents: zCents.min(0),
  feeRefundCents: zCents.optional(),
  shippingLostCents: zCents.optional(),
  restock: z.boolean().optional(),
  notes: zNote.optional()
})

// ---------------------------------------------------------------------------
// Preparacion
// ---------------------------------------------------------------------------

export const zPickingMark = z.object({
  orderId: zId,
  productId: zId,
  scannedSku: z.string().trim().max(64).optional()
})

export const zPickingNote = z.object({
  orderId: zId,
  productId: zId,
  note: z.string().max(2000)
})

export const zScanCode = z.object({ code: z.string().trim().min(1).max(120) })

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------

const zLabelOptions = z.object({
  target: z.enum(LABEL_TARGETS).optional(),
  symbology: z.enum(BARCODE_SYMBOLOGIES).optional(),
  widthMm: z.number().min(20).max(200).optional(),
  heightMm: z.number().min(10).max(200).optional(),
  columns: z.number().int().min(1).max(6).optional(),
  showSku: z.boolean().optional(),
  showName: z.boolean().optional(),
  showLocation: z.boolean().optional(),
  showPrice: z.boolean().optional(),
  showPlatform: z.boolean().optional(),
  encode: z.enum(['sku', 'location', 'custom']).optional(),
  customPrefix: z.string().max(40).optional(),
  title: z.string().max(80).optional()
})

export const zLabelProducts = z.object({
  productIds: z.array(zId).min(1).max(500),
  options: zLabelOptions
})

export const zLabelLocations = z.object({
  locationIds: z.array(zId).min(1).max(500),
  options: zLabelOptions
})

// ---------------------------------------------------------------------------
// Informes
// ---------------------------------------------------------------------------

export const zFinanceQuery = z.object({
  from: zOptionalIsoDate.optional(),
  to: zOptionalIsoDate.optional(),
  platformIds: z.array(zId).max(100).optional()
})

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const zCsvMapping = z.record(z.string().max(40), z.number().int().min(-1).max(500))

export const zCsvAnalyze = z.object({
  path: z.string().min(1).max(1000),
  mapping: zCsvMapping
})

export const zCsvImport = z.object({
  path: z.string().min(1).max(1000),
  mapping: zCsvMapping,
  duplicateStrategy: z.enum(['skip', 'update', 'create_anyway']),
  dryRun: z.boolean()
})

export const zCsvExport = z.object({
  path: z.string().min(1).max(1000),
  format: z.enum(['products', 'orders', 'purchases', 'expenses', 'picking']),
  delimiter: z.enum([',', ';']).optional(),
  includeArchived: z.boolean().optional()
})

export const zCsvExportDialog = z.object({
  format: z.enum(['products', 'orders', 'purchases', 'expenses', 'picking']),
  suggestedName: z.string().max(120).optional()
})

// ---------------------------------------------------------------------------
// IA (estructura lista; la interfaz se activa en la Fase 5)
// ---------------------------------------------------------------------------

export const zAiConnectionCreate = z.object({
  provider: z.enum(AI_PROVIDERS),
  label: z.string().trim().max(80).optional(),
  /** La clave nunca se registra ni se devuelve; solo se cifra y se guarda. */
  secret: z.string().min(8).max(400),
  baseUrl: z.string().trim().max(300).optional(),
  defaultModel: zShort.optional()
})

export const zAiConnectionUpdate = z.object({
  id: zId,
  patch: z.object({
    label: z.string().trim().max(80).optional(),
    defaultModel: zShort.optional(),
    baseUrl: z.string().trim().max(300).optional(),
    active: z.boolean().optional(),
    /** Si se envia, se sustituye la clave guardada. */
    secret: z.string().min(8).max(400).optional()
  })
})

export const zAiGenerate = z.object({
  task: z.enum([
    'title',
    'description',
    'translation',
    'classification',
    'attributes',
    'keywords',
    'review',
    'price_suggestion'
  ]),
  productId: zId.optional(),
  instruction: z.string().max(2000).optional(),
  language: z.string().max(40).optional(),
  model: zShort.optional(),
  connectionId: zId.optional()
})

export const zAiRoute = z.object({
  task: z.string().min(1).max(40),
  connectionId: zId.nullable(),
  model: zShort.optional()
})

export const zAiPrice = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: zShort,
  inputPerMillionMicros: z.number().int().min(0).max(1_000_000_000),
  outputPerMillionMicros: z.number().int().min(0).max(1_000_000_000)
})

export const zAiEstimateFlow = z.object({
  products: z.number().int().min(0).max(100_000),
  steps: z.number().int().min(0).max(20),
  averageInputTokens: z.number().int().min(0).max(10_000_000),
  averageOutputTokens: z.number().int().min(0).max(10_000_000),
  inputPerMillionMicros: z.number().int().min(0).max(1_000_000_000),
  outputPerMillionMicros: z.number().int().min(0).max(1_000_000_000)
})

// ---------------------------------------------------------------------------
// Licencias (la interfaz llega en la Fase 6; la logica ya esta lista)
// ---------------------------------------------------------------------------

export const zLicenseActivate = z.object({
  code: z.string().trim().min(10).max(8000),
  holder: z.string().trim().max(120).optional()
})

export const zIntelligenceThresholds = z.object({
  staleDays: z.number().int().min(1).max(3650).optional(),
  lowMarginPercent: z.number().min(0).max(100).optional(),
  maxCapitalSharePercent: z.number().min(1).max(100).optional(),
  pendingPrepDays: z.number().int().min(1).max(365).optional(),
  pendingOrderDays: z.number().int().min(1).max(365).optional(),
  returnsRatePercent: z.number().min(0).max(100).optional(),
  expenseGrowthPercent: z.number().min(0).max(1000).optional(),
  enabled: z.boolean().optional()
})

export const zInsightDismiss = z.object({
  key: z.string().min(1).max(200),
  ruleId: z.string().min(1).max(60),
  subject: z.string().max(120).optional(),
  /** Dias durante los que no debe reaparecer. 0 = para siempre. */
  days: z.number().int().min(0).max(3650).optional()
})

// ---------------------------------------------------------------------------
// Copias de seguridad
// ---------------------------------------------------------------------------

export const zBackupPath = z.string().min(1).max(1000)

export const zBackupConfig = z.object({
  enabled: z.boolean().optional(),
  intervalDays: z.number().int().min(1).max(365).optional(),
  maxCopies: z.number().int().min(1).max(200).optional(),
  destination: z.string().max(1000).optional(),
  includeMedia: z.boolean().optional()
})

export { zOptionalCents }
