/**
 * RESALEVAULT - Distintivo de transportista.
 *
 * Decision deliberada: NO se usan logotipos oficiales. Son marcas registradas y
 * no hay autorizacion de uso; ademas, las imagenes remotas se rompen y las
 * inventadas confunden. Se genera un distintivo propio con las iniciales y un
 * color estable derivado del identificador: el mismo transportista siempre tiene
 * el mismo color, sin mantener ninguna lista.
 */

import type { ReactNode } from 'react'
import type { Carrier } from '@shared/types-tracking'
import { toneForCode } from './ui'

function initialsFor(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter((word) => word.length > 0)

  if (words.length === 0) return '??'
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase()
  return ((words[0] as string)[0] ?? '').concat((words[1] as string)[0] ?? '').toUpperCase()
}

export function CarrierBadge({
  carrier,
  size = 34
}: {
  carrier: Pick<Carrier, 'id' | 'name'>
  size?: number
}): ReactNode {
  const tone = toneForCode(carrier.id)
  return (
    <span
      className="carrier-badge"
      style={{
        width: size,
        height: size,
        background: tone,
        fontSize: Math.round(size * 0.38)
      }}
      title={carrier.name}
      aria-hidden="true"
    >
      {initialsFor(carrier.name)}
    </span>
  )
}

export { initialsFor }
