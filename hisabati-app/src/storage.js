import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBMY7a2w7n6w_TiZoZJk2pMSVGRv_K0568",
  authDomain: "hisabati-ecee0.firebaseapp.com",
  projectId: "hisabati-ecee0",
  storageBucket: "hisabati-ecee0.firebasestorage.app",
  messagingSenderId: "1078686646448",
  appId: "1:1078686646448:web:b2d11ce3516e1f4caa3b75"
}

const app = initializeApp(firebaseConfig)
const db  = getFirestore(app)

function safeKey(key) { return key.replace(/[/.[\]#$]/g, '_') }

export const storage = {
  async get(key) {
    try {
      const snap = await getDoc(doc(db, 'kv', safeKey(key)))
      if (!snap.exists()) {
        // Try local fallback
        const v = localStorage.getItem(key)
        return v ? JSON.parse(v) : null
      }
      return JSON.parse(snap.data().value)
    } catch {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null } catch { return null }
    }
  },

  async set(key, value) {
    const str = JSON.stringify(value)
    try { localStorage.setItem(key, str) } catch {}
    try { await setDoc(doc(db, 'kv', safeKey(key)), { value: str, updatedAt: Date.now() }) }
    catch (e) { console.warn('Cloud save failed:', e.message) }
  },

  async delete(key) {
    try { localStorage.removeItem(key) } catch {}
    try { await deleteDoc(doc(db, 'kv', safeKey(key))) } catch {}
  }
}

export async function kv(op, key, val) {
  if (op === 'get') return storage.get(key)
  if (op === 'set') return storage.set(key, val)
  if (op === 'del') return storage.delete(key)
}
