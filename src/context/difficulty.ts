/**
 * How forgiving play is, as one choice. It used to be three separate toggles
 * (retry-on-miss, practice mode, the first-word capital hint) — eight
 * combinations, several of them pointless (one-shot scoring with no timer)
 * and hard for a child to tell apart. They all answer the same question, so
 * they're set together.
 */
export type Difficulty = 'easy' | 'normal' | 'hard'

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard']

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '🌱 ゆっくり',
  normal: '⚡ ふつう',
  hard: '🔥 一発勝負',
}

export const DIFFICULTY_KEY = 'wordrush.difficulty'
export const LISTENING_MODE_KEY = 'wordrush.listeningMode'
/** The toggles `difficulty` replaced, read once to carry a saved choice over. */
const LEGACY_PRACTICE_MODE_KEY = 'wordrush.practiceMode'
const LEGACY_RETRY_ON_MISS_KEY = 'wordrush.retryOnMiss'

export interface DifficultyBehavior {
  /** No timer or hearts, and the run doesn't count toward the best score. */
  practiceMode: boolean
  /** Each tile is checked as it's placed; a wrong one bounces and the
   * player keeps going. Otherwise the full board is scored at once. */
  retryOnMiss: boolean
  /** The sentence's first word keeps its capital, giving away which comes first. */
  capitalizeFirst: boolean
}

export function behaviorFor(difficulty: Difficulty): DifficultyBehavior {
  return {
    practiceMode: difficulty === 'easy',
    retryOnMiss: difficulty !== 'hard',
    capitalizeFirst: difficulty === 'easy',
  }
}

function isDifficulty(value: string | null): value is Difficulty {
  return value !== null && (DIFFICULTIES as readonly string[]).includes(value)
}

/** The saved difficulty, or one mapped from the old toggles: practice mode
 * was the forgiving end, one-shot scoring the strict one. */
export function loadDifficulty(): Difficulty {
  try {
    const saved = localStorage.getItem(DIFFICULTY_KEY)
    if (isDifficulty(saved)) return saved
    if (localStorage.getItem(LEGACY_PRACTICE_MODE_KEY) === '1') return 'easy'
    if (localStorage.getItem(LEGACY_RETRY_ON_MISS_KEY) === '0') return 'hard'
  } catch {
    /* storage unavailable — fall back to the default */
  }
  return 'normal'
}
