import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ExternalLink } from 'lucide-react'
import Cabecera from '../components/Cabecera'
import { useVista } from '../state/vista'
import { useMercadoDoc } from '../state/data'
import { dinero, horaCorta } from '../lib/format'
import { mensajeError } from '../lib/errores'
import { COLORES, EJE, tip } from './estadisticas/comun'

interface Entidad { id: string; nombre: string; simbolo: string | null; pais: string | null; btc: number; valorUsd: number | null; pctSuministro: number | null }
interface Movimiento { entidad: string; tipo: 'compra' | 'venta'; btc: number; precioUsd: number | null; fecha: number }
interface Instituciones { empresas?: Entidad[]; gobiernos?: Entidad[]; movimientos?: Movimiento[]; detalles?: Record<string, [number, number][]> }
interface Ballenas { umbralBtc?: number; movimientos?: { txid: string; btc: number; bloque: number; hora: number }[] }
interface Carteras { carteras?: Record<string, { nombre: string; descripcion?: string; fuente?: string; saldoBtc: number }> }

const SECCIONES = [['inst', 'Empresas y gobiernos'], ['ballenas', 'Ballenas'], ['carteras', 'Carteras']] as const
const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })
const esHttps = (u?: string) => typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u)

export default function Mercado() {
  const v = useVista()
  const [seccion, setSeccion] = useState<(typeof SECCIONES)[number][0]>('inst')
  return (
    <main className="app stack">
      <Cabecera titulo="Mercado" />
      <div className="seg" role="tablist" aria-label="Secciones" style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}>
        {SECCIONES.map(([k, l]) => <button key={k} role="tab" aria-selected={seccion === k} onClick={() => setSeccion(k)}>{l}</button>)}
      </div>
      {seccion === 'inst' && <Inst />}
      {seccion === 'ballenas' && <Ballenas v={v} />}
      {seccion === 'carteras' && <CarterasSec v={v} />}
      <p className="notice" role="note">Información pública sobre el mercado, no una recomendación de inversión ni asesoramiento financiero. Los datos pueden tener retraso o errores.</p>
    </main>
  )
}

function Inst() {
  const d = useMercadoDoc<Instituciones>('instituciones')
  const reducir = useReducedMotion()
  const [tipo, setTipo] = useState<'empresas' | 'gobiernos'>('empresas')
  const [abierta, setAbierta] = useState<string | null>(null)
  const lista = (tipo === 'empresas' ? d?.empresas : d?.gobiernos) ?? []
  if (!d) return <p className="card muted">Aún no hay datos de empresas y gobiernos. Se actualizan una vez al día cuando el servidor tiene configurada la clave de CoinGecko.</p>
  return (
    <>
      <section className="card stack" aria-label="Ranking">
        <div className="row between wrap">
          <h2>Quién tiene más BTC</h2>
          <div className="seg" role="group" aria-label="Tipo de entidad">
            <button aria-pressed={tipo === 'empresas'} onClick={() => setTipo('empresas')}>Empresas</button>
            <button aria-pressed={tipo === 'gobiernos'} onClick={() => setTipo('gobiernos')}>Gobiernos</button>
          </div>
        </div>
        {lista.length === 0 ? <p className="muted">Sin datos.</p> : (
          <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 6 }}>
            {lista.slice(0, 20).map((e, i) => (
              <li key={e.id}>
                <button className="btn-ghost" style={{ width: '100%', justifyContent: 'space-between', padding: '0 4px' }} aria-expanded={abierta === e.id} onClick={() => setAbierta(abierta === e.id ? null : e.id)}>
                  <span style={{ textAlign: 'left' }}>{i + 1}. {e.nombre}{e.simbolo ? <span className="muted"> · {e.simbolo}</span> : null}</span>
                  <span className="num">{nf.format(e.btc)} BTC{e.pctSuministro != null ? <span className="muted"> · {nf2.format(e.pctSuministro)} %</span> : null}</span>
                </button>
                <AnimatePresence initial={false}>
                  {abierta === e.id && d.detalles?.[e.id] && d.detalles[e.id].length > 1 && (
                    <motion.div initial={reducir ? { opacity: 0 } : { height: 0, opacity: 0 }} animate={reducir ? { opacity: 1 } : { height: 170, opacity: 1 }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                      <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={d.detalles[e.id].map(([t, b]) => ({ fecha: new Date(t).toISOString().slice(0, 10), btc: b }))}>
                          <XAxis dataKey="fecha" {...EJE} minTickGap={40} tickFormatter={(f: string) => f.slice(2, 7)} />
                          <YAxis {...EJE} width={48} tickFormatter={(n: number) => nf.format(n)} />
                          <Tooltip {...tip} formatter={(n) => `${nf.format(Number(n))} BTC`} />
                          <Area type="stepAfter" dataKey="btc" stroke={COLORES.acento} fill={COLORES.acento} fillOpacity={0.18} strokeWidth={2} isAnimationActive={!reducir} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ol>
        )}
        <p className="notice">Pulsa una entidad para ver cómo ha evolucionado lo que tiene. Fuente: CoinGecko.</p>
      </section>

      <section className="card stack" aria-label="Últimos movimientos">
        <h2>Últimos movimientos</h2>
        {(d.movimientos ?? []).length === 0 ? <p className="muted">Sin movimientos recientes.</p> : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {d.movimientos!.map((m, i) => (
              <li key={`${m.entidad}${m.fecha}${i}`}>
                <b>{m.entidad}</b> {m.tipo === 'compra' ? 'compró' : 'vendió'} <span className={`num ${m.tipo === 'compra' ? 'gain' : 'loss'}`}>{nf.format(Math.abs(m.btc))} BTC</span>
                {m.precioUsd ? <span className="muted num"> a {nf.format(m.precioUsd)} $ de media</span> : null}
                <div className="muted num" style={{ fontSize: 12 }}>{horaCorta(new Date(m.fecha))}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function Ballenas({ v }: { v: ReturnType<typeof useVista> }) {
  const d = useMercadoDoc<Ballenas>('ballenas')
  const reducir = useReducedMotion()
  const [min, setMin] = useState(500)
  const lista = useMemo(() => (d?.movimientos ?? []).filter((m) => m.btc >= min), [d, min])
  return (
    <section className="card stack" aria-label="Movimientos de ballenas">
      <div className="row between wrap">
        <h2>Movimientos de ballenas</h2>
        <div className="seg" role="group" aria-label="Tamaño mínimo">
          {[500, 1000, 5000].map((n) => <button key={n} aria-pressed={min === n} onClick={() => setMin(n)}>≥ {nf.format(n)}</button>)}
        </div>
      </div>
      {!d ? <p className="muted">Aún no hay datos. El servidor revisa los bloques nuevos cada 15 minutos.</p> : lista.length === 0 ? <p className="muted">Ninguna transacción de ≥ {nf.format(min)} BTC en lo guardado.</p> : (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <AnimatePresence initial={false}>
            {lista.map((m) => (
              <motion.li key={m.txid} layout initial={reducir ? { opacity: 0 } : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
                <span className="num warn">{nf.format(m.btc)} BTC</span> <span className="muted num">≈ {dinero(m.btc * v.precio, v.moneda, 0)}</span>
                <div className="muted" style={{ fontSize: 12 }}>
                  Cartera desconocida · bloque {nf.format(m.bloque)} · {horaCorta(new Date(m.hora))}{' '}
                  <a href={`https://mempool.space/tx/${encodeURIComponent(m.txid)}`} target="_blank" rel="noopener noreferrer" aria-label="Ver la transacción en mempool.space"><ExternalLink size={12} strokeWidth={1.75} /></a>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <p className="notice">Valor total de las salidas de cada transacción (incluye el cambio que vuelve al emisor). No se etiqueta a nadie: solo las carteras de la lista pública aparecen con nombre. Fuente: mempool.space.</p>
    </section>
  )
}

function CarterasSec({ v }: { v: ReturnType<typeof useVista> }) {
  const d = useMercadoDoc<Carteras>('carteras')
  const [msg, setMsg] = useState('')
  const lista = Object.entries(d?.carteras ?? {})
  const seguidas = new Set(v.avisos.seguidas ?? [])
  const alternar = (id: string) => {
    const s = new Set(seguidas)
    if (s.has(id)) s.delete(id); else s.add(id)
    v.guardarAvisos({ ...v.avisos, seguidas: [...s].slice(0, 30) }).catch((e) => setMsg(mensajeError(e)))
  }
  return (
    <section className="card stack" aria-label="Carteras públicas">
      <h2>Carteras públicas</h2>
      <p className="muted">Direcciones que entidades (gobiernos, fondos, administradores) publican ellas mismas, cada una con su fuente. Puedes seguirlas y recibir un aviso si se mueven (actívalo en Avisos → «Una cartera que sigues se mueve»).</p>
      {lista.length === 0 ? <p className="muted">Todavía no hay carteras verificadas en la lista.</p> : (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {lista.map(([id, c]) => (
            <li key={id} className="card stack" style={{ background: 'var(--card-2)' }}>
              <div className="row between">
                <b>{c.nombre}</b>
                <button aria-pressed={seguidas.has(id)} className={seguidas.has(id) ? 'btn-outline' : ''} onClick={() => alternar(id)}>{seguidas.has(id) ? 'Siguiendo' : 'Seguir'}</button>
              </div>
              <p className="num">{nf2.format(c.saldoBtc)} BTC</p>
              {c.descripcion && <p className="muted" style={{ fontSize: 13 }}>{c.descripcion}</p>}
              {esHttps(c.fuente) && <a href={c.fuente} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>Fuente <ExternalLink size={12} strokeWidth={1.75} /></a>}
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="err" role="alert">{msg}</p>}
    </section>
  )
}
