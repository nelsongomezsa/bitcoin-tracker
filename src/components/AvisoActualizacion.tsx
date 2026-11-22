import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const CADA_MS = 30 * 60 * 1000

/** Detecta una versión nueva de la app y ofrece recargarla. */
export default function AvisoActualizacion() {
  const {
    needRefresh: [hayNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      if (!registro) return
      // Busca versiones nuevas cada 30 minutos y cada vez que la app vuelve a primer plano (en iPhone la PWA casi nunca se recarga sola).
      const buscar = () => { if (navigator.onLine) void registro.update().catch(() => undefined) }
      setInterval(buscar, CADA_MS)
      document.addEventListener('visibilitychange', () => { if (!document.hidden) buscar() })
    },
  })

  const [aplicando, setAplicando] = useState(false)
  if (!hayNueva) return null

  function actualizar() {
    setAplicando(true)
    let recargada = false
    const recargar = () => { if (!recargada) { recargada = true; window.location.reload() } }
    // Recarga en cuanto la versión nueva toma el control; si por lo que sea no llega, recarga igualmente.
    navigator.serviceWorker?.addEventListener('controllerchange', recargar, { once: true })
    void updateServiceWorker(false)
    setTimeout(recargar, 2500)
  }

  return (
    <div className="aviso-update glass" role="alert">
      <span>Hay una versión nueva</span>
      <button className="btn-primary" disabled={aplicando} onClick={actualizar}>{aplicando ? 'Actualizando…' : 'Actualizar'}</button>
    </div>
  )
}
