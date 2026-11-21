import { useMemo, useState } from 'react'
import { useDatos } from './data'
import { dinero, dineroConSigno, OCULTO, porcentajeConSigno, btc as fmtBtc } from '../lib/format'
import { normalizar, resumen, type Moneda, type Operacion, type PreciosBtc } from '../lib/calculos'

/** Vista derivada: todo expresado en la moneda elegida y respetando el modo privado. */
export function useVista() {
  const d = useDatos()
  const [moneda, setMoneda] = useState<Moneda>(d.perfil.monedaPreferida)
  const precios: PreciosBtc | null = d.mercado?.precios ?? null
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

  const ocultar = (s: string) => (privado ? OCULTO : s)
  return {
    ...d,
    moneda, setMoneda, precios, precio, ops, res, errorFifo, privado,
    togglePrivado: () => d.guardarPerfil({ ...d.perfil, modoPrivado: !privado }),
    $: (n: number) => ocultar(dinero(n, moneda)),
    $s: (n: number) => ocultar(dineroConSigno(n, moneda)),
    pct: (n: number) => ocultar(porcentajeConSigno(n)),
    btcF: (n: number) => ocultar(fmtBtc(n)),
  }
}
export type Vista = ReturnType<typeof useVista>
