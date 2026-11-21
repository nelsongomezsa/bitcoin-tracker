import type { Operacion, Plan } from '../calculos'

// Datos 100% inventados.
const c = (id: string, fecha: string, cantidad: number, comision: number, precio: number): Operacion => ({
  id, tipo: 'compra', fecha, cantidad, comision, precio, moneda: 'EUR',
})

export const COMPRAS: Operacion[] = [
  c('c1', '2025-01-10', 1000, 10, 50000), // 0,0198 BTC
  c('c2', '2025-01-20', 500, 5, 40000), // 0,012375
  c('c3', '2025-02-03', 200, 2, 40000), // 0,00495 (mismo día que c4)
  c('c4', '2025-02-03', 300, 3, 50000), // 0,00594
  c('c5', '2025-02-15', 40, 2, 25000), // 0,00152 · comisión 5 % (> 3 %)
  c('c6', '2025-03-01', 1000, 10, 25000), // 0,0396
  c('c7', '2025-03-10', 600, 6, 60000), // 0,0099
  c('c8', '2025-04-01', 800, 8, 80000), // 0,0099
  c('c9', '2025-04-15', 100, 1, 50000), // 0,00198
  c('c10', '2025-05-01', 450, 4.5, 45000), // 0,0099
]

// Totales calculados a mano.
export const TOTAL_CANTIDAD = 4990
export const TOTAL_COMISION = 51.5
export const TOTAL_BTC = 0.115865

export const PLAN: Plan = {
  capital: 10000,
  nivelesClave: [
    { precio: 50000, porcentajeCapital: 10 },
    { precio: 40000, porcentajeCapital: 20 },
    { precio: 30000, porcentajeCapital: 20 },
    { precio: 20000, porcentajeCapital: 25 },
  ],
  dca: { inicio: '2025-06-01', porcentajeSemanal: 1, semanas: 25 },
}
