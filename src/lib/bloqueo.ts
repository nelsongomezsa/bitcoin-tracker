// Bloqueo local con Face ID / huella mediante WebAuthn (passkey del dispositivo).
// Es un bloqueo de la interfaz en este dispositivo: la seguridad de los datos la dan Firebase Auth y las reglas de Firestore.
// En localStorage solo se guarda el identificador público de la credencial (no es un secreto ni un token de sesión).
const CLAVE = 'btc-bloqueo-credencial'

const aB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export async function bloqueoSoportado(): Promise<boolean> {
  try {
    return Boolean(window.PublicKeyCredential) && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

export function bloqueoActivo(): boolean {
  try { return Boolean(localStorage.getItem(CLAVE)) } catch { return false }
}

export async function activarBloqueo(): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: aleatorio(32),
      rp: { name: 'Bitcoin Tracker' },
      user: { id: aleatorio(16), name: 'dispositivo', displayName: 'Este dispositivo' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('cancelado')
  localStorage.setItem(CLAVE, aB64(cred.rawId))
}

export function desactivarBloqueo(): void {
  try { localStorage.removeItem(CLAVE) } catch { /* sin almacenamiento */ }
}

export async function desbloquear(): Promise<boolean> {
  let id: string | null = null
  try { id = localStorage.getItem(CLAVE) } catch { /* sin almacenamiento */ }
  if (!id) return true
  try {
    const r = await navigator.credentials.get({
      publicKey: { challenge: aleatorio(32), allowCredentials: [{ type: 'public-key', id: deB64(id) }], userVerification: 'required', timeout: 60000 },
    })
    return Boolean(r)
  } catch {
    return false
  }
}
