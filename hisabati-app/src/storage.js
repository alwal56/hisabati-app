// Local storage adapter — replaces window.storage for standalone app
export async function kvGet(key) {
  try {
    const val = localStorage.getItem(key)
    return val ? { value: val } : null
  } catch { return null }
}

export async function kvSet(key, value) {
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value)
    localStorage.setItem(key, str)
    return { key, value: str }
  } catch { return null }
}

export async function kvDel(key) {
  try { localStorage.removeItem(key); return { key, deleted: true } }
  catch { return null }
}

export async function kv(op, key, val) {
  if (op === 'get') {
    const r = await kvGet(key)
    try { return r ? JSON.parse(r.value) : null } catch { return r?.value ?? null }
  }
  if (op === 'set') return kvSet(key, JSON.stringify(val))
  if (op === 'del') return kvDel(key)
}
