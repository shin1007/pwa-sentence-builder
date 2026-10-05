import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'
import { prefersReducedMotion, toCanvasDelta } from '../utils/motion'

/**
 * FLIP: whenever `trigger` changes, every tile (`[data-tile-uid]` under
 * `rootRef`) that moved flies from where it was to where it now is, instead
 * of blinking out of one place and into another. Call the returned function
 * just before the change, to record where the tiles were.
 */
export function useFlip(rootRef: RefObject<HTMLElement | null>, trigger: unknown): () => void {
  /** Tile positions just before the board changes. */
  const snapshot = useRef<Map<number, DOMRect> | null>(null)

  useLayoutEffect(() => {
    const snap = snapshot.current
    snapshot.current = null
    const root = rootRef.current
    if (!snap || !root || prefersReducedMotion()) return
    root.querySelectorAll<HTMLElement>('[data-tile-uid]').forEach((el) => {
      if (el.dataset.hidden) return
      const before = snap.get(Number(el.dataset.tileUid))
      if (!before) return
      const after = el.getBoundingClientRect()
      const dx = before.left + before.width / 2 - (after.left + after.width / 2)
      const dy = before.top + before.height / 2 - (after.top + after.height / 2)
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      const d = toCanvasDelta(dx, dy)
      const dist = Math.hypot(dx, dy)
      el.animate(
        [
          { transform: `translate(${d.x}px, ${d.y}px) scale(1.06)`, opacity: 1 },
          { transform: 'translate(0, 0) scale(1.07, 0.93)', opacity: 1, offset: 0.78 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: Math.min(320, 170 + dist * 0.25), easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
      )
    })
  }, [rootRef, trigger])

  return useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const rects = new Map<number, DOMRect>()
    root.querySelectorAll<HTMLElement>('[data-tile-uid]').forEach((el) => {
      if (el.dataset.hidden) return
      rects.set(Number(el.dataset.tileUid), el.getBoundingClientRect())
    })
    snapshot.current = rects
  }, [rootRef])
}
