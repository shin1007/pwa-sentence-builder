/**
 * Minimum width for a word tile, so a tile is sized to its word before the
 * browser has laid any text out (trailing punctuation barely adds width).
 *
 * In `em` so it follows the tile's font size, which shrinks with the screen
 * (see WordTile.module.css). A fixed pixel width sized for the largest font
 * left small phones with tiles far wider than their words, pushing a long
 * sentence's tray onto a third row below the bottom of the screen.
 *
 * Kept out of WordTile.tsx deliberately: a module that exports both
 * components and plain helpers opts out of React Fast Refresh.
 */
export function estimateTileWidth(word: string): string {
  const bare = word.replace(/[.,?!]/g, '')
  return `${Math.max(2.4, bare.length * 0.72 + 1.6).toFixed(2)}em`
}
