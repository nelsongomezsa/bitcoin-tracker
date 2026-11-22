import { useEffect, useRef, useState } from 'react'

/** Tirar para refrescar en la parte superior de la página. Devuelve la distancia tirada y si está refrescando. */
export function useTirarRefrescar(onRefrescar: () => Promise<void>) {
  const [dist, setDist] = useState(0)
  const [refrescando, setRefrescando] = useState(false)
  const inicio = useRef<number | null>(null)
  const distRef = useRef(0)
  const cb = useRef(onRefrescar)
  cb.current = onRefrescar

  useEffect(() => {
    const down = (e: TouchEvent) => { inicio.current = window.scrollY <= 0 ? e.touches[0].clientY : null }
    const move = (e: TouchEvent) => {
      if (inicio.current == null) return
      const d = e.touches[0].clientY - inicio.current
      if (d > 0) { distRef.current = Math.min(d * 0.5, 80); setDist(distRef.current) }
    }
    const up = async () => {
      if (inicio.current == null) return
      inicio.current = null
      const hecho = distRef.current >= 60
      distRef.current = 0
      setDist(0)
      if (hecho) {
        setRefrescando(true)
        try { await cb.current() } finally { setRefrescando(false) }
      }
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', up)
    return () => { window.removeEventListener('touchstart', down); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up) }
  }, [])
  return { dist, refrescando }
}
