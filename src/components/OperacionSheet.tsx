import { useMemo, useState, type FormEvent } from 'react'
import Sheet from './Sheet'
import { btcDeCompra, btcDeVenta, calcularFifo, normalizar, resumen, VentaExcedidaError, type Moneda, type Operacion } from '../lib/calculos'
import { MONEDAS, operacionSchema } from '../lib/schemas'
import { btc as fBtc, dinero, hoyISO, porcentaje } from '../lib/format'
import { UMBRAL_COMISION_ALTA } from '../config/irpf'
import { mensajeError } from '../lib/errores'
import { useVista } from '../state/vista'

interface Props {
  tipo: 'compra' | 'venta'
  /** Operación a editar, o plantilla (p. ej. al duplicar) si `plantilla` es true. */
  inicial?: Operacion
  plantilla?: boolean
  onCerrar: () => void
}

const aNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))

export default function OperacionSheet({ tipo, inicial, plantilla, onCerrar }: Props) {
  const v = useVista()
  const editando = inicial && !plantilla ? inicial.id : undefined
  // Para la vista previa se parte de las operaciones originales sin la que se edita.
  const base = useMemo(() => v.operaciones.filter((o) => o.id !== editando), [v.operaciones, editando])
  const [f, setF] = useState({
    fecha: inicial?.fecha ?? hoyISO(),
    cantidad: inicial ? String(inicial.cantidad) : '',
    comision: inicial ? String(inicial.comision) : '0',
    precio: inicial ? String(inicial.precio) : '',
    moneda: (inicial?.moneda ?? v.moneda) as Moneda,
    plataforma: inicial?.plataforma ?? '',
    nota: inicial?.nota ?? '',
  })
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))

  const cantidad = aNum(f.cantidad), comision = aNum(f.comision), precio = aNum(f.precio)
  const valido = cantidad > 0 && comision >= 0 && comision < cantidad && precio > 0

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
      const r = resumen(conv, precios ? precios[f.moneda] : precio)
      const venta = tipo === 'venta' ? calcularFifo(conv).ventas.find((x) => x.id === 'nueva') : undefined
      return { pctCom, btcOp, disp, medio: r.precioMedioReal, venta, excede: false }
    } catch (e) {
      if (e instanceof VentaExcedidaError) return { pctCom, btcOp, disp: e.disponible, medio: 0, venta: undefined, excede: true }
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
        <div className="grid2">
          <label>Fecha<input type="date" value={f.fecha} max={hoyISO()} onChange={set('fecha')} required /></label>
          <label>Moneda
            <select value={f.moneda} onChange={set('moneda')}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          <label>{tipo === 'compra' ? 'Cantidad metida' : 'Cantidad recibida'}
            <input inputMode="decimal" value={f.cantidad} onChange={set('cantidad')} placeholder="0,00" required />
          </label>
          <label>Comisión
            <input inputMode="decimal" value={f.comision} onChange={set('comision')} placeholder="0,00" />
          </label>
        </div>
        <label>Precio de 1 BTC
          <div className="row">
            <input inputMode="decimal" value={f.precio} onChange={set('precio')} placeholder="0" required />
            <button type="button" onClick={usarPrecioActual} disabled={!v.precios} style={{ whiteSpace: 'nowrap' }}>Usar precio actual</button>
          </div>
        </label>
        <label>Plataforma (opcional)<input value={f.plataforma} maxLength={60} onChange={set('plataforma')} /></label>
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
              Comisión: {porcentaje(preview.pctCom)}{preview.pctCom > UMBRAL_COMISION_ALTA ? ' · alta (más del 3 %)' : ''}
            </p>
            {!preview.excede && preview.medio > 0 && <p className="num">Precio medio tras guardar: {dinero(preview.medio, f.moneda)}</p>}
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

