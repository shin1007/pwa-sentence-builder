import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../utils/motion'

/** Rolls a displayed number up to `target` instead of jumping straight to it. */
export function useCountUp(target: number, durationMs = 450): number {
  const [shown, setShown] = useState(target)
  const current = useRef(target)

  useEffect(() => {
    const from = current.current
    if (from === target) return
    // Reduced motion: still updated from a frame callback, just in one step.
    const duration = prefersReducedMotion() ? 0 : durationMs
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = duration > 0 ? Math.min(1, (now - start) / duration) : 1
      const eased = 1 - Math.pow(1 - p, 3)
      const v = Math.round(from + (target - from) * eased)
      current.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])

  return shown
}
