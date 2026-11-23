// Demo con el precio real de BTC: solo las compras, los trades y el plan son inventados.
// Kraken se simula con datos inventados y deterministas para poder comprobar cifras exactas.
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, devices, type Browser, type Page } from 'playwright-core'

const URL_BASE = process.env.AUDIT_URL ?? 'http://localhost:4173'
function chromiumPath(): string {
  const base = join(homedir(), 'Library/Caches/ms-playwright')
  for (const d of readdirSync(base).filter((x) => x.startsWith('chromium_headless_shell')).sort().reverse()) {
    const p = join(base, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
    if (existsSync(p)) return p
  }
  throw new Error('No hay Chromium instalado')
}

const DIA = 86400
const AHORA = Math.floor(Date.now() / 1000)
const T0 = Math.floor(AHORA / DIA) * DIA
const N = 720
/** Precio de EUR del día i (0 = el más antiguo de los 720): sube 10 € por día desde 40.000. */
const precioDia = (i: number) => 40000 + i * 10
const ULTIMO = 61234.5 // precio actual (ticker)
const f = (t: number, c: number) => [t, String(c - 5), String(c + 20), String(c - 20), String(c), String(c), '10', 5]

let browser: Browser
beforeAll(async () => { browser = await chromium.launch({ executablePath: chromiumPath() }) })
afterAll(async () => { await browser?.close() })

async function simular(page: Page, { kraken }: { kraken: boolean }) {
  // Sin WebSocket (no abre ni emite): el precio es el del ticker simulado
  await page.addInitScript(() => {
    class WS { readyState = 0; send() { /* nada */ } close() { /* nada */ } static OPEN = 1 }
    ;(window as unknown as { WebSocket: unknown }).WebSocket = WS
  })
  await page.route('https://api.kraken.com/**', (r) => {
    if (!kraken) return r.abort()
    const u = new URL(r.request().url())
    const cab = { contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }
    if (u.pathname.endsWith('/Ticker')) {
      return r.fulfill({ ...cab, body: JSON.stringify({ error: [], result: { XXBTZEUR: { c: [String(ULTIMO), '1'], h: ['0', '62000'], l: ['0', '60000'], v: ['0', '999'] }, XXBTZUSD: { c: [String(ULTIMO * 1.1), '1'] }, XBTAUD: { c: [String(ULTIMO * 1.6), '1'] } } }) })
    }
    const minutos = Number(u.searchParams.get('interval') ?? '60')
    if (minutos === 1440) return r.fulfill({ ...cab, body: JSON.stringify({ error: [], result: { XXBTZEUR: Array.from({ length: N }, (_, i) => f(T0 - (N - 1 - i) * DIA, i === N - 1 ? ULTIMO : precioDia(i))), last: T0 } }) })
    const paso = minutos * 60, fin = Math.floor(AHORA / paso) * paso
    return r.fulfill({ ...cab, body: JSON.stringify({ error: [], result: { XXBTZEUR: Array.from({ length: 300 }, (_, i) => f(fin - (299 - i) * paso, i === 299 ? ULTIMO : ULTIMO - 100 + (i % 9) * 10)), last: fin } }) })
  })
}

describe('demo con el precio real de BTC (Kraken simulado)', () => {
  it('banner, precio actual, histórico y compras ancladas al histórico real; el gráfico pro pide las velas a Kraken', async () => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] })
    const page = await ctx.newPage()
    const errores: string[] = []
    page.on('console', (m) => { if (m.type() === 'error' && !/google|gstatic|recaptcha|private-token/.test(m.location().url + m.text())) errores.push(m.text().slice(0, 160)) })
    page.on('pageerror', (e) => errores.push('PAGEERR ' + e.message.slice(0, 160)))
    await simular(page, { kraken: true })
    await page.goto(`${URL_BASE}/login`)
    await page.getByText('Probar sin cuenta').tap()
    await page.waitForSelector('section[aria-label="Saldo"]', { timeout: 20000 })
    await page.waitForTimeout(1500)
    expect(await page.locator('.banner').first().innerText(), 'banner de la demo').toMatch(/precio real de BTC, compras ficticias/)
    // Precio actual = el del ticker (no el inventado)
    const saldo = (await page.locator('section[aria-label="Saldo"]').innerText()).replace(/\s+/g, ' ')
    expect(saldo, 'precio de BTC del ticker').toMatch(/Precio de BTC 61\.2(34|35) €/)
    // El gráfico de precio acaba en el precio real
    expect(Number(await page.locator('.chart-box').first().getAttribute('data-ultimo-valor')), 'último punto del gráfico = precio del ticker').toBeCloseTo(ULTIMO, 2)
    // Las compras inventadas están ancladas al histórico real: la más antigua es la de hace 300 días, con el cierre real de ese día
    await page.evaluate(() => { history.pushState({}, '', '/operaciones'); dispatchEvent(new PopStateEvent('popstate')) })
    await page.getByRole('heading', { name: 'Operaciones', level: 1 }).waitFor()
    const filas = await page.locator('main ul > li').allInnerTexts()
    const historia = 366 // el histórico de la demo es el último año de los 720 días
    const indiceHistorico = historia - 1 - 300
    const precioEsperado = precioDia(N - historia + indiceHistorico) // 40000 + 10 × día
    expect(filas.at(-1)!.replace(/\s+/g, ' '), 'la compra más antigua usa el precio real de ese día').toContain(`${new Intl.NumberFormat('es-ES').format(precioEsperado)} €`)
    expect(filas.length, 'compras inventadas').toBe(10)
    // Gráfico pro: velas de todas las temporalidades pedidas a Kraken (no hay documentos del servidor en la demo)
    await page.evaluate(() => { history.pushState({}, '', '/grafico'); dispatchEvent(new PopStateEvent('popstate')) })
    await page.waitForSelector('section[aria-label="Tu posición"]')
    for (const tf of ['1m', '5m', '15m', '1h', '4h', '1D', '1S']) {
      await page.getByRole('button', { name: tf, exact: true }).tap()
      await page.waitForFunction(() => Number(document.querySelector('[data-velas]')?.getAttribute('data-velas') ?? 0) > 0, null, { timeout: 15000 }).catch(() => undefined)
      const d = await page.evaluate(() => ({ n: Number(document.querySelector('[data-velas]')?.getAttribute('data-velas') ?? 0), origen: document.querySelector('[data-velas]')?.getAttribute('data-origen') }))
      expect(d.n, `${tf}: velas reales`).toBeGreaterThan(0)
      expect(d.origen, `${tf}: origen de las velas`).toBe(tf === '1m' || tf === '5m' ? 'directo' : 'kraken')
    }
    // Máx./Mín./Vol. 24 h con el ticker
    const cab = (await page.locator('section[aria-label="Precio"]').innerText()).replace(/\s+/g, ' ')
    expect(cab).toMatch(/Máx\. 24h 62\.000 €/)
    expect(cab).toMatch(/Mín\. 24h 60\.000 €/)
    expect(errores, 'errores en la consola').toEqual([])
    await ctx.close()
  }, 120000)

  it('si Kraken no responde, la demo sigue funcionando con datos inventados y lo dice', async () => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] })
    const page = await ctx.newPage()
    await simular(page, { kraken: false })
    await page.goto(`${URL_BASE}/login`)
    await page.getByText('Probar sin cuenta').tap()
    await page.waitForSelector('section[aria-label="Saldo"]', { timeout: 20000 })
    expect(await page.locator('.banner').first().innerText()).toMatch(/datos ficticios/)
    expect((await page.locator('section[aria-label="Saldo"]').innerText()).replace(/\s+/g, ' ')).toMatch(/Metido 3550,00 €/) // la cartera inventada de siempre
    await ctx.close()
  }, 60000)
})
