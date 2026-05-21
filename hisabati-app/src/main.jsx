import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// ── PWA update handling ───────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  let refreshing = false

  // Show countdown banner then reload
  const showUpdateBanner = () => {
    if (document.getElementById('__pwa_banner__')) return

    const style = document.createElement('style')
    style.textContent = `
      @keyframes __slide_up__ {
        from { opacity:0; transform:translateX(-50%) translateY(24px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }`
    document.head.appendChild(style)

    const wrap = document.createElement('div')
    wrap.id = '__pwa_banner__'
    wrap.style.cssText = [
      'position:fixed','bottom:28px','left:50%','transform:translateX(-50%)',
      'z-index:999999','background:#1a1a2e','border:1px solid rgba(212,168,67,.65)',
      'border-radius:16px','padding:14px 18px','min-width:280px','max-width:92vw',
      'box-shadow:0 8px 32px rgba(0,0,0,.6)','display:flex','align-items:center',
      'gap:14px','direction:rtl','font-family:inherit','color:#f0e6c8',
      'animation:__slide_up__ .35s ease'
    ].join(';')

    let secs = 10
    const txt = document.createElement('span')
    txt.style.cssText = 'flex:1;font-size:13px;line-height:1.55;'
    txt.innerHTML = `يوجد تحديث جديد 🔄<br>
      <span id="__pwa_cd__" style="color:#d4a843;font-size:12px;">
        سيتم التحديث تلقائياً خلال ${secs} ث
      </span>`

    const btn = document.createElement('button')
    btn.textContent = 'الآن'
    btn.style.cssText = [
      'background:#d4a843','color:#080810','border:none','border-radius:9px',
      'padding:9px 16px','font-size:12px','font-weight:700','cursor:pointer',
      'white-space:nowrap','flex-shrink:0'
    ].join(';')

    const reload = () => { clearInterval(t); window.location.reload() }
    btn.addEventListener('click', reload)
    wrap.appendChild(txt); wrap.appendChild(btn)
    document.body.appendChild(wrap)

    const t = setInterval(() => {
      secs--
      const el = document.getElementById('__pwa_cd__')
      if (el) el.textContent = `سيتم التحديث تلقائياً خلال ${secs} ث`
      if (secs <= 0) reload()
    }, 1000)
  }

  // When new SW takes control → show banner
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    showUpdateBanner()
  })

  // Actively check for SW updates: on load + every time app comes back to foreground
  const checkUpdate = () =>
    navigator.serviceWorker.ready.then(r => r.update()).catch(() => {})

  window.addEventListener('load', checkUpdate)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkUpdate()
  })
}

// Disable bounce scroll on iOS
document.addEventListener('touchmove', e => {
  if (e.target === document.body) e.preventDefault()
}, { passive: false })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
