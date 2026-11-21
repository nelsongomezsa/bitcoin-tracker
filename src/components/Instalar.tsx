import { useState } from 'react'

function instalada(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

/** Pasos para instalar la app en el iPhone. Solo se muestra si no está instalada. */
export default function Instalar() {
  const [abierto, setAbierto] = useState(true)
  if (instalada() || !abierto) return null
  return (
    <section className="card stack" aria-label="Instalar en el iPhone">
      <div className="row between">
        <h2>Instálala en tu iPhone</h2>
        <button className="btn-ghost" aria-label="Cerrar instrucciones" onClick={() => setAbierto(false)}>✕</button>
      </div>
      <ol className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
        <li>Abre esta página en <b>Safari</b>.</li>
        <li>Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
        <li>Elige <b>Añadir a pantalla de inicio</b>.</li>
        <li>Abre la app desde el icono nuevo. Las notificaciones solo se activan desde ahí.</li>
      </ol>
    </section>
  )
}
