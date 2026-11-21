import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { bloqueoActivo, desbloquear } from '../lib/bloqueo'

const REBLOQUEO_MS = 60_000

/** Si el usuario activó Face ID, pide desbloquear antes de enseñar nada. */
export default function Bloqueo({ children }: { children: ReactNode }) {
  const [bloqueada, setBloqueada] = useState(bloqueoActivo())
  const oculta = useRef<number | null>(null)

  const intentar = useCallback(async () => {
    if (await desbloquear()) setBloqueada(false)
  }, [])

  useEffect(() => {
    if (bloqueada) void intentar()
  }, [bloqueada, intentar])

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) oculta.current = Date.now()
      else if (oculta.current && Date.now() - oculta.current > REBLOQUEO_MS && bloqueoActivo()) setBloqueada(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  if (!bloqueada) return <>{children}</>
  return (
    <main className="app stack" style={{ minHeight: '100vh', justifyContent: 'center', textAlign: 'center' }}>
      <h1>Bitcoin Tracker</h1>
      <p className="muted">Desbloquea con Face ID o tu huella para continuar.</p>
      <button className="btn-primary" onClick={() => void intentar()}>Desbloquear</button>
    </main>
  )
}
