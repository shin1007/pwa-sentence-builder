// Decides when a downloaded app update may reload the page.
//
// Reloading mid-run would throw away the player's score, lives and streak, and
// reloading on the result screen would hide a result they haven't read yet.
// So an update waits until the player is somewhere with nothing to lose:
// - right away on the title screen (that is where a reload lands anyway), or
// - when the app is backgrounded on another menu screen (the reload happens
//   while nobody is looking, and they come back to the title screen).

export type UpdateScreen = 'title' | 'levelSelect' | 'game' | 'result' | 'progress'

const BACKGROUND_SAFE: ReadonlySet<UpdateScreen> = new Set(['title', 'levelSelect', 'progress'])

export interface UpdateGate {
  /** The new version is downloaded and waiting; `apply` reloads into it. */
  updateReady(apply: () => void): void
  screenChanged(screen: UpdateScreen): void
  visibilityChanged(hidden: boolean): void
}

export function createUpdateGate(initialScreen: UpdateScreen = 'title'): UpdateGate {
  let screen = initialScreen
  let hidden = false
  let pending: (() => void) | null = null

  const tryApply = () => {
    if (!pending) return
    if (screen === 'title' || (hidden && BACKGROUND_SAFE.has(screen))) {
      const apply = pending
      pending = null
      apply()
    }
  }

  return {
    updateReady(apply) {
      pending = apply
      tryApply()
    },
    screenChanged(next) {
      screen = next
      tryApply()
    },
    visibilityChanged(nextHidden) {
      hidden = nextHidden
      tryApply()
    },
  }
}
