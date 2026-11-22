import { z } from 'zod'

const hoyMasUno = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)

export const MONEDAS = ['EUR', 'USD', 'AUD'] as const
export const monedaSchema = z.enum(MONEDAS)

// Las mismas reglas que firestore.rules (que son las que mandan en el servidor).
export const operacionSchema = z
  .object({
    tipo: z.enum(['compra', 'venta']),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida')
      .refine((f) => f <= hoyMasUno(), 'La fecha no puede ser futura'),
    cantidad: z.number({ message: 'Introduce un número' }).gt(0, 'La cantidad debe ser mayor que 0').lt(10_000_000, 'Cantidad demasiado grande'),
    comision: z.number({ message: 'Introduce un número' }).min(0, 'La comisión no puede ser negativa'),
    precio: z.number({ message: 'Introduce un número' }).gt(0, 'El precio debe ser mayor que 0').lt(100_000_000),
    moneda: monedaSchema,
    plataforma: z.string().trim().max(40, 'Máximo 40 caracteres').regex(/^[\p{L}\p{N} .,&'+_-]*$/u, 'Solo letras, números y signos sencillos').optional(),
    nota: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
  })
  .refine((o) => o.comision < o.cantidad, { path: ['comision'], message: 'La comisión debe ser menor que la cantidad' })

export type OperacionInput = z.infer<typeof operacionSchema>

export const perfilSchema = z.object({
  nombre: z.string().trim().max(60),
  monedaPreferida: monedaSchema,
  modoPrivado: z.boolean(),
})

export const planSchema = z.object({
  capital: z.number().min(0).lt(1_000_000_000),
  nivelesClave: z.array(z.object({ precio: z.number().gt(0), porcentajeCapital: z.number().min(0).max(100) })).max(20),
  dca: z.object({
    inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    precioInicio: z.number().gt(0).optional(),
    monedaInicio: monedaSchema.optional(),
    porcentajeSemanal: z.number().min(0).max(100),
    semanas: z.number().int().min(0).max(520),
  }),
  objetivos: z.record(z.string(), z.unknown()).optional(),
})

export const emailSchema = z.string().trim().email('Correo no válido').max(254)
export const passwordSchema = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres').max(128)

const horaSchema = z.number().int().min(0).max(23)
export const generalAvisosSchema = z.object({
  zona: z.string().max(64),
  silencioActivo: z.boolean(),
  silencioDesde: horaSchema,
  silencioHasta: horaSchema,
  limiteDiario: z.number().int().min(1).max(100),
  pausadoHasta: z.number().min(0),
  moneda: monedaSchema,
  horaResumen: horaSchema,
}).partial()

export const alertaSchema = z.object({
  id: z.string().min(4).max(24),
  dir: z.enum(['abajo', 'arriba']),
  precio: z.number().gt(0).lt(100_000_000),
  moneda: monedaSchema,
  repetir: z.boolean(),
})

export const avisosSchema = z.object({
  ajustes: z.record(z.string().max(40), z.object({ activo: z.boolean() }).passthrough()),
  tokens: z.array(z.string().max(4096)).max(10),
  resumen: z.record(z.string(), z.unknown()).optional(),
  general: generalAvisosSchema.optional(),
  alertas: z.array(alertaSchema).max(20).optional(),
  seguidas: z.array(z.string().max(60)).max(30).optional(),
  telegram: z.object({ desconectar: z.boolean().optional() }).optional(),
  historialLeidoHasta: z.date().nullable().optional(),
}).passthrough()
