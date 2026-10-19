/**
 * RESALEVAULT - Repositorio de anuncios (relacion articulo <-> plataforma).
 *
 * Cada articulo puede publicarse en varias plataformas. El registro es manual:
 * RESALEVAULT no se conecta a Vinted ni a ningun marketplace. Los conectores
 * autorizados llegaran en la Fase 7; hasta entonces la aplicacion solo guarda
 * el identificador y la URL que el usuario aporte.
 *
 * La restriccion UNIQUE (platform_id, external_id) impide registrar dos veces el
 * mismo anuncio externo, lo que protege contra ventas duplicadas al importar.
 */

import type { Listing, ListingStatus } from '@shared/types'
import type { Database } from '../database'
import { appError } from '../../errors'
import { logActivity } from './activity'
import { newId, nowIso, toNumber, toNullableString, toStringValue } from '../support'

interface ListingRow {
  id: string
  product_id: string
  platform_id: string
  platform_code: string
  platform_name: string
  external_id: string
  url: string
  listed_price_cents: number | null
  status: string
  listed_at: string | null
  notes: string
  created_at: string
  updated_at: string
}

const SELECT_BASE = `
  SELECT pl.id, pl.product_id, pl.platform_id, pf.code AS platform_code, pf.name AS platform_name,
         pl.external_id, pl.url, pl.listed_price_cents, pl.status, pl.listed_at, pl.notes,
         pl.created_at, pl.updated_at
  FROM product_listings pl
  JOIN platforms pf ON pf.id = pl.platform_id
`

function mapListing(row: ListingRow): Listing {
  return {
    id: row.id,
    productId: row.product_id,
    platformId: row.platform_id,
    platformCode: toStringValue(row.platform_code),
    platformName: toStringValue(row.platform_name),
    externalId: toStringValue(row.external_id),
    url: toStringValue(row.url),
    listedPriceCents: row.listed_price_cents === null ? null : toNumber(row.listed_price_cents),
    status: row.status as ListingStatus,
    listedAt: toNullableString(row.listed_at),
    notes: toStringValue(row.notes),
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at)
  }
}

export interface ListingCreateInput {
  productId: string
  platformId: string
  externalId?: string
  url?: string
  listedPriceCents?: number | null
  status?: ListingStatus
  listedAt?: string | null
  notes?: string
}

export class ListingRepository {
  constructor(private readonly db: Database) {}

  listForProduct(productId: string): Listing[] {
    return this.db
      .all<ListingRow>(`${SELECT_BASE} WHERE pl.product_id = $id ORDER BY pf.sort_order ASC`, {
        $id: productId
      })
      .map(mapListing)
  }

  findById(id: string): Listing | null {
    const row = this.db.get<ListingRow>(`${SELECT_BASE} WHERE pl.id = $id`, { $id: id })
    return row ? mapListing(row) : null
  }

  create(input: ListingCreateInput): Listing {
    const productExists = toNumber(
      this.db.scalar<number>('SELECT COUNT(*) AS v FROM products WHERE id = $id', { $id: input.productId })
    )
    if (productExists === 0) throw appError('not_found', { entity: 'product' })

    const platformExists = toNumber(
      this.db.scalar<number>('SELECT COUNT(*) AS v FROM platforms WHERE id = $id', { $id: input.platformId })
    )
    if (platformExists === 0) throw appError('not_found', { entity: 'platform' })

    const externalId = input.externalId?.trim() ?? ''
    if (externalId) {
      const duplicate = toNumber(
        this.db.scalar<number>(
          'SELECT COUNT(*) AS v FROM product_listings WHERE platform_id = $platform AND external_id = $external',
          { $platform: input.platformId, $external: externalId }
        )
      )
      if (duplicate > 0) throw appError('conflict', { entity: 'listing', externalId })
    }

    const id = newId()
    const at = nowIso()
    this.db.run(
      `INSERT INTO product_listings (
         id, product_id, platform_id, external_id, url, listed_price_cents, status, listed_at, notes,
         created_at, updated_at
       ) VALUES ($id, $product, $platform, $external, $url, $price, $status, $listedAt, $notes, $at, $at)`,
      {
        $id: id,
        $product: input.productId,
        $platform: input.platformId,
        $external: externalId,
        $url: input.url?.trim() ?? '',
        $price: input.listedPriceCents ?? null,
        $status: input.status ?? 'draft',
        $listedAt: input.listedAt ?? null,
        $notes: input.notes ?? '',
        $at: at
      }
    )

    logActivity(this.db, {
      entity: 'listing',
      entityId: id,
      action: 'created',
      summary: `Anuncio registrado en ${this.db.scalar<string>('SELECT name FROM platforms WHERE id = $id', { $id: input.platformId }) ?? ''}`
    })

    const created = this.findById(id)
    if (!created) throw appError('db_error', { detail: 'listing_not_persisted' })
    return created
  }

  update(
    id: string,
    patch: Partial<{
      externalId: string
      url: string
      listedPriceCents: number | null
      status: ListingStatus
      listedAt: string | null
      notes: string
    }>
  ): Listing {
    const current = this.findById(id)
    if (!current) throw appError('not_found', { entity: 'listing' })

    const nextExternal = patch.externalId?.trim() ?? current.externalId
    if (nextExternal && nextExternal !== current.externalId) {
      const duplicate = toNumber(
        this.db.scalar<number>(
          'SELECT COUNT(*) AS v FROM product_listings WHERE platform_id = $platform AND external_id = $external AND id <> $id',
          { $platform: current.platformId, $external: nextExternal, $id: id }
        )
      )
      if (duplicate > 0) throw appError('conflict', { entity: 'listing', externalId: nextExternal })
    }

    this.db.run(
      `UPDATE product_listings
       SET external_id = $external, url = $url, listed_price_cents = $price, status = $status,
           listed_at = $listedAt, notes = $notes, updated_at = $at
       WHERE id = $id`,
      {
        $id: id,
        $external: nextExternal,
        $url: patch.url?.trim() ?? current.url,
        $price: patch.listedPriceCents === undefined ? current.listedPriceCents : patch.listedPriceCents,
        $status: patch.status ?? current.status,
        $listedAt: patch.listedAt === undefined ? current.listedAt : patch.listedAt,
        $notes: patch.notes ?? current.notes,
        $at: nowIso()
      }
    )

    const updated = this.findById(id)
    if (!updated) throw appError('db_error', { detail: 'listing_not_persisted' })
    return updated
  }

  remove(id: string): { affected: number } {
    const current = this.findById(id)
    if (!current) throw appError('not_found', { entity: 'listing' })
    this.db.run('DELETE FROM product_listings WHERE id = $id', { $id: id })
    logActivity(this.db, {
      entity: 'listing',
      entityId: id,
      action: 'deleted',
      summary: `Anuncio eliminado (${current.platformName})`
    })
    return { affected: 1 }
  }
}
