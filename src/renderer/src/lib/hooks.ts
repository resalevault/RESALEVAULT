/**
 * RESALEVAULT - Hooks de datos.
 *
 * Un cargador asincrono minimo, suficiente para esta aplicacion: no hay
 * mutaciones optimistas ni cache compartida que justifiquen una libreria.
 * `dataVersion` del contexto actua como invalidacion global.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: unknown
  reload: () => void
}

export function useAsyncData<T>(loader: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [nonce, setNonce] = useState(0)

  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    loaderRef.current().then(
      (result) => {
        if (cancelled) return
        setData(result)
        setError(null)
        setLoading(false)
      },
      (failure: unknown) => {
        if (cancelled) return
        setData(null)
        setError(failure)
        setLoading(false)
      }
    )

    return () => {
      cancelled = true
    }
    // El numero de dependencias varia por diseno: el llamador decide que
    // cambios deben provocar una recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return { data, loading, error, reload }
}

/**
 * Retrasa un valor. Se usa en el buscador global para no consultar la base de
 * datos en cada pulsacion de tecla.
 */
export function useDebounced<T>(value: T, delayMs = 220): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(handle)
  }, [value, delayMs])
  return debounced
}
