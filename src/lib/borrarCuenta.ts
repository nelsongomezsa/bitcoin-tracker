import { collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore'
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential } from 'firebase/auth'
import { auth, db } from './firebase'

/** Borra los datos del usuario en Firestore y después su cuenta de Auth. */
export async function borrarCuenta(password: string): Promise<void> {
  const user = auth?.currentUser
  if (!auth || !db || !user?.email) throw new Error('sin-sesion')
  // Reautenticación explícita: Auth la exige para operaciones sensibles.
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))

  const base = `users/${user.uid}`
  const ops = await getDocs(collection(db, `${base}/operaciones`))
  for (let i = 0; i < ops.docs.length; i += 400) {
    const lote = writeBatch(db)
    ops.docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref))
    await lote.commit()
  }
  await deleteDoc(doc(db, `${base}/plan/config`))
  await deleteDoc(doc(db, `${base}/avisos/config`))
  await deleteDoc(doc(db, base))
  await deleteUser(user)
}
