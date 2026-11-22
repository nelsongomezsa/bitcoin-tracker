import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../state/data'
import { activarPush, pushSoportado } from '../lib/push'
import { CATALOGO, GENERAL_DEFECTO, SECCIONES, ajuste, general as fusionarGeneral, type DefAviso } from '../shared/avisosCatalogo.mjs'
import type { AjusteAviso, AlertaMedida, EntradaHistorial, GeneralAvisos } from '../lib/tipos'
import { MONEDAS } from '../lib/schemas'
import { mensajeError } from '../lib/errores'
import { horaCorta } from '../lib/format'

const esIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
const instalada = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const BOT = import.meta.env.VITE_TELEGRAM_BOT as string | undefined

/** Campo numérico: se edita en local y se guarda al salir del campo (una escritura por cambio, no por tecla). */
function Numero({ etiqueta, valor, min, max, paso = 1, onGuardar }: { etiqueta: string; valor: number; min: number; max: number; paso?: number; onGuardar: (n: number) => void }) {
  const [txt, setTxt] = useState(String(valor))
  useEffect(() => setTxt(String(valor)), [valor])
  const confirmar = () => {
    const n = Number(txt.replace(',', '.'))
    if (Number.isFinite(n) && n >= min && n <= max) { if (n !== valor) onGuardar(n) } else setTxt(String(valor))
  }
  return (
    <label style={{ maxWidth: 180 }}>{etiqueta}
      <input inputMode="decimal" type="number" min={min} max={max} step={paso} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={confirmar} />
    </label>
  )
}

function codigoAleatorio(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return [...crypto.getRandomValues(new Uint8Array(10))].map((b) => abc[b % abc.length]).join('')
}

export default function Avisos() {
  const d = useDatos()
  const [soporte, setSoporte] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')
  const [codigo, setCodigo] = useState('')
  const [historial, setHistorial] = useState<EntradaHistorial[]>([])
  const [filtro, setFiltro] = useState('todos')
  useEffect(() => { void pushSoportado().then(setSoporte) }, [])
  useEffect(() => d.suscribirHistorial(setHistorial), [d])

  const g: GeneralAvisos = fusionarGeneral(d.avisos.general)
  const ahora = Date.now()
  const pausado = g.pausadoHasta > ahora

  const guardar = (parcial: Partial<typeof d.avisos>) => d.guardarAvisos({ ...d.avisos, ...parcial }).catch((e) => setMsg(mensajeError(e)))
  const cambiarAjuste = (c: string, p: Partial<AjusteAviso>) => guardar({ ajustes: { ...d.avisos.ajustes, [c]: { ...ajuste(d.avisos.ajustes, c), ...p } as AjusteAviso } })
  const cambiarGeneral = (p: Partial<GeneralAvisos>) => guardar({ general: { ...d.avisos.general, ...p } })

  async function activar() {
    setMsg('')
    try {
      const token = await activarPush()
      await guardar({ tokens: [...new Set([...d.avisos.tokens, token])].slice(-10), general: { ...d.avisos.general, zona: d.avisos.general?.zona ?? Intl.DateTimeFormat().resolvedOptions().timeZone } })
      setMsg('Notificaciones activadas en este dispositivo.')
    } catch (e) {
      const c = (e as Error).message
      setMsg(c === 'permiso-denegado' ? 'Has rechazado el permiso. Actívalo en Ajustes del iPhone > Notificaciones.' : c === 'push-no-configurado' ? 'Las notificaciones no están configuradas en este entorno.' : mensajeError(e, 'No se han podido activar las notificaciones.'))
    }
  }

  async function probar() {
    try { await d.pedirPrueba(); setMsg('Aviso de prueba pedido. Puede tardar hasta 15 minutos en llegar.') }
    catch { setMsg('Solo se puede pedir un aviso de prueba cada 5 minutos.') }
  }

  async function conectarTelegram() {
    const c = codigoAleatorio()
    try { await d.crearVinculo(c); setCodigo(c) } catch (e) { setMsg(mensajeError(e)) }
  }

  const pausar = (h: number) => cambiarGeneral({ pausadoHasta: Date.now() + h * 3600e3 })
  const nuevaAlerta = (): AlertaMedida => ({ id: codigoAleatorio().slice(0, 8).toLowerCase(), dir: 'abajo', precio: 0, moneda: g.moneda, repetir: false })
  const alertas = d.avisos.alertas ?? []
  const setAlertas = (a: AlertaMedida[]) => guardar({ alertas: a })

  const tipos = useMemo(() => ['todos', ...new Set(historial.map((h) => h.tipo))], [historial])
  const lista = historial.filter((h) => filtro === 'todos' || h.tipo === filtro)
  const leidoHasta = d.avisos.historialLeidoHasta?.getTime() ?? 0
  const sinLeer = historial.filter((h) => h.t.getTime() > leidoHasta).length

  const tarjeta = (def: DefAviso) => {
    const a = ajuste(d.avisos.ajustes, def.clave) as AjusteAviso
    const id = `aviso-${def.clave}`
    const canales = a.canales ?? ['push', 'telegram']
    return (
      <li key={def.clave} className="card stack">
        <label htmlFor={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, color: 'var(--text)', fontSize: 15 }}>
          <input id={id} type="checkbox" checked={a.activo} onChange={(e) => void cambiarAjuste(def.clave, { activo: e.target.checked })} />
          {def.titulo}
        </label>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{def.desc}</p>
        {a.activo && (
          <div className="stack">
            {def.umbral && <Numero etiqueta={def.umbral.etiqueta} valor={Number(a.umbral ?? def.defecto.umbral)} min={def.umbral.min} max={def.umbral.max} paso={def.umbral.paso} onGuardar={(n) => void cambiarAjuste(def.clave, { umbral: n })} />}
            {def.campos?.map((c) => c.tipo === 'numero' ? (
              <Numero key={c.nombre} etiqueta={c.etiqueta} valor={Number(a[c.nombre] ?? def.defecto[c.nombre])} min={c.min ?? 0} max={c.max ?? 1e9} onGuardar={(n) => void cambiarAjuste(def.clave, { [c.nombre]: n })} />
            ) : (
              <label key={c.nombre} style={{ maxWidth: 220 }}>{c.etiqueta}
                <select value={String(a[c.nombre] ?? def.defecto[c.nombre])} onChange={(e) => void cambiarAjuste(def.clave, { [c.nombre]: typeof c.opciones?.[0][0] === 'number' ? Number(e.target.value) : e.target.value })}>
                  {c.opciones?.map(([v, t]) => <option key={String(v)} value={String(v)}>{t}</option>)}
                </select>
              </label>
            ))}
            {!def.soloApp && (
              <div className="row wrap">
                <label style={{ maxWidth: 160 }}>Prioridad
                  <select value={a.prioridad ?? 'normal'} onChange={(e) => void cambiarAjuste(def.clave, { prioridad: e.target.value as 'normal' | 'urgente' })}>
                    <option value="normal">Normal</option><option value="urgente">Urgente (salta el silencio)</option>
                  </select>
                </label>
                {(['push', 'telegram'] as const).map((c) => (
                  <label key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
                    <input type="checkbox" checked={canales.includes(c)} onChange={(e) => void cambiarAjuste(def.clave, { canales: e.target.checked ? [...new Set([...canales, c])] : canales.filter((x) => x !== c) })} />
                    {c === 'push' ? 'Notificación' : 'Telegram'}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <main className="app stack">
      <header className="row between wrap">
        <h1>Avisos</h1>
        {pausado ? <button onClick={() => void cambiarGeneral({ pausadoHasta: 0 })}>Reanudar</button> : null}
      </header>

      <section className="card stack" aria-label="Pausa">
        {pausado ? (
          <p className="warn" role="status">Avisos en pausa hasta las {horaCorta(new Date(g.pausadoHasta))}. No se enviará nada.</p>
        ) : (
          <>
            <h2>Pausar todo</h2>
            <div className="row wrap">
              {([['1 hora', 1], ['8 horas', 8], ['1 día', 24], ['1 semana', 168]] as const).map(([t, h]) => <button key={t} onClick={() => void pausar(h)}>{t}</button>)}
            </div>
          </>
        )}
      </section>

      <section className="card stack" aria-label="Canales">
        <h2>Canales</h2>
        {d.demo && <p className="muted">En el modo demo no se envían avisos reales.</p>}
        {esIos && !instalada() && <p className="warn" role="status">En iPhone, primero instala la app («Compartir» → «Añadir a pantalla de inicio») y ábrela desde el icono. El permiso solo se puede pedir desde ahí.</p>}
        {soporte === false && !d.demo && <p className="muted">Este navegador no admite notificaciones push.</p>}
        <p className="notice">El permiso se pide al pulsar el botón, nunca de forma automática.</p>
        <button className="btn-primary" disabled={d.demo || soporte !== true || (esIos && !instalada())} onClick={() => void activar()}>
          {d.avisos.tokens.length ? 'Reactivar en este dispositivo' : 'Activar notificaciones'}
        </button>
        {d.avisos.tokens.length > 0 && <p className="gain">▲ {d.avisos.tokens.length} dispositivo(s) con notificaciones</p>}

        <h3>Telegram (opcional)</h3>
        {d.telegramVinculado ? (
          <div className="row wrap"><span className="gain">▲ Telegram conectado</span>
            <button className="btn-danger" onClick={() => void guardar({ telegram: { desconectar: true } })}>Desconectar Telegram</button></div>
        ) : (
          <div className="stack">
            {codigo ? (
              <p>Abre el bot {BOT ? <b>@{BOT}</b> : 'de Telegram'} y envíale <b className="num">/start {codigo}</b>. El código vale 15 minutos y puede tardar hasta 15 minutos en confirmarse.</p>
            ) : <p className="muted">Recibe los mismos avisos en un chat de Telegram. Sin enviar nunca datos a chats sin vincular.</p>}
            <button disabled={d.demo} onClick={() => void conectarTelegram()}>{codigo ? 'Generar otro código' : 'Conectar Telegram'}</button>
          </div>
        )}
        <button disabled={d.demo} onClick={() => void probar()}>Enviar aviso de prueba</button>
        <p className="notice">El aviso de prueba lo envía el servidor en su siguiente pasada: puede tardar hasta 15 minutos.</p>
        {msg && <p role="status" className="notice">{msg}</p>}
      </section>

      <section className="card stack" aria-label="Ajustes generales">
        <h2>Ajustes generales</h2>
        <div className="grid2">
          <label>Moneda de los avisos
            <select value={g.moneda} onChange={(e) => void cambiarGeneral({ moneda: e.target.value as GeneralAvisos['moneda'] })}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          <Numero etiqueta="Hora de los resúmenes (0-23)" valor={g.horaResumen} min={0} max={23} onGuardar={(n) => void cambiarGeneral({ horaResumen: n })} />
          <Numero etiqueta="Máximo de avisos al día" valor={g.limiteDiario} min={1} max={100} onGuardar={(n) => void cambiarGeneral({ limiteDiario: n })} />
        </div>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
          <input type="checkbox" checked={g.silencioActivo} onChange={(e) => void cambiarGeneral({ silencioActivo: e.target.checked, zona: d.avisos.general?.zona ?? Intl.DateTimeFormat().resolvedOptions().timeZone })} />
          Horas de silencio
        </label>
        {g.silencioActivo && (
          <div className="grid2">
            <Numero etiqueta="Desde (hora)" valor={g.silencioDesde} min={0} max={23} onGuardar={(n) => void cambiarGeneral({ silencioDesde: n })} />
            <Numero etiqueta="Hasta (hora)" valor={g.silencioHasta} min={0} max={23} onGuardar={(n) => void cambiarGeneral({ silencioHasta: n })} />
            <p className="notice" style={{ gridColumn: '1 / -1' }}>Zona horaria: {g.zona === GENERAL_DEFECTO.zona && !d.avisos.general?.zona ? Intl.DateTimeFormat().resolvedOptions().timeZone : g.zona}. Lo que llegue en ese tramo se junta y se manda en un solo resumen al terminar. Los avisos urgentes saltan siempre.</p>
          </div>
        )}
      </section>

      <section className="card stack" aria-label="Alertas a medida">
        <h2>Mis alertas de precio</h2>
        <p className="muted">«BTC por debajo o por encima de X». Máximo 20.</p>
        {alertas.map((al, i) => (
          <div key={al.id} className="row wrap" style={{ alignItems: 'flex-end' }}>
            <label>Cuando BTC esté
              <select value={al.dir} onChange={(e) => void setAlertas(alertas.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'abajo' | 'arriba' } : x)))}><option value="abajo">por debajo de</option><option value="arriba">por encima de</option></select>
            </label>
            <Numero etiqueta="Precio" valor={al.precio} min={1} max={99999999} onGuardar={(n) => void setAlertas(alertas.map((x, j) => (j === i ? { ...x, precio: n } : x)))} />
            <label>Moneda
              <select value={al.moneda} onChange={(e) => void setAlertas(alertas.map((x, j) => (j === i ? { ...x, moneda: e.target.value as AlertaMedida['moneda'] } : x)))}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
              <input type="checkbox" checked={al.repetir} onChange={(e) => void setAlertas(alertas.map((x, j) => (j === i ? { ...x, repetir: e.target.checked } : x)))} /> Repetir (cada 6 h)
            </label>
            <button className="btn-danger" aria-label="Borrar alerta" onClick={() => void setAlertas(alertas.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button disabled={alertas.length >= 20} onClick={() => void setAlertas([...alertas, { ...nuevaAlerta(), precio: Math.round(d.mercado?.precios[g.moneda] ?? 50000) }])}>Añadir alerta</button>
      </section>

      {SECCIONES.map(([clave, titulo]) => {
        const items = CATALOGO.filter((a) => a.seccion === clave)
        if (!items.length) return null
        return (
          <section key={clave} className="stack" aria-label={titulo}>
            <h2>{titulo}</h2>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{items.map(tarjeta)}</ul>
          </section>
        )
      })}

      <section className="card stack" aria-label="Historial">
        <div className="row between wrap">
          <h2>Historial {sinLeer > 0 && <span className="pill warn">{sinLeer} sin leer</span>}</h2>
          <button disabled={!sinLeer} onClick={() => void guardar({ historialLeidoHasta: new Date() })}>Marcar todo como leído</button>
        </div>
        <label style={{ maxWidth: 220 }}>Filtrar por tipo
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>{tipos.map((t) => <option key={t} value={t}>{t === 'todos' ? 'Todos' : t}</option>)}</select>
        </label>
        {lista.length === 0 ? <p className="muted">Aún no has recibido avisos (se guardan 30 días).</p> : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {lista.map((h) => (
              <li key={h.id}>
                <b>{h.t.getTime() > leidoHasta ? '● ' : ''}{h.titulo}</b> <span className="muted num" style={{ fontSize: 12 }}>{horaCorta(h.t)}</span>
                <div className="muted" style={{ fontSize: 13 }}>{h.texto}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="notice" role="note">Los avisos son información sobre el mercado y sobre tus datos. No son recomendaciones de inversión ni asesoramiento financiero. Pueden retrasarse unos minutos (los avisos del servidor se evalúan cada 15 minutos).</p>
    </main>
  )
}
