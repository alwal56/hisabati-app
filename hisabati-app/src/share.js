// Native share via Capacitor Share plugin, with web fallback
export async function nativeShare({ title, text, url }) {
  try {
    const { Share } = await import('@capacitor/share')
    const canShare = await Share.canShare()
    if (canShare.value) {
      await Share.share({ title, text, url, dialogTitle: title })
      return true
    }
  } catch {}
  // Web fallback
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return true } catch {}
  }
  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(text)
    alert('تم نسخ الكشف إلى الحافظة')
    return true
  } catch {}
  return false
}
