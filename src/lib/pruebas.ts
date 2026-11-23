// Interruptores solo para las pruebas automáticas (localStorage). Sin ellos, la app se comporta con normalidad.
export function interruptorPrueba(clave: 'demo-vacia' | 'demo-directo' | 'pruebas-contadores'): boolean {
  try { return localStorage.getItem(clave) === '1' } catch { return false }
}

/** Cuenta cuántas veces ocurre algo (gráficos creados, setData, update…) para que las pruebas automáticas lo comprueben. No hace nada fuera de las pruebas. */
export function registrarPrueba(clave: string): void {
  if (!contadoresActivos()) return
  const w = window as unknown as { __pruebas?: Record<string, number> }
  const c = (w.__pruebas ??= {})
  c[clave] = (c[clave] ?? 0) + 1
}

/** Deja un valor (el último) para que las pruebas lo lean, p. ej. cuántas marcas hay dibujadas. */
export function fijarPrueba(clave: string, valor: number): void {
  if (!contadoresActivos()) return
  const w = window as unknown as { __pruebas?: Record<string, number> }
  ;(w.__pruebas ??= {})[clave] = valor
}

const contadoresActivos = () => interruptorPrueba('demo-directo') || interruptorPrueba('pruebas-contadores')
