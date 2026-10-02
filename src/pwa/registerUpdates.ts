import { registerSW } from 'virtual:pwa-register'
import { createUpdateGate, type UpdateScreen } from '../utils/updateGate'

// A fullscreen PWA on a kid's tablet can sit in the background for days and
// never navigate, so the browser's own update check (which runs on
// navigation) rarely fires. Check again whenever the app comes back to the
// foreground, at most this often.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

const gate = createUpdateGate()

export function reportScreenForUpdates(screen: UpdateScreen) {
  gate.screenChanged(screen)
}

export function registerUpdates() {
  if (!('serviceWorker' in navigator)) return

  let registration: ServiceWorkerRegistration | undefined
  let lastCheck = Date.now()

  const updateSW = registerSW({
    onNeedRefresh() {
      gate.updateReady(() => void updateSW(true))
    },
    onRegisteredSW(_url, reg) {
      registration = reg
    },
  })

  document.addEventListener('visibilitychange', () => {
    gate.visibilityChanged(document.hidden)
    if (!document.hidden && registration && Date.now() - lastCheck >= UPDATE_CHECK_INTERVAL_MS) {
      lastCheck = Date.now()
      registration.update().catch(() => {
        // Offline: try again next time the app comes back.
      })
    }
  })
}
