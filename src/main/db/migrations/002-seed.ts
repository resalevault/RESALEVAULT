/**
 * RESALEVAULT - Migracion 002: datos base del sistema.
 *
 * Solo inserta lo imprescindible para que la aplicacion tenga sentido en el
 * primer arranque. NO inserta inventario de ejemplo: los datos de demostracion
 * se crean bajo peticion explicita del usuario desde Ajustes y se marcan con
 * `products.is_demo = 1` para poder retirarlos despues sin riesgo.
 */

import type { Database } from '../database'

/** Estados del ciclo de vida. Las etiquetas visibles se traducen por codigo. */
const STATUSES: Array<{
  code: string
  label: string
  isTerminal: 0 | 1
  sort: number
  color: string
}> = [
  { code: 'to_prepare', label: 'Pendiente de preparar', isTerminal: 0, sort: 10, color: '#FFC24B' },
  { code: 'available', label: 'Disponible', isTerminal: 0, sort: 20, color: '#C8FF3D' },
  { code: 'reserved', label: 'Reservado', isTerminal: 0, sort: 30, color: '#7CC4FF' },
  { code: 'sold', label: 'Vendido', isTerminal: 1, sort: 40, color: '#34D399' },
  { code: 'shipped', label: 'Enviado', isTerminal: 1, sort: 50, color: '#34D399' },
  { code: 'returned', label: 'Devuelto', isTerminal: 0, sort: 60, color: '#FF8A5C' },
  { code: 'archived', label: 'Archivado', isTerminal: 1, sort: 70, color: '#8A8A92' }
]

/** Plataformas de venta frecuentes. El usuario puede anadir mas. */
const PLATFORMS: Array<{ code: string; name: string; sort: number }> = [
  { code: 'vinted', name: 'Vinted', sort: 10 },
  { code: 'wallapop', name: 'Wallapop', sort: 20 },
  { code: 'ebay', name: 'eBay', sort: 30 },
  { code: 'depop', name: 'Depop', sort: 40 },
  { code: 'vinted-pro', name: 'Vinted Pro', sort: 50 },
  { code: 'mercari', name: 'Mercari', sort: 60 },
  { code: 'grailed', name: 'Grailed', sort: 70 },
  { code: 'etsy', name: 'Etsy', sort: 80 },
  { code: 'amazon', name: 'Amazon', sort: 90 },
  { code: 'shopify', name: 'Shopify', sort: 100 },
  { code: 'local', name: 'Venta local / en mano', sort: 110 },
  { code: 'other', name: 'Otra plataforma', sort: 200 }
]

/** Arbol de categorias inicial, deliberadamente generico y editable. */
const CATEGORIES: Array<{ name: string; slug: string; sort: number; children: Array<{ name: string; slug: string }> }> = [
  {
    name: 'Ropa',
    slug: 'ropa',
    sort: 10,
    children: [
      { name: 'Camisetas', slug: 'camisetas' },
      { name: 'Sudaderas', slug: 'sudaderas' },
      { name: 'Pantalones', slug: 'pantalones' },
      { name: 'Chaquetas', slug: 'chaquetas' },
      { name: 'Calzado', slug: 'calzado' },
      { name: 'Accesorios', slug: 'accesorios' }
    ]
  },
  {
    name: 'Tecnologia',
    slug: 'tecnologia',
    sort: 20,
    children: [
      { name: 'Moviles', slug: 'moviles' },
      { name: 'Ordenadores', slug: 'ordenadores' },
      { name: 'Consolas', slug: 'consolas' },
      { name: 'Audio', slug: 'audio' },
      { name: 'Accesorios', slug: 'accesorios' }
    ]
  },
  {
    name: 'Coleccionables',
    slug: 'coleccionables',
    sort: 30,
    children: [
      { name: 'Cartas', slug: 'cartas' },
      { name: 'Figuras', slug: 'figuras' },
      { name: 'Vinilos', slug: 'vinilos' },
      { name: 'Libros y comics', slug: 'libros-comics' }
    ]
  },
  {
    name: 'Hogar',
    slug: 'hogar',
    sort: 40,
    children: [
      { name: 'Decoracion', slug: 'decoracion' },
      { name: 'Menaje', slug: 'menaje' },
      { name: 'Textil', slug: 'textil' }
    ]
  },
  {
    name: 'Deporte',
    slug: 'deporte',
    sort: 50,
    children: [
      { name: 'Calzado deportivo', slug: 'calzado-deportivo' },
      { name: 'Equipamiento', slug: 'equipamiento' }
    ]
  },
  { name: 'Sin clasificar', slug: 'sin-clasificar', sort: 999, children: [] }
]

export const migration002 = {
  version: 2,
  name: 'datos-base',
  up: (db: Database): void => {
    const now = new Date().toISOString()

    // Organizacion y usuario local. En la version individual son implicitos;
    // cuando llegue el modo Business ya existen y no hay que migrar datos.
    db.run('INSERT INTO organizations (id, name, created_at) VALUES ($id, $name, $at)', {
      $id: 'org-local',
      $name: 'Mi negocio',
      $at: now
    })
    db.run(
      'INSERT INTO users (id, organization_id, display_name, role, created_at) VALUES ($id, $org, $name, $role, $at)',
      { $id: 'user-local', $org: 'org-local', $name: 'Propietario', $role: 'owner', $at: now }
    )

    for (const status of STATUSES) {
      db.run(
        `INSERT INTO product_statuses (code, label, is_system, is_terminal, sort_order, color)
         VALUES ($code, $label, 1, $terminal, $sort, $color)`,
        {
          $code: status.code,
          $label: status.label,
          $terminal: status.isTerminal,
          $sort: status.sort,
          $color: status.color
        }
      )
    }

    for (const platform of PLATFORMS) {
      db.run(
        `INSERT INTO platforms (id, code, name, sort_order, active, is_builtin, created_at, updated_at)
         VALUES ($id, $code, $name, $sort, 1, 1, $at, $at)`,
        { $id: `platform-${platform.code}`, $code: platform.code, $name: platform.name, $sort: platform.sort, $at: now }
      )
    }

    for (const category of CATEGORIES) {
      const parentId = `cat-${category.slug}`
      db.run(
        `INSERT INTO categories (id, parent_id, name, slug, sort_order, created_at, updated_at)
         VALUES ($id, NULL, $name, $slug, $sort, $at, $at)`,
        { $id: parentId, $name: category.name, $slug: category.slug, $sort: category.sort, $at: now }
      )
      for (const child of category.children) {
        db.run(
          `INSERT INTO categories (id, parent_id, name, slug, sort_order, created_at, updated_at)
           VALUES ($id, $parent, $name, $slug, $sort, $at, $at)`,
          {
            $id: `cat-${category.slug}-${child.slug}`,
            $parent: parentId,
            $name: child.name,
            $slug: child.slug,
            $sort: 0,
            $at: now
          }
        )
      }
    }

    // Contadores de secuencia usados por el generador de SKU y, mas adelante,
    // por la numeracion de pedidos.
    db.run("INSERT INTO counters (key, value) VALUES ('sku_seq', 0)")
    db.run("INSERT INTO counters (key, value) VALUES ('order_seq', 0)")
  }
}
