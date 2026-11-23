// Auditoría en el navegador (modo demo, 390×844): lee del DOM las cifras que muestra la app y las compara con la
// calculadora de control. Uso: AUDIT_URL=http://localhost:4173 AUDIT_NAME=local npx vitest run --config scripts/auditoria/vitest.web.config.ts
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright-core'
import Decimal from 'decimal.js'
import * as K from './control.mjs'
import { historicoDemo, mercadoDemo, operacionesDemo, planDemo, tradesDemo } from '../../src/state/demoData'

const URL_BASE = process.env.AUDIT_URL ?? 'http://localhost:4173'
const NOMBRE = process.env.AUDIT_NAME ?? 'local'
const SALIDA = process.env.AUDIT_DIR ?? resolve(__dirname, '../../datos-privados/auditoria-web')
mkdirSync(SALIDA, { recursive: true })

interface Fila { pantalla: string; cifra: string; app: string; control: string; dif: string; ok: boolean }
const filas: Fila[] = []

// ───── lectura de números en formato es-ES ─────
const SIGNO = /[−–-]/
const decimalesDe = (s: string) => (s.match(/,(\d+)/)?.[1].length ?? 0)
const num = (s: string): number => {
  const neg = SIGNO.test(s.trim().replace(/^[^\d−–+-]*/, '')[0] ?? '')
  const limpio = s.replace(/[^\d,]/g, '').replace(',', '.')
  const v = Number(limpio)
  return neg ? -v : v
}
const nums = (s: string): string[] => s.match(/[−+-]?\d[\d.]*(?:,\d+)?/g) ?? []

function comparar(pantalla: string, cifra: string, textoApp: string, control: Decimal.Value, dec?: number) {
  const d = dec ?? decimalesDe(textoApp)
  const app = num(textoApp)
  const ctl = new Decimal(control)
  const dif = Math.abs(app - ctl.toNumber())
  const ok = dif <= 0.5 * 10 ** -d + 1e-9 // el redondeo de lo que se muestra
  filas.push({ pantalla, cifra, app: textoApp.trim(), control: ctl.toDecimalPlaces(d + 2).toString(), dif: dif.toExponential(1), ok })
}
/** Para números en bruto (atributos del DOM con punto decimal), con tolerancia de 0,01. */
function compararBruto(pantalla: string, cifra: string, textoApp: string, control: Decimal.Value, tol = 0.01) {
  const app = Number(textoApp)
  const ctl = new Decimal(control)
  const dif = Math.abs(app - ctl.toNumber())
  filas.push({ pantalla, cifra, app: textoApp, control: ctl.toDecimalPlaces(4).toString(), dif: dif.toExponential(1), ok: Number.isFinite(app) && dif <= tol })
}
function igual(pantalla: string, cifra: string, app: string, control: string) {
  filas.push({ pantalla, cifra, app, control, dif: '-', ok: app === control })
}
const fmtFecha = (iso: string) => iso.split('-').reverse().join('/')

// ───── datos demo (entrada) y control ─────
const ops = operacionesDemo()
const merc = mercadoDemo()
const plan = planDemo()
const historico = historicoDemo()
const preciosBtc = merc.precios
type Mon = 'EUR' | 'USD' | 'AUD'
const opsEn = (m: Mon) => K.normalizar(ops, m, preciosBtc).map((o: { cantidad: Decimal; comision: Decimal; precio: Decimal }) => ({ ...o, cantidad: o.cantidad.toString(), comision: o.comision.toString(), precio: o.precio.toString() }))

let browser: Browser
let page: Page

function chromiumPath(): string {
  const base = join(homedir(), 'Library/Caches/ms-playwright')
  const dirs = readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell')).sort().reverse()
  for (const d of dirs) {
    const p = join(base, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
    if (existsSync(p)) return p
  }
  throw new Error('No hay Chromium instalado')
}

const captura = (n: string) => page.screenshot({ path: join(SALIDA, `${NOMBRE}-${n}.png`), fullPage: true })
const sec = (etiqueta: string) => page.locator(`section[aria-label="${etiqueta}"]`)
// Si el enlace no está en la pantalla actual (p. ej. Estadísticas ahora cuelga de Inicio), navega por el historial.
const irA = async (href: string) => {
  await page.evaluate((h) => {
    const a = document.querySelector<HTMLAnchorElement>(`a[href="${h}"]`)
    if (a) a.click()
    else { history.pushState({}, '', h); dispatchEvent(new PopStateEvent('popstate')) }
  }, href)
  await page.waitForTimeout(900)
}

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: chromiumPath() })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  page = await ctx.newPage()
  await page.goto(`${URL_BASE}/login`)
  await page.getByText('Probar sin cuenta').click()
  await page.waitForSelector('section[aria-label="Saldo"]')
  await page.waitForTimeout(1200)
})
afterAll(async () => {
  await browser?.close()
  writeFileSync(join(SALIDA, `${NOMBRE}.json`), JSON.stringify(filas, null, 2))
})

async function leerInicio(moneda: Mon, etiqueta: string) {
  const P = preciosBtc[moneda]
  const o = opsEn(moneda)
  const t = K.totales(o, P)
  const saldo = sec('Saldo')
  comparar(etiqueta, 'Valor actual', (await saldo.locator('.big .sr').textContent())!, t.valor)
  const mid = (await saldo.locator('.mid').innerText()).replace(/\s+/g, ' ')
  const [ganTxt, rentTxt] = nums(mid)
  comparar(etiqueta, 'Ganancia / pérdida', ganTxt, t.ganancia, 2)
  comparar(etiqueta, 'Rentabilidad %', rentTxt, t.rent.mul(100), 2)
  const stats = await saldo.locator('.stat .num').allInnerTexts()
  comparar(etiqueta, 'Metido', stats[0], t.invertido)
  comparar(etiqueta, 'Precio de BTC', stats[1], P, 0)
  // otras monedas en la tarjeta
  const otras = (await saldo.locator('.muted.num').first().innerText()).split('·').map((x) => x.trim())
  const restantes = (['EUR', 'USD', 'AUD'] as Mon[]).filter((m) => m !== moneda)
  restantes.forEach((m, i) => comparar(etiqueta, `Valor en ${m}`, otras[i], K.convertir(t.valor, moneda, m, preciosBtc), 0))
  // chips
  const chips: Record<string, string> = {}
  for (const c of await page.locator('.chips .chip').all()) chips[(await c.locator('.k').innerText()).trim().toLowerCase()] = (await c.locator('.v').innerText()).replace(/\s+/g, ' ').trim()
  comparar(etiqueta, 'Chip precio medio', chips['precio medio'], t.medioReal)
  if (chips['rentable desde']?.includes('%')) comparar(etiqueta, 'Chip rentable desde (subida %)', chips['rentable desde'], t.subida.mul(100), 2)
  else igual(etiqueta, 'Chip rentable desde', chips['rentable desde'], t.subida.gt(0) ? '+x %' : '▲ ya')
  const pn = K.proximoNivel(plan, ops, preciosBtc.EUR, preciosBtc)
  if (pn) comparar(etiqueta, 'Chip próximo nivel', chips['próximo nivel'], K.convertir(pn.precio, 'EUR', moneda, preciosBtc), 0)
  comparar(etiqueta, 'Chip miedo y codicia', chips['miedo y codicia'].split('·')[0], merc.miedoCodicia!.valor, 0)
  const ath = K.convertir(merc.maximoHistorico.EUR, 'EUR', moneda, preciosBtc)
  comparar(etiqueta, 'Chip del máximo %', chips['del máximo'], new Decimal(1).minus(new Decimal(P).div(ath)).mul(100), 2)
  // tabla de últimas compras (5 más recientes) y total
  const compras = K.ordenar(o.filter((x: { tipo: string }) => x.tipo === 'compra')).slice(-5).reverse()
  const filasTabla = await sec('Últimas compras').locator('tbody tr').all()
  for (const [i, c] of compras.entries()) {
    const celdas = (await filasTabla[i].locator('td').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim())
    const f = K.filaCompra(c, P)
    igual(etiqueta, `Tabla ${i + 1}: fecha`, celdas[0], fmtFecha(c.fecha))
    comparar(etiqueta, `Tabla ${i + 1}: metido`, celdas[1], c.cantidad)
    comparar(etiqueta, `Tabla ${i + 1}: vale hoy`, celdas[2], f.valor)
    comparar(etiqueta, `Tabla ${i + 1}: rentabilidad %`, celdas[3], f.rent.mul(100))
  }
  const total = (await filasTabla[compras.length].locator('td').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim())
  comparar(etiqueta, 'Tabla total: metido', total[1], t.invertido)
  comparar(etiqueta, 'Tabla total: vale hoy', total[2], t.valor)
  comparar(etiqueta, 'Tabla total: rentabilidad %', total[3], t.rent.mul(100))
}

describe(`auditoría en navegador (${NOMBRE})`, () => {
  it('Inicio en EUR, USD y AUD', async () => {
    await leerInicio('EUR', 'Inicio EUR'); await captura('inicio-eur')
    await page.getByRole('button', { name: 'USD', exact: true }).click(); await page.waitForTimeout(500)
    await leerInicio('USD', 'Inicio USD'); await captura('inicio-usd')
    await page.getByRole('button', { name: 'AUD', exact: true }).click(); await page.waitForTimeout(500)
    await leerInicio('AUD', 'Inicio AUD'); await captura('inicio-aud')
    await page.getByRole('button', { name: 'EUR', exact: true }).click(); await page.waitForTimeout(500)
  })

  it('Gráfica: puntos, marcas y líneas en 1D, 1S, 1M, 1A y Todo', async () => {
    const t = K.totales(ops, preciosBtc.EUR)
    const pn = K.proximoNivel(plan, ops, preciosBtc.EUR, preciosBtc)
    for (const p of ['1D', '1S', '1M', '1A', 'Todo']) {
      await page.locator('section[aria-label="Gráfica del precio"]').getByRole('button', { name: p, exact: true }).click()
      await page.waitForTimeout(700)
      const caja = page.locator('.chart-box').first()
      const a = (n: string) => caja.getAttribute(n)
      const puntos = Number(await a('data-puntos'))
      filas.push({ pantalla: `Gráfica ${p}`, cifra: 'Tiene puntos (≥ 2)', app: String(puntos), control: '≥ 2', dif: '-', ok: puntos >= 2 })
      compararBruto(`Gráfica ${p}`, 'Último punto = precio actual', String(await a('data-ultimo-valor')), preciosBtc.EUR)
      compararBruto(`Gráfica ${p}`, 'Línea de precio medio', String(await a('data-media')), t.medioReal)
      if (pn) compararBruto(`Gráfica ${p}`, 'Línea del próximo nivel', String(await a('data-nivel')), pn.precio)
      const marcas = (JSON.parse((await a('data-marcas')) ?? '[]') as [string, string][]).map((m) => m[0])
      const desde = new Date(Number(await a('data-primero')) * 1000).toISOString().slice(0, 10)
      const hasta = new Date(Number(await a('data-ultimo-tiempo')) * 1000).toISOString().slice(0, 10)
      const esperadas = ops.filter((o) => o.fecha >= desde && o.fecha <= hasta).map((o) => o.fecha).sort()
      igual(`Gráfica ${p}`, 'Marcas de compra en su fecha', JSON.stringify([...marcas].sort()), JSON.stringify(esperadas))
      // el último punto de la serie cae hoy y el primero abre el periodo
      const dias = { '1D': 1, '1S': 7, '1M': 30, '1A': 365, Todo: 1e9 }[p]!
      const abre = (Date.now() / 1000 - dias * 86400)
      filas.push({ pantalla: `Gráfica ${p}`, cifra: 'El primer punto cubre el inicio del periodo', app: desde, control: p === 'Todo' ? 'primer dato' : `≤ ${new Date(abre * 1000 + 86400000).toISOString().slice(0, 10)}`, dif: '-', ok: p === 'Todo' || desde <= new Date(abre * 1000 + 86400000).toISOString().slice(0, 10) })
      await captura(`grafica-${p}`)
    }
    expect(true).toBe(true)
  })

  it('Operaciones: todas las filas', async () => {
    await page.getByText('Ver todas').click(); await page.waitForTimeout(900)
    const P = preciosBtc.EUR
    const lista = K.ordenar(ops).reverse()
    const tarjetas = await page.locator('main li.card').all()
    filas.push({ pantalla: 'Operaciones', cifra: 'Número de filas', app: String(tarjetas.length), control: String(lista.length), dif: '-', ok: tarjetas.length === lista.length })
    for (const [i, o] of lista.entries()) {
      const tx = (await tarjetas[i].innerText()).replace(/\s+/g, ' ')
      const f = K.filaCompra(o, P)
      igual('Operaciones', `Fila ${i + 1}: fecha`, tx.match(/\d{2}\/\d{2}\/\d{4}/)![0], fmtFecha(o.fecha))
      comparar('Operaciones', `Fila ${i + 1}: cantidad`, tx.match(/Compra · \d{2}\/\d{2}\/\d{4} ([\d.,]+ €)/)![1], o.cantidad)
      comparar('Operaciones', `Fila ${i + 1}: precio`, tx.match(/Precio ([\d.,]+ €)/)![1], o.precio, 0)
      comparar('Operaciones', `Fila ${i + 1}: comisión`, tx.match(/comisión ([\d.,]+ €)/)![1], o.comision)
      comparar('Operaciones', `Fila ${i + 1}: % comisión`, tx.match(/\(([\d.,]+ %)\)/)![1], f.pctCom.mul(100), 2)
      comparar('Operaciones', `Fila ${i + 1}: BTC`, tx.match(/([\d,]+) BTC/)![1], f.btc, 8)
      comparar('Operaciones', `Fila ${i + 1}: vale hoy`, tx.match(/vale ([\d.,]+ €)/)![1], f.valor)
      comparar('Operaciones', `Fila ${i + 1}: rentabilidad %`, tx.match(/([▲▼] [−+-]?[\d.,]+ %)/)![1], f.rent.mul(100), 1)
    }
    await captura('operaciones')
  })

  it('Estadísticas: Mi cartera y Mis compras', async () => {
    await irA('/estadisticas')
    const P = preciosBtc.EUR
    const t = K.totales(ops, P)
    // Mi cartera
    const serie = K.serieCartera(ops, historico)
    const dd = K.drawdown(serie)
    const h = K.hitos(serie)!
    const tx = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    comparar('Estadísticas · Mi cartera', 'Máxima caída %', tx.match(/Máxima caída: ([−+-]?[\d.,]+ %)/)![1], new Decimal(dd.reduce((m: Decimal, x: { caida: Decimal }) => Decimal.min(m, x.caida), new Decimal(0))).mul(100), 1)
    comparar('Estadísticas · Mi cartera', 'Mejor día (€)', tx.match(/Mejor día: [\d/]+ · \+([\d.,]+ €)/)![1], h.mejor.cambio.abs())
    comparar('Estadísticas · Mi cartera', 'Peor día (€)', tx.match(/Peor día: [\d/]+ · −([\d.,]+ €)/)![1], h.peor.cambio.abs())
    comparar('Estadísticas · Mi cartera', 'Máximo valor (€)', tx.match(/Máximo valor: ([\d.,]+ €)/)![1], h.maximo.valor)
    await captura('estadisticas-cartera')
    // Mis compras
    await page.getByRole('tab', { name: 'Mis compras' }).click(); await page.waitForTimeout(900)
    const tc = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    comparar('Estadísticas · Mis compras', 'Sats acumulados', tc.match(/Satoshis acumulados ([\d.]+) sats/i)![1], K.sats(t.btc), 0)
    const hg = K.histograma(ops, P, 8)
    comparar('Estadísticas · Mis compras', '% de compras en ganancias', tc.match(/El ([\d.,]+ %) de tus compras/)![1], hg.pctGanancias.mul(100), 0)
    comparar('Estadísticas · Mis compras', 'Comisiones pagadas', tc.match(/Comisiones ([\d.,]+ €) pagadas/)![1], t.comisiones)
    comparar('Estadísticas · Mis compras', '% de lo metido en comisiones', tc.match(/pagadas · ([\d.,]+ %)/)![1], t.pctCom.mul(100), 2)
    const mp = K.mejorPeor(ops, P)
    comparar('Estadísticas · Mis compras', 'Mejor compra %', tc.match(/Mejor: [\d/]+ · [▲▼] ([−+-]?[\d.,]+ %)/)![1], mp.mejor.rent.mul(100), 1)
    comparar('Estadísticas · Mis compras', 'Peor compra %', tc.match(/Peor: [\d/]+ · [▲▼] ([−+-]?[\d.,]+ %)/)![1], mp.peor.rent.mul(100), 1)
    const pd = K.primerDia(ops, P)!
    comparar('Estadísticas · Mis compras', 'Primer día: valdría', tc.match(/Valdría ([\d.,]+ €)/)![1], pd.valor)
    comparar('Estadísticas · Mis compras', 'Primer día: tu cartera real vale', tc.match(/real vale ([\d.,]+ €)/)![1], pd.valorReal)
    const cal = K.calendarioDca(ops, new Date().toISOString().slice(0, 10), 26)
    comparar('Estadísticas · Mis compras', 'Semanas con compra (de 26)', tc.match(/(\d+) de 26 semanas/)![1], cal.filter((s: { compras: number }) => s.compras > 0).length, 0)
    const plat = K.comisionPorPlataforma(ops)
    for (const pl of plat) {
      const fila = await page.locator(`tr:has-text("${pl.plataforma}")`).first().innerText()
      comparar('Estadísticas · Mis compras', `Comisión media en ${pl.plataforma} %`, fila.replace(/\s+/g, ' ').match(/([\d.,]+ %)/)![1], pl.pct.mul(100), 2)
    }
    await captura('estadisticas-compras')
  })

  it('Plan: niveles y DCA', async () => {
    await irA('/'); await page.getByRole('link', { name: 'Plan y objetivos' }).click(); await page.waitForTimeout(900)
    const niv = K.estadoNiveles(plan, ops, preciosBtc)
    const filasN = await page.locator('section[aria-label="Niveles clave"] tbody tr').all()
    for (const [i, n] of niv.entries()) {
      const c = (await filasN[i].locator('td').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim())
      comparar('Plan', `Nivel ${i + 1}: precio`, c[0], n.precio, 0)
      comparar('Plan', `Nivel ${i + 1}: importe`, c[1], n.importe)
      igual('Plan', `Nivel ${i + 1}: estado`, c[2].replace('✓ ', ''), n.estado)
    }
    const tx = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    comparar('Plan', 'Total planificado %', tx.match(/Total planificado: ([\d.,]+) %/)![1], K.totalPlanificado(plan), 0)
    const hoy = new Date().toISOString().slice(0, 10)
    const pd = K.progresoDca(plan, hoy)
    comparar('Plan', 'DCA: semana actual', tx.match(/Semana (\d+) de/)![1], pd.semana, 0)
    comparar('Plan', 'DCA: importe semanal', tx.match(/de \d+ · ([\d.,]+ €) por semana/)![1], pd.semanal)
    comparar('Plan', 'DCA: queda por meter', tx.match(/quedan por meter ([\d.,]+ €)/)![1], pd.queda)
    await captura('plan')
  })

  it('Calculadoras: 3 valores de prueba en cada una', async () => {
    await irA('/'); await page.getByRole('link', { name: 'Calculadoras' }).click(); await page.waitForTimeout(900)
    const P = preciosBtc.EUR
    const t = K.totales(ops, P)
    // Bajar mi media
    for (const f of [0.95, 0.9, 0.8]) {
      const obj = Math.round(t.medioReal.mul(f).toNumber())
      await sec('Bajar mi media').getByRole('textbox').fill(String(obj))
      await page.waitForTimeout(250)
      const tx = (await sec('Bajar mi media').innerText()).replace(/\s+/g, ' ')
      const k = K.bajarMedia(ops, obj, P)
      if (k.posible) {
        comparar('Calculadoras · Bajar mi media', `Objetivo ${obj}: importe a comprar`, tx.match(/comprar ([\d.,]+ €)/)![1], k.importe)
        comparar('Calculadoras · Bajar mi media', `Objetivo ${obj}: BTC nuevos`, tx.match(/\(([\d,]+) BTC\)/)![1], k.btcNuevos, 8)
        comparar('Calculadoras · Bajar mi media', `Objetivo ${obj}: nueva media`, tx.match(/quedaría en ([\d.,]+ €)/)![1], k.nuevaMedia)
      } else igual('Calculadoras · Bajar mi media', `Objetivo ${obj}`, 'no posible', 'no posible')
    }
    // ¿Y si BTC llega a X?
    for (const x of [30000, 100000, 250000]) {
      const caja = sec('¿Y si BTC llega a X?')
      await caja.locator('input[inputmode="decimal"]').fill(String(x)); await page.waitForTimeout(250)
      const tx = (await caja.innerText()).replace(/\s+/g, ' ')
      const e = K.escenario(ops, x)
      comparar('Calculadoras · ¿Y si BTC llega a X?', `A ${x}: valor`, tx.match(/valdría ([\d.,]+ €)/)![1], e.valor)
      const [g, r] = nums(tx.slice(tx.indexOf('valdría')).replace(/valdría [\d.,]+ €/, ''))
      comparar('Calculadoras · ¿Y si BTC llega a X?', `A ${x}: ganancia`, g, e.ganancia, 2)
      comparar('Calculadoras · ¿Y si BTC llega a X?', `A ${x}: rentabilidad %`, r, e.rent.mul(100), 2)
    }
    // Si vendo hoy: todo y 3 cantidades
    const venta = sec('Si vendo hoy')
    const leerVenta = async (etq: string, btc?: number) => {
      const tx = (await venta.innerText()).replace(/\s+/g, ' ')
      const k = K.siVendoHoy(ops, P, btc)
      comparar('Calculadoras · Si vendo hoy', `${etq}: recibes`, tx.match(/recibes ([\d.,]+ €)/)![1], k.ingreso)
      comparar('Calculadoras · Si vendo hoy', `${etq}: coste FIFO`, tx.match(/\(FIFO\): ([\d.,]+ €)/)![1], k.coste)
      comparar('Calculadoras · Si vendo hoy', `${etq}: ganancia`, tx.match(/pérdida: ([+−-]?[\d.,]+ €)/)![1], k.ganancia)
      comparar('Calculadoras · Si vendo hoy', `${etq}: IRPF estimado`, tx.match(/estimado: ([\d.,]+ €)/)![1], k.irpf)
    }
    await leerVenta('Vender todo')
    await venta.getByRole('checkbox').uncheck()
    for (const f of [0.1, 0.5, 0.9]) {
      const btc = Number(t.btc.mul(f).toFixed(6))
      await venta.locator('input[inputmode="decimal"]').fill(String(btc).replace('.', ',')); await page.waitForTimeout(250)
      await leerVenta(`Vender ${btc} BTC`, btc)
    }
    await captura('calculadoras')
  })

  it('Trading: totales, ganado, perdido, neto y detalle de cada trade', async () => {
    await irA('/trading')
    await page.waitForSelector('section[aria-label="Ganado, perdido y neto"]')
    const trades = tradesDemo().map((t) => ({ ...t, moneda: t.moneda as Mon }))
    const k = K.totalesTradingCtl(trades, preciosBtc, 'EUR')
    const caja = sec('Ganado, perdido y neto')
    const v = (await caja.locator('.stat .num').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '))
    comparar('Trading', 'Ganado (BTC)', v[0], k.ganado, 8)
    comparar('Trading', 'Perdido (BTC, se muestra con signo menos)', v[1], k.perdido.neg(), 8)
    comparar('Trading', 'Neto = ganado − perdido (BTC)', v[2], k.neto, 8)
    comparar('Trading', 'Neto × precio actual (€)', v[3], k.netoValor, 2)
    const res = (await sec('Resumen de trading').innerText()).replace(/\s+/g, ' ')
    comparar('Trading', 'Neto del resumen (BTC)', res.match(/Neto ([−+-]?[\d,]+) BTC/)![1], k.neto, 8)
    comparar('Trading', 'Valor del neto del resumen (€)', res.match(/BTC · ([−+-]?[\d.,]+) €/)![1], k.netoValor, 2)
    comparar('Trading', 'Media por trade %', res.match(/([▲▼■] [−+-]?[\d.,]+ %) Media por trade/)![1], k.pctMedia.mul(100), 2)
    const chips = (await page.locator('.chips .chip').allInnerTexts()).join(' | ').replace(/\s+/g, ' ')
    comparar('Trading', '% de ganadores', chips.match(/GANADORES ([\d.,]+ %)/i)![1], k.pctGanadores.mul(100), 0)
    comparar('Trading', 'Duración media (d)', chips.match(/DURACIÓN MEDIA ([\d,]+) d/i)![1], k.duracionMedia, 1)
    const km = K.porMesCtl(trades, preciosBtc).reverse()
    const filasMes = await sec('Por mes').locator('tbody tr').all()
    igual('Trading · Por mes', 'Número de meses', String(filasMes.length), String(km.length))
    for (let i = 0; i < filasMes.length; i++) {
      const c = await filasMes[i].locator('td').allInnerTexts()
      igual('Trading · Por mes', `Mes ${i + 1}`, c[0].trim(), km[i].mes.split('-').reverse().join('/'))
      igual('Trading · Por mes', `${c[0].trim()}: nº de trades`, c[1].trim(), String(km[i].n))
      comparar('Trading · Por mes', `${c[0].trim()}: BTC ganados`, c[2], km[i].btc, 8)
      comparar('Trading · Por mes', `${c[0].trim()}: media por trade %`, c[3], km[i].pctMedia.mul(100), 2)
    }
    // Detalle de un trade (el primero de la lista es el abierto más reciente; se abre el último cerrado)
    const cerrados = k.filas
    await page.getByRole('button', { name: 'Cerrados' }).click(); await page.waitForTimeout(300)
    await page.locator('.trade-fila').first().click(); await page.waitForTimeout(600)
    const ficha = (await page.locator('[role="dialog"]').innerText()).replace(/\s+/g, ' ')
    const ult = cerrados[cerrados.length - 1]
    comparar('Trading · ficha del último cerrado', '% del trade', ficha.match(/([▲▼■] [−+-]?[\d.,]+ %)/)![1], ult.pct.mul(100), 2)
    comparar('Trading · ficha del último cerrado', 'Ganado (BTC)', ficha.match(/(?:Ganado|Perdido) ([−+-]?[\d,]+) BTC/)![1], ult.btcN, 8)
    comparar('Trading · ficha del último cerrado', 'Total tras este trade (BTC)', ficha.match(/Total tras este trade ([−+-]?[\d,]+) BTC/)![1], ult.acumulado, 8)
    comparar('Trading · ficha del último cerrado', 'Vale hoy (€)', ficha.match(/Vale hoy ([−+-]?[\d.,]+) €/)![1], ult.valeHoy, 2)
    comparar('Trading · ficha del último cerrado', 'Valía al cerrar (€)', ficha.match(/Valía al cerrar ([−+-]?[\d.,]+) €/)![1], ult.valia, 2)
    // El margen destinado y la nota (informativos) se ven en el detalle y no cambian ninguna cifra (las de arriba ya coinciden con el control)
    const dest = trades.find((x: { id: string }) => x.id === 'demo-t13') as { margenDestinado?: number; nota?: string } | undefined
    expect(dest?.margenDestinado).toBeGreaterThan(0)
    igual('Trading · ficha', 'Muestra «Margen destinado»', /Margen destinado 0,08 BTC/.test(ficha) ? 'sí' : 'no', 'sí')
    igual('Trading · ficha', 'Muestra la nota del trade', ficha.includes(dest!.nota!) ? 'sí' : 'no', 'sí')
    await page.keyboard.press('Escape')
    await captura('trading')
  })

  it('Inicio pro: las mismas cifras que en simple, frente a la calculadora de control', async () => {
    await irA('/')
    await page.waitForSelector('section[aria-label="Saldo"]')
    await page.getByRole('group', { name: 'Moneda' }).getByRole('button', { name: 'EUR' }).click()
    await page.waitForTimeout(300)
    const P = preciosBtc.EUR
    const t = K.totales(ops, P)
    // En simple (referencia) y luego en pro: tienen que dar exactamente lo mismo.
    const simple = (await sec('Saldo').locator('.big .sr').textContent())!
    await page.getByRole('button', { name: 'Cambiar a vista pro' }).click()
    await page.waitForSelector('section[aria-label="Resumen pro"]')
    await page.waitForTimeout(1200)
    const pro = sec('Resumen pro')
    const valorPro = (await pro.locator('.pro-valor .sr').textContent())!
    igual('Inicio pro', 'Valor estimado = el de la vista simple', valorPro.trim(), simple.trim())
    comparar('Inicio pro', 'Valor estimado', valorPro, t.valor)
    const pnl = (await pro.innerText()).replace(/\s+/g, ' ')
    const [g, r] = nums(pnl.slice(pnl.indexOf('PnL')))
    comparar('Inicio pro', 'PnL (€)', g, t.ganancia, 2)
    comparar('Inicio pro', 'PnL (%)', r, t.rent.mul(100), 2)
    const celdas = await pro.locator('.pro-tabla-mini td').allInnerTexts()
    comparar('Inicio pro', 'BTC', celdas[0], t.btc, 8)
    comparar('Inicio pro', 'Precio medio', celdas[1], t.medioReal)
    comparar('Inicio pro', 'Metido', celdas[2], t.invertido)
    comparar('Inicio pro', 'Comisiones', celdas[3], t.comisiones)
    // Historial: la compra más reciente
    const ultima = [...ops].filter((o) => o.tipo === 'compra').sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0]
    const o = opsEn('EUR').find((x: { fecha: string }) => x.fecha === ultima.fecha)!
    const f = K.filaCompra(o, P)
    const fila = (await sec('Historial de operaciones').locator('tbody tr').first().innerText()).replace(/\s+/g, ' ')
    igual('Inicio pro', 'Historial: fecha de la compra más reciente', fila.match(/(\d{2}\/\d{2}\/\d{4})/)![1], fmtFecha(ultima.fecha))
    igual('Inicio pro', 'Historial: hora de la compra más reciente', fila.match(/\d{2}\/\d{2}\/\d{4} (\d{2}:\d{2})/)?.[1] ?? '(sin hora)', (ultima as { hora?: string }).hora ?? '(sin hora)')
    const sinHora = (await sec('Historial de operaciones').locator('tbody tr').nth(3).innerText()).replace(/\s+/g, ' ')
    igual('Inicio pro', 'Historial: una compra sin hora solo enseña la fecha', /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(sinHora) ? 'con hora' : 'solo fecha', 'solo fecha')
    comparar('Inicio pro', 'Historial: BTC', fila.match(/([\d,]+) BTC/)![1], f.btc, 8)
    comparar('Inicio pro', 'Historial: importe', fila.match(/([\d.,]+) € [▲▼]/)![1], o.cantidad)
    comparar('Inicio pro', 'Historial: PnL', fila.match(/[▲▼] ([−+-]?[\d.,]+) €$/)![1], f.ganancia, 2)
    await captura('inicio-pro')
    await page.getByRole('button', { name: 'Cambiar a vista simple' }).click()
    await page.waitForSelector('section[aria-label="Saldo"]')
  })

  it('Trading: «Resultado en dinero» (pérdida) → BTC con la vela de Kraken, y resta en Neto y Por mes', async () => {
    // Kraken simulado: una vela diaria de hoy con VWAP 81.300 (número inventado)
    const t0 = Math.floor(Date.now() / 1000 / 86400) * 86400
    await page.route('https://api.kraken.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ error: [], result: { XXBTZEUR: [[t0, '81000', '82000', '80000', '81500', '81300', '10', 5]], last: t0 } }) }))
    await irA('/trading')
    await page.getByRole('heading', { name: 'Trading', level: 1 }).waitFor()
    await page.locator('.fab').click()
    await page.getByRole('dialog', { name: '¿Qué quieres apuntar?' }).getByRole('button', { name: 'Nuevo trade' }).click()
    const f = page.getByRole('dialog', { name: 'Nuevo trade' })
    await f.getByLabel('Precio de entrada').fill('50000')
    await f.getByLabel('Precio de salida').fill('51000')
    await f.getByLabel('Resultado en dinero (opcional)').fill('-100')
    await f.getByLabel('Moneda del resultado').selectOption('EUR')
    await f.getByText(/−100 € → −0,00123001 BTC a 81\.300 €\/BTC/).waitFor({ timeout: 5000 })
    const prev = (await f.getByText(/−100 € →/).innerText()).replace(/\s+/g, ' ')
    igual('Trading · resultado en dinero', 'Vista previa antes de guardar', prev.match(/−100 € → −0,00123001 BTC a 81\.300 €\/BTC/)?.[0] ?? prev, '−100 € → −0,00123001 BTC a 81.300 €/BTC')
    await f.getByRole('button', { name: 'Guardar' }).click()
    await f.waitFor({ state: 'detached' })
    await page.waitForTimeout(500)
    // Neto y Por mes con la pérdida, frente a la calculadora de control
    const hoy = new Date().toISOString().slice(0, 10)
    const extra = { id: 'nuevo', estado: 'cerrado', direccion: 'largo', fechaInicio: hoy, fechaCierre: hoy, precioEntrada: 50000, precioSalida: 51000, moneda: 'USD', resultadoDinero: -100, resultadoMoneda: 'EUR', resultadoPrecio: 81300 }
    const todos = [...tradesDemo().map((t) => ({ ...t, moneda: t.moneda as Mon })), extra]
    const k = K.totalesTradingCtl(todos, preciosBtc, 'EUR')
    const v = (await sec('Ganado, perdido y neto').locator('.stat .num').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '))
    comparar('Trading · con pérdida en dinero', 'Ganado (BTC)', v[0], k.ganado, 8)
    comparar('Trading · con pérdida en dinero', 'Perdido (BTC, con signo menos)', v[1], k.perdido.neg(), 8)
    comparar('Trading · con pérdida en dinero', 'Neto (BTC)', v[2], k.neto, 8)
    comparar('Trading · con pérdida en dinero', 'Neto × precio actual (€)', v[3], k.netoValor, 2)
    const km = K.porMesCtl(todos, preciosBtc).reverse()
    const mes = (await sec('Por mes').locator('tbody tr').first().locator('td').allInnerTexts())
    igual('Trading · con pérdida en dinero', 'Por mes: mes actual', mes[0].trim(), km[0].mes.split('-').reverse().join('/'))
    comparar('Trading · con pérdida en dinero', 'Por mes: BTC del mes actual', mes[2], km[0].btc, 8)
    // El detalle enseña el importe, la moneda y el precio usado
    await page.getByRole('button', { name: 'Cerrados' }).click(); await page.waitForTimeout(300)
    await page.locator('.trade-fila').first().click(); await page.waitForTimeout(500)
    const ficha = (await page.locator('[role="dialog"]').innerText()).replace(/\s+/g, ' ')
    igual('Trading · ficha', 'Resultado en dinero', /Resultado en dinero −100 EUR/.test(ficha) ? 'sí' : 'no', 'sí')
    igual('Trading · ficha', 'Precio de BTC usado', /Precio de BTC usado 81\.300 EUR\/BTC/.test(ficha) ? 'sí' : 'no', 'sí')
    comparar('Trading · ficha', 'BTC del trade (resultado ÷ precio)', ficha.match(/(?:Ganado|Perdido) ([−+-]?[\d,]+) BTC/)![1], new Decimal(-100).div(81300).toDecimalPlaces(8), 8)
    // Se borra para dejar la demo como estaba
    await page.getByRole('button', { name: 'Borrar', exact: true }).click()
    await page.getByRole('dialog', { name: '¿Borrar este trade?' }).getByRole('button', { name: 'Borrar', exact: true }).click()
    await page.waitForTimeout(500)
    await page.unroute('https://api.kraken.com/**')
  })

  it('Sumar Trading a la cartera: apagado por defecto; encendido, Cartera / Trading (neto) / Total; el precio medio no cambia', async () => {
    await irA('/ajustes')
    await page.getByRole('heading', { name: 'Ajustes', level: 1 }).waitFor()
    const casilla = page.getByRole('checkbox', { name: /Sumar los BTC ganados con trades a mi cartera/ })
    igual('Sumar Trading a la cartera', 'Por defecto está desactivado', (await casilla.isChecked()) ? 'activado' : 'desactivado', 'desactivado')
    await irA('/')
    await page.getByRole('group', { name: 'Moneda' }).getByRole('button', { name: 'EUR' }).click()
    await page.waitForSelector('section[aria-label="Saldo"]')
    igual('Sumar Trading a la cartera', 'Apagado: Inicio no enseña el desglose', String(await page.getByRole('table', { name: 'Cartera, Trading y Total' }).count()), '0')
    const medioAntes = (await page.locator('.chip', { hasText: 'Precio medio' }).locator('.v').innerText()).trim()
    // Se activa
    await irA('/ajustes')
    await casilla.check(); await page.waitForTimeout(400)
    await irA('/')
    const tabla = page.getByRole('table', { name: 'Cartera, Trading y Total' })
    await tabla.waitFor()
    const P = preciosBtc.EUR
    const t = K.totales(ops, P)
    const trades = tradesDemo().map((x) => ({ ...x, moneda: x.moneda as Mon }))
    const k = K.totalesTradingCtl(trades, preciosBtc, 'EUR')
    const leer = async () => {
      const filas = await tabla.locator('tbody tr').all()
      const r: Record<string, string[]> = {}
      for (const f of filas) { const c = (await f.locator('th, td').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim()); r[c[0].toLowerCase()] = c.slice(1) }
      return r
    }
    const a = await leer()
    comparar('Sumar Trading · Inicio', 'Cartera: BTC', a['cartera'][0], t.btc, 8)
    comparar('Sumar Trading · Inicio', 'Cartera: valor', a['cartera'][1], t.valor, 2)
    comparar('Sumar Trading · Inicio', 'Trading (neto): BTC', a['trading (neto)'][0], k.neto, 8)
    comparar('Sumar Trading · Inicio', 'Trading (neto): valor', a['trading (neto)'][1], k.netoValor, 2)
    comparar('Sumar Trading · Inicio', 'Total: BTC', a['total'][0], t.btc.plus(k.neto), 8)
    comparar('Sumar Trading · Inicio', 'Total: valor', a['total'][1], t.valor.plus(k.netoValor), 2)
    comparar('Sumar Trading · Inicio', 'Valor actual = Total', (await sec('Saldo').locator('.big .sr').textContent())!, t.valor.plus(k.netoValor))
    igual('Sumar Trading · Inicio', 'El precio medio no cambia', (await page.locator('.chip', { hasText: 'Precio medio' }).locator('.v').innerText()).trim(), medioAntes)
    // Una pérdida grande (−5.000 € a 81.300 €/BTC ≈ −0,0615 BTC) hace el neto negativo: el Total baja por debajo de la Cartera
    await page.route('https://api.kraken.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ error: [], result: { XXBTZEUR: [[Math.floor(Date.now() / 1000 / 86400) * 86400, '81000', '82000', '80000', '81500', '81300', '10', 5]], last: 0 } }) }))
    await page.locator('.fab').click()
    await page.getByRole('dialog', { name: '¿Qué quieres apuntar?' }).getByRole('button', { name: 'Nuevo trade' }).click()
    const f = page.getByRole('dialog', { name: 'Nuevo trade' })
    await f.getByLabel('Precio de entrada').fill('50000'); await f.getByLabel('Precio de salida').fill('51000')
    await f.getByLabel('Resultado en dinero (opcional)').fill('-5000')
    await f.getByLabel('Moneda del resultado').selectOption('EUR')
    await f.getByText(/−5000 € → −0,06150062 BTC a 81\.300 €\/BTC/).waitFor({ timeout: 5000 })
    await f.getByRole('button', { name: 'Guardar' }).click(); await f.waitFor({ state: 'detached' }); await page.waitForTimeout(600)
    const hoy = new Date().toISOString().slice(0, 10)
    const conPerdida = [...trades, { id: 'nuevo', estado: 'cerrado', direccion: 'largo', fechaInicio: hoy, fechaCierre: hoy, precioEntrada: 50000, precioSalida: 51000, moneda: 'USD', resultadoDinero: -5000, resultadoMoneda: 'EUR', resultadoPrecio: 81300 }]
    const k2 = K.totalesTradingCtl(conPerdida, preciosBtc, 'EUR')
    expect(k2.neto.lt(0), 'el neto con la pérdida es negativo').toBe(true)
    const b = await leer()
    comparar('Sumar Trading · con pérdida', 'Trading (neto): BTC (negativo)', b['trading (neto)'][0], k2.neto, 8)
    comparar('Sumar Trading · con pérdida', 'Total: BTC', b['total'][0], t.btc.plus(k2.neto), 8)
    comparar('Sumar Trading · con pérdida', 'Total: valor', b['total'][1], t.valor.plus(k2.netoValor), 2)
    expect(num(b['total'][0]), 'el Total en BTC baja de la Cartera').toBeLessThan(num(b['cartera'][0]))
    igual('Sumar Trading · con pérdida', 'El precio medio sigue igual', (await page.locator('.chip', { hasText: 'Precio medio' }).locator('.v').innerText()).trim(), medioAntes)
    // Se deja todo como estaba: se borra el trade, se apaga el ajuste
    await irA('/trading')
    await page.getByRole('button', { name: 'Cerrados' }).click(); await page.waitForTimeout(300)
    await page.locator('.trade-fila').first().click(); await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'Borrar', exact: true }).click()
    await page.getByRole('dialog', { name: '¿Borrar este trade?' }).getByRole('button', { name: 'Borrar', exact: true }).click()
    await page.waitForTimeout(400)
    await page.unroute('https://api.kraken.com/**')
    await irA('/ajustes')
    await casilla.uncheck(); await page.waitForTimeout(300)
    igual('Sumar Trading a la cartera', 'Apagado otra vez', (await casilla.isChecked()) ? 'activado' : 'desactivado', 'desactivado')
  })
})
