// Pasada con una cuenta nueva y vacía en el emulador de Firebase. Se ejecuta con:
//   npm run auditoria:vacia
// (firebase emulators:exec levanta Auth y Firestore, siembra el precio de mercado, compila una copia de la app que apunta a los
//  emuladores, la sirve y lanza la auditoría del navegador sobre ella.)
import { execSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const env = {
  ...process.env,
  VITE_FIREBASE_API_KEY: 'fake', VITE_FIREBASE_AUTH_DOMAIN: 'localhost', VITE_FIREBASE_PROJECT_ID: 'demo-bitcoin-tracker', VITE_FIREBASE_APP_ID: 'fake',
  VITE_USE_EMULATOR: 'true', VITE_RECAPTCHA_SITE_KEY: '', VITE_APPCHECK_DEBUG: '', VITE_FIREBASE_VAPID_KEY: '',
}
// Datos de mercado mínimos, como los deja el servidor (precio).
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
initializeApp({ projectId: 'demo-bitcoin-tracker' })
const eur = 60585
await getFirestore().doc('mercado/precio').set({
  precios: { EUR: eur, USD: eur * 1.08, AUD: eur * 1.65 }, maximoHistorico: { EUR: eur * 1.3, USD: eur * 1.4, AUD: eur * 2 }, athFecha: null,
  cambio1h: 0.001, cambio24h: -0.012, cambio7d: 0.03, miedoCodicia: { valor: 54, clasificacion: 'Neutral' }, actualizado: FieldValue.serverTimestamp(),
})

execSync('npx vite build --outDir dist-emu --emptyOutDir', { env, stdio: 'inherit' })
const servidor = spawn('npx', ['vite', 'preview', '--outDir', 'dist-emu', '--port', '4300', '--strictPort'], { env, stdio: 'ignore' })
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch('http://localhost:4300')).ok) break } catch { /* espera */ } await new Promise((r) => setTimeout(r, 500)) }
  execSync('npx vitest run --config scripts/auditoria/vitest.web.config.ts scripts/auditoria/cuenta-vacia.test.ts', { env: { ...process.env, AUDIT_URL: 'http://localhost:4300', AUDIT_EMU_URL: 'http://localhost:4300' }, stdio: 'inherit' })
} finally {
  servidor.kill()
}
