import type { PointerEvent as ReactPointerEvent } from 'react'
import { estimateTileWidth } from './tileWidth'
import styles from './WordTile.module.css'

const COLOR_CLASSES = [styles.c0, styles.c1, styles.c2, styles.c3, styles.c4]

export function WordTile({
  uid,
  word,
  displayWord,
  colorIndex,
  onClick,
  onPointerDown,
  disabled,
  placed,
  error,
  dragging,
  hotkey,
}: {
  uid: number
  word: string
  displayWord?: string
  colorIndex: number
  onClick: () => void
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void
  disabled?: boolean
  /** Already placed in an answer slot: keeps this tile's spot in the tray
   * reserved (so the other tiles don't jump into the gap) but hides it,
   * since its word is now shown in the answer row instead. */
  placed?: boolean
  /** Temporarily marks this tray tile as incorrect (shakes with red border)
   * on tap when the wrong word order is chosen. */
  error?: boolean
  /** Being dragged by the player's finger/mouse right now. */
  dragging?: boolean
  /** Keyboard shortcut shown on the tile on devices with a real keyboard. */
  hotkey?: string
}) {
  const shown = displayWord ?? word
  return (
    <button
      className={`${styles.tile} ${COLOR_CLASSES[colorIndex % COLOR_CLASSES.length]} ${placed ? styles.placed : ''} ${error ? styles.error : ''} ${dragging ? styles.dragging : ''}`}
      style={{ minWidth: estimateTileWidth(word) }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      data-tile-uid={uid}
      data-hidden={placed ? 'true' : undefined}
      aria-label={`${shown} を置く`}
    >
      {shown}
      {hotkey && !placed && (
        <span className={styles.hotkey} aria-hidden="true">
          {hotkey}
        </span>
      )}
    </button>
  )
}

export function AnswerSlot({
  index,
  uid,
  word,
  displayWord,
  colorIndex,
  mismatch,
  next,
  hover,
  dragging,
  cheerDelayMs,
  onClick,
  onPointerDown,
}: {
  /** 0-indexed position in the answer row. */
  index: number
  uid?: number
  word: string | null
  displayWord?: string
  colorIndex: number
  /** Marks this slot's tile as landing in the wrong position, once the round
   * has been scored, so learners can see exactly which words to move. */
  mismatch?: boolean
  /** The slot a tapped word will go into next. */
  next?: boolean
  /** A dragged word is currently over this slot. */
  hover?: boolean
  dragging?: boolean
  /** Set once the sentence is correct: the tiles bounce one after another. */
  cheerDelayMs?: number
  onClick: () => void
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  const position = index + 1
  if (word === null) {
    return (
      <div
        className={`${styles.slot} ${next ? styles.slotNext : ''} ${hover ? styles.slotHover : ''}`}
        style={{ minWidth: 52 }}
        data-slot-index={index}
        aria-label={`解答欄 ${position}：空`}
      />
    )
  }
  const shown = displayWord ?? word
  const cheering = cheerDelayMs !== undefined
  return (
    <div className={`${styles.slot} ${styles.filled} ${hover ? styles.slotHover : ''}`} data-slot-index={index}>
      <button
        className={`${styles.tile} ${styles.landed} ${COLOR_CLASSES[colorIndex % COLOR_CLASSES.length]} ${mismatch ? styles.mismatch : ''} ${dragging ? styles.dragging : ''} ${cheering ? styles.cheer : ''}`}
        style={{ minWidth: estimateTileWidth(word), animationDelay: cheering ? `${cheerDelayMs}ms` : undefined }}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        data-tile-uid={uid}
        aria-label={`解答欄 ${position}：${shown}。タップで取り消し`}
      >
        {shown}
      </button>
    </div>
  )
}
