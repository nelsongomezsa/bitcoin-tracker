// Mensajes genéricos para el usuario; el detalle técnico solo va a la consola en desarrollo.
export function mensajeError(e: unknown, generico = 'Algo ha salido mal. Inténtalo de nuevo.'): string {
  if (import.meta.env.DEV) console.error(e)
  const code = (e as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.'
    case 'auth/email-already-in-use':
      return 'No se ha podido crear la cuenta con esos datos.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos.'
    case 'auth/network-request-failed':
      return 'Sin conexión. Comprueba tu red.'
    case 'auth/requires-recent-login':
      return 'Por seguridad, vuelve a iniciar sesión y repite la acción.'
    default:
      return generico
  }
}
