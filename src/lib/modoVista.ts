// Vista simple o pro: se guarda en users/{uid}.vista y también en local, para pintar la correcta al instante.
export type ModoVista = 'simple' | 'pro'
const CLAVE = 'modo-vista'

export function leerVistaLocal(): ModoVista {
  try { return localStorage.getItem(CLAVE) === 'pro' ? 'pro' : 'simple' } catch { return 'simple' }
}
export function guardarVistaLocal(v: ModoVista) {
  try { localStorage.setItem(CLAVE, v) } catch { /* sin permiso: no pasa nada */ }
}
