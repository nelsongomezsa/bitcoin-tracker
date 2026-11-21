import { useEffect, useState } from 'react'
import { useDatos } from '../state/data'
import { activarPush, pushSoportado } from '../lib/push'
import type { AjusteAviso, ClaveAviso } from '../lib/tipos'
import { mensajeError } from '../lib/errores'

interface Def { clave: ClaveAviso; titulo: string; desc: string; umbral?: { etiqueta: string; defecto: number }; push: boolean }

const AVISOS: Def[] = [
  { clave: 'nivelClave', titulo: 'BTC toca un nivel clave', desc: 'Cuando el precio baja hasta uno de tus niveles pendientes.', push: true },
  { clave: 'rentable', titulo: 'Rentable o no rentable', desc: 'Cuando el precio cruza tu precio medio, hacia arriba o hacia abajo.', push: true },
  { clave: 'variacion24h', titulo: 'Variación en 24 horas', desc: 'Caída o subida mayor que el umbral.', umbral: { etiqueta: 'Umbral (%)', defecto: 5 }, push: true },
  { clave: 'variacion7d', titulo: 'Variación en 7 días', desc: 'Caída o subida mayor que el umbral.', umbral: { etiqueta: 'Umbral (%)', defecto: 10 }, push: true },
  { clave: 'dcaSemanal', titulo: 'Recordatorio semanal del DCA', desc: 'Los lunes, para tu compra programada.', push: true },
  { clave: 'miedoExtremo', titulo: 'Miedo extremo', desc: 'Cuando el índice de miedo y codicia baja del umbral.', umbral: { etiqueta: 'Índice máximo', defecto: 20 }, push: true },
  { clave: 'comisionAlta', titulo: 'Comisión alta al guardar', desc: 'Aviso dentro de la app si una compra paga más del 3 % de comisión.', push: false },
  { clave: 'precioObjetivo', titulo: 'Precio de venta objetivo', desc: 'Cuando BTC alcanza el precio de venta que fijaste en tus objetivos.', push: true },
  { clave: 'resumenMensual', titulo: 'Resumen mensual', desc: 'El día 1: lo metido, tu precio medio y tu rentabilidad.', push: true },
  { clave: 'copiaSeguridad', titulo: 'Copia de seguridad mensual', desc: 'El día 1, un recordatorio para exportar tus datos.', push: true },
]

const esIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
const instalada = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export default function Avisos() {
  const d = useDatos()
  const [soporte, setSoporte] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { void pushSoportado().then(setSoporte) }, [])

  const ajuste = (c: ClaveAviso): AjusteAviso => d.avisos.ajustes[c] ?? { activo: c === 'comisionAlta' }
  const cambiar = (c: ClaveAviso, parcial: Partial<AjusteAviso>) =>
    d.guardarAvisos({ ...d.avisos, ajustes: { ...d.avisos.ajustes, [c]: { ...ajuste(c), ...parcial } } }).catch((e) => setMsg(mensajeError(e)))

  async function activar() {
    setMsg('')
    try {
      const token = await activarPush()
      const tokens = [...new Set([...d.avisos.tokens, token])].slice(-10)
      await d.guardarAvisos({ ...d.avisos, tokens })
      setMsg('Notificaciones activadas en este dispositivo.')
    } catch (e) {
      const c = (e as Error).message
      setMsg(c === 'permiso-denegado' ? 'Has rechazado el permiso. Actívalo en Ajustes del iPhone > Notificaciones.' : c === 'push-no-configurado' ? 'Las notificaciones no están configuradas en este entorno.' : mensajeError(e, 'No se han podido activar las notificaciones.'))
    }
  }

  return (
    <main className="app stack">
      <h1>Avisos</h1>

      <section className="card stack" aria-label="Notificaciones">
        <h2>Notificaciones push</h2>
        {d.demo && <p className="muted">En el modo demo no se envían notificaciones reales.</p>}
        {esIos && !instalada() && <p className="warn" role="status">En iPhone, primero instala la app («Compartir» → «Añadir a pantalla de inicio») y ábrela desde el icono. El permiso solo se puede pedir desde ahí.</p>}
        {soporte === false && !d.demo && <p className="muted">Este navegador no admite notificaciones push.</p>}
        <p className="notice">El permiso se pide al pulsar el botón, nunca de forma automática.</p>
        <button className="btn-primary" disabled={d.demo || soporte !== true || (esIos && !instalada())} onClick={() => void activar()}>
          {d.avisos.tokens.length ? 'Reactivar en este dispositivo' : 'Activar notificaciones'}
        </button>
        {d.avisos.tokens.length > 0 && <p className="gain">▲ {d.avisos.tokens.length} dispositivo(s) registrado(s)</p>}
        {msg && <p role="status" className="notice">{msg}</p>}
      </section>

      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {AVISOS.map((a) => {
          const aj = ajuste(a.clave)
          const id = `aviso-${a.clave}`
          return (
            <li key={a.clave} className="card stack">
              <div className="row between">
                <label htmlFor={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, color: 'var(--text)', fontSize: 15 }}>
                  <input id={id} type="checkbox" checked={aj.activo} onChange={(e) => void cambiar(a.clave, { activo: e.target.checked })} />
                  {a.titulo}
                </label>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{a.desc}{!a.push && ' (no es un push)'}</p>
              {a.umbral && aj.activo && (
                <label style={{ maxWidth: 160 }}>{a.umbral.etiqueta}
                  <input type="number" inputMode="decimal" min={0} max={100} value={aj.umbral ?? a.umbral.defecto} onChange={(e) => { const n = Number(e.target.value); if (n >= 0 && n <= 100) void cambiar(a.clave, { umbral: n }) }} />
                </label>
              )}
            </li>
          )
        })}
      </ul>

      <p className="notice" role="note">Los avisos son información sobre el mercado y sobre tus datos. No son recomendaciones de inversión ni asesoramiento financiero. Las notificaciones pueden retrasarse unos minutos.</p>
    </main>
  )
}
