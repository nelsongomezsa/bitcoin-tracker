// Identificador aleatorio por instalación (en IndexedDB). No contiene huella ni IP: solo un id y un navegador genérico.
const DB = 'btc-tracker-dispositivo'
const STORE = 'kv'

function abrir(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

async function leer(k: string): Promise<string | undefined> {
  const db = await abrir()
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).get(k)
    q.onsuccess = () => res(q.result as string | undefined)
    q.onerror = () => rej(q.error)
  })
}
async function escribir(k: string, v: string): Promise<void> {
  const db = await abrir()
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite')
    t.objectStore(STORE).put(v, k)
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}

export async function idDispositivo(): Promise<string> {
  let id = await leer('id')
  if (!id) {
    id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')
    await escribir('id', id)
  }
  return id
}
export const yaRegistrado = async (uid: string) => (await leer(`reg:${uid}`)) === '1'
export const marcarRegistrado = (uid: string) => escribir(`reg:${uid}`, '1')

/** Navegador y sistema en genérico, sin versiones. */
export function navegadorGenerico(ua = navigator.userAgent): string {
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) || /CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'otro sistema'
  return `${nav} en ${so}`.slice(0, 40)
}
