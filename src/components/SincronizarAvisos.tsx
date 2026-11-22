import { useEffect, useRef } from 'react'
import { useDatos } from '../state/data'
import { convertir, estadoNiveles, informeFifoAnual, normalizar, ordenarPorFecha, precioObjetivoPorGanancia, resumen, resumenMensual } from '../lib/calculos'
import type { ResumenAvisos } from '../lib/tipos'

/**
 * Deja en avisos/config un resumen mínimo (en EUR) para que el job evalúe los avisos
 * sin leer todas las operaciones de cada usuario (ahorra lecturas del plan gratuito).
 * Solo escribe cuando hay algún canal de avisos activo y el resumen ha cambiado.
 */
export default function SincronizarAvisos() {
  const d = useDatos()
  const ultimo = useRef('')

  useEffect(() => {
    const hayCanal = d.avisos.tokens.length > 0 || d.telegramVinculado
    if (d.demo || d.cargando || !d.mercado || !hayCanal) return
    const t = setTimeout(() => {
      try {
        const precios = d.mercado!.precios
        const ops = normalizar(d.operaciones, 'EUR', precios)
        const precio = precios.EUR
        const r = resumen(ops, precio)
        const hoy = new Date()
        const ant = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
        const pv = d.objetivos.precioVenta
        const dca = d.plan.dca
        const compras = ordenarPorFecha(ops.filter((o) => o.tipo === 'compra'))
        let anioAnterior: ResumenAvisos['anioAnterior'] = null
        try {
          const inf = informeFifoAnual(ops, hoy.getUTCFullYear() - 1)
          anioAnterior = { anio: hoy.getUTCFullYear() - 1, ganancia: Math.round(inf.gananciaTotal * 100) / 100, ventas: inf.ventas.length }
        } catch { /* operaciones incoherentes */ }
        const res: ResumenAvisos = {
          precioMedio: Math.round(r.precioMedioReal),
          btc: Number(r.btc.toFixed(8)),
          invertido: Math.round(r.invertido * 100) / 100,
          nivelesPendientes: estadoNiveles(d.plan, ops).filter((n) => n.estado === 'Pendiente').map((n) => n.precio),
          precioObjetivo: pv ? Math.round(pv.modo === 'precio' ? pv.valor : precioObjetivoPorGanancia(r.precioMedioReal, pv.valor)) : null,
          precioInicio: dca.precioInicio ? Math.round(convertir(dca.precioInicio, dca.monedaInicio ?? 'EUR', 'EUR', precios)) : null,
          btcMeta: d.objetivos.btcMeta ?? null,
          dineroMeta: d.objetivos.dineroMeta ?? null,
          ultimaCompra: compras.at(-1)?.fecha ?? null,
          anioAnterior,
          tradesAbiertos: d.trades.filter((t) => t.estado === 'abierto').slice(0, 20).map((t) => ({ id: t.id.slice(0, 40), direccion: t.direccion, ...(t.apalancamiento ? { apalancamiento: t.apalancamiento } : {}), precioEntrada: t.precioEntrada, moneda: t.moneda, fechaInicio: t.fechaInicio, ...(t.comisiones != null ? { comisiones: t.comisiones } : {}) })),
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
