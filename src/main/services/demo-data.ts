/**
 * RESALEVAULT - Datos de demostracion.
 *
 * IMPORTANTE (honestidad del producto): estos articulos son claramente de
 * ejemplo, se marcan con `is_demo = 1` y se pueden borrar de una vez desde
 * Ajustes. No se insertan en el primer arranque: solo cuando el usuario lo
 * pide expresamente, para que el inventario real nunca se mezcle con ejemplos.
 */

import type { ProductCondition, ProductStatus } from '@shared/types'
import type { Repositories } from '../db/context'
import { logActivity } from '../db/repositories/activity'
import { todayIso, toNumber } from '../db/support'

interface DemoItem {
  name: string
  categoryId: string
  brand: string
  size: string
  color: string
  condition: ProductCondition
  status: ProductStatus
  /** Dias transcurridos desde la compra (para poblar el analisis de antiguedad). */
  ageDays: number
  purchaseCents: number
  feesCents: number
  expectedCents: number
  finalCents?: number
  tags: string[]
  note?: string
}

const DEMO_ITEMS: DemoItem[] = [
  { name: 'Camiseta grafica algodon organico', categoryId: 'cat-ropa-camisetas', brand: 'Ejemplo Basics', size: 'M', color: 'Negro', condition: 'like_new', status: 'available', ageDays: 12, purchaseCents: 400, feesCents: 120, expectedCents: 2200, tags: ['demo', 'verano'] },
  { name: 'Sudadera con capucha oversize', categoryId: 'cat-ropa-sudaderas', brand: 'Ejemplo Sport', size: 'L', color: 'Gris', condition: 'good', status: 'available', ageDays: 48, purchaseCents: 900, feesCents: 250, expectedCents: 3800, tags: ['demo', 'invierno'] },
  { name: 'Vaqueros rectos clasicos', categoryId: 'cat-ropa-pantalones', brand: 'Ejemplo Denim', size: '32/32', color: 'Azul', condition: 'good', status: 'reserved', ageDays: 21, purchaseCents: 700, feesCents: 0, expectedCents: 3200, tags: ['demo'] },
  { name: 'Zapatillas running amortiguadas', categoryId: 'cat-ropa-calzado', brand: 'Ejemplo Run', size: '43', color: 'Blanco', condition: 'used', status: 'available', ageDays: 95, purchaseCents: 1500, feesCents: 400, expectedCents: 4200, tags: ['demo', 'revisar'] },
  { name: 'Cortavientos tecnico impermeable', categoryId: 'cat-ropa-chaquetas', brand: 'Ejemplo Outdoor', size: 'S', color: 'Verde', condition: 'new', status: 'available', ageDays: 5, purchaseCents: 1200, feesCents: 300, expectedCents: 4900, tags: ['demo', 'nuevo'] },
  { name: 'Gorra ajustable bordada', categoryId: 'cat-ropa-accesorios', brand: 'Ejemplo Caps', size: 'U', color: 'Beige', condition: 'like_new', status: 'to_prepare', ageDays: 2, purchaseCents: 300, feesCents: 0, expectedCents: 1500, tags: ['demo'] },
  { name: 'Movil gama media 128 GB', categoryId: 'cat-tecnologia-moviles', brand: 'EjemploTech', size: '', color: 'Negro', condition: 'good', status: 'sold', ageDays: 140, purchaseCents: 9000, feesCents: 1500, expectedCents: 16500, finalCents: 15900, tags: ['demo'] },
  { name: 'Portatil ultraligero 14 pulgadas', categoryId: 'cat-tecnologia-ordenadores', brand: 'EjemploTech', size: '14"', color: 'Plata', condition: 'like_new', status: 'sold', ageDays: 60, purchaseCents: 22000, feesCents: 2500, expectedCents: 38000, finalCents: 36500, tags: ['demo', 'alto-valor'] },
  { name: 'Consola portatil con estuche', categoryId: 'cat-tecnologia-consolas', brand: 'Ejemplo Games', size: '', color: 'Azul', condition: 'good', status: 'available', ageDays: 32, purchaseCents: 8500, feesCents: 900, expectedCents: 14500, tags: ['demo'] },
  { name: 'Auriculares inalambricos con cancelacion', categoryId: 'cat-tecnologia-audio', brand: 'EjemploTech', size: '', color: 'Blanco', condition: 'new', status: 'available', ageDays: 8, purchaseCents: 4200, feesCents: 600, expectedCents: 7900, tags: ['demo', 'nuevo'] },
  { name: 'Cargador rapido USB-C 65W', categoryId: 'cat-tecnologia-accesorios', brand: 'EjemploTech', size: '', color: 'Negro', condition: 'used', status: 'available', ageDays: 120, purchaseCents: 800, feesCents: 150, expectedCents: 1900, tags: ['demo', 'revisar', 'bajo-margen'] },
  { name: 'Mazo de cartas coleccionables precintado', categoryId: 'cat-coleccionables-cartas', brand: 'Ejemplo TCG', size: '', color: '', condition: 'new', status: 'available', ageDays: 15, purchaseCents: 3500, feesCents: 0, expectedCents: 7200, tags: ['demo', 'coleccion'] },
  { name: 'Figura de vinilo edicion limitada', categoryId: 'cat-coleccionables-figuras', brand: 'Ejemplo Toys', size: '18 cm', color: 'Multicolor', condition: 'new', status: 'reserved', ageDays: 70, purchaseCents: 2600, feesCents: 500, expectedCents: 5400, tags: ['demo', 'coleccion'] },
  { name: 'Vinilo reedicion remasterizada', categoryId: 'cat-coleccionables-vinilos', brand: 'Ejemplo Records', size: '12"', color: 'Negro', condition: 'good', status: 'available', ageDays: 200, purchaseCents: 1400, feesCents: 200, expectedCents: 3100, tags: ['demo', 'revisar', 'lento'] },
  { name: 'Novela grafica tomo unico', categoryId: 'cat-coleccionables-libros-comics', brand: 'Ejemplo Press', size: '', color: '', condition: 'good', status: 'sold', ageDays: 180, purchaseCents: 600, feesCents: 0, expectedCents: 1800, finalCents: 1650, tags: ['demo'] },
  { name: 'Lampara de escritorio articulada', categoryId: 'cat-hogar-decoracion', brand: 'Ejemplo Home', size: '', color: 'Negro', condition: 'like_new', status: 'available', ageDays: 40, purchaseCents: 1800, feesCents: 400, expectedCents: 4200, tags: ['demo'] },
  { name: 'Juego de sartenes antiadherentes', categoryId: 'cat-hogar-menaje', brand: 'Ejemplo Home', size: '3 piezas', color: 'Gris', condition: 'new', status: 'available', ageDays: 25, purchaseCents: 2400, feesCents: 700, expectedCents: 5600, tags: ['demo', 'voluminoso'] },
  { name: 'Juego de sabanas 100% algodon', categoryId: 'cat-hogar-textil', brand: 'Ejemplo Home', size: '150x200', color: 'Crudo', condition: 'good', status: 'to_prepare', ageDays: 10, purchaseCents: 1500, feesCents: 300, expectedCents: 3900, tags: ['demo'] },
  { name: 'Zapatillas de trail mixto', categoryId: 'cat-deporte-calzado-deportivo', brand: 'Ejemplo Run', size: '42', color: 'Rojo', condition: 'used', status: 'available', ageDays: 150, purchaseCents: 2200, feesCents: 500, expectedCents: 4000, tags: ['demo', 'revisar', 'lento'] },
  { name: 'Mancuernas ajustables 2x10 kg', categoryId: 'cat-deporte-equipamiento', brand: 'Ejemplo Fit', size: '20 kg', color: 'Negro', condition: 'good', status: 'sold', ageDays: 90, purchaseCents: 3000, feesCents: 1200, expectedCents: 6800, finalCents: 6500, tags: ['demo', 'pesado'] },
  { name: 'Lote variado de accesorios sin clasificar', categoryId: 'cat-sin-clasificar', brand: '', size: '', color: '', condition: 'used', status: 'to_prepare', ageDays: 3, purchaseCents: 1200, feesCents: 0, expectedCents: 3000, tags: ['demo', 'lote'], note: 'Lote comprado por cajas cerradas; clasificar antes de publicar.' },
  { name: 'Camiseta deportiva tecnica', categoryId: 'cat-ropa-camisetas', brand: 'Ejemplo Sport', size: 'L', color: 'Azul', condition: 'good', status: 'available', ageDays: 65, purchaseCents: 500, feesCents: 100, expectedCents: 1800, tags: ['demo'], note: 'Revisar margen: los gastos de envio se comen buena parte del beneficio.' },
  { name: 'Teclado mecanico compacto', categoryId: 'cat-tecnologia-ordenadores', brand: 'EjemploTech', size: '60%', color: 'Negro', condition: 'like_new', status: 'returned', ageDays: 55, purchaseCents: 4500, feesCents: 700, expectedCents: 8500, finalCents: 8200, tags: ['demo', 'incidencia'], note: 'Devuelto por el comprador: se reviso y vuelve a estar a la venta.' },
  { name: 'Mochila urbana resistente al agua', categoryId: 'cat-ropa-accesorios', brand: 'Ejemplo Gear', size: '25 L', color: 'Gris', condition: 'new', status: 'shipped', ageDays: 35, purchaseCents: 2100, feesCents: 500, expectedCents: 4900, finalCents: 4700, tags: ['demo'] }
]

export function seedDemoData(repos: Repositories): { created: number } {
  const today = new Date()
  let created = 0

  for (const item of DEMO_ITEMS) {
    const purchaseDate = new Date(today.getTime() - item.ageDays * 86_400_000)
    const sold = item.status === 'sold' || item.status === 'shipped'

    repos.products.create(
      {
        name: item.name,
        categoryId: item.categoryId,
        brand: item.brand,
        model: '',
        size: item.size,
        color: item.color,
        condition: item.condition,
        status: item.status,
        purchaseDate: todayIso(purchaseDate),
        purchasePriceCents: item.purchaseCents,
        acquisitionFeesCents: item.feesCents,
        expectedSalePriceCents: item.expectedCents,
        finalSalePriceCents: sold ? (item.finalCents ?? item.expectedCents) : null,
        privateNotes: item.note ?? '',
        description: '',
        tags: item.tags
      },
      { isDemo: true }
    )
    created += 1
  }

  logActivity(repos.db, {
    entity: 'system',
    entityId: null,
    action: 'demo_seeded',
    summary: `Datos de demostracion insertados: ${created} articulos`
  })

  return { created }
}

/**
 * Elimina los datos de demostracion. Se borra directamente porque el flujo
 * normal exige archivar antes de eliminar, y aqui el usuario ha pedido
 * explicitamente deshacerse de los ejemplos.
 */
export function clearDemoData(repos: Repositories): { deleted: number } {
  const before = toNumber(
    repos.db.scalar<number>('SELECT COUNT(*) AS v FROM products WHERE is_demo = 1')
  )
  if (before === 0) return { deleted: 0 }

  repos.db.transaction(() => {
    repos.db.run('DELETE FROM products WHERE is_demo = 1')
    logActivity(repos.db, {
      entity: 'system',
      entityId: null,
      action: 'demo_cleared',
      summary: `Datos de demostracion eliminados: ${before} articulos`
    })
  })

  return { deleted: before }
}

export function countDemoData(repos: Repositories): number {
  return toNumber(repos.db.scalar<number>('SELECT COUNT(*) AS v FROM products WHERE is_demo = 1'))
}
