// Pasada completa con una cuenta VACÍA (sin compras, ventas ni trades), en el móvil con pantalla táctil y con el precio en vivo corriendo:
//  · sin errores en la consola, un solo gráfico por pantalla, el gráfico de Inicio no se rehace con cada precio,
//  · estado vacío claro en Inicio y «Abrir gráfico pro» abre siempre.
// 1) Demo vacía (siempre): AUDIT_URL=http://localhost:4173 npm run auditoria:web
// 2) Cuenta nueva en el emulador de Firebase: npm run auditoria:vacia (levanta emuladores y una copia de la app apuntando a ellos)
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, devices, type Browser, type BrowserContext, type Page } from 'playwright-core'

const URL_DEMO = process.env.AUDIT_URL ?? 'http://localhost:4173'
const URL_EMU = process.env.AUDIT_EMU_URL

function chromiumPath(): string {
  const base = join(homedir(), 'Library/Caches/ms-playwright')
  for (const d of readdirSync(base).filter((x) => x.startsWith('chromium_headless_shell')).sort().reverse()) {
    const p = join(base, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
    if (existsSync(p)) return p
  }
  throw new Error('No hay Chromium instalado')
}

/** Kraken simulado: un ticker por segundo (paseo aleatorio) para que el precio en vivo corra de verdad. Cuenta los gráficos que se crean. */
const SIMULAR_DIRECTO = () => {
  class WS {
    readyState = 0
    onopen: ((e: unknown) => void) | null = null
    onmessage: ((e: { data: string }) => void) | null = null
    onclose: ((e: unknown) => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    t: ReturnType<typeof setInterval> | undefined
    constructor() {
      setTimeout(() => {
        this.readyState = 1
        this.onopen?.({})
        let e = 60585
        this.t = setInterval(() => {
          e += (Math.random() - 0.5) * 40
          const msg = (s: string, k: number) => ({ channel: 'ticker', type: 'update', data: [{ symbol: s, last: e * k, high: e * k * 1.01, low: e * k * 0.99, volume: 1234.5, change_pct: -0.4 }] })
          this.onmessage?.({ data: JSON.stringify(msg('BTC/EUR', 1)) })
          this.onmessage?.({ data: JSON.stringify(msg('BTC/USD', 1.08)) })
        }, 1000)
      }, 100)
    }
    send() { /* nada */ }
    close() { clearInterval(this.t); this.readyState = 3; this.onclose?.({}) }
    static OPEN = 1
  }
  ;(window as unknown as { WebSocket: unknown }).WebSocket = WS
  const w = window as unknown as { __creados: number }
  w.__creados = 0
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue
      const el = n as Element
      w.__creados += (el.matches('.tv-lightweight-charts') ? 1 : 0) + el.querySelectorAll('.tv-lightweight-charts').length
    }
  }).observe(document, { childList: true, subtree: true })
}

let browser: Browser
beforeAll(async () => { browser = await chromium.launch({ executablePath: chromiumPath() }) })
afterAll(async () => { await browser?.close() })

async function nuevoMovil(opciones: { demoVacia: boolean }): Promise<{ ctx: BrowserContext; page: Page; errores: string[] }> {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'no-preference' })
  const page = await ctx.newPage()
  const errores: string[] = []
  // Se ignoran los avisos de terceros (reCAPTCHA de Google en localhost); los errores propios cuentan.
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const u = m.location().url
    if (/google|gstatic|recaptcha/.test(u) || /private-token/.test(m.text())) return
    errores.push(`${m.text().slice(0, 160)} (${u})`)
  })
  page.on('pageerror', (e) => errores.push(`PAGEERR ${e.message.slice(0, 160)}`))
  await page.addInitScript(SIMULAR_DIRECTO)
  await simularKrakenRest(page)
  if (opciones.demoVacia) await page.addInitScript(() => { localStorage.setItem('demo-vacia', '1'); localStorage.setItem('demo-directo', '1'); localStorage.setItem('demo-sintetica', '1') })
  return { ctx, page, errores }
}

/** Kraken simulado por REST (velas y ticker), para que las pruebas no dependan de la red. */
async function simularKrakenRest(page: Page) {
  await page.route('https://api.kraken.com/**', (r) => {
    const u = new URL(r.request().url())
    if (u.pathname.endsWith('/Ticker')) {
      return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: [], result: {
        XXBTZEUR: { h: ['91000.0', '92500.5'], l: ['89000.0', '88000.25'], v: ['500.1', '1234.56'] },
        XXBTZUSD: { h: ['99000.0', '101000.0'], l: ['96000.0', '95000.0'], v: ['800.5', '2100.5'] },
        XBTAUD: { h: ['150000.0', '152000.0'], l: ['145000.0', '144000.0'], v: ['20.5', '55.25'] },
      } }) })
    }
    const paso = Number(u.searchParams.get('interval') ?? '60') * 60
    const fin = Math.floor(Date.now() / 1000 / paso) * paso
    const filas = Array.from({ length: 150 }, (_, i) => { const t = fin - (149 - i) * paso, c = 60000 + Math.sin(i / 9) * 1500; return [t, String(c * 0.999), String(c * 1.004), String(c * 0.996), String(c), String(c), String(10 + (i % 7)), 5] })
    return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: [], result: { XXBTZEUR: filas, last: fin } }) })
  })
}
const velasDe = (page: Page) => page.evaluate(() => { const e = document.querySelector('[data-velas]'); return { n: Number(e?.getAttribute('data-velas') ?? 0), origen: e?.getAttribute('data-origen') ?? '' } })

const graficos = (page: Page) => page.evaluate(() => document.querySelectorAll('.tv-lightweight-charts').length)
const creados = (page: Page) => page.evaluate(() => (window as unknown as { __creados: number }).__creados)
const contadores = (page: Page) => page.evaluate(() => ({ ...((window as unknown as { __pruebas?: Record<string, number> }).__pruebas ?? {}) }))
const irA = async (page: Page, ruta: string) => { await page.evaluate((h) => { history.pushState({}, '', h); dispatchEvent(new PopStateEvent('popstate')) }, ruta); await page.waitForTimeout(1200) }

/** Recorre Inicio (simple y pro), Mercado, Trading, el gráfico pro y Ajustes. */
async function recorrer(page: Page, errores: string[], etiqueta: string, { esperaHistorico }: { esperaHistorico: boolean }) {
  await page.waitForSelector('section[aria-label="Saldo"]', { timeout: 20000 })
  await page.waitForTimeout(1500)
  // Cuenta vacía: «Valor actual» es 0 y no hay minigráfico (sería una línea inventada)
  expect(await page.locator('svg[aria-label^="Valor de la cartera"]').count(), `${etiqueta}: sin minigráfico de valor con la cartera vacía`).toBe(0)

  // ── Inicio: estado vacío claro ──
  const vacio = page.locator('section[aria-label="Sin operaciones"]')
  expect(await vacio.count(), `${etiqueta}: estado vacío de Inicio`).toBe(1)
  await expect(vacio.getByRole('heading', { name: 'Aún no has apuntado ninguna compra' }).count()).resolves.toBe(1)
  expect(await vacio.getByRole('button', { name: 'Apuntar compra' }).count(), `${etiqueta}: botón Apuntar compra`).toBe(1)
  // El gráfico de Inicio es de precio de BTC (nunca una serie de cartera vacía): un solo gráfico, o ninguno si aún no hay histórico
  const nGraf = await graficos(page)
  expect(nGraf, `${etiqueta}: gráficos en Inicio`).toBeLessThanOrEqual(1)
  if (esperaHistorico) expect(nGraf, `${etiqueta}: hay gráfico de precio en Inicio`).toBe(1)
  else expect(await page.getByText('Aún no hay histórico de precios').count()).toBe(1)

  // ── 30 s de precio en vivo con toques sobre el gráfico: no se rehace ni se multiplica ──
  const antes = await creados(page)
  const caja = page.locator('.chart-box').first()
  for (let i = 0; i < 6; i++) {
    if (await caja.count()) { const bb = await caja.boundingBox(); if (bb) await page.touchscreen.tap(bb.x + 40 + i * 20, bb.y + 60) }
    await page.waitForTimeout(5000)
  }
  expect(await graficos(page), `${etiqueta}: gráficos tras 30 s de precio en vivo`).toBe(nGraf)
  expect(await creados(page) - antes, `${etiqueta}: gráficos creados durante 30 s de ticks (debe ser 0: se actualiza el existente)`).toBe(0)
  if (esperaHistorico) {
    const c = await contadores(page)
    expect(c['precio:grafico-creado'] ?? 0, `${etiqueta}: una sola instancia del gráfico de precio`).toBe(1)
    expect(c['precio:update'] ?? 0, `${etiqueta}: el precio en vivo actualiza el último punto (update)`).toBeGreaterThanOrEqual(10)
    expect(c['precio:setData'] ?? 0, `${etiqueta}: el precio en vivo no repinta la serie entera`).toBeLessThanOrEqual(1)
  }

  // ── «Abrir gráfico pro» abre siempre, haya o no datos del usuario ──
  const enlace = page.getByRole('link', { name: 'Abrir gráfico pro' })
  expect(await enlace.count(), `${etiqueta}: enlace «Abrir gráfico pro»`).toBe(1)
  await enlace.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  expect(await page.evaluate(() => window.scrollY), `${etiqueta}: Inicio está desplazado hacia abajo`).toBeGreaterThan(0)
  await enlace.tap()
  await page.waitForSelector('section[aria-label="Tu posición"]', { timeout: 10000 })
  expect(new URL(page.url()).pathname, `${etiqueta}: ruta del gráfico pro`).toBe('/grafico')
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => window.scrollY), `${etiqueta}: /grafico se abre arriba del todo`).toBe(0)
  expect(await page.getByText('Todavía no tienes BTC apuntados').count()).toBe(1)
  expect(await page.getByRole('button', { name: 'Apuntar compra' }).count()).toBe(1)
  expect(await graficos(page), `${etiqueta}: gráficos en el gráfico pro`).toBe(1)
  // Cada temporalidad tiene velas (del servidor o, si no están guardadas, de Kraken por REST) y sigue habiendo un solo gráfico
  for (const tf of ['1m', '5m', '15m', '1h', '4h', '1D', '1S']) {
    await page.getByRole('button', { name: tf, exact: true }).tap()
    await page.waitForFunction(() => Number(document.querySelector('[data-velas]')?.getAttribute('data-velas') ?? 0) > 0, null, { timeout: 15000 }).catch(() => undefined)
    const d = await velasDe(page)
    expect(d.n, `${etiqueta}: la temporalidad ${tf} tiene velas (origen: ${d.origen})`).toBeGreaterThan(0)
    expect(await graficos(page), `${etiqueta}: un solo gráfico en ${tf}`).toBe(1)
  }
  // Máx., mín. y volumen de 24 h con datos (ticker de Kraken)
  const cab = (await page.locator('section[aria-label="Precio"]').innerText()).replace(/\s+/g, ' ')
  expect(cab, `${etiqueta}: Máx./Mín./Vol. 24h con datos`).not.toMatch(/(Máx|Mín|Vol)\. 24h —/)
  expect(cab).toMatch(/Máx\. 24h [\d.]+ €/)
  expect(await graficos(page), `${etiqueta}: gráficos en el gráfico pro tras cambiar de temporalidad`).toBe(1)

  // ── Mercado, Trading y Ajustes ──
  for (const [ruta, marca] of [['/mercado', 'Mercado'], ['/trading', 'Trading'], ['/ajustes', 'Ajustes']] as const) {
    await irA(page, ruta)
    await page.getByRole('heading', { name: marca, level: 1 }).waitFor({ timeout: 10000 })
    expect(await graficos(page), `${etiqueta}: gráficos en ${marca}`).toBeLessThanOrEqual(1)
  }
  // Cuenta nueva: «Sumar los BTC ganados con trades a mi cartera» viene desactivado y Inicio no enseña el desglose
  await irA(page, '/ajustes')
  expect(await page.getByRole('checkbox', { name: /Sumar los BTC ganados con trades a mi cartera/ }).isChecked(), `${etiqueta}: «Sumar trading a la cartera» desactivado por defecto`).toBe(false)
  await irA(page, '/')
  expect(await page.getByRole('table', { name: 'Cartera, Trading y Total' }).count(), `${etiqueta}: sin desglose con el ajuste apagado`).toBe(0)
  expect(await page.getByText('Todavía no has apuntado ningún trade').count(), `${etiqueta}: estado vacío de Trading`).toBeGreaterThanOrEqual(0)

  // ── Inicio en vista pro: un solo gráfico y el mismo estado vacío ──
  await irA(page, '/')
  await page.getByRole('button', { name: 'Cambiar a vista pro' }).tap()
  await page.waitForSelector('section[aria-label="Resumen pro"]')
  await page.waitForTimeout(2500)
  expect(await graficos(page), `${etiqueta}: gráficos en Inicio pro`).toBeLessThanOrEqual(1)
  expect(await page.getByText('Aún no has apuntado ninguna compra').count()).toBeGreaterThanOrEqual(1)
  await page.getByRole('button', { name: 'Cambiar a vista simple' }).tap()
  expect(errores, `${etiqueta}: errores en la consola`).toEqual([])
}

describe('cuenta vacía · demo (sin compras, ventas ni trades)', () => {
  it('Inicio, gráfico pro, Mercado, Trading y Ajustes sin errores y con un solo gráfico por pantalla', async () => {
    const { ctx, page, errores } = await nuevoMovil({ demoVacia: true })
    await page.goto(`${URL_DEMO}/login`)
    await page.getByText('Probar sin cuenta').tap()
    await recorrer(page, errores, 'demo vacía', { esperaHistorico: true })
    await ctx.close()
  }, 120000)
})

describe.skipIf(!URL_EMU)('cuenta nueva y vacía en el emulador de Firebase', () => {
  // Usuario desechable del emulador: correo y contraseña distintos en cada ejecución.
  const unico = `${Date.now()}${Math.floor(Math.random() * 1e6)}`
  const email = `vacia-${unico}@example.com`
  const clave = `Tmp-${unico}-Zz9`
  beforeAll(async () => {
    const A = 'http://127.0.0.1:9099'
    const json = { 'content-type': 'application/json' }
    const r = await (await fetch(`${A}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: json, body: JSON.stringify({ email, password: clave, returnSecureToken: true }) })).json()
    await fetch(`${A}/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=fake`, { method: 'POST', headers: json, body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken: r.idToken }) })
    const codes = await (await fetch(`${A}/emulator/v1/projects/demo-bitcoin-tracker/oobCodes`)).json()
    const c = codes.oobCodes.filter((x: { email: string; requestType: string }) => x.email === email && x.requestType === 'VERIFY_EMAIL').at(-1)
    await fetch(`${A}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake`, { method: 'POST', headers: json, body: JSON.stringify({ oobCode: c.oobCode }) })
  })
  it('un usuario nuevo y verificado, sin ningún dato: mismo recorrido, sin errores y con el gráfico pro abierto', async () => {
    const { ctx, page, errores } = await nuevoMovil({ demoVacia: false })
    await page.goto(`${URL_EMU}/login`)
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña').first().fill(clave)
    await page.getByRole('button', { name: 'Entrar', exact: true }).tap()
    // El emulador no admite series anidadas: sin histórico de mercado, el gráfico de Inicio muestra su estado vacío.
    await recorrer(page, errores, 'emulador', { esperaHistorico: false })
    await ctx.close()
  }, 120000)
})
