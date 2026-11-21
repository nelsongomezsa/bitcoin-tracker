// Importación de Excel/CSV. Todo ocurre en el navegador: el archivo no se sube a ningún sitio.
import * as XLSX from 'xlsx'
import { operacionSchema, type OperacionInput } from './schemas'
import type { Moneda } from './calculos'

export const MAX_BYTES = 2 * 1024 * 1024
export const MAX_FILAS = 500

export type TipoArchivo = 'xlsx' | 'xls' | 'csv'

/** Detecta el tipo por el contenido (cabecera del archivo), no por la extensión ni por el tipo MIME. */
export function detectarTipo(b: Uint8Array): TipoArchivo | null {
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'xlsx'
  if (b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'xls'
  const muestra = b.subarray(0, 4096)
  if (muestra.length && !muestra.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(muestra.length < 4096 ? muestra : muestra.subarray(0, 4090))
      return 'csv'
    } catch {
      return null
    }
  }
  return null
}

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

function aFecha(v: unknown): string | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(v ?? '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function aNumero(v: unknown): number {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/[€$\s]/g, '')
  if (!s) return NaN
  // 1.234,56 (es) o 1234.56 (en)
  const n = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  return Number(n)
}

export interface ResultadoImportacion {
  operaciones: OperacionInput[]
  errores: { fila: number; motivo: string }[]
}

/** Convierte filas de hoja (con cabecera Fecha, Precio, Cantidad, Comisión) en compras. */
export function filasAOperaciones(filas: unknown[][], moneda: Moneda): ResultadoImportacion {
  const h = filas.findIndex((f) => ['fecha', 'precio', 'cantidad', 'comision'].every((k) => f.some((c) => norm(c).startsWith(k))))
  if (h < 0) throw new Error('cabecera')
  const col = (k: string) => filas[h].findIndex((c) => norm(c).startsWith(k))
  const [iF, iP, iC, iM] = [col('fecha'), col('precio'), col('cantidad'), col('comision')]
  const operaciones: OperacionInput[] = []
  const errores: ResultadoImportacion['errores'] = []
  for (let i = h + 1; i < filas.length; i++) {
    const f = filas[i]
    if (!f || f[iF] == null || f[iF] === '') break // fin de la tabla (debajo o al lado suelen estar los resúmenes)
    if (operaciones.length + errores.length >= MAX_FILAS) {
      errores.push({ fila: i + 1, motivo: `Máximo ${MAX_FILAS} filas por importación` })
      break
    }
    const fecha = aFecha(f[iF])
    const r = operacionSchema.safeParse({
      tipo: 'compra', fecha: fecha ?? '', cantidad: aNumero(f[iC]), comision: iM >= 0 && f[iM] != null && f[iM] !== '' ? aNumero(f[iM]) : 0,
      precio: aNumero(f[iP]), moneda,
    })
    if (r.success) operaciones.push(r.data)
    else errores.push({ fila: i + 1, motivo: r.error.issues[0].message })
  }
  return { operaciones, errores }
}

export function leerArchivo(buf: ArrayBuffer, moneda: Moneda): ResultadoImportacion {
  if (buf.byteLength > MAX_BYTES) throw new Error('tamano')
  const bytes = new Uint8Array(buf)
  const tipo = detectarTipo(bytes)
  if (!tipo) throw new Error('tipo')
  const wb = tipo === 'csv' ? XLSX.read(new TextDecoder().decode(bytes), { type: 'string' }) : XLSX.read(bytes, { type: 'array' })
  for (const nombre of wb.SheetNames.slice(0, 10)) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, raw: true, defval: null })
    try {
      return filasAOperaciones(filas, moneda)
    } catch {
      /* prueba la siguiente hoja */
    }
  }
  throw new Error('cabecera')
}

export function mensajeImportacion(e: unknown): string {
  switch ((e as Error).message) {
    case 'tamano': return 'El archivo pesa más de 2 MB.'
    case 'tipo': return 'El archivo no es un Excel (.xlsx, .xls) ni un CSV válido.'
    case 'cabecera': return 'No encuentro las columnas Fecha, Precio, Cantidad y Comisión.'
    default: return 'No se ha podido leer el archivo.'
  }
}
