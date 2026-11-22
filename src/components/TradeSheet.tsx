import { useMemo, useState, type FormEvent } from 'react'
import Sheet from './Sheet'
import { calcularTrade, pasoAPaso, type Direccion, type Trade } from '../lib/trading'
import { MONEDAS, tradeSchema } from '../lib/schemas'
import { btcConSigno, hoyISO, porcentajeConSigno } from '../lib/format'
import { mensajeError } from '../lib/errores'
import { PLATAFORMAS, recordarPlataforma, ultimaPlataforma } from '../lib/plataformas'
import { useVista } from '../state/vista'
import type { Moneda } from '../lib/calculos'

interface Props {
  /** Trade a editar, o plantilla (al duplicar) si `plantilla` es true. */
  inicial?: Trade
  plantilla?: boolean
  onCerrar: () => void
}

const aNum = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')))
const PILDORAS = [1, 2, 3, 5, 10]

export default function TradeSheet({ inicial, plantilla, onCerrar }: Props) {
  const v = useVista()
  const editando = inicial && !plantilla ? inicial.id : undefined
  const [f, setF] = useState({
    estado: (inicial?.estado ?? 'cerrado') as 'abierto' | 'cerrado',
    direccion: (inicial?.direccion ?? 'largo') as Direccion,
    fechaInicio: inicial?.fechaInicio ?? hoyISO(),
    fechaCierre: inicial?.fechaCierre ?? hoyISO(),
    precioEntrada: inicial ? String(inicial.precioEntrada) : '',
    precioSalida: inicial?.precioSalida != null ? String(inicial.precioSalida) : '',
    moneda: (inicial?.moneda ?? 'USD') as Moneda,
    apalancamiento: String(inicial?.apalancamiento ?? 1),
    margenBTC: inicial?.margenBTC != null ? String(inicial.margenBTC) : '',
    comisiones: inicial?.comisiones != null ? String(inicial.comisiones) : '',
    manual: inicial?.btcGanadoManual != null,
    btcManual: inicial?.btcGanadoManual != null ? String(inicial.btcGanadoManual) : '',
    plataforma: inicial ? (inicial.plataforma ?? '') : ultimaPlataforma(),
    nota: inicial?.nota ?? '',
  })
  const [otroLev, setOtroLev] = useState(Boolean(inicial) && !PILDORAS.includes(inicial?.apalancamiento ?? 1))
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))

  const cerrado = f.estado === 'cerrado'
  const candidato = useMemo(() => {
    const r = tradeSchema.safeParse({
      estado: f.estado, direccion: f.direccion, fechaInicio: f.fechaInicio, ...(cerrado ? { fechaCierre: f.fechaCierre, precioSalida: aNum(f.precioSalida) } : {}),
      precioEntrada: aNum(f.precioEntrada), moneda: f.moneda, apalancamiento: aNum(f.apalancamiento),
      ...(Number.isFinite(aNum(f.margenBTC)) ? { margenBTC: aNum(f.margenBTC) } : {}),
      ...(Number.isFinite(aNum(f.comisiones)) ? { comisiones: aNum(f.comisiones) } : {}),
      ...(f.manual && Number.isFinite(aNum(f.btcManual)) ? { btcGanadoManual: aNum(f.btcManual) } : {}),
      ...(f.plataforma.trim() ? { plataforma: f.plataforma } : {}), ...(f.nota.trim() ? { nota: f.nota } : {}),
    })
    return r
  }, [f, cerrado])

  const vista = useMemo(() => {
    if (!candidato.success) return null
    const t: Trade = { id: 'nuevo', ...candidato.data }
    const c = calcularTrade(t, v.precios?.[t.moneda] ?? t.precioEntrada)
    return { t, c }
  }, [candidato, v.precios])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!candidato.success) return setError(candidato.error.issues[0].message)
    setOcupado(true)
    try {
      await v.guardarTrade(candidato.data, editando)
      if (f.plataforma) recordarPlataforma(f.plataforma)
      onCerrar()
    } catch (err) {
      setError(mensajeError(err, 'No se ha podido guardar. Inténtalo de nuevo.'))
    } finally {
      setOcupado(false)
    }
  }

  const usarPrecioActual = (k: 'precioEntrada' | 'precioSalida') => {
    if (v.precios) setF((s) => ({ ...s, [k]: String(Math.round(v.precios![s.moneda])) }))
  }
  const titulo = editando ? 'Editar trade' : 'Nuevo trade'

  return (
    <Sheet titulo={titulo} onCerrar={onCerrar}>
      <form className="stack" onSubmit={enviar} noValidate>
        <div className="row wrap">
          <div className="seg" role="group" aria-label="Dirección">
            <button type="button" aria-pressed={f.direccion === 'largo'} onClick={() => setF((s) => ({ ...s, direccion: 'largo' }))}>Largo ▲</button>
            <button type="button" aria-pressed={f.direccion === 'corto'} onClick={() => setF((s) => ({ ...s, direccion: 'corto' }))}>Corto ▼</button>
          </div>
          <div className="seg" role="group" aria-label="Estado">
            <button type="button" aria-pressed={f.estado === 'abierto'} onClick={() => setF((s) => ({ ...s, estado: 'abierto' }))}>Abierto</button>
            <button type="button" aria-pressed={f.estado === 'cerrado'} onClick={() => setF((s) => ({ ...s, estado: 'cerrado' }))}>Cerrado</button>
          </div>
        </div>
        <p className="notice">{f.direccion === 'largo' ? 'Largo: ganas si el precio sube.' : 'Corto: ganas si el precio baja.'}</p>

        <div className="grid2">
          <label>Fecha de inicio<input type="date" value={f.fechaInicio} max={hoyISO()} onChange={set('fechaInicio')} required /></label>
          {cerrado && <label>Fecha de cierre<input type="date" value={f.fechaCierre} min={f.fechaInicio} max={hoyISO()} onChange={set('fechaCierre')} required /></label>}
          <label>Moneda
            <select value={f.moneda} onChange={set('moneda')}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
        </div>

        <label>Precio de entrada
          <div className="row">
            <input inputMode="decimal" value={f.precioEntrada} onChange={set('precioEntrada')} placeholder="0" required />
            <button type="button" onClick={() => usarPrecioActual('precioEntrada')} disabled={!v.precios} style={{ whiteSpace: 'nowrap' }}>Usar precio actual</button>
          </div>
        </label>
        {cerrado && (
          <label>Precio de salida
            <div className="row">
              <input inputMode="decimal" value={f.precioSalida} onChange={set('precioSalida')} placeholder="0" required />
              <button type="button" onClick={() => usarPrecioActual('precioSalida')} disabled={!v.precios} style={{ whiteSpace: 'nowrap' }}>Usar precio actual</button>
            </div>
          </label>
        )}

        <div className="stack" style={{ gap: 8 }} role="group" aria-label="Apalancamiento">
          <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Apalancamiento</span>
          <div className="chips">
            {PILDORAS.map((n) => (
              <button key={n} type="button" className="opt" aria-pressed={!otroLev && f.apalancamiento === String(n)} onClick={() => { setOtroLev(false); setF((s) => ({ ...s, apalancamiento: String(n) })) }}>x{n}</button>
            ))}
            <button type="button" className="opt" aria-pressed={otroLev} onClick={() => setOtroLev(true)}>Otro</button>
          </div>
          {otroLev && <input aria-label="Apalancamiento (1 a 125)" inputMode="decimal" value={f.apalancamiento} onChange={set('apalancamiento')} placeholder="1 a 125" />}
        </div>

        <div className="grid2">
          <label>Margen en BTC (opcional)<input inputMode="decimal" value={f.margenBTC} onChange={set('margenBTC')} placeholder="0,05" /></label>
          <label>Comisiones % (opcional)<input inputMode="decimal" value={f.comisiones} onChange={set('comisiones')} placeholder="0,4" /></label>
        </div>

        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
          <input type="checkbox" checked={f.manual} onChange={(e) => setF((s) => ({ ...s, manual: e.target.checked }))} /> Escribir BTC ganados a mano
        </label>
        {f.manual && <label>BTC ganados (con signo; negativo si pierdes)<input inputMode="decimal" value={f.btcManual} onChange={set('btcManual')} placeholder="0,0089" /></label>}

        <label>Plataforma (opcional)
          <input list="plataformas-trading" maxLength={40} value={f.plataforma} onChange={set('plataforma')} />
          <datalist id="plataformas-trading">{PLATAFORMAS.map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        <label>Nota (opcional, máx. 200)<input value={f.nota} maxLength={200} onChange={set('nota')} /></label>

        {vista && (
          <div className="card stack" aria-live="polite">
            <h3>Vista previa{vista.c.abierto ? ' · sin cerrar' : ''}</h3>
            <p className={`num ${vista.c.pct > 0 ? 'gain' : vista.c.pct < 0 ? 'loss' : ''}`}>
              {vista.c.pct > 0 ? '▲' : vista.c.pct < 0 ? '▼' : '■'} {porcentajeConSigno(vista.c.pct)}
              {vista.c.btc != null && <> · {btcConSigno(vista.c.btc)}</>}
            </p>
            <p className="notice">{pasoAPaso(vista.t, vista.c)}</p>
          </div>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <div className="row">
          <button type="button" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={ocupado} type="submit">Guardar</button>
        </div>
      </form>
    </Sheet>
  )
}
