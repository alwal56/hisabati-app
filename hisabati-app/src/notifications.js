// Capacitor Local Notifications helper
let notifPlugin = null

async function getPlugin() {
  if (notifPlugin) return notifPlugin
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    notifPlugin = LocalNotifications
    return notifPlugin
  } catch { return null }
}

export async function requestNotifPermission() {
  const plugin = await getPlugin()
  if (!plugin) return false
  try {
    const { display } = await plugin.requestPermissions()
    return display === 'granted'
  } catch { return false }
}

export async function schedulePaymentReminder({ id, title, body, dueDate }) {
  const plugin = await getPlugin()
  if (!plugin) return
  try {
    // Schedule 1 day before due date at 9 AM
    const due = new Date(dueDate)
    const remind = new Date(due)
    remind.setDate(remind.getDate() - 1)
    remind.setHours(9, 0, 0, 0)
    if (remind < new Date()) return // already past

    await plugin.schedule({
      notifications: [{
        id: parseInt(id.replace(/\D/g, '').slice(0, 9)) || Math.floor(Math.random() * 99999),
        title,
        body,
        schedule: { at: remind },
        sound: null,
        smallIcon: 'ic_stat_icon',
        largeIcon: '',
        channelId: 'payments'
      }]
    })
  } catch (e) { console.warn('Notification scheduling failed:', e) }
}

export async function cancelNotification(id) {
  const plugin = await getPlugin()
  if (!plugin) return
  try {
    const numId = parseInt(id.replace(/\D/g, '').slice(0, 9)) || 0
    await plugin.cancel({ notifications: [{ id: numId }] })
  } catch {}
}
