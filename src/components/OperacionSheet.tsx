import { useMemo, useState, type FormEvent } from 'react'
import Sheet from './Sheet'
import { btcDeCompra, btcDeVenta, calcularFifo, normalizar, resumen, VentaExcedidaError, type Moneda, type Operacion } from '../lib/calculos'
import { MONEDAS, operacionSchema } from '../lib/schemas'
import { btc as fBtc, dinero, hoyISO, porcentaje } from '../lib/format'
import { UMBRAL_COMISION_ALTA } from '../config/irpf'
import { mensajeError } from '../lib/errores'
import { comisionHabitualPct, PLATAFORMAS, recordarPlataforma, ultimaPlataforma } from '../lib/plataformas'
import { useVista } from '../state/vista'

interface Props {
  tipo: 'compra' | 'venta'
  /** Operación a editar, o plantilla (p. ej. al duplicar) si `plantilla` es true. */
  inicial?: Operacion
  plantilla?: boolean
  onCerrar: () => void
}

const aNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))
const redondear = (n: number, d = 2) => String(Math.round(n * 10 ** d) / 10 ** d)

export default function OperacionSheet({ tipo: tipoInicial, inicial, plantilla, onCerrar }: Props) {
  const v = useVista()
  const editando = inicial && !plantilla ? inicial.id : undefined
  const [tipo, setTipo] = useState<'compra' | 'venta'>(tipoInicial)
  // Para la vista previa se parte de las operaciones originales sin la que se edita.
  const base = useMemo(() => v.operaciones.filter((o) => o.id !== editando), [v.operaciones, editando])
  const plataformaInicial = inicial ? (inicial.plataforma ?? '') : ultimaPlataforma()
  const [f, setF] = useState({
    fecha: inicial?.fecha ?? hoyISO(),
    cantidad: inicial ? String(inicial.cantidad) : '',
    comision: inicial ? String(inicial.comision) : '0',
    precio: inicial ? String(inicial.precio) : '',
    moneda: (inicial?.moneda ?? v.moneda) as Moneda,
    plataforma: plataformaInicial,
    nota: inicial?.nota ?? '',
  })
  const [modoCom, setModoCom] = useState<'eur' | 'pct'>('eur')
  const [otra, setOtra] = useState(Boolean(plataformaInicial) && !(PLATAFORMAS as readonly string[]).includes(plataformaInicial))
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))

  const cantidad = aNum(f.cantidad), precio = aNum(f.precio)
  const comInput = aNum(f.comision)
  // Internamente la comisión se guarda siempre en la moneda de la operación (no en %).
  const comision = modoCom === 'eur' ? comInput : (cantidad * comInput) / 100
  const valido = cantidad > 0 && comision >= 0 && comision < cantidad && precio > 0
  const simbolo = f.moneda === 'EUR' ? '€' : f.moneda === 'USD' ? '$' : 'A$'

  const habitual = f.plataforma ? comisionHabitualPct(v.operaciones.filter((o) => o.moneda === f.moneda), f.plataforma) : null

  function elegirPlataforma(p: string) {
    setOtra(false)
    setF((s) => ({ ...s, plataforma: s.plataforma === p ? '' : p }))
    const h = p ? comisionHabitualPct(v.operaciones.filter((o) => o.moneda === f.moneda), p) : null
    // Propone la comisión habitual solo si todavía no has escrito ninguna.
    if (h != null && f.plataforma !== p && (f.comision === '' || f.comision === '0')) {
      setF((s) => ({ ...s, plataforma: p, comision: modoCom === 'pct' ? redondear(h * 100) : cantidad > 0 ? redondear(h * cantidad) : '0' }))
    }
  }
  function cambiarModo(m: 'eur' | 'pct') {
    if (m === modoCom) return
    if (cantidad > 0 && Number.isFinite(comInput)) {
      setF((s) => ({ ...s, comision: m === 'pct' ? redondear((comInput / cantidad) * 100, 3) : redondear((comInput * cantidad) / 100) }))
    }
    setModoCom(m)
  }

  const preview = useMemo(() => {
    if (!valido) return null
    const nueva: Operacion = { id: 'nueva', tipo, fecha: f.fecha, cantidad, comision, precio, moneda: f.moneda }
    const pctCom = comision / cantidad
    const btcOp = tipo === 'compra' ? btcDeCompra(nueva) : btcDeVenta(nueva)
    const precios = v.precios
    try {
      const todas = [...base, nueva]
      const disp = calcularFifo(base).lotes.reduce((s, l) => s + l.btc, 0)
      const conv = precios ? normalizar(todas, f.moneda, precios) : todas
      const pRef = precios ? precios[f.moneda] : precio
      const r = resumen(conv, pRef)
      const antes = resumen(precios ? normalizar(base, f.moneda, precios) : base, pRef)
      const venta = tipo === 'venta' ? calcularFifo(conv).ventas.find((x) => x.id === 'nueva') : undefined
      return { pctCom, btcOp, disp, medio: r.precioMedioReal, medioAntes: antes.precioMedioReal, venta, excede: false }
    } catch (e) {
      if (e instanceof VentaExcedidaError) return { pctCom, btcOp, disp: e.disponible, medio: 0, medioAntes: 0, venta: undefined, excede: true }
      return null
    }
  }, [valido, f.fecha, f.moneda, cantidad, comision, precio, tipo, base, v.precios])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    const r = operacionSchema.safeParse({
      tipo, fecha: f.fecha, cantidad, comision, precio, moneda: f.moneda,
      plataforma: f.plataforma || undefined, nota: f.nota || undefined,
    })
    if (!r.success) return setError(r.error.issues[0].message)
    if (preview?.excede) return setError('No puedes vender más BTC del que tienes.')
    setOcupado(true)
    try {
      await v.guardarOperacion(r.data, editando)
      if (f.plataforma) recordarPlataforma(f.plataforma)
      onCerrar()
    } catch (err) {
      setError(mensajeError(err, 'No se ha podido guardar. Inténtalo de nuevo.'))
    } finally {
      setOcupado(false)
    }
  }

  const usarPrecioActual = () => {
    if (v.precios) setF((s) => ({ ...s, precio: String(Math.round(v.precios![s.moneda])) }))
  }
  const titulo = editando ? (tipo === 'compra' ? 'Editar compra' : 'Editar venta') : tipo === 'compra' ? 'Añadir compra' : 'Retirar / vender'

  return (
    <Sheet titulo={titulo} onCerrar={onCerrar}>
      <form className="stack" onSubmit={enviar} noValidate>
        {!editando && (
          <div className="seg" role="group" aria-label="Tipo de operación" style={{ alignSelf: 'flex-start' }}>
            <button type="button" aria-pressed={tipo === 'compra'} onClick={() => setTipo('compra')}>Comprar</button>
            <button type="button" aria-pressed={tipo === 'venta'} onClick={() => setTipo('venta')}>Vender</button>
          </div>
        )}
        <div className="grid2">
          <label>{tipo === 'compra' ? 'Cantidad metida' : 'Cantidad recibida'}
            <input inputMode="decimal" value={f.cantidad} onChange={set('cantidad')} placeholder="0,00" required />
          </label>
          <label>Fecha<input type="date" value={f.fecha} max={hoyISO()} onChange={set('fecha')} required /></label>
          <label>
            <span className="row between">
              <span>Comisión ({modoCom === 'eur' ? simbolo : '%'})</span>
              <span className="seg" role="group" aria-label="Unidad de la comisión" style={{ transform: 'scale(0.85)', transformOrigin: 'right center' }}>
                <button type="button" aria-pressed={modoCom === 'eur'} onClick={() => cambiarModo('eur')} style={{ minHeight: 28 }}>{simbolo}</button>
                <button type="button" aria-pressed={modoCom === 'pct'} onClick={() => cambiarModo('pct')} style={{ minHeight: 28 }}>%</button>
              </span>
            </span>
            <input inputMode="decimal" value={f.comision} onChange={set('comision')} placeholder="0,00" />
          </label>
          <label>Moneda
            <select value={f.moneda} onChange={set('moneda')}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
        </div>
        <label>Precio de 1 BTC
          <div className="row">
            <input inputMode="decimal" value={f.precio} onChange={set('precio')} placeholder="0" required />
            <button type="button" onClick={usarPrecioActual} disabled={!v.precios} style={{ whiteSpace: 'nowrap' }}>Usar precio actual</button>
          </div>
        </label>

        <div className="stack" style={{ gap: 8 }} role="group" aria-label="Plataforma">
          <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>{tipo === 'compra' ? 'Dónde la has comprado' : 'Dónde la has vendido'}</span>
          <div className="chips">
            {PLATAFORMAS.map((p) => (
              <button key={p} type="button" className="opt" aria-pressed={!otra && f.plataforma === p} onClick={() => elegirPlataforma(p)}>{p}</button>
            ))}
            <button type="button" className="opt" aria-pressed={otra} onClick={() => { setOtra(true); setF((s) => ({ ...s, plataforma: (PLATAFORMAS as readonly string[]).includes(s.plataforma) ? '' : s.plataforma })) }}>Otra…</button>
          </div>
          {otra && <input aria-label="Nombre de la plataforma" maxLength={40} value={f.plataforma} onChange={set('plataforma')} placeholder="Nombre (máx. 40 caracteres)" />}
          {habitual != null && <p className="notice">Comisión habitual en {f.plataforma}: {porcentaje(habitual)} (media de tus últimas compras).</p>}
        </div>

        <label>Nota (opcional, máx. 200)<input value={f.nota} maxLength={200} onChange={set('nota')} /></label>

        {preview && (
          <div className="card stack" aria-live="polite">
            <h3>Vista previa</h3>
            {tipo === 'compra' ? (
              <p className="num">Recibes {fBtc(preview.btcOp)}</p>
            ) : (
              <>
                <p className="num">Vendes {fBtc(preview.btcOp)} · disponible {fBtc(preview.disp)}</p>
                {preview.venta && (
                  <p className={`num ${preview.venta.ganancia >= 0 ? 'gain' : 'loss'}`}>
                    Ganancia FIFO: {preview.venta.ganancia >= 0 ? '▲ +' : '▼ −'}{dinero(Math.abs(preview.venta.ganancia), f.moneda)}
                  </p>
                )}
                {preview.excede && <p className="err" role="alert">No puedes vender más BTC del que tienes.</p>}
              </>
            )}
            <p className={`num ${preview.pctCom > UMBRAL_COMISION_ALTA ? 'warn' : ''}`}>
              Comisión: {dinero(comision, f.moneda)} · {porcentaje(preview.pctCom)}{f.plataforma ? ` (${f.plataforma})` : ''}
              {preview.pctCom > UMBRAL_COMISION_ALTA && v.avisos.ajustes.comisionAlta?.activo !== false ? ' · alta (más del 3 %)' : ''}
            </p>
            {!preview.excede && preview.medio > 0 && (
              <p className="num">Tu precio medio {preview.medioAntes > 0 ? `${dinero(preview.medioAntes, f.moneda, 0)} → ` : ''}{dinero(preview.medio, f.moneda, 0)}</p>
            )}
          </div>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <div className="row">
          <button type="button" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={ocupado || Boolean(preview?.excede)} type="submit">Guardar</button>
        </div>
      </form>
    </Sheet>
  )
}
