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
  // Read: localStorage first (instant) → then sync from Firestore in background
  async get(key) {
    // 1. Return localStorage immediately (fast)
    let local = null
    try {
      const v = localStorage.getItem(key)
      if (v) local = JSON.parse(v)
    } catch {}

    // 2. Sync from Firestore in background (don't block UI)
    getDoc(doc(db, 'kv', safeKey(key))).then(snap => {
      if (snap.exists()) {
        const cloudVal = snap.data().value
        // Update local if cloud is newer
        try { localStorage.setItem(key, cloudVal) } catch {}
      }
    }).catch(() => {})

    return local
  },

  // Write: localStorage immediately + Firestore in background
  async set(key, value) {
    const str = JSON.stringify(value)
    // Save locally instantly
    try { localStorage.setItem(key, str) } catch {}
    // Sync to cloud in background
    setDoc(doc(db, 'kv', safeKey(key)), { value: str, updatedAt: Date.now() })
      .catch(e => console.warn('Cloud sync failed:', e.message))
  },

  async delete(key) {
    try { localStorage.removeItem(key) } catch {}
    deleteDoc(doc(db, 'kv', safeKey(key))).catch(() => {})
  }
}

export async function kv(op, key, val) {
  if (op === 'get') return storage.get(key)
  if (op === 'set') return storage.set(key, val)
  if (op === 'del') return storage.delete(key)
}
