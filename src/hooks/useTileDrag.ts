import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { haptic } from '../utils/haptics'
import { prefersReducedMotion, toCanvasDelta } from '../utils/motion'

/** How far a press has to travel before it becomes a drag instead of a tap. */
const DRAG_THRESHOLD_PX = 8

/** The tile a finished drag picked up. */
export interface TileDrop {
  uid: number
  from: 'tray' | 'slot'
  /** The slot it was picked up from; -1 for the tray. */
  slotIndex: number
}

interface DragState extends TileDrop {
  el: HTMLElement
  pointerId: number
  startX: number
  startY: number
  active: boolean
  transform: string
}

/**
 * Drag & drop for word tiles, on top of the tap controls. A press only turns
 * into a drag once it has moved DRAG_THRESHOLD_PX; until then it's a tap and
 * the click handler takes it. Where it lands is up to the caller:
 * `onDrop(drop, slot)` gets the slot under the finger (null outside the
 * answer area) and returns whether the board changed — if not, the tile
 * springs back.
 */
export function useTileDrag({
  slotsAreaRef,
  onDrop,
  onPickup,
}: {
  /** The answer area; its `[data-slot-index]` children are the drop targets. */
  slotsAreaRef: RefObject<HTMLElement | null>
  onDrop: (drop: TileDrop, target: number | null) => boolean
  onPickup: () => void
}) {
  const [dragUid, setDragUid] = useState<number | null>(null)
  const [hoverSlot, setHoverSlot] = useState<number | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const hoverSlotRef = useRef<number | null>(null)
  /** A drag ends with a pointerup that some browsers follow with a click on
   * whatever is underneath; that click must not count as a tap. */
  const suppressClickUntil = useRef(0)
  // Kept in refs so the window listeners below always see the latest render's
  // state (synced after each commit — a drag event never lands mid-render).
  const onDropRef = useRef(onDrop)
  const onPickupRef = useRef(onPickup)

  /** The slot a drop at this screen point is meant for. Anywhere over the
   * answer area counts, snapped to the nearest slot, so a drop doesn't have
   * to be pixel-perfect to land. */
  const slotIndexAt = (x: number, y: number): number | null => {
    const area = slotsAreaRef.current
    if (!area) return null
    const r = area.getBoundingClientRect()
    const pad = 12
    if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return null
    let best: number | null = null
    let bestDist = Infinity
    area.querySelectorAll<HTMLElement>('[data-slot-index]').forEach((el) => {
      const s = el.getBoundingClientRect()
      const dist = Math.hypot(x - (s.left + s.width / 2), y - (s.top + s.height / 2))
      if (dist < bestDist) {
        bestDist = dist
        best = Number(el.dataset.slotIndex)
      }
    })
    return best
  }
  const slotIndexAtRef = useRef(slotIndexAt)
  useLayoutEffect(() => {
    onDropRef.current = onDrop
    onPickupRef.current = onPickup
    slotIndexAtRef.current = slotIndexAt
  })

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (!d.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
        d.active = true
        setDragUid(d.uid)
        onPickupRef.current()
        haptic(6)
      }
      const local = toCanvasDelta(dx, dy)
      d.transform = `translate(${local.x}px, ${local.y}px) scale(1.1) rotate(-2deg)`
      d.el.style.transform = d.transform
      const target = slotIndexAtRef.current(e.clientX, e.clientY)
      if (target !== hoverSlotRef.current) {
        hoverSlotRef.current = target
        setHoverSlot(target)
      }
    }
    const end = (e: PointerEvent, cancelled: boolean) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      dragRef.current = null
      hoverSlotRef.current = null
      setHoverSlot(null)
      if (!d.active) return // a plain tap — the click handler takes it from here
      suppressClickUntil.current = performance.now() + 350
      setDragUid(null)
      const target = cancelled ? null : slotIndexAtRef.current(e.clientX, e.clientY)
      // The board snapshot for the fly-in is taken inside the drop, while
      // the tile is still sitting under the finger — so it lands from there.
      const changed = onDropRef.current({ uid: d.uid, from: d.from, slotIndex: d.slotIndex }, target)
      d.el.style.transform = ''
      if (!changed && !prefersReducedMotion()) {
        d.el.animate([{ transform: d.transform }, { transform: 'none' }], {
          duration: 200,
          easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
        })
      }
    }
    const up = (e: PointerEvent) => end(e, false)
    const cancel = (e: PointerEvent) => end(e, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [])

  /** Starts tracking a press on a tile; whether it's allowed is the caller's call. */
  const begin = (e: ReactPointerEvent<HTMLButtonElement>, uid: number, from: 'tray' | 'slot', slotIndex: number) => {
    if (e.button !== 0 || !e.isPrimary || dragRef.current) return
    dragRef.current = {
      uid,
      from,
      slotIndex,
      el: e.currentTarget,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      transform: '',
    }
  }

  /** False just after a drag, when the browser's trailing click isn't a tap. */
  const clickAllowed = () => performance.now() >= suppressClickUntil.current

  return { dragUid, hoverSlot, begin, clickAllowed }
}
