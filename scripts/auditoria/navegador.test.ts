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
    comparar('Trading', '% total', res.match(/([▲▼■] [−+-]?[\d.,]+ %)/)![1], k.pctTotal.mul(100), 2)
    const chips = (await page.locator('.chips .chip').allInnerTexts()).join(' | ').replace(/\s+/g, ' ')
    comparar('Trading', '% de ganadores', chips.match(/GANADORES ([\d.,]+ %)/i)![1], k.pctGanadores.mul(100), 0)
    comparar('Trading', 'Ganancia media %', chips.match(/GANANCIA MEDIA ([−+-]?[\d.,]+ %)/i)![1], k.gananciaMedia.mul(100), 2)
    comparar('Trading', 'Duración media (d)', chips.match(/DURACIÓN MEDIA ([\d,]+) d/i)![1], k.duracionMedia, 1)
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
    await page.keyboard.press('Escape')
    await captura('trading')
  })
})
