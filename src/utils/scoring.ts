/** A challenge run is always this many questions. */
export const QUESTIONS_PER_SESSION = 10

/**
 * A run scored over fewer than this many questions doesn't earn stars.
 *
 * Endless runs end whenever the player taps やめる, and both modes share one
 * best-score record per level. Without a floor, quitting an endless run after
 * a single correct answer would be 100% accuracy — an instant ★3 that a real
 * 10-question run has to work for.
 */
export const MIN_RANKED_QUESTIONS = QUESTIONS_PER_SESSION

/**
 * A run's score rescaled to what it would be over a full 10-question session.
 *
 * Both modes share one best-score record per level, and raw score is a
 * running total — so a 60-question endless run always out-totals a 10-question
 * one no matter how carelessly it was played, which would turn "ベストスコア"
 * into "longest session". Normalizing per question and scaling back up to ten
 * keeps the number in the range players already know (a challenge run's
 * normalized score is exactly its own score) while making the two modes
 * comparable.
 */
export function normalizedScore(score: number, totalCount: number): number {
  if (totalCount <= 0) return 0
  return Math.round((score / totalCount) * QUESTIONS_PER_SESSION)
}

/**
 * Stars from answer accuracy: 3 at 90%+, 2 at 70%+, 1 at 40%+.
 * Returns 0 for runs too short to rank (see MIN_RANKED_QUESTIONS).
 */
export function calcStars(correctCount: number, totalCount: number): 0 | 1 | 2 | 3 {
  if (totalCount < MIN_RANKED_QUESTIONS) return 0
  const accuracy = correctCount / totalCount
  return accuracy >= 0.9 ? 3 : accuracy >= 0.7 ? 2 : accuracy >= 0.4 ? 1 : 0
}

/** Most a single correct answer can earn from speed, before combo. */
export const MAX_TIME_BONUS = 50

/**
 * Speed bonus for a correct answer, as a share of the time that was on offer.
 *
 * This used to be `timeLeft * 2`, which quietly made the bonus depend on how
 * long the clock happened to be: the same brisk answer was worth more on a
 * level with a generous limit than on a hard one, so the reward for speed
 * shrank exactly where the questions got harder. Scaling by the fraction of
 * the limit still on the clock pays the same for the same relative speed,
 * whatever the level or the length of the sentence.
 */
export function timeBonus(timeLeft: number, timeLimitSec: number): number {
  if (timeLimitSec <= 0) return 0
  const remaining = Math.min(Math.max(timeLeft, 0), timeLimitSec) / timeLimitSec
  return Math.round(MAX_TIME_BONUS * remaining)
}

export type JudgeTone = 'perfect' | 'great' | 'good' | 'miss'

/**
 * Points and the PERFECT!/GREAT!/GOOD! callout for a clean correct answer.
 * `combo` is the streak before this answer: 3+ in a row pays ×1.5, 5+ pays ×2.
 * Speed sets the grade, and a hesitant answer (see isShakyAnswer) can't be a
 * PERFECT. Practice runs have no clock, so no speed bonus and no grade.
 */
export function scoreCorrect({
  combo,
  timeLeft,
  timeLimit,
  timed,
  shaky,
}: {
  combo: number
  timeLeft: number
  timeLimit: number
  timed: boolean
  shaky: boolean
}): { gained: number; label: string; tone: JudgeTone } {
  const multiplier = combo >= 5 ? 2 : combo >= 3 ? 1.5 : 1
  const bonus = timed ? timeBonus(timeLeft, timeLimit) : 0
  const gained = Math.round(100 * multiplier) + bonus
  if (!timed) return { gained, label: 'NICE!', tone: 'great' }
  if (shaky) return { gained, label: 'GOOD!', tone: 'good' }
  const speed = timeLimit > 0 ? timeLeft / timeLimit : 0
  if (speed >= 0.6) return { gained, label: 'PERFECT!', tone: 'perfect' }
  if (speed >= 0.35) return { gained, label: 'GREAT!', tone: 'great' }
  return { gained, label: 'GOOD!', tone: 'good' }
}
