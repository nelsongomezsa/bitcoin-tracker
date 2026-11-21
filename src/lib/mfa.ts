// Doble factor con app autenticadora (TOTP). Está PREPARADO pero desactivado por defecto:
// Firebase solo ofrece TOTP con Identity Platform, que exige activar la facturación (Blaze).
// La app no lo activa en el plan gratuito. Para usarlo: actívalo en la consola y pon VITE_ENABLE_MFA=true.
import {
  TotpMultiFactorGenerator, getMultiFactorResolver, multiFactor, type MultiFactorError, type TotpSecret, type User,
} from 'firebase/auth'
import { auth } from './firebase'

export const mfaHabilitado = import.meta.env.VITE_ENABLE_MFA === 'true'

export async function iniciarAltaTotp(user: User): Promise<{ secreto: TotpSecret; uri: string }> {
  const sesion = await multiFactor(user).getSession()
  const secreto = await TotpMultiFactorGenerator.generateSecret(sesion)
  return { secreto, uri: secreto.generateQrCodeUrl(user.email ?? 'usuario', 'Bitcoin Tracker') }
}

export async function confirmarAltaTotp(user: User, secreto: TotpSecret, codigo: string): Promise<void> {
  const asercion = TotpMultiFactorGenerator.assertionForEnrollment(secreto, codigo)
  await multiFactor(user).enroll(asercion, 'Autenticador')
}

/** Completa un inicio de sesión que exigía segundo factor (error auth/multi-factor-auth-required). */
export async function completarLoginTotp(error: MultiFactorError, codigo: string): Promise<void> {
  if (!auth) return
  const resolver = getMultiFactorResolver(auth, error)
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID)
  if (!hint) throw new Error('sin-totp')
  await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, codigo))
}
