// Catálogo único de avisos: lo usan la pantalla de Avisos (cliente) y los jobs (Node).
// `defecto` son los valores por defecto prudentes: todo apagado salvo lo marcado con activo: true.

export const SECCIONES = [
  ['precio', 'Precio'],
  ['cartera', 'Mi cartera'],
  ['plan', 'Mi plan'],
  ['trading', 'Trading'],
  ['mercado', 'Mercado'],
  ['ballenas', 'Ballenas y carteras'],
  ['resumenes', 'Resúmenes'],
  ['cuenta', 'Cuenta y seguridad'],
  ['app', 'Dentro de la app'],
]

const U = (etiqueta, min, max, paso = 1) => ({ etiqueta, min, max, paso })

/** campos extra: { nombre, tipo: 'numero' | 'select', etiqueta, min?, max?, opciones?: [valor, texto][] } */
export const CATALOGO = [
  // Precio
  { clave: 'mov1h', seccion: 'precio', titulo: 'Movimiento brusco en 1 hora', desc: 'Sube o baja más que el umbral en una hora.', defecto: { activo: false, umbral: 3 }, umbral: U('Umbral (%)', 0.5, 50, 0.5) },
  { clave: 'mov24h', seccion: 'precio', titulo: 'Movimiento brusco en 24 horas', desc: 'Sube o baja más que el umbral en un día.', defecto: { activo: false, umbral: 5 }, umbral: U('Umbral (%)', 0.5, 80, 0.5) },
  { clave: 'mov7d', seccion: 'precio', titulo: 'Movimiento brusco en 7 días', desc: 'Sube o baja más que el umbral en una semana.', defecto: { activo: false, umbral: 10 }, umbral: U('Umbral (%)', 1, 100, 1) },
  { clave: 'maxMes', seccion: 'precio', titulo: 'Nuevo máximo del mes', desc: 'El precio supera su máximo de este mes.', defecto: { activo: false } },
  { clave: 'minMes', seccion: 'precio', titulo: 'Nuevo mínimo del mes', desc: 'El precio cae por debajo de su mínimo de este mes.', defecto: { activo: false } },
  { clave: 'maxAnio', seccion: 'precio', titulo: 'Nuevo máximo del año', desc: 'El precio supera su máximo de este año.', defecto: { activo: false } },
  { clave: 'minAnio', seccion: 'precio', titulo: 'Nuevo mínimo del año', desc: 'El precio cae por debajo de su mínimo de este año.', defecto: { activo: false } },
  { clave: 'redondos', seccion: 'precio', titulo: 'Números redondos', desc: 'BTC cruza cada múltiplo del paso elegido, en tu moneda.', defecto: { activo: false, paso: 10000 }, campos: [{ nombre: 'paso', tipo: 'numero', etiqueta: 'Cada (en tu moneda)', min: 100, max: 1000000 }] },
  // Cartera
  { clave: 'rentable', seccion: 'cartera', titulo: 'Vuelves a estar en positivo o pasas a pérdidas', desc: 'Cuando el precio cruza tu precio medio (con un margen del 0,5 %).', defecto: { activo: true } },
  { clave: 'hitos', seccion: 'cartera', titulo: 'Hitos de rentabilidad', desc: 'Cuando tu rentabilidad llega a +10, +25, +50, +100 % o a −10, −20 %. Avisa una vez por hito.', defecto: { activo: false } },
  { clave: 'valorCartera', seccion: 'cartera', titulo: 'El valor de tu cartera supera X', desc: 'Importe en la moneda de tus avisos.', defecto: { activo: false, umbral: 5000 }, umbral: U('Valor', 1, 100000000, 100) },
  { clave: 'objetivoBtc', seccion: 'cartera', titulo: 'Objetivo de BTC cumplido', desc: 'Cuando llegas al objetivo de BTC de tu plan.', defecto: { activo: false } },
  { clave: 'objetivoInvertido', seccion: 'cartera', titulo: 'Objetivo de dinero metido cumplido', desc: 'Cuando llegas al objetivo de lo invertido.', defecto: { activo: false } },
  { clave: 'precioObjetivo', seccion: 'cartera', titulo: 'Precio de venta objetivo alcanzado', desc: 'Cuando BTC alcanza el precio de venta que fijaste en tus objetivos.', defecto: { activo: false } },
  // Plan
  { clave: 'nivelClave', seccion: 'plan', titulo: 'BTC se acerca a un precio clave', desc: 'Un aviso previo al acercarse y otro al tocarlo.', defecto: { activo: true, umbral: 3 }, umbral: U('Aviso previo a (%)', 0.5, 20, 0.5) },
  { clave: 'comprarBajaMedia', seccion: 'plan', titulo: 'Comprar hoy bajaría tu media', desc: 'Como mucho uno a la semana, y solo si el precio está por debajo de tu media.', defecto: { activo: false, importe: 100 }, campos: [{ nombre: 'importe', tipo: 'numero', etiqueta: 'Compra de ejemplo (€)', min: 10, max: 1000000 }] },
  { clave: 'dca', seccion: 'plan', titulo: 'Recordatorio de DCA', desc: 'El día y la hora que elijas. El aviso abre la app lista para duplicar tu última compra.', defecto: { activo: false, dia: 1, hora: 9 }, campos: [
    { nombre: 'dia', tipo: 'select', etiqueta: 'Día', opciones: [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']] },
    { nombre: 'hora', tipo: 'numero', etiqueta: 'Hora (0-23)', min: 0, max: 23 }] },
  { clave: 'dcaSaltado', seccion: 'plan', titulo: 'DCA saltado', desc: 'Si pasan 8 días sin ninguna compra.', defecto: { activo: false } },
  { clave: 'inicioDca', seccion: 'plan', titulo: 'Inicio de DCA', desc: 'Cuando BTC toca el precio de arranque que pusiste en el plan.', defecto: { activo: false } },
  // Trading
  { clave: 'tradeDias', seccion: 'trading', titulo: 'Trade abierto desde hace demasiado', desc: 'Un trade sin cerrar lleva más de X días. Se repite cada 3 días.', defecto: { activo: false, umbral: 7 }, umbral: U('Días', 1, 365) },
  { clave: 'tradePct', seccion: 'trading', titulo: 'Trade abierto con un % grande', desc: 'Un trade sin cerrar va en −X % o en +X % (con tu apalancamiento y comisiones).', defecto: { activo: false, umbral: 10, direccion: 'ambos' }, umbral: U('Porcentaje (%)', 1, 500), campos: [{ nombre: 'direccion', tipo: 'select', etiqueta: 'Avisar', opciones: [['ambos', 'En pérdida y en ganancia'], ['perdida', 'Solo en pérdida'], ['ganancia', 'Solo en ganancia']] }] },
  // Mercado
  { clave: 'miedoExtremo', seccion: 'mercado', titulo: 'Miedo extremo', desc: 'El índice de miedo y codicia baja del umbral (se evalúa una vez al día).', defecto: { activo: false, umbral: 20 }, umbral: U('Índice máximo', 1, 49) },
  { clave: 'codiciaExtrema', seccion: 'mercado', titulo: 'Codicia extrema', desc: 'El índice de miedo y codicia supera el umbral (se evalúa una vez al día).', defecto: { activo: false, umbral: 80 }, umbral: U('Índice mínimo', 51, 100) },
  { clave: 'zonaIndice', seccion: 'mercado', titulo: 'Cambio de zona del índice', desc: 'Miedo extremo 0-24, Miedo 25-44, Neutral 45-55, Codicia 56-74, Codicia extrema 75-100.', defecto: { activo: false, direccion: 'ambos' }, campos: [{ nombre: 'direccion', tipo: 'select', etiqueta: 'Avisar cuando va', opciones: [['ambos', 'En ambos sentidos'], ['miedo', 'Hacia el miedo'], ['codicia', 'Hacia la codicia']] }] },
  { clave: 'subidaMiedo', seccion: 'mercado', titulo: 'Subida brusca del miedo', desc: 'El índice cae X puntos o más en la ventana elegida.', defecto: { activo: false, umbral: 15, ventana: 7 }, umbral: U('Puntos', 5, 80), campos: [{ nombre: 'ventana', tipo: 'select', etiqueta: 'En', opciones: [[1, '24 horas'], [7, '7 días']] }] },
  { clave: 'halving', seccion: 'mercado', titulo: 'Halving', desc: 'Avisos a 30 días, a 7 días y el mismo día (estimado con la altura de bloque).', defecto: { activo: false } },
  // Ballenas y carteras
  { clave: 'carteraMovida', seccion: 'ballenas', titulo: 'Una cartera que sigues se mueve', desc: 'Avisa cuando cambia el saldo de las carteras públicas que sigues en la pestaña Mercado.', defecto: { activo: false } },
  { clave: 'ballena', seccion: 'ballenas', titulo: 'Ballena detectada', desc: 'Una transacción de más de X BTC en un bloque nuevo.', defecto: { activo: false, umbral: 1000 }, umbral: U('BTC mínimos', 500, 100000, 100) },
  // Resúmenes
  { clave: 'resumenDiario', seccion: 'resumenes', titulo: 'Resumen diario', desc: 'Valor, variación, lo metido y tu precio medio, cada día a la hora elegida.', defecto: { activo: false } },
  { clave: 'resumenSemanal', seccion: 'resumenes', titulo: 'Resumen semanal', desc: 'Los lunes, a la hora elegida.', defecto: { activo: false } },
  { clave: 'resumenMensual', seccion: 'resumenes', titulo: 'Resumen mensual', desc: 'El día 1, a la hora elegida.', defecto: { activo: false } },
  { clave: 'resumenAnual', seccion: 'resumenes', titulo: 'Resumen anual para la renta', desc: 'El 15 de enero: ganancia o pérdida FIFO del año anterior.', defecto: { activo: false } },
  // Cuenta
  { clave: 'dispositivoNuevo', seccion: 'cuenta', titulo: 'Inicio de sesión desde un dispositivo nuevo', desc: 'Te avisa en tus otros dispositivos.', defecto: { activo: true, prioridad: 'urgente' } },
  { clave: 'cambioCuenta', seccion: 'cuenta', titulo: 'Cambio de correo o de contraseña', desc: 'Detecta un cambio de correo, de contraseña o un cierre de sesión global (se revisa una vez al día).', defecto: { activo: false, prioridad: 'urgente' } },
  { clave: 'copiaSeguridad', seccion: 'cuenta', titulo: 'Recordatorio de copia de seguridad', desc: 'El día 1 de cada mes.', defecto: { activo: false } },
  // Dentro de la app
  { clave: 'comisionAlta', seccion: 'app', titulo: 'Comisión alta al guardar', desc: 'Aviso dentro de la app si una compra paga más del 3 % de comisión (no es un push).', defecto: { activo: true }, soloApp: true },
]

export const POR_CLAVE = Object.fromEntries(CATALOGO.map((a) => [a.clave, a]))

export const GENERAL_DEFECTO = {
  zona: 'Europe/Madrid',
  silencioDesde: 22,
  silencioHasta: 8,
  silencioActivo: false,
  limiteDiario: 10,
  pausadoHasta: 0,
  moneda: 'EUR',
  horaResumen: 9,
}

/** Ajuste efectivo de un aviso: valores por defecto + lo que guardó la usuaria. */
export function ajuste(ajustes, clave) {
  const def = POR_CLAVE[clave]?.defecto ?? { activo: false }
  return { prioridad: 'normal', canales: ['push', 'telegram'], ...def, ...(ajustes?.[clave] ?? {}) }
}

export function general(g) {
  return { ...GENERAL_DEFECTO, ...(g ?? {}) }
}

// Zonas del índice de miedo y codicia (orden de menos a más codicia).
export const ZONAS = [
  { id: 0, nombre: 'Miedo extremo', hasta: 24 },
  { id: 1, nombre: 'Miedo', hasta: 44 },
  { id: 2, nombre: 'Neutral', hasta: 55 },
  { id: 3, nombre: 'Codicia', hasta: 74 },
  { id: 4, nombre: 'Codicia extrema', hasta: 100 },
]
export const zonaDe = (v) => ZONAS.find((z) => v <= z.hasta) ?? ZONAS[4]

export const UMBRAL_BALLENA_DEFECTO = 500
