// Comprueba si una contraseña aparece en filtraciones (HaveIBeenPwned, k-anonymity).
// Solo se envían los 5 primeros caracteres del SHA-1; la contraseña nunca sale del dispositivo.
export async function contrasenaFiltrada(password: string): Promise<boolean> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  const prefijo = hex.slice(0, 5)
  const sufijo = hex.slice(5)
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefijo}`, { headers: { 'Add-Padding': 'true' } })
    if (!res.ok) return false
    const texto = await res.text()
    return texto.split('\n').some((l) => {
      const [s, n] = l.trim().split(':')
      return s === sufijo && Number(n) > 0
    })
  } catch {
    return false // si el servicio no responde, no bloqueamos el registro
  }
}
