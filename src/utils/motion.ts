export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Converts a screen-space vector (pointer movement, the gap between two
 * getBoundingClientRect()s) into the game canvas's own coordinate space.
 *
 * Held portrait, the whole canvas is CSS-rotated 90deg to fake a landscape
 * layout (see useForcedLandscape), so a finger moving down the physical
 * screen is moving *left* as far as the canvas's children are concerned. A
 * transform applied to a child has to be expressed in that rotated space or
 * a dragged tile would slide off at right angles to the finger.
 */
export function toCanvasDelta(dx: number, dy: number): { x: number; y: number } {
  const canvas = document.querySelector('.app-canvas')
  if (!canvas) return { x: dx, y: dy }
  const t = getComputedStyle(canvas).transform
  if (!t || t === 'none') return { x: dx, y: dy }
  const m = new DOMMatrix(t)
  // Only the linear part applies to a vector; invert the 2x2 [a c; b d].
  const det = m.a * m.d - m.b * m.c
  if (!det) return { x: dx, y: dy }
  return { x: (m.d * dx - m.c * dy) / det, y: (-m.b * dx + m.a * dy) / det }
}
