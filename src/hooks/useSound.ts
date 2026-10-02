import { useCallback, useEffect, useRef, useState } from 'react'
import { soundEngine } from '../audio/soundEngine'

const SFX_KEY = 'wordrush.sfx'

function readBool(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw === '1'
  } catch {
    return fallback
  }
}

export function useSound() {
  const [sfxOn, setSfxOn] = useState(() => readBool(SFX_KEY, true))
  const unlocked = useRef(false)

  useEffect(() => {
    soundEngine.setSfxEnabled(sfxOn)
    try {
      localStorage.setItem(SFX_KEY, sfxOn ? '1' : '0')
    } catch {
      /* storage unavailable — preference just won't persist */
    }
  }, [sfxOn])

  const unlock = useCallback(() => {
    if (unlocked.current) return
    unlocked.current = true
    soundEngine.unlock()
  }, [])

  return {
    sfxOn,
    toggleSfx: () => setSfxOn((v) => !v),
    unlock,
    tap: () => soundEngine.tap(),
    place: (step?: number) => soundEngine.place(step),
    pickup: () => soundEngine.pickup(),
    swap: () => soundEngine.swap(),
    remove: () => soundEngine.remove(),
    click: () => soundEngine.click(),
    correct: (combo?: number, sparkle?: boolean) => soundEngine.correct(combo, sparkle),
    wrong: () => soundEngine.wrong(),
    combo: (tier: number) => soundEngine.combo(tier),
    tick: (urgent: boolean) => soundEngine.tick(urgent),
    countIn: () => soundEngine.countIn(),
    win: () => soundEngine.win(),
    lose: () => soundEngine.lose(),
    starPop: (delaySec: number) => soundEngine.starPop(delaySec),
  }
}
