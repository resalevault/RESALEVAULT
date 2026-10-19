/**
 * RESALEVAULT - Compras, proveedores y gastos generales.
 *
 * REGLA CONTRA EL DOBLE CONTEO (importante para que los numeros cuadren):
 *  - El coste de una compra NO es un gasto general. Es el coste de adquisicion
 *    de unos articulos. Se reparte entre ellos y se escribe en el articulo.
 *  - `expenses` es SOLO para gastos generales del negocio (embalaje, cuotas,
 *    almacenamiento, transporte propio...). Nunca se solapa con las compras.
 *  - El envio de una compra se reparte entre los articulos como gasto de
 *    adquisicion; por eso NO se registra tambien como gasto general.
 */

import type {
  AllocationMethod,
  Expense,
  ExpenseCategory,
  ExpenseRecurrence,
  ExpenseSummary,
  Purchase,
  PurchaseCreateInput,
  PurchaseItem,
  Supplier
} from '@shared/types-modules'
import { allocateExtraCost } from '@shared/finance-extended'
import type { Database, SqlParam } from '../database'
import { appError } from '../../errors'
import { logActivity } from './activity'
import type { ProductRepository } from './products'
import { ACTOR_USER_ID, inClause, newId, nowIso, toNumber, toNullableString, toStringValue } from '../support'

// ===========================================================================
// Proveedores
// ===========================================================================

interface SupplierRow {
  id: string
  name: string
  contact: string
  notes: string
  created_at: string
  updated_at: string
  purchase_count: number
  total_spent: number
}

const SUPPLIER_SELECT = `
  SELECT s.id, s.name, s.contact, s.notes, s.created_at, s.updated_at,
         (SELECT COUNT(*) FROM purchases p WHERE p.supplier_id = s.id) AS purchase_count,
         (SELECT COALESCE(SUM(
            (SELECT COALESCE(SUM(pi.unit_cost_cents * pi.quantity), 0)
             FROM purchase_items pi WHERE pi.purchase_id = p.id)
            + p.shipping_cents + p.other_cents - p.discount_cents), 0)
          FROM purchases p WHERE p.supplier_id = s.id) AS total_spent
  FROM suppliers s
`

function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: toStringValue(row.name),
    contact: toStringValue(row.contact),
    notes: toStringValue(row.notes),
    purchaseCount: toNumber(row.purchase_count),
    totalSpentCents: toNumber(row.total_spent),
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at)
  }
}

export class SupplierRepository {
  constructor(private readonly db: Database) {}

  list(): Supplier[] {
    return this.db
      .all<SupplierRow>(`${SUPPLIER_SELECT} ORDER BY s.name COLLATE NOCASE ASC`)
      .map(mapSupplier)
  }

  findById(id: string): Supplier | null {
    const row = this.db.get<SupplierRow>(`${SUPPLIER_SELECT} WHERE s.id = $id`, { $id: id })
    return row ? mapSupplier(row) : null
  }

  /** Busca por nombre o lo crea. Evita duplicados por mayusculas o espacios. */
  ensure(name: string, contact = ''): Supplier {
    const trimmed = name.trim()
    if (!trimmed) throw appError('invalid_input', { field: 'name' })

    const existing = this.db.get<SupplierRow>(`${SUPPLIER_SELECT} WHERE s.name = $name COLLATE NOCASE`, {
      $name: trimmed
    })
    if (existing) return mapSupplier(existing)

    const id = newId()
    const at = nowIso()
    this.db.run(
      'INSERT INTO suppliers (id, name, contact, notes, created_at, updated_at) VALUES ($id, $name, $contact, $notes, $at, $at)',
      { $id: id, $name: trimmed, $contact: contact, $notes: '', $at: at }
    )
    const created = this.findById(id)
    if (!created) throw appError('db_error', { detail: 'supplier_not_persisted' })
    return created
  }

  create(input: { name: string; contact?: string; notes?: string }): Supplier {
    const name = input.name.trim()
    if (!name) throw appError('invalid_input', { field: 'name' })
    const duplicate = toNumber(
      this.db.scalar<number>('SELECT COUNT(*) AS v FROM suppliers WHERE name = $name COLLATE NOCASE', {
        $name: name
      })
    )
    if (duplicate > 0) throw appError('conflict', { entity: 'supplier', name })

    const id = newId()
    const at = nowIso()
    this.db.run(
      'INSERT INTO suppliers (id, name, contact, notes, created_at, updated_at) VALUES ($id, $name, $contact, $notes, $at, $at)',
      { $id: id, $name: name, $contact: input.contact ?? '', $notes: input.notes ?? '', $at: at }
    )
    const created = this.findById(id)
    if (!created) throw appError('db_error', { detail: 'supplier_not_persisted' })
    return created
  }

  update(id: string, patch: { name?: string; contact?: string; notes?: string }): Supplier {
    const current = this.findById(id)
    if (!current) throw appError('not_found', { entity: 'supplier' })
    const name = patch.name?.trim() ?? current.name
    if (!name) throw appError('invalid_input', { field: 'name' })

    this.db.run('UPDATE suppliers SET name = $name, contact = $contact, notes = $notes, updated_at = $at WHERE id = $id', {
      $id: id,
      $name: name,
      $contact: patch.contact ?? current.contact,
      $notes: patch.notes ?? current.notes,
      $at: nowIso()
    })
    const updated = this.findById(id)
    if (!updated) throw appError('db_error', { detail: 'supplier_not_persisted' })
    return updated
  }

  /** Elimina un proveedor. Las compras se conservan sin proveedor. */
  remove(id: string): { affected: number } {
    const current = this.findById(id)
    if (!current) throw appError('not_found', { entity: 'supplier' })
    // `ON DELETE SET NULL` conserva las compras y su `supplier_name` textual.
    this.db.run('DELETE FROM suppliers WHERE id = $id', { $id: id })
    logActivity(this.db, {
      entity: 'supplier',
      entityId: id,
      action: 'deleted',
      summary: `Proveedor eliminado: ${current.name}`
    })
    return { affected: 1 }
  }
}

// ===========================================================================
// Compras
// ===========================================================================

interface PurchaseRow {
  id: string
  reference: string
  supplier_id: string | null
  supplier_name: string
  purchased_at: string
  shipping_cents: number
  other_cents: number
  discount_cents: number
  allocation_method: string
  notes: string
  is_demo: number
  created_at: string
  updated_at: string
  items_cost: number
  extra_cost: number
  line_count: number
}

interface PurchaseItemRow {
  id: string
  purchase_id: string
  product_id: string | null
  description: string
  quantity: number
  unit_cost_cents: number
  allocated_extra_cents: number
  product_sku: string | null
  product_name: string | null
}

function mapPurchaseItem(row: PurchaseItemRow): PurchaseItem {
  const quantity = Math.max(1, toNumber(row.quantity, 1))
  const unit = toNumber(row.unit_cost_cents)
  const extra = toNumber(row.allocated_extra_cents)
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    productId: row.product_id,
    productSku: toNullableString(row.product_sku),
    productName: toNullableString(row.product_name),
    description: toStringValue(row.description),
    quantity,
    unitCostCents: unit,
    allocatedExtraCents: extra,
    lineCostCents: unit * quantity + extra
  }
}

export class PurchaseRepository {
  constructor(
    private readonly db: Database,
    private readonly products: ProductRepository
  ) {}

  private selectBase(): string {
    return `
      SELECT p.id, p.reference, p.supplier_id, p.supplier_name, p.purchased_at,
             p.shipping_cents, p.other_cents, p.discount_cents, p.allocation_method,
             p.notes, p.is_demo, p.created_at, p.updated_at,
             (SELECT COALESCE(SUM(pi2.unit_cost_cents * pi2.quantity), 0)
              FROM purchase_items pi2 WHERE pi2.purchase_id = p.id) AS items_cost,
             (p.shipping_cents + p.other_cents - p.discount_cents) AS extra_cost,
             (SELECT COUNT(*) FROM purchase_items pi3 WHERE pi3.purchase_id = p.id) AS line_count
      FROM purchases p
    `
  }

  list(options: { search?: string; from?: string; to?: string; limit?: number } = {}): Purchase[] {
    const clauses: string[] = []
    const params: Record<string, SqlParam> = {}

    if (options.search?.trim()) {
      params.$q = '%' + options.search.trim().replace(/[\\%_]/g, (m) => '\\' + m) + '%'
      clauses.push(
        `(p.reference LIKE $q ESCAPE '\\' OR p.supplier_name LIKE $q ESCAPE '\\' OR p.notes LIKE $q ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM purchase_items pi4 WHERE pi4.purchase_id = p.id
                     AND pi4.description LIKE $q ESCAPE '\\'))`
      )
    }
    if (options.from) {
      params.$from = options.from
      clauses.push('p.purchased_at >= $from')
    }
    if (options.to) {
      params.$to = options.to
      clauses.push('p.purchased_at <= $to')
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    params.$limit = Math.min(1000, Math.max(1, options.limit ?? 200))

    return this.db
      .all<PurchaseRow>(
        `${this.selectBase()} ${where} ORDER BY p.purchased_at DESC, p.created_at DESC LIMIT $limit`,
        params
      )
      .map((row) => this.hydrate(row))
  }

  get(id: string): Purchase {
    const row = this.db.get<PurchaseRow>(`${this.selectBase()} WHERE p.id = $id`, { $id: id })
    if (!row) throw appError('not_found', { entity: 'purchase' })
    return this.hydrate(row)
  }

  /** Lineas de una compra, con el SKU y el nombre del articulo si lo tiene. */
  private items(purchaseId: string): PurchaseItem[] {
    return this.db
      .all<PurchaseItemRow>(
        `SELECT pi.id, pi.purchase_id, pi.product_id, pi.description, pi.quantity,
                pi.unit_cost_cents, pi.allocated_extra_cents,
                pr.sku AS product_sku, pr.name AS product_name
         FROM purchase_items pi
         LEFT JOIN products pr ON pr.id = pi.product_id
         WHERE pi.purchase_id = $id
         ORDER BY pi.created_at ASC`,
        { $id: purchaseId }
      )
      .map(mapPurchaseItem)
  }

  private hydrate(row: PurchaseRow): Purchase {
    const itemsCost = toNumber(row.items_cost)
    const extra = toNumber(row.shipping_cents) + toNumber(row.other_cents) - toNumber(row.discount_cents)
    return {
      id: row.id,
      reference: toStringValue(row.reference),
      supplierId: row.supplier_id,
      supplierName: toStringValue(row.supplier_name),
      purchasedAt: toStringValue(row.purchased_at),
      shippingCents: toNumber(row.shipping_cents),
      otherCents: toNumber(row.other_cents),
      discountCents: toNumber(row.discount_cents),
      allocationMethod: row.allocation_method as AllocationMethod,
      notes: toStringValue(row.notes),
      isDemo: toNumber(row.is_demo) === 1,
      items: this.items(row.id),
      itemsCostCents: itemsCost,
      extraCostCents: extra,
      totalCostCents: itemsCost + extra,
      createdAt: toStringValue(row.created_at),
      updatedAt: toStringValue(row.updated_at)
    }
  }

  /**
   * Vista previa del reparto de costes, SIN guardar nada.
   *
   * Se aplica sobre un reparto ya calculado (por ejemplo, al ir a guardar) y
   * permite ensenar exactamente que coste tendra cada articulo antes de tocar
   * nada.
   */
  previewAllocation(input: Pick<PurchaseCreateInput, 'allocationMethod' | 'shippingCents' | 'otherCents' | 'discountCents' | 'items'>): {
    method: AllocationMethod
    extraCents: number
    lines: Array<{
      index: number
      description: string
      productId: string | null
      quantity: number
      unitCostCents: number
      allocatedExtraCents: number
      effectiveUnitCostCents: number
    }>
    allocatedTotalCents: number
    unallocatedCents: number
  } {
    const method = input.allocationMethod ?? 'by_cost'
    const extra =
      Math.round(input.shippingCents ?? 0) +
      Math.round(input.otherCents ?? 0) -
      Math.round(input.discountCents ?? 0)

    const allocation = allocateExtraCost(
      extra,
      input.items.map((item) => ({ unitCostCents: item.unitCostCents, quantity: item.quantity })),
      method
    )

    const lines = input.items.map((item, index) => {
      const quantity = Math.max(1, Math.round(item.quantity))
      const unit = Math.round(item.unitCostCents)
      const allocated = allocation.allocations[index] ?? 0
      // El extra se reparte por unidad para que el coste unitario del articulo
      // incluya su parte del envio.
      const effective = unit + Math.round(allocated / quantity)
      return {
        index,
        description: item.description?.trim() || `Linea ${index + 1}`,
        productId: item.productId ?? null,
        quantity,
        unitCostCents: unit,
        allocatedExtraCents: allocated,
        effectiveUnitCostCents: effective
      }
    })

    return {
      method,
      extraCents: extra,
      lines,
      allocatedTotalCents: allocation.allocatedTotalCents,
      unallocatedCents: allocation.unallocatedCents
    }
  }

  /**
   * Crea la compra y, si el reparto esta activo, ESCRIBE el coste resultante en
   * cada articulo vinculado. Tambien fija la fecha de compra.
   *
   * Todo ocurre en una transaccion: o se guardan la compra y los costes, o no
   * se guarda nada.
   */
  create(input: PurchaseCreateInput, options: { isDemo?: boolean } = {}): Purchase {
    const purchasedAt = input.purchasedAt?.trim()
    if (!purchasedAt) throw appError('invalid_input', { field: 'purchasedAt' })
    if (!input.items || input.items.length === 0) throw appError('invalid_input', { field: 'items' })

    const preview = this.previewAllocation(input)
    const id = newId()
    const at = nowIso()

    let supplierId = input.supplierId ?? null
    let supplierName = input.supplierName?.trim() ?? ''

    if (!supplierId && supplierName) {
      supplierId = this.db.transaction(() => this.ensureSupplier(supplierName).id)
    }
    if (supplierId) {
      const found = this.db.scalar<string>('SELECT name FROM suppliers WHERE id = $id', { $id: supplierId })
      if (!found) throw appError('not_found', { entity: 'supplier' })
      supplierName = found
    }

    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO purchases (id, reference, supplier_id, supplier_name, purchased_at,
            shipping_cents, other_cents, discount_cents, allocation_method, notes, is_demo,
            created_at, updated_at)
         VALUES ($id, $reference, $supplier, $supplierName, $date,
            $shipping, $other, $discount, $method, $notes, $isDemo, $at, $at)`,
        {
          $id: id,
          $reference: input.reference?.trim() ?? '',
          $supplier: supplierId,
          $supplierName: supplierName,
          $date: purchasedAt,
          $shipping: Math.round(input.shippingCents ?? 0),
          $other: Math.round(input.otherCents ?? 0),
          $discount: Math.round(input.discountCents ?? 0),
          $method: preview.method,
          $notes: input.notes ?? '',
          $isDemo: options.isDemo ? 1 : 0,
          $at: at
        }
      )

      for (const line of preview.lines) {
        if (line.productId) {
          const exists = toNumber(
            this.db.scalar<number>('SELECT COUNT(*) AS v FROM products WHERE id = $id', { $id: line.productId })
          )
          if (exists === 0) throw appError('not_found', { entity: 'product' })
        }

        this.db.run(
          `INSERT INTO purchase_items (id, purchase_id, product_id, description, quantity,
              unit_cost_cents, allocated_extra_cents, created_at)
           VALUES ($id, $purchase, $product, $description, $quantity, $unitCost, $extra, $at)`,
          {
            $id: newId(),
            $purchase: id,
            $product: line.productId,
            $description: line.description,
            $quantity: line.quantity,
            $unitCost: line.unitCostCents,
            $extra: line.allocatedExtraCents,
            $at: at
          }
        )

        if (line.productId) {
          this.products.setAcquisitionCost(line.productId, {
            purchasePriceCents: line.unitCostCents,
            acquisitionFeesCents: line.allocatedExtraCents,
            purchaseDate: purchasedAt,
            source: `compra ${input.reference?.trim() || id.slice(0, 8)}`
          })
        }
      }

      logActivity(this.db, {
        entity: 'purchase',
        entityId: id,
        action: 'created',
        summary: `Compra registrada: ${preview.lines.length} linea(s), total ${((preview.extraCents + preview.lines.reduce((s, l) => s + l.unitCostCents * l.quantity, 0)) / 100).toFixed(2)}`,
        details: { supplier: supplierName }
      })
    })

    return this.get(id)
  }

  update(id: string, patch: { reference?: string; notes?: string; purchasedAt?: string }): Purchase {
    const current = this.get(id)
    this.db.run(
      'UPDATE purchases SET reference = $reference, notes = $notes, purchased_at = $date, updated_at = $at WHERE id = $id',
      {
        $id: id,
        $reference: patch.reference?.trim() ?? current.reference,
        $notes: patch.notes ?? current.notes,
        $date: patch.purchasedAt ?? current.purchasedAt,
        $at: nowIso()
      }
    )
    return this.get(id)
  }

  /**
   * Elimina el documento de compra. NO revierte el coste ya escrito en los
   * articulos: ese coste es el dato vigente del articulo. La interfaz lo avisa.
   */
  remove(id: string): { affected: number; linkedProducts: string[] } {
    const purchase = this.get(id)
    const linked = purchase.items
      .map((item) => item.productId)
      .filter((value): value is string => value !== null)

    this.db.run('DELETE FROM purchases WHERE id = $id', { $id: id })
    logActivity(this.db, {
      entity: 'purchase',
      entityId: id,
      action: 'deleted',
      summary: `Compra eliminada: ${purchase.reference || id.slice(0, 8)}`,
      details: { linkedProducts: linked.length }
    })
    return { affected: 1, linkedProducts: linked }
  }

  /**
   * Convierte en articulos reales las lineas de un lote que aun no estan
   * vinculadas. Es el paso "tengo 30 articulos de este lote, crealos".
   */
  materialize(purchaseId: string, itemIds: readonly string[], options: { categoryId?: string | null } = {}): {
    created: number
    productIds: string[]
  } {
    const purchase = this.get(purchaseId)
    const selected = purchase.items.filter((item) => itemIds.includes(item.id) && item.productId === null)
    if (selected.length === 0) throw appError('invalid_input', { field: 'items' })

    const productIds: string[] = []

    this.db.transaction(() => {
      for (const item of selected) {
        const created = this.products.create(
          {
            name: item.description || `Articulo de la compra ${purchase.reference || purchaseId.slice(0, 8)}`,
            categoryId: options.categoryId ?? null,
            purchaseDate: purchase.purchasedAt,
            purchasePriceCents: item.unitCostCents,
            acquisitionFeesCents: item.allocatedExtraCents,
            status: 'to_prepare'
          },
          { isDemo: purchase.isDemo }
        )
        productIds.push(created.id)

        this.db.run('UPDATE purchase_items SET product_id = $product WHERE id = $id', {
          $product: created.id,
          $id: item.id
        })
      }

      logActivity(this.db, {
        entity: 'purchase',
        entityId: purchaseId,
        action: 'materialized',
        summary: `Creados ${productIds.length} articulos desde la compra`,
        details: { productIds }
      })
    })

    return { created: productIds.length, productIds }
  }

  private ensureSupplier(name: string): Supplier {
    const trimmed = name.trim()
    const existing = this.db.get<SupplierRow>(`${SUPPLIER_SELECT} WHERE s.name = $name COLLATE NOCASE`, {
      $name: trimmed
    })
    if (existing) return mapSupplier(existing)
    const id = newId()
    const at = nowIso()
    this.db.run(
      'INSERT INTO suppliers (id, name, contact, notes, created_at, updated_at) VALUES ($id, $name, $contact, $notes, $at, $at)',
      { $id: id, $name: trimmed, $contact: '', $notes: '', $at: at }
    )
    const created = this.db.get<SupplierRow>(`${SUPPLIER_SELECT} WHERE s.id = $id`, { $id: id })
    if (!created) throw appError('db_error', { detail: 'supplier_not_persisted' })
    return mapSupplier(created)
  }

  /** Total gastado en compras en un periodo (coste de adquisicion, no gasto general). */
  totals(from?: string, to?: string): { count: number; totalCents: number; itemsCents: number; extraCents: number } {
    const params: Record<string, SqlParam> = {}
    const clauses: string[] = []
    if (from) {
      params.$from = from
      clauses.push('purchased_at >= $from')
    }
    if (to) {
      params.$to = to
      clauses.push('purchased_at <= $to')
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

    const row = this.db.get<{ n: number; items: number; extra: number }>(
      `SELECT COUNT(*) AS n,
              (SELECT COALESCE(SUM(pi.unit_cost_cents * pi.quantity), 0) FROM purchase_items pi
                WHERE pi.purchase_id IN (SELECT id FROM purchases ${where})) AS items,
              (SELECT COALESCE(SUM(p2.shipping_cents + p2.other_cents - p2.discount_cents), 0)
                FROM purchases p2 ${where.replace(/\b(purchased_at)\b/g, 'p2.$1')}) AS extra
       FROM purchases ${where}`,
      params
    )

    const items = toNumber(row?.items)
    const extra = toNumber(row?.extra)
    return { count: toNumber(row?.n), totalCents: items + extra, itemsCents: items, extraCents: extra }
  }
}

// ===========================================================================
// Gastos generales
// ===========================================================================

interface ExpenseRow {
  id: string
  category: string
  description: string
  amount_cents: number
  incurred_on: string
  recurring: string
  notes: string
  is_demo: number
  created_at: string
  updated_at: string
}

function mapExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    category: row.category as ExpenseCategory,
    description: toStringValue(row.description),
    amountCents: toNumber(row.amount_cents),
    incurredOn: toStringValue(row.incurred_on),
    recurring: row.recurring as ExpenseRecurrence,
    notes: toStringValue(row.notes),
    isDemo: toNumber(row.is_demo) === 1,
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at)
  }
}

const EXPENSE_SELECT = `
  SELECT id, category, description, amount_cents, incurred_on, recurring, notes, is_demo,
         created_at, updated_at
  FROM expenses
`

export class ExpenseRepository {
  constructor(private readonly db: Database) {}

  list(options: { from?: string; to?: string; category?: ExpenseCategory; search?: string; limit?: number } = {}): Expense[] {
    const clauses: string[] = []
    const params: Record<string, SqlParam> = {}

    if (options.from) {
      params.$from = options.from
      clauses.push('incurred_on >= $from')
    }
    if (options.to) {
      params.$to = options.to
      clauses.push('incurred_on <= $to')
    }
    if (options.category) {
      params.$category = options.category
      clauses.push('category = $category')
    }
    if (options.search?.trim()) {
      params.$q = '%' + options.search.trim().replace(/[\\%_]/g, (m) => '\\' + m) + '%'
      clauses.push("(description LIKE $q ESCAPE '\\' OR notes LIKE $q ESCAPE '\\')")
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    params.$limit = Math.min(2000, Math.max(1, options.limit ?? 500))

    return this.db
      .all<ExpenseRow>(
        `${EXPENSE_SELECT} ${where} ORDER BY incurred_on DESC, created_at DESC LIMIT $limit`,
        params
      )
      .map(mapExpense)
  }

  create(input: {
    category: ExpenseCategory
    description?: string
    amountCents: number
    incurredOn: string
    recurring?: ExpenseRecurrence
    notes?: string
  }): Expense {
    const amount = Math.round(input.amountCents)
    if (!Number.isFinite(amount) || amount < 0) throw appError('invalid_input', { field: 'amountCents' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.incurredOn)) throw appError('invalid_input', { field: 'incurredOn' })

    const id = newId()
    const at = nowIso()
    this.db.run(
      `INSERT INTO expenses (id, category, description, amount_cents, incurred_on, recurring, notes, is_demo, created_at, updated_at)
       VALUES ($id, $category, $description, $amount, $date, $recurring, $notes, 0, $at, $at)`,
      {
        $id: id,
        $category: input.category,
        $description: input.description?.trim() ?? '',
        $amount: amount,
        $date: input.incurredOn,
        $recurring: input.recurring ?? 'none',
        $notes: input.notes ?? '',
        $at: at
      }
    )

    logActivity(this.db, {
      entity: 'expense',
      entityId: id,
      action: 'created',
      summary: `Gasto registrado: ${input.category} ${(amount / 100).toFixed(2)}`
    })

    const created = this.db.get<ExpenseRow>(`${EXPENSE_SELECT} WHERE id = $id`, { $id: id })
    if (!created) throw appError('db_error', { detail: 'expense_not_persisted' })
    return mapExpense(created)
  }

  update(
    id: string,
    patch: Partial<{
      category: ExpenseCategory
      description: string
      amountCents: number
      incurredOn: string
      recurring: ExpenseRecurrence
      notes: string
    }>
  ): Expense {
    const current = this.db.get<ExpenseRow>(`${EXPENSE_SELECT} WHERE id = $id`, { $id: id })
    if (!current) throw appError('not_found', { entity: 'expense' })

    const amount = patch.amountCents === undefined ? toNumber(current.amount_cents) : Math.round(patch.amountCents)
    if (amount < 0) throw appError('invalid_input', { field: 'amountCents' })

    this.db.run(
      `UPDATE expenses SET category = $category, description = $description, amount_cents = $amount,
          incurred_on = $date, recurring = $recurring, notes = $notes, updated_at = $at
       WHERE id = $id`,
      {
        $id: id,
        $category: patch.category ?? current.category,
        $description: patch.description?.trim() ?? toStringValue(current.description),
        $amount: amount,
        $date: patch.incurredOn ?? toStringValue(current.incurred_on),
        $recurring: patch.recurring ?? current.recurring,
        $notes: patch.notes ?? toStringValue(current.notes),
        $at: nowIso()
      }
    )

    const updated = this.db.get<ExpenseRow>(`${EXPENSE_SELECT} WHERE id = $id`, { $id: id })
    if (!updated) throw appError('db_error', { detail: 'expense_not_persisted' })
    return mapExpense(updated)
  }

  remove(id: string): { affected: number } {
    const current = this.db.get<ExpenseRow>(`${EXPENSE_SELECT} WHERE id = $id`, { $id: id })
    if (!current) throw appError('not_found', { entity: 'expense' })
    this.db.run('DELETE FROM expenses WHERE id = $id', { $id: id })
    return { affected: 1 }
  }

  summary(from?: string, to?: string): ExpenseSummary {
    const params: Record<string, SqlParam> = {}
    const clauses: string[] = []
    if (from) {
      params.$from = from
      clauses.push('incurred_on >= $from')
    }
    if (to) {
      params.$to = to
      clauses.push('incurred_on <= $to')
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

    const byCategory = this.db
      .all<{ category: string; total: number; n: number }>(
        `SELECT category, COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS n
         FROM expenses ${where} GROUP BY category ORDER BY total DESC`,
        params
      )
      .map((row) => ({
        category: row.category as ExpenseCategory,
        totalCents: toNumber(row.total),
        count: toNumber(row.n)
      }))

    const byMonth = this.db
      .all<{ month: string; total: number }>(
        `SELECT substr(incurred_on, 1, 7) AS month, COALESCE(SUM(amount_cents), 0) AS total
         FROM expenses ${where} GROUP BY month ORDER BY month ASC`,
        params
      )
      .map((row) => ({ month: toStringValue(row.month), totalCents: toNumber(row.total) }))

    const totalCents = byCategory.reduce((sum, entry) => sum + entry.totalCents, 0)

    return { totalCents, byCategory, byMonth }
  }

  /** Suma de gastos generales en un periodo. Se usa para el beneficio del negocio. */
  totalBetween(from?: string, to?: string): number {
    const params: Record<string, SqlParam> = {}
    const clauses: string[] = []
    if (from) {
      params.$from = from
      clauses.push('incurred_on >= $from')
    }
    if (to) {
      params.$to = to
      clauses.push('incurred_on <= $to')
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    return toNumber(this.db.scalar<number>(`SELECT COALESCE(SUM(amount_cents), 0) AS v FROM expenses ${where}`, params))
  }

  removeDemo(): number {
    return this.db.run('DELETE FROM expenses WHERE is_demo = 1').changes
  }
}

/** Helper compartido para listar ids en una clausula IN. */
export { inClause, ACTOR_USER_ID }
