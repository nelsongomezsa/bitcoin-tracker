// Comprobación con los datos reales de la usuaria. Solo se ejecuta si existen los archivos privados.
// Nada de lo que se lee aquí se copia ni se imprime.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { resumen, type Operacion } from '../calculos'

const xlsx = resolve(process.cwd(), 'datos-privados/compras.xlsx')
const json = resolve(process.cwd(), 'datos-privados/esperado.json')
const hay = existsSync(xlsx) && existsSync(json)

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

function leerCompras(): Operacion[] {
  const wb = XLSX.read(readFileSync(xlsx))
  for (const name of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true })
    const h = filas.findIndex((f) => ['fecha', 'precio', 'cantidad', 'comision'].every((k) => f.some((c) => norm(c).startsWith(k))))
    if (h < 0) continue
    const idx = (k: string) => filas[h].findIndex((c) => norm(c).startsWith(k))
    const [iF, iP, iC, iM] = [idx('fecha'), idx('precio'), idx('cantidad'), idx('comision')]
    const ops: Operacion[] = []
    for (const f of filas.slice(h + 1)) {
      const [precio, cantidad, comision] = [f[iP], f[iC], f[iM]].map(Number)
      if (typeof f[iF] !== 'number' || !(precio > 0) || !(cantidad > 0)) break
      const d = XLSX.SSF.parse_date_code(f[iF] as number)
      const fecha = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      ops.push({ id: String(ops.length), tipo: 'compra', fecha, cantidad, comision: comision || 0, precio, moneda: 'EUR' })
    }
    return ops
  }
  throw new Error('No se encontró la hoja de compras')
}

describe.skipIf(!hay)('comprobación con datos privados', () => {
  it('coincide con esperado.json', () => {
    const esperado = JSON.parse(readFileSync(json, 'utf8'))
    const r = resumen(leerCompras(), 50000)
    expect(r.invertido).toBeCloseTo(esperado.invertido, 2)
    expect(r.comisiones).toBeCloseTo(esperado.comisiones, 2)
    expect(r.btc).toBeCloseTo(esperado.btc, 7)
    expect(r.precioMedioReal).toBeCloseTo(esperado.precioMedioReal, 1)
    expect(r.precioMedioSinComisiones).toBeCloseTo(esperado.precioMedioSinComisiones, 1)
  })
})
