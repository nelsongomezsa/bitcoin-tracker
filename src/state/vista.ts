import { useMemo, useState } from 'react'
import { useDatos } from './data'
import { dinero, dineroConSigno, OCULTO, porcentajeConSigno, btc as fmtBtc, btcConSigno } from '../lib/format'
import { normalizar, resumen, type Moneda, type Operacion, type PreciosBtc } from '../lib/calculos'
import { totalesTrading } from '../lib/trading'
import { usePreciosVivos } from '../lib/kraken'

/** Vista derivada: todo expresado en la moneda elegida y respetando el modo privado. */
export function useVista() {
  const d = useDatos()
  const [moneda, setMoneda] = useState<Moneda>(d.perfil.monedaPreferida)
  // Precio en directo (Kraken) mientras la app está abierta; si falla, el del job (mercado/precio, cada 15 min).
  const vivo = usePreciosVivos(!d.demo)
  const base = d.mercado?.precios ?? null
  const eur = vivo.ticks.EUR?.last, usd = vivo.ticks.USD?.last
  const enDirecto = Boolean(base && vivo.conectado && eur && usd)
  const precios: PreciosBtc | null = useMemo(
    () => (base && enDirecto ? { EUR: eur!, USD: usd!, AUD: eur! * (base.AUD / base.EUR) } : base),
    [base, enDirecto, eur, usd],
  )
  const privado = d.perfil.modoPrivado

  const ops: Operacion[] = useMemo(() => {
    if (!precios) return d.operaciones
    return normalizar(d.operaciones, moneda, precios)
  }, [d.operaciones, moneda, precios])

  const precio = precios?.[moneda] ?? ops.filter((o) => o.tipo === 'compra').at(-1)?.precio ?? 0

  const { res, errorFifo } = useMemo(() => {
    try {
      return { res: resumen(ops, precio), errorFifo: false }
    } catch {
      return { res: null, errorFifo: true }
    }
  }, [ops, precio])

  // Totales de trading en la moneda de la vista (null si aún no hay precio).
  const trading = useMemo(() => (precios ? totalesTrading(d.trades, precios, moneda) : null), [d.trades, precios, moneda])

  const ocultar = (s: string) => (privado ? OCULTO : s)
  return {
    ...d,
    moneda, setMoneda, precios, precio, enDirecto, pro: d.perfil.vista === 'pro',
    alternarVista: () => d.guardarPerfil({ ...d.perfil, vista: d.perfil.vista === 'pro' ? 'simple' : 'pro' }), ticks24h: vivo.ticks, ops, res, errorFifo, privado, trading,
    togglePrivado: () => d.guardarPerfil({ ...d.perfil, modoPrivado: !privado }),
    $: (n: number) => ocultar(dinero(n, moneda)),
    $s: (n: number) => ocultar(dineroConSigno(n, moneda)),
    pct: (n: number) => ocultar(porcentajeConSigno(n)),
    btcF: (n: number) => ocultar(fmtBtc(n)),
    btcS: (n: number) => ocultar(btcConSigno(n)),
  }
}
export type Vista = ReturnType<typeof useVista>
