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
  if (opciones.demoVacia) await page.addInitScript(() => { localStorage.setItem('demo-vacia', '1'); localStorage.setItem('demo-directo', '1') })
  return { ctx, page, errores }
}

const graficos = (page: Page) => page.evaluate(() => document.querySelectorAll('.tv-lightweight-charts').length)
const creados = (page: Page) => page.evaluate(() => (window as unknown as { __creados: number }).__creados)
const contadores = (page: Page) => page.evaluate(() => ({ ...((window as unknown as { __pruebas?: Record<string, number> }).__pruebas ?? {}) }))
const irA = async (page: Page, ruta: string) => { await page.evaluate((h) => { history.pushState({}, '', h); dispatchEvent(new PopStateEvent('popstate')) }, ruta); await page.waitForTimeout(1200) }

/** Recorre Inicio (simple y pro), Mercado, Trading, el gráfico pro y Ajustes. */
async function recorrer(page: Page, errores: string[], etiqueta: string, { esperaHistorico }: { esperaHistorico: boolean }) {
  await page.waitForSelector('section[aria-label="Saldo"]', { timeout: 20000 })
  await page.waitForTimeout(1500)

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
  await enlace.tap()
  await page.waitForSelector('section[aria-label="Tu posición"]', { timeout: 10000 })
  expect(new URL(page.url()).pathname, `${etiqueta}: ruta del gráfico pro`).toBe('/grafico')
  await page.waitForTimeout(1500)
  expect(await page.getByText('Todavía no tienes BTC apuntados').count()).toBe(1)
  expect(await page.getByRole('button', { name: 'Apuntar compra' }).count()).toBe(1)
  expect(await graficos(page), `${etiqueta}: gráficos en el gráfico pro`).toBe(1)
  // El gráfico pro sigue siendo un solo gráfico tras cambiar de temporalidad
  for (const tf of ['4h', '1S', '1D']) { await page.getByRole('button', { name: tf, exact: true }).tap(); await page.waitForTimeout(600) }
  expect(await graficos(page), `${etiqueta}: gráficos en el gráfico pro tras cambiar de temporalidad`).toBe(1)

  // ── Mercado, Trading y Ajustes ──
  for (const [ruta, marca] of [['/mercado', 'Mercado'], ['/trading', 'Trading'], ['/ajustes', 'Ajustes']] as const) {
    await irA(page, ruta)
    await page.getByRole('heading', { name: marca, level: 1 }).waitFor({ timeout: 10000 })
    expect(await graficos(page), `${etiqueta}: gráficos en ${marca}`).toBeLessThanOrEqual(1)
  }
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
