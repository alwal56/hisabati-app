import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// PWA update notification — fires when new SW takes control
if ('serviceWorker' in navigator) {
  let refreshing = false

  const showUpdateBanner = () => {
    if (document.getElementById('__pwa_update_banner__')) return

    const style = document.createElement('style')
    style.textContent = `
      @keyframes __pwa_slide_up__ {
        from { opacity:0; transform:translateX(-50%) translateY(20px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
    `
    document.head.appendChild(style)

    const banner = document.createElement('div')
    banner.id = '__pwa_update_banner__'
    banner.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:99999', 'background:#1a1a2e', 'border:1px solid rgba(212,168,67,.6)',
      'border-radius:14px', 'padding:14px 20px', 'min-width:280px', 'max-width:90vw',
      'box-shadow:0 8px 32px rgba(0,0,0,.55)', 'display:flex', 'align-items:center',
      'gap:14px', 'direction:rtl', 'font-family:inherit', 'color:#f0e6c8',
      'animation:__pwa_slide_up__ .35s ease'
    ].join(';')

    let seconds = 10
    const text = document.createElement('span')
    text.style.cssText = 'flex:1; font-size:13px; line-height:1.5;'
    text.innerHTML = `يوجد تحديث جديد للتطبيق<br><span id="__pwa_countdown__" style="color:#d4a843;font-size:12px;">سيتم التحديث تلقائياً خلال ${seconds} ث</span>`

    const btn = document.createElement('button')
    btn.textContent = 'تحديث الآن'
    btn.style.cssText = [
      'background:#d4a843', 'color:#080810', 'border:none', 'border-radius:8px',
      'padding:8px 14px', 'font-size:12px', 'font-weight:700', 'cursor:pointer',
      'white-space:nowrap', 'flex-shrink:0'
    ].join(';')

    const doReload = () => { clearInterval(timer); window.location.reload() }
    btn.addEventListener('click', doReload)
    banner.appendChild(text)
    banner.appendChild(btn)
    document.body.appendChild(banner)

    const timer = setInterval(() => {
      seconds--
      const el = document.getElementById('__pwa_countdown__')
      if (el) el.textContent = `سيتم التحديث تلقائياً خلال ${seconds} ث`
      if (seconds <= 0) doReload()
    }, 1000)
  }

  // controllerchange fires when the new SW takes control (after skipWaiting)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    showUpdateBanner()
  })
}

// Disable bounce scroll on iOS
document.addEventListener('touchmove', (e) => {
  if (e.target === document.body) e.preventDefault()
}, { passive: false })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
