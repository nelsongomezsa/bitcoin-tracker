import { useEffect, useRef } from 'react'
import { useDatos } from '../state/data'
import { estadoNiveles, normalizar, precioObjetivoPorGanancia, resumen, resumenMensual } from '../lib/calculos'
import type { ResumenAvisos } from '../lib/tipos'

/**
 * Deja en avisos/config un resumen mínimo (en EUR) para que el job evalúe los avisos
 * sin leer todas las operaciones de cada usuario (ahorra lecturas del plan gratuito).
 * Solo escribe cuando el usuario tiene notificaciones activadas y el resumen ha cambiado.
 */
export default function SincronizarAvisos() {
  const d = useDatos()
  const ultimo = useRef('')

  useEffect(() => {
    if (d.demo || d.cargando || !d.mercado || d.avisos.tokens.length === 0) return
    const t = setTimeout(() => {
      try {
        const ops = normalizar(d.operaciones, 'EUR', d.mercado!.precios)
        const precio = d.mercado!.precios.EUR
        const r = resumen(ops, precio)
        const hoy = new Date()
        const ant = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
        const pv = d.objetivos.precioVenta
        const res: ResumenAvisos = {
          precioMedio: Math.round(r.precioMedioReal),
          btc: Number(r.btc.toFixed(8)),
          nivelesPendientes: estadoNiveles(d.plan, ops).filter((n) => n.estado === 'Pendiente').map((n) => n.precio),
          precioObjetivo: pv ? Math.round(pv.modo === 'precio' ? pv.valor : precioObjetivoPorGanancia(r.precioMedioReal, pv.valor)) : null,
          mesAnterior: ops.some((o) => o.fecha.slice(0, 7) <= ant) ? (({ metido, medioAntes, medioDespues, rentabilidad }) => ({ mes: ant, metido, medioAntes, medioDespues, rentabilidad }))(resumenMensual(ops, ant, precio)) : null,
        }
        const clave = JSON.stringify(res)
        if (clave === ultimo.current || clave === JSON.stringify(d.avisos.resumen)) { ultimo.current = clave; return }
        ultimo.current = clave
        void d.guardarAvisos({ ...d.avisos, resumen: res })
      } catch {
        /* datos incoherentes: no se sincroniza */
      }
    }, 3000)
    return () => clearTimeout(t)
  }, [d])
  return null
}
