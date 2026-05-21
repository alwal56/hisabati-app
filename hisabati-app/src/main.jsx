import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Auto-reload when a new version is deployed (keeps PWA shortcuts always up to date)
if ('serviceWorker' in navigator) {
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) { refreshing = true; window.location.reload() }
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
