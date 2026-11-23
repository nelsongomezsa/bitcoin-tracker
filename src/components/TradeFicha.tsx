import Sheet from './Sheet'
import { calcularTrade, diasEntre, etiquetaTrade, pasoAPaso, type FilaTrade } from '../lib/trading'
import { claseSigno, fechaCorta, flecha, hoyISO, dinero } from '../lib/format'
import { useVista } from '../state/vista'

interface Props {
  fila: FilaTrade
  onEditar: () => void
  onDuplicar: () => void
  onBorrar: () => void
  onGrafico?: () => void
  onCerrar: () => void
}

export default function TradeFicha({ fila, onEditar, onDuplicar, onBorrar, onGrafico, onCerrar }: Props) {
  const v = useVista()
  const { trade: t, calculo: c } = fila
  const fin = t.fechaCierre ?? hoyISO()
  const sinBtc = c.btc == null
  const dato = (k: string, val: string) => <div className="stat"><span className="muted" style={{ fontSize: 12 }}>{k}</span><span className="num">{val}</span></div>
  return (
    <Sheet titulo={`${etiquetaTrade(t)}${c.abierto ? ' · sin cerrar' : ''}`} onCerrar={onCerrar}>
      <div className="stack">
        <div className={`mid num ${claseSigno(c.pct)}`}>{flecha(c.pct)} {v.pct(c.pct)}</div>
        <div className="grid2">
          {dato('Inicio', fechaCorta(t.fechaInicio))}
          {dato(c.abierto ? 'Hoy (sin cerrar)' : 'Cierre', c.abierto ? fechaCorta(hoyISO()) : fechaCorta(t.fechaCierre!))}
          {dato('Entrada', dinero(t.precioEntrada, t.moneda, 0))}
          {dato(c.abierto ? 'Precio actual' : 'Salida', dinero(c.precioReferencia, t.moneda, 0))}
          {dato('Duración', `${diasEntre(t.fechaInicio, fin)} d`)}
          {dato('Margen', t.margenBTC != null ? v.btcF(t.margenBTC) : '—')}
          {t.margenDestinado != null && dato('Margen destinado', v.btcF(t.margenDestinado))}
          {t.resultadoDinero != null && t.resultadoMoneda && dato('Resultado en dinero', v.privado ? '••••' : `${t.resultadoDinero > 0 ? '+' : t.resultadoDinero < 0 ? '−' : ''}${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Math.abs(t.resultadoDinero))} ${t.resultadoMoneda}`)}
          {t.resultadoPrecio != null && t.resultadoMoneda && dato('Precio de BTC usado', `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(t.resultadoPrecio)} ${t.resultadoMoneda}/BTC`)}
          {dato('Comisiones', t.comisiones != null ? `${String(t.comisiones).replace('.', ',')} %` : '—')}
          {dato('Plataforma', t.plataforma ?? '—')}
        </div>
        {t.nota && <p className="notice">{t.nota}</p>}

        <div className="card stack" aria-label="Resultado del trade">
          <h3>Resultado</h3>
          <div className="grid2">
            <div className="stat"><span className="muted" style={{ fontSize: 12 }}>{!sinBtc && c.btc! < 0 ? 'Perdido' : 'Ganado'}</span><span className={`num ${claseSigno(c.btc ?? 0)}`}>{sinBtc ? '—' : v.btcS(c.btc!)}</span></div>
            <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Vale hoy</span><span className="num">{fila.valeHoy == null ? '—' : v.$s(fila.valeHoy)}</span></div>
            <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Valía al cerrar</span><span className="num">{fila.valiaAlCerrar == null ? '—' : v.$s(fila.valiaAlCerrar)}</span></div>
            <div className="stat"><span className="muted" style={{ fontSize: 12 }}>Total tras este trade</span><span className="num">{fila.acumulado == null ? '—' : v.btcS(fila.acumulado)}</span></div>
          </div>
          <p className="notice"><b>Cálculo:</b> {v.privado ? '••••' : pasoAPaso(t, calcularTrade(t, v.precios?.[t.moneda] ?? t.precioEntrada))}</p>
          {c.manual && <p className="notice">Los BTC ganados están escritos a mano y mandan sobre el cálculo.</p>}
        </div>

        <div className="row wrap">
          <button onClick={onEditar}>Editar</button>
          <button onClick={onDuplicar}>Duplicar</button>
          {onGrafico && <button onClick={onGrafico}>Ver gráfico</button>}
          <button className="btn-danger" onClick={onBorrar}>Borrar</button>
        </div>
      </div>
    </Sheet>
  )
}
