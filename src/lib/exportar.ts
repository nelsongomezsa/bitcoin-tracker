import * as XLSX from 'xlsx'
import type { Operacion } from './calculos'
import type { Trade } from './trading'
import { calcularTrade } from './trading'

const CAB = ['Fecha', 'Tipo', 'Cantidad', 'Comisión', 'Precio', 'Moneda', 'Plataforma', 'Nota']

/** Evita la inyección de fórmulas al abrir el archivo en una hoja de cálculo. */
export const seguroCelda = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s)

const comillas = (s: string) => `"${s.replaceAll('"', '""')}"`

export function aCsv(ops: Operacion[]): string {
  const filas = ops.map((o) => [o.fecha, o.tipo, o.cantidad, o.comision, o.precio, o.moneda, seguroCelda(o.plataforma ?? ''), seguroCelda(o.nota ?? '')])
  return '﻿' + [CAB, ...filas].map((f) => f.map((c) => (typeof c === 'number' ? String(c) : comillas(String(c)))).join(',')).join('\r\n')
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const descargarCsv = (ops: Operacion[], nombre = 'operaciones.csv') => descargar(new Blob([aCsv(ops)], { type: 'text/csv;charset=utf-8' }), nombre)

export function descargarXlsx(ops: Operacion[], nombre = 'operaciones.xlsx') {
  const filas = ops.map((o) => [o.fecha, o.tipo, o.cantidad, o.comision, o.precio, o.moneda, seguroCelda(o.plataforma ?? ''), seguroCelda(o.nota ?? '')])
  const ws = XLSX.utils.aoa_to_sheet([CAB, ...filas])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Operaciones')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  descargar(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre)
}

export function informeFifoCsv(filas: { fecha: string; btcVendidos: number; ingreso: number; coste: number; ganancia: number }[]): string {
  const cab = ['Fecha venta', 'BTC vendidos', 'Ingreso', 'Coste de adquisición (FIFO)', 'Ganancia o pérdida']
  return '﻿' + [cab, ...filas.map((f) => [f.fecha, f.btcVendidos, f.ingreso.toFixed(2), f.coste.toFixed(2), f.ganancia.toFixed(2)])].map((r) => r.join(',')).join('\r\n')
}
export const descargarInforme = (csv: string, anio: number) => descargar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `informe-fifo-${anio}.csv`)

// ───── Trades ─────
const CAB_TRADES = ['Trade', 'Estado', 'Dirección', 'Fecha inicio', 'Fecha cierre', 'Precio entrada', 'Precio salida', 'Moneda', 'Apalancamiento', 'Margen (BTC)', 'Comisiones (%)', '% ganancia', 'Total ganado (BTC)', 'Plataforma', 'Nota']
const filasTrades = (ts: Trade[]) =>
  [...ts].sort((a, b) => (a.fechaInicio < b.fechaInicio ? -1 : a.fechaInicio > b.fechaInicio ? 1 : 0)).map((t, i) => {
    const c = t.estado === 'cerrado' ? calcularTrade(t, t.precioSalida ?? t.precioEntrada) : null
    return [
      i + 1, t.estado, t.direccion, t.fechaInicio, t.fechaCierre ?? '', t.precioEntrada, t.precioSalida ?? '', t.moneda, t.apalancamiento, t.margenBTC ?? '', t.comisiones ?? '',
      c ? Math.round(c.pct * 1e6) / 1e4 : '', c?.btc != null ? c.btc : '', seguroCelda(t.plataforma ?? ''), seguroCelda(t.nota ?? ''),
    ]
  })

export const tradesACsv = (ts: Trade[]) => '﻿' + [CAB_TRADES, ...filasTrades(ts)].map((f) => f.map((c) => (typeof c === 'number' ? String(c) : comillas(String(c)))).join(',')).join('\r\n')
export const descargarTradesCsv = (ts: Trade[], nombre = 'trades.csv') => descargar(new Blob([tradesACsv(ts)], { type: 'text/csv;charset=utf-8' }), nombre)
export function descargarTradesXlsx(ts: Trade[], nombre = 'trades.xlsx') {
  const ws = XLSX.utils.aoa_to_sheet([CAB_TRADES, ...filasTrades(ts)])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trades')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  descargar(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre)
}

export function informeTradingCsv(filas: { fecha: string; btc: number; eur: number | null }[]): string {
  const cab = ['Fecha cierre', 'BTC ganados (o perdidos)', 'Valor en EUR al precio del día']
  return '﻿' + [cab, ...filas.map((f) => [f.fecha, f.btc, f.eur == null ? '' : f.eur.toFixed(2)])].map((r) => r.join(',')).join('\r\n')
}
export const descargarInformeTrading = (csv: string, anio: number) => descargar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `informe-trading-${anio}.csv`)
