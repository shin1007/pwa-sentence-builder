import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { getLevel } from '../data/levels'
import { pickGrammarQuestions, pickQuestions, pickReviewQuestions, questionsByIds, warmUpFirst } from '../data/questions'
import { useSoundContext } from '../context/sound'
import { useSettingsContext } from '../context/settings'
import { saveBestResultIfBetter } from '../utils/storage'
import { isShakyAnswer, loadDueIds, recordCorrect, recordMiss, recordReviewRecall, recordShaky } from '../utils/reviewQueue'
import { MAX_RELEARN_PER_RUN, countScored, insertRelearn, type Relearnable } from '../utils/relearn'
import { recordFirstTry, recordRecovered, recordMissedOnly } from '../utils/progressStats'
import { grammarWeights, recordGrammarResult } from '../utils/grammarStats'
import { idiomSpans, recordIdiomResult, shouldChunkIdiom } from '../utils/idiomProgress'
import { forgetSolved, recentlySolvedIds, recordSolved } from '../utils/solvedQuestions'
import { phraseChunks, unitsWithSpans } from '../utils/phraseScaffold'
import { acceptedOrders, fitsSomeOrder, isAccepted, misplacedSlots, splitFinalPunct } from '../utils/answerCheck'
import { isSpeechSupported, speakEnglish, speakJapanese, stopSpeaking } from '../audio/speech'
import { haptic } from '../utils/haptics'
import { prefersReducedMotion, toCanvasDelta } from '../utils/motion'
import { useCountUp } from '../hooks/useCountUp'
import { grammarLabel } from '../data/grammar'
import { keepsCapital } from '../data/capitalization'
import { ORDER_HINTS, detectOrderMistake, type OrderMistake } from '../data/orderHints'
import { WordTile, AnswerSlot } from './WordTile'
import Confetti from './Confetti'
import { QUESTIONS_PER_SESSION, calcStars, timeBonus } from '../utils/scoring'
import { timeLimitFor } from '../data/timeLimit'
import { focusLabel } from '../data/modes'
import type { FocusSession, GameMode, LevelId, LevelResult, MissedQuestion, Question } from '../types'
import styles from './GameScreen.module.css'

const START_LIVES = 10
/** How many questions an endless run draws at a time. Another batch is
 * appended before the current one runs out, so the run never hits an end. */
const ENDLESS_BATCH = 30
/** Append the next batch once this few questions are left in the queue. */
const ENDLESS_REFILL_AT = 5
const FEEDBACK_DELAY_CORRECT = 1100
const FEEDBACK_DELAY_WRONG = 1500
/**
 * The feedback pause (and the English read-aloud) can be skipped with a tap,
 * but not instantly: a tap that was already on its way when the answer got
 * scored shouldn't throw away the result before it's even been seen. A miss
 * waits longer, since the correct sentence is shown then and is worth a look.
 */
const SKIP_AFTER_CORRECT_MS = 250
const SKIP_AFTER_WRONG_MS = 700
/** Grace window after the last tile lands before the answer is actually
 * scored, so a player who notices a misplaced word (or two swapped) can
 * still tap a filled slot to pull it back and fix it before it counts
 * against them — filling the board no longer locks the answer in instantly. */
const CONFIRM_GRACE_MS = 650
/** Pause on the finished sentence after rebuilding a missed answer. */
const REBUILD_DONE_DELAY = 700
/** How far a press has to travel before it becomes a drag instead of a tap. */
const DRAG_THRESHOLD_PX = 8
/** How long the back/やめる button stays armed after the first tap. */
const QUIT_ARM_MS = 2500

interface Tile {
  uid: number
  word: string
}

interface DragState {
  uid: number
  from: 'tray' | 'slot'
  slotIndex: number
  el: HTMLElement
  pointerId: number
  startX: number
  startY: number
  active: boolean
  transform: string
}

interface Judge {
  id: number
  label: string
  tone: 'perfect' | 'great' | 'good' | 'miss'
  combo: number
  confetti: number
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface Answer {
  /** The tiles in written order: normally a word each, but a chunked idiom
   * (see utils/idiomProgress.ts) or, while the player is struggling with the
   * grammar, a noun phrase (see utils/phraseScaffold.ts) is a single tile.
   * The sentence-final mark is not on any tile — it's shown after the slots
   * (see utils/answerCheck.ts). */
  units: string[]
  /** The sentence-final `.`, `?` or `!`. */
  punct: string
  /** Every tile order that counts as correct; the first is `units`. */
  orders: string[][]
  /** Noun phrases are merged into single tiles for this question. */
  phrasesChunked: boolean
}

function answerFor(levelId: LevelId, question: Question): Answer {
  const phrases = phraseChunks(levelId, question)
  const withPunct = unitsWithSpans(question.words, [...idiomSpans(question, shouldChunkIdiom(question)), ...phrases])
  const { units, punct } = splitFinalPunct(withPunct)
  return { units, punct, orders: acceptedOrders(question.words, withPunct), phrasesChunked: phrases.length > 0 }
}

function buildTiles(units: string[]): Tile[] {
  return shuffle(units.map((word, uid) => ({ uid, word })))
}

/** What the hint names: the idiom itself for an idiom question (its words
 * may be spread over several tiles), otherwise the grammar point. */
function hintFor(question: Question): string | undefined {
  if (question.idiom) return `${question.idiom.phrase}（${question.idiom.meaning}）`
  return question.grammar ? grammarLabel(question.grammar) : question.note
}

/** The note shown after answering; an idiom question also spells out the
 * idiom, since the group label alone ("群動詞") doesn't say which one. */
function noteFor(question: Question): string | undefined {
  if (question.idiom) return `${question.note}: ${question.idiom.phrase}（${question.idiom.meaning}）`
  return question.note
}

/** A normal draw: biased toward what's due for review, toward the grammar
 * the player is weakest on, and away from sentences they've recently solved
 * cleanly (see pickQuestions). */
function drawQuestions(levelId: LevelId, count: number): Question[] {
  return pickQuestions(levelId, count, loadDueIds(levelId), grammarWeights(levelId), recentlySolvedIds(levelId))
}

function focusQuestions(levelId: LevelId, focus: FocusSession): Question[] {
  switch (focus.kind) {
    case 'grammar':
      return pickGrammarQuestions(levelId, focus.grammar, QUESTIONS_PER_SESSION, recentlySolvedIds(levelId))
    case 'review':
      return pickReviewQuestions(levelId, loadDueIds(levelId), QUESTIONS_PER_SESSION, recentlySolvedIds(levelId))
    case 'retryMissed':
      return questionsByIds(levelId, focus.questionIds)
  }
}

/** The opening draw for a run: a focus run's hand-picked set, or a normal
 * draw, opening with its shortest sentence (see warmUpFirst). A grammar
 * drill keeps its own order, which leads with the drilled point. */
function initialQuestions(levelId: LevelId, mode: GameMode, focus: FocusSession | undefined): Question[] {
  if (focus) {
    const picked = focusQuestions(levelId, focus)
    // Callers only offer a focus run that has questions, but a stale id list
    // (the bank changed between runs) mustn't leave the run with nothing.
    if (picked.length > 0) return focus.kind === 'grammar' ? picked : warmUpFirst(picked)
  }
  return warmUpFirst(drawQuestions(levelId, mode === 'endless' ? ENDLESS_BATCH : QUESTIONS_PER_SESSION))
}

/** With the first-word capital hint off, the sentence-initial tile loses
 * its capital — unless the word is always capitalized (`I'm`, `Tom`,
 * `Kyoto`; see keepsCapital). `secondWord` tells the modal `May` from the
 * month. */
function displayFor(tile: Tile, capitalizeFirst: boolean, secondWord: string | undefined): string {
  if (capitalizeFirst || tile.uid !== 0) return tile.word
  const [first, ...rest] = tile.word.split(' ')
  if (keepsCapital(first, rest[0] ?? secondWord)) return tile.word
  return tile.word.charAt(0).toLowerCase() + tile.word.slice(1)
}

export default function GameScreen({
  levelId,
  mode,
  focus,
  onFinish,
  onExit,
}: {
  levelId: LevelId
  mode: GameMode
  /** Set for a targeted practice run; always a fixed-length run. */
  focus?: FocusSession
  onFinish: (result: LevelResult, isNewBest: boolean, missed: MissedQuestion[]) => void
  onExit: () => void
}) {
  const level = getLevel(levelId)!
  const sound = useSoundContext()
  const { capitalizeFirst, practiceMode, retryOnMiss, listeningMode } = useSettingsContext()
  // With sound off (or no speech engine) there'd be nothing to listen to, so
  // the question falls back to the Japanese prompt.
  const listening = listeningMode && sound.sfxOn && isSpeechSupported()

  const isEndless = mode === 'endless' && !focus

  // Challenge mode draws its ten questions once (a focus run, however many it
  // was given). Endless keeps the queue topped up (see the refill effect
  // below) so it never runs dry.
  // Missed questions are repeated later in the run (see utils/relearn.ts);
  // those copies are marked `relearn` and aren't scored.
  const [questions, setQuestions] = useState<Relearnable<Question>[]>(() => initialQuestions(levelId, mode, focus))
  const [qIndex, setQIndex] = useState(0)
  const question = questions[qIndex]

  /** The answer as the player builds it, one entry per tile. Decided when the
   * question comes up so progress booked mid-question can't reshape it. */
  const [answer, setAnswer] = useState<Answer>(() => answerFor(levelId, questions[0]))
  const units = answer.units
  const [tray, setTray] = useState<Tile[]>(() => buildTiles(units))
  const [slots, setSlots] = useState<(Tile | null)[]>(() => new Array(units.length).fill(null))

  const [lives, setLives] = useState(START_LIVES)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  /** Questions actually resolved so far — an endless run is scored over this. */
  const [answeredCount, setAnsweredCount] = useState(0)

  /**
   * 'fixed' is a sentence finished after a wrong tile in retry-on-miss mode:
   * the board ends up right, but the player didn't get there unaided, so it
   * scores and counts as a miss rather than a correct answer.
   *
   * 'rebuild' follows a wrong answer: the correct sentence stays on screen and
   * the player lays it out once themselves (wrong tiles just bounce, nothing
   * is scored) before moving on — 'rebuilt' once they have. Seeing the answer
   * is recognition; putting it together is the practice.
   */
  const [status, setStatus] = useState<'playing' | 'correct' | 'wrong' | 'fixed' | 'rebuild' | 'rebuilt'>('playing')
  /** The answer on screen was correct but hesitant, so it was sent to review
   * (see isShakyAnswer). */
  const [shaky, setShaky] = useState(false)
  /**
   * This question's budget, scaled to how many words it takes (see
   * data/timeLimit.ts). Held in state rather than derived so a question that
   * arrives mid-render can't rescale the bar the player is already watching;
   * it's set alongside timeLeft whenever the question changes.
   */
  const [timeLimit, setTimeLimit] = useState(() => timeLimitFor(level, questions[0].words.length))
  const [timeLeft, setTimeLeft] = useState(timeLimit)
  const [scorePop, setScorePop] = useState<{ id: number; value: number } | null>(null)
  const [shake, setShake] = useState(false)
  const [errorTileUid, setErrorTileUid] = useState<number | null>(null)
  // True for the brief window after the last tile lands but before it's
  // actually scored in advance mode.
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  /** A wrong tile was tapped on this question, so its hint is showing (see
   * handleTrayTap). */
  const [hintShown, setHintShown] = useState(false)
  /** The typical word-order mistake the player's last wrong order showed, if
   * any (see data/orderHints.ts) — named alongside the usual hint. */
  const [orderHint, setOrderHint] = useState<OrderMistake | null>(null)
  /** The PERFECT!/GREAT!/TIME UP! callout for the question just scored. */
  const [judge, setJudge] = useState<Judge | null>(null)
  const [dragUid, setDragUid] = useState<number | null>(null)
  const [hoverSlot, setHoverSlot] = useState<number | null>(null)
  /** First tap on back/やめる arms it; only a second tap actually leaves, so a
   * stray thumb near the corner can't throw a run away. */
  const [quitArmed, setQuitArmed] = useState(false)

  const displayedScore = useCountUp(score)

  const lastTickSecond = useRef(-1)
  const advanceTimer = useRef<number | null>(null)
  const pendingAdvance = useRef<(() => void) | null>(null)
  const advanceGeneration = useRef(0)
  const popIdRef = useRef(0)
  const pendingCheck = useRef<{ timerId: number; isCorrect: boolean; mistake: OrderMistake | null } | null>(null)
  /**
   * Latest outcome per question in this session, for the progress tracker.
   * A question can be missed, recovered, and (in endless) come back and be
   * missed again, so this holds where it stands right now rather than a
   * one-way "was missed" flag. Whatever is still 'missed' when the session
   * ends is what never got recovered.
   */
  const questionOutcome = useRef<Map<string, 'missed' | 'recovered'>>(new Map())
  /** Every question missed at least once this run, in the order it was
   * first missed, for the result screen's review list. */
  const missedQuestions = useRef<Map<string, Question>>(new Map())
  /** True while a wrong-tile hint is being read aloud, so a quick string of
   * wrong taps doesn't restart the sentence from the top each time. */
  const hintSpeaking = useRef(false)
  /** A wrong tile was tapped on the question on screen now (retry-on-miss
   * mode). Kept per appearance rather than read off questionOutcome, which in
   * endless can carry a miss over from an earlier appearance of the same
   * question. */
  const missedThisQuestion = useRef(false)
  /** Times a tile was pulled back out of the answer on this question — part of
   * judging whether a correct answer was hesitant. */
  const removalsThisQuestion = useRef(0)
  /** Repeats this run has queued (capped for fixed-length runs). */
  const relearnAdded = useRef(0)
  /** Moves on once the player has rebuilt a missed answer. */
  const rebuildAdvance = useRef<(() => void) | null>(null)
  /**
   * Every question id this run has queued up, so an endless refill can skip
   * what the player has already seen. Refills used to be deduped only against
   * the questions still waiting in the queue, so once a run went past the size
   * of the level's pool (210 questions at the smallest) it quietly started
   * serving repeats.
   */
  const servedIds = useRef<Set<string>>(new Set(questions.map((q) => q.id)))
  /** Lets a tap cut the post-answer pause short (see SKIP_AFTER_*). */
  const skipRef = useRef<{ at: number; minMs: number; run: () => void } | null>(null)
  const quitArmTimer = useRef<number | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const slotsAreaRef = useRef<HTMLDivElement>(null)
  /** Tile positions just before the board changes, for the FLIP fly-in. */
  const flipSnapshot = useRef<Map<number, DOMRect> | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const hoverSlotRef = useRef<number | null>(null)
  /** A drag ends with a pointerup that some browsers follow with a click on
   * whatever is underneath; that click must not count as a tap. */
  const suppressClickUntil = useRef(0)

  // Freeze the countdown while the tab/app is backgrounded so returning
  // players don't find their time silently drained (or the round already
  // timed out) by however long they were away.
  const [isHidden, setIsHidden] = useState(() => document.hidden)
  useEffect(() => {
    const onVisibilityChange = () => setIsHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  // Top the endless queue up before it empties. A fresh draw re-consults the
  // review queue, so questions missed earlier in this same run can resurface.
  useEffect(() => {
    if (!isEndless) return
    if (questions.length - qIndex > ENDLESS_REFILL_AT) return
    setQuestions((current) => {
      const next = drawQuestions(levelId, ENDLESS_BATCH)
      // Skip anything this run has already served. A long enough run exhausts
      // the pool, at which point this comes back empty — then the run starts
      // over on a clean slate rather than stalling with nothing to show.
      let fresh = next.filter((q) => !servedIds.current.has(q.id))
      if (fresh.length === 0) {
        servedIds.current = new Set(current.map((q) => q.id))
        fresh = next.filter((q) => !servedIds.current.has(q.id))
        if (fresh.length === 0) fresh = next
      }
      for (const q of fresh) servedIds.current.add(q.id)
      return [...current, ...fresh]
    })
  }, [isEndless, qIndex, questions.length, levelId])

  const cancelPendingCheck = useCallback(() => {
    if (!pendingCheck.current) return
    window.clearTimeout(pendingCheck.current.timerId)
    pendingCheck.current = null
    setAwaitingConfirm(false)
  }, [])

  useEffect(() => {
    if (qIndex === 0) return
    cancelPendingCheck()
    missedThisQuestion.current = false
    removalsThisQuestion.current = 0
    setShaky(false)
    setHintShown(false)
    setOrderHint(null)
    setJudge(null)
    skipRef.current = null
    const q = questions[qIndex]
    const nextAnswer = answerFor(levelId, q)
    const nextUnits = nextAnswer.units
    setAnswer(nextAnswer)
    setTray(buildTiles(nextUnits))
    setSlots(new Array(nextUnits.length).fill(null))
    setStatus('playing')
    const nextLimit = timeLimitFor(level, q.words.length)
    setTimeLimit(nextLimit)
    setTimeLeft(nextLimit)
    lastTickSecond.current = -1
  }, [qIndex, questions, level, levelId, cancelPendingCheck])

  // The countdown shouldn't start ticking while the prompt is still being
  // read aloud (the Japanese one, or in listening mode the English sentence
  // itself), so wait for that playback to finish before arming it.
  const [timerReady, setTimerReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    setTimerReady(false)
    const q = questions[qIndex]
    const done = listening
      ? speakEnglish(q.words.join(' '))
      : sound.sfxOn
        ? speakJapanese(q.jp)
        : Promise.resolve()
    done.then(() => {
      if (!cancelled) setTimerReady(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex])

  // The confirm grace window is time the player was given to spot a misplaced
  // word, not time to solve the question — letting the clock run through it
  // can score a correct answer as a time-out.
  useEffect(() => {
    if (status !== 'playing' || isHidden || practiceMode || !timerReady || awaitingConfirm) return
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        const next = Math.max(0, t - 0.1)
        const floorNext = Math.floor(next)
        if (floorNext <= 4 && floorNext !== lastTickSecond.current && next > 0) {
          lastTickSecond.current = floorNext
          sound.tick(true)
        }
        return next
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [status, qIndex, sound, isHidden, practiceMode, timerReady, awaitingConfirm])

  useEffect(
    () => () => {
      advanceGeneration.current++
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
      if (pendingAdvance.current) document.removeEventListener('visibilitychange', pendingAdvance.current)
      if (pendingCheck.current) window.clearTimeout(pendingCheck.current.timerId)
      if (quitArmTimer.current) window.clearTimeout(quitArmTimer.current)
    },
    [],
  )

  // FLIP: whenever the board changes, every tile that moved (tray → slot,
  // slot → tray, slot ↔ slot) flies from where it was to where it now is,
  // instead of blinking out of one place and into another.
  useLayoutEffect(() => {
    const snap = flipSnapshot.current
    flipSnapshot.current = null
    const root = boardRef.current
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
  }, [slots])

  const captureFlip = () => {
    const root = boardRef.current
    if (!root) return
    const rects = new Map<number, DOMRect>()
    root.querySelectorAll<HTMLElement>('[data-tile-uid]').forEach((el) => {
      if (el.dataset.hidden) return
      rects.set(Number(el.dataset.tileUid), el.getBoundingClientRect())
    })
    flipSnapshot.current = rects
  }

  /**
   * Books a question's first result this run against its grammar point, then
   * records where it now stands. Only the first result counts toward grammar
   * accuracy — a later recovery shows the player was told the answer, not that
   * the point had stuck.
   */
  const recordOutcome = useCallback(
    (q: Question, correct: boolean) => {
      if (!questionOutcome.current.has(q.id) && q.grammar) {
        recordGrammarResult(levelId, q.grammar, correct)
      }
      questionOutcome.current.set(q.id, correct ? 'recovered' : 'missed')
      if (!correct && !missedQuestions.current.has(q.id)) missedQuestions.current.set(q.id, q)
    },
    [levelId],
  )

  const finishSession = useCallback(
    (finalScore: number, finalCorrect: number, finalBestCombo: number, finalAnswered: number) => {
      // A challenge run is always out of ten, even when hearts run out early
      // (a focus run, out of however many questions it was given). An endless
      // run is scored over however many questions were answered — never zero,
      // so the result screen can't divide by it.
      const total = isEndless ? Math.max(finalAnswered, 1) : countScored(questions)
      const stars = calcStars(finalCorrect, total)
      const result: LevelResult = {
        levelId,
        mode,
        score: finalScore,
        correctCount: finalCorrect,
        totalCount: total,
        bestCombo: finalBestCombo,
        stars,
        clearedAt: Date.now(),
      }
      // Everything still sitting at 'missed' was never recovered in this run.
      let unrecovered = 0
      for (const outcome of questionOutcome.current.values()) {
        if (outcome === 'missed') unrecovered++
      }
      recordMissedOnly(unrecovered)

      const missed: MissedQuestion[] = [...missedQuestions.current.values()].map((q) => ({
        question: q,
        recovered: questionOutcome.current.get(q.id) === 'recovered',
      }))

      // Practice sessions have no timer/lives pressure, so they aren't a fair
      // comparison against timed runs and shouldn't overwrite a real best.
      // Neither should a focus run, whose questions were hand-picked.
      const isNewBest = practiceMode || focus ? false : saveBestResultIfBetter(result)
      if (stars >= 2 || (focus && finalCorrect / total >= 0.7)) sound.win()
      else sound.lose()
      onFinish(result, isNewBest, missed)
    },
    [levelId, mode, isEndless, onFinish, sound, practiceMode, focus, questions],
  )

  const resolve = useCallback(
    (isCorrect: boolean) => {
      // Finishing the sentence after a wrong tile doesn't make it a correct
      // answer. The miss was already booked (life, review queue, grammar
      // stats) when the tile was tapped, so this only withholds the reward.
      const fixed = isCorrect && missedThisQuestion.current
      const isRelearn = !!question.relearn
      const cleanCorrect = isCorrect && !fixed
      const wasShaky =
        cleanCorrect &&
        !isRelearn &&
        isShakyAnswer({ timeLeft, timeLimit, removals: removalsThisQuestion.current, timed: !practiceMode })
      setStatus(fixed ? 'fixed' : isCorrect ? 'correct' : 'wrong')
      setShaky(wasShaky)

      let nextScore = score
      let nextCombo = combo
      let nextBestCombo = bestCombo
      let nextCorrect = correctCount
      let nextLives = lives
      // A repeat isn't a new question, so it doesn't count toward the total.
      const nextAnswered = isRelearn ? answeredCount : answeredCount + 1
      setAnsweredCount(nextAnswered)

      if (fixed) {
        // Combo was already reset by the wrong tap. The question stays
        // 'missed' in questionOutcome, so it's tallied as never recovered
        // at the end of the run unless it comes back and is solved cleanly.
        sound.place(units.length - 1)
      } else if (isCorrect && isRelearn) {
        // A repeat within the run earns no points and leaves the review queue
        // alone: getting it right a few questions after being shown the answer
        // isn't the recall a wider interval is meant to reward. It still counts
        // as a recovery in the progress record.
        sound.correct()
        haptic([12, 40, 18])
        setJudge({ id: popIdRef.current++, label: 'NICE!', tone: 'great', combo: 0, confetti: 22 })
        recordRecovered()
        recordOutcome(question, true)
      } else if (isCorrect) {
        const tier = combo >= 5 ? 2 : combo >= 3 ? 1 : 0
        const multiplier = tier === 2 ? 2 : tier === 1 ? 1.5 : 1
        const bonus = practiceMode ? 0 : timeBonus(timeLeft, timeLimit)
        const gained = Math.round(100 * multiplier) + bonus

        nextScore = score + gained
        nextCombo = combo + 1
        nextBestCombo = Math.max(bestCombo, nextCombo)
        nextCorrect = correctCount + 1

        setScore(nextScore)
        setCombo(nextCombo)
        setBestCombo(nextBestCombo)
        setCorrectCount(nextCorrect)
        // How it went, called out big: speed sets the grade, and a hesitant
        // answer (see isShakyAnswer) can't be a PERFECT.
        const speed = timeLimit > 0 ? timeLeft / timeLimit : 0
        const [label, tone]: [string, Judge['tone']] = practiceMode
          ? ['NICE!', 'great']
          : wasShaky
            ? ['GOOD!', 'good']
            : speed >= 0.6
              ? ['PERFECT!', 'perfect']
              : speed >= 0.35
                ? ['GREAT!', 'great']
                : ['GOOD!', 'good']
        setJudge({
          id: popIdRef.current,
          label,
          tone,
          combo: nextCombo,
          confetti: 22 + Math.min(nextCombo, 10) * 3 + (tone === 'perfect' ? 14 : 0),
        })
        setScorePop({ id: popIdRef.current++, value: gained })
        sound.correct(combo, tone === 'perfect')
        haptic([12, 40, 18])
        if (!questionOutcome.current.has(question.id)) recordReviewRecall(levelId, question.id, true)
        if (wasShaky) recordShaky(levelId, question.id)
        else recordCorrect(levelId, question.id)
        // Only a clean first answer in the run shows the sentence is known.
        if (!wasShaky && !questionOutcome.current.has(question.id)) recordSolved(levelId, question.id)
        // A hesitant answer doesn't show the idiom has stuck, so it leaves
        // the tiles as they are.
        if (!wasShaky) recordIdiomResult(question, true)
        // Missed earlier in this session means this is a recovery, even if the
        // question had already been recovered once and came back around.
        if (questionOutcome.current.has(question.id)) {
          recordRecovered()
        } else {
          recordFirstTry()
        }
        recordOutcome(question, true)
        if (nextCombo === 3 || (nextCombo >= 5 && nextCombo % 5 === 0)) {
          window.setTimeout(() => sound.combo(nextCombo >= 5 ? 2 : 1), 260)
        }
      } else {
        // Missing a repeat costs nothing: it's already due for review.
        if (!isRelearn) {
          nextCombo = 0
          nextLives = practiceMode ? lives : lives - 1
          setCombo(0)
          setLives(nextLives)
          if (!questionOutcome.current.has(question.id)) recordReviewRecall(levelId, question.id, false)
          recordMiss(levelId, question.id)
          forgetSolved(levelId, question.id)
          // A wrong tile on this question already counted against the idiom.
          if (!missedThisQuestion.current) recordIdiomResult(question, false)
        }
        setJudge({
          id: popIdRef.current++,
          label: timeLeft <= 0 ? 'TIME UP!' : 'おしい！',
          tone: 'miss',
          combo: 0,
          confetti: 0,
        })
        setShake(true)
        sound.wrong()
        haptic([40, 60, 40])
        recordOutcome(question, false)
        window.setTimeout(() => setShake(false), 450)
      }

      // Endless only ends on hearts (or the やめる button) — the queue itself
      // is refilled before it can run out.
      const outOfLives = !practiceMode && nextLives <= 0
      // Anything missed comes back once more later in this run.
      const requeue =
        !cleanCorrect && !isRelearn && !outOfLives && (isEndless || relearnAdded.current < MAX_RELEARN_PER_RUN)
      if (requeue) relearnAdded.current++
      const isLastQuestion = !isEndless && !requeue && qIndex + 1 >= questions.length
      // A wrong answer is rebuilt before moving on (not a 'fixed' one — that
      // was already finished tile by tile — and not when the run is over).
      const needsRebuild = !isCorrect && !outOfLives
      const generation = ++advanceGeneration.current

      // If the player backgrounds the app right after answering, don't let a
      // native setTimeout silently skip them ahead while they're away —
      // defer the advance until the tab is visible again. Guarded so a tap
      // to skip and the regular timer can't both advance.
      let advanced = false
      const advance = () => {
        if (advanced || generation !== advanceGeneration.current) return
        if (document.hidden) {
          pendingAdvance.current = advance
          document.addEventListener('visibilitychange', advance, { once: true })
          return
        }
        advanced = true
        pendingAdvance.current = null
        skipRef.current = null
        if (isLastQuestion || outOfLives) {
          finishSession(nextScore, nextCorrect, nextBestCombo, nextAnswered)
        } else {
          // Inserted only now, not at answer time: changing the queue resets
          // the board, which would wipe the feedback still on screen.
          if (requeue) setQuestions((current) => insertRelearn(current, qIndex))
          setQIndex((i) => i + 1)
        }
      }

      // Don't advance while the English sentence is still being read aloud —
      // wait for playback to finish (in addition to the usual feedback
      // delay) so the audio for this question is never cut short. Read it
      // on a wrong answer too, alongside the "正解: ..." text, so missing a
      // question still reinforces how the correct sentence actually sounds.
      // A player who's ready to move on can tap to skip both (skipFeedback).
      const speechDone = sound.sfxOn ? speakEnglish(question.words.join(' ')) : Promise.resolve()
      const minDelay = new Promise<void>((res) => {
        advanceTimer.current = window.setTimeout(res, isCorrect && !fixed ? FEEDBACK_DELAY_CORRECT : FEEDBACK_DELAY_WRONG)
      })
      let proceeded = false
      const proceed = () => {
        if (proceeded || generation !== advanceGeneration.current) return
        proceeded = true
        skipRef.current = null
        if (needsRebuild) {
          rebuildAdvance.current = advance
          setSlots(new Array(units.length).fill(null))
          setStatus('rebuild')
          return
        }
        advance()
      }
      Promise.all([minDelay, speechDone]).then(proceed)
      skipRef.current = {
        at: performance.now(),
        minMs: isCorrect && !fixed ? SKIP_AFTER_CORRECT_MS : SKIP_AFTER_WRONG_MS,
        run: () => {
          if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
          stopSpeaking()
          proceed()
        },
      }
    },
    [
      score,
      combo,
      bestCombo,
      correctCount,
      answeredCount,
      lives,
      timeLeft,
      timeLimit,
      qIndex,
      question,
      questions.length,
      sound,
      finishSession,
      practiceMode,
      isEndless,
      levelId,
      recordOutcome,
      units.length,
    ],
  )

  const skipFeedback = () => {
    const s = skipRef.current
    if (!s || performance.now() - s.at < s.minMs) return
    skipRef.current = null
    s.run()
  }

  useEffect(() => {
    if (status === 'playing' && timeLeft <= 0) {
      cancelPendingCheck()
      setOrderHint(detectOrderMistake(question, slots.map((s) => s?.word ?? null), answer.orders))
      resolve(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, status])

  /** Back (challenge) / やめる (endless). An endless run the player stops is
   * still a finished run: it goes to the result screen with whatever was
   * scored, unless they quit before answering anything at all. */
  const handleQuit = () => {
    sound.click()
    const hasProgress = answeredCount > 0 || slots.some((s) => s !== null)
    if (hasProgress && !quitArmed) {
      setQuitArmed(true)
      if (quitArmTimer.current) window.clearTimeout(quitArmTimer.current)
      quitArmTimer.current = window.setTimeout(() => setQuitArmed(false), QUIT_ARM_MS)
      return
    }
    if (!isEndless || answeredCount === 0) {
      onExit()
      return
    }
    cancelPendingCheck()
    // Drop any advance queued by the answer they just gave, so it can't fire
    // a second finish on top of this one.
    advanceGeneration.current++
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    finishSession(score, correctCount, bestCombo, answeredCount)
  }

  const handleListen = () => {
    sound.click()
    speakEnglish(question.words.join(' '))
  }

  const confirmNow = () => {
    if (!pendingCheck.current) return
    const { isCorrect, mistake } = pendingCheck.current
    window.clearTimeout(pendingCheck.current.timerId)
    pendingCheck.current = null
    setAwaitingConfirm(false)
    sound.click()
    if (!isCorrect) setOrderHint(mistake)
    resolve(isCorrect)
  }

  /**
   * Every change to the answer row while playing goes through here: it
   * records where the tiles were (for the fly animation), and scores the board
   * once it's full — straight away in retry mode, where every placed word is
   * already known to fit, or after the grace window in one-shot mode. Any
   * edit made during that window cancels it, and refilling the board starts a
   * fresh one.
   */
  const commitSlots = (next: (Tile | null)[]) => {
    captureFlip()
    cancelPendingCheck()
    setSlots(next)
    if (!next.every((s) => s !== null)) return
    if (retryOnMiss) {
      resolve(true)
      return
    }
    const placedWords = next.map((s) => (s as Tile).word)
    const isCorrect = isAccepted(placedWords, answer.orders)
    const mistake = isCorrect ? null : detectOrderMistake(question, placedWords, answer.orders)
    setAwaitingConfirm(true)
    const timerId = window.setTimeout(() => {
      pendingCheck.current = null
      setAwaitingConfirm(false)
      if (!isCorrect) setOrderHint(mistake)
      resolve(isCorrect)
    }, CONFIRM_GRACE_MS)
    pendingCheck.current = { timerId, isCorrect, mistake }
  }

  /** Laying out the correct sentence after a miss: only the right next word
   * sticks, and nothing is scored or recorded. */
  const placeRebuild = (tile: Tile, emptyIndex: number): boolean => {
    if (tile.word !== units[emptyIndex]) {
      setErrorTileUid(tile.uid)
      sound.remove()
      window.setTimeout(() => setErrorTileUid(null), 450)
      return false
    }
    const nextSlots = [...slots]
    nextSlots[emptyIndex] = tile
    captureFlip()
    setSlots(nextSlots)
    sound.place(emptyIndex)
    haptic(8)
    if (nextSlots.every((s) => s !== null)) {
      setStatus('rebuilt')
      const done = rebuildAdvance.current
      rebuildAdvance.current = null
      advanceTimer.current = window.setTimeout(() => done?.(), REBUILD_DONE_DELAY)
      skipRef.current = {
        at: performance.now(),
        minMs: 0,
        run: () => {
          if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
          done?.()
        },
      }
    }
    return true
  }

  /** Puts a tray tile on the board — into `target` when it was dropped on a
   * specific slot (one-shot mode), otherwise into the first empty one.
   * Returns whether it landed. */
  const placeTile = (tile: Tile, target?: number): boolean => {
    if (status !== 'playing' && status !== 'rebuild') return false
    if (slots.some((s) => s?.uid === tile.uid)) return false
    const emptyIndex = slots.findIndex((s) => s === null)
    if (status === 'rebuild') return emptyIndex !== -1 && placeRebuild(tile, emptyIndex)

    if (retryOnMiss) {
      if (emptyIndex === -1) return false
      // 即時判定モード: この単語を置いても、正解のどれかの並びと食い違わないか判定
      const tried = slots.map((s, i) => (i === emptyIndex ? tile.word : (s?.word ?? null)))
      if (!fitsSomeOrder(tried, answer.orders)) {
        // 間違えた単語をタップした瞬間に赤枠＆シェイクで通知！
        setErrorTileUid(tile.uid)
        setOrderHint(detectOrderMistake(question, tried, answer.orders))
        // Only the first wrong tile on a question counts against the idiom,
        // like a first-try result; a repeat doesn't count at all.
        if (!missedThisQuestion.current && !question.relearn) recordIdiomResult(question, false)
        missedThisQuestion.current = true
        // Before handing over the answer, point at the grammar it turns on
        // (and in listening mode, what the sentence means) so the player has
        // something to work the next word out from, not just to copy.
        setHintShown(true)
        sound.wrong()
        haptic([30, 40, 30])
        // Booked before recordOutcome/recordMiss move things on: only the
        // first result on a question that came up due counts as recall.
        if (!question.relearn && !questionOutcome.current.has(question.id)) {
          recordReviewRecall(levelId, question.id, false)
        }
        recordOutcome(question, false)
        // Read the correct sentence aloud as a hint: hearing the whole thing
        // in order is often enough to spot which word comes next, and it
        // turns a wrong tap into listening practice rather than a dead end.
        if (sound.sfxOn && !hintSpeaking.current) {
          hintSpeaking.current = true
          void speakEnglish(question.words.join(' ')).then(() => {
            hintSpeaking.current = false
          })
        }
        window.setTimeout(() => setErrorTileUid(null), 450)
        // A repeat costs nothing (see resolve).
        if (question.relearn) return false

        setCombo(0)
        recordMiss(levelId, question.id)
        forgetSolved(levelId, question.id)
        const nextLives = practiceMode ? lives : lives - 1
        setLives(nextLives)
        if (!practiceMode && nextLives <= 0) {
          // Hearts ran out mid-question: it's never completed, but it was
          // attempted and missed, so it counts toward the answered total.
          finishSession(score, correctCount, bestCombo, answeredCount + 1)
        }
        return false
      }

      // 正しい単語の場合: スロットに配置（すべて埋まれば commitSlots が正解処理）
      const nextSlots = [...slots]
      nextSlots[emptyIndex] = tile
      sound.place(emptyIndex)
      haptic(8)
      commitSlots(nextSlots)
      return true
    }

    // 一発勝負モード: 自由に並べてから一括判定。埋まっている欄に落とした
    // 場合は、元の単語がトレイに戻って入れ替わる。
    const index = target ?? emptyIndex
    if (index === -1) return false
    const nextSlots = [...slots]
    nextSlots[index] = tile
    sound.place(nextSlots.filter((s) => s !== null).length - 1)
    haptic(8)
    commitSlots(nextSlots)
    return true
  }

  /** Moving a placed word to another slot counts as a correction, like
   * pulling it out and putting it back (see isShakyAnswer). */
  const swapSlots = (from: number, to: number) => {
    if (status !== 'playing' || from === to) return
    removalsThisQuestion.current++
    const nextSlots = [...slots]
    ;[nextSlots[from], nextSlots[to]] = [nextSlots[to], nextSlots[from]]
    sound.swap()
    haptic(8)
    commitSlots(nextSlots)
  }

  const handleSlotTap = (index: number) => {
    if (status !== 'playing') return
    if (!slots[index]) return
    removalsThisQuestion.current++
    const nextSlots = [...slots]
    nextSlots[index] = null
    sound.remove()
    commitSlots(nextSlots)
  }

  const undoLast = () => {
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i]) {
        handleSlotTap(i)
        return
      }
    }
  }

  const handleClearAll = () => {
    if (status !== 'playing') return
    if (!slots.some((s) => s !== null)) return
    removalsThisQuestion.current++
    sound.remove()
    commitSlots(new Array(slots.length).fill(null))
  }

  const clickAllowed = () => performance.now() >= suppressClickUntil.current

  // ---------- drag & drop ----------

  const beginPointer = (
    e: ReactPointerEvent<HTMLButtonElement>,
    uid: number,
    from: 'tray' | 'slot',
    slotIndex: number,
  ) => {
    if (e.button !== 0 || !e.isPrimary || dragRef.current) return
    if (status !== 'playing' && !(status === 'rebuild' && from === 'tray')) return
    // In retry mode every placed word is already confirmed right, so there's
    // nothing to rearrange — a tap still sends it back to the tray.
    if (from === 'slot' && retryOnMiss) return
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

  /** Applies a finished drag. Returns whether the board changed. Kept in a
   * ref so the window listeners below always see this render's state. */
  const dropRef = useRef<(d: DragState, target: number | null) => boolean>(() => false)
  dropRef.current = (d, target) => {
    if (d.from === 'tray') {
      const tile = tray.find((t) => t.uid === d.uid)
      if (!tile || target === null) return false
      return placeTile(tile, retryOnMiss || status === 'rebuild' ? undefined : target)
    }
    if (status !== 'playing') return false
    // Dragged out of the answer area: back to the tray.
    if (target === null) {
      handleSlotTap(d.slotIndex)
      return true
    }
    if (target === d.slotIndex) return false
    swapSlots(d.slotIndex, target)
    return true
  }
  const pickupSoundRef = useRef(sound.pickup)
  pickupSoundRef.current = sound.pickup
  const slotIndexAtRef = useRef(slotIndexAt)
  slotIndexAtRef.current = slotIndexAt

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
        pickupSoundRef.current()
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
      const changed = dropRef.current(d, target)
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

  // ---------- keyboard ----------
  // 1–9, 0: place the tray word with that number · Backspace: take the last
  // word back · Esc: clear the row · Enter: confirm now / skip to next.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
    if (status !== 'playing' && status !== 'rebuild') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        skipFeedback()
      }
      return
    }
    if (/^[0-9]$/.test(e.key)) {
      const tile = tray[e.key === '0' ? 9 : Number(e.key) - 1]
      if (tile) {
        e.preventDefault()
        placeTile(tile)
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      undoLast()
    } else if (e.key === 'Escape') {
      handleClearAll()
    } else if (e.key === 'Enter' && awaitingConfirm) {
      e.preventDefault()
      confirmNow()
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Only the tiles that would have to move, not everything after the first
  // slip (see misplacedSlots).
  const misplaced = status === 'wrong' ? misplacedSlots(slots.map((s) => s?.word ?? ''), answer.orders) : null

  const timerPct = (timeLeft / timeLimit) * 100
  const timerClass = timeLeft <= 4 ? 'urgent' : timeLeft <= timeLimit * 0.4 ? 'warn' : ''
  const secondsLeft = Math.ceil(timeLeft)
  const nextEmpty = slots.findIndex((s) => s === null)
  // In retry mode (and while rebuilding) a drop anywhere goes to the next
  // slot, so that's the one to light up, whichever slot the finger is nearest.
  const hoverIndex = hoverSlot === null ? null : retryOnMiss || status === 'rebuild' ? nextEmpty : hoverSlot
  const heat = Math.min(combo, 10) / 10
  // The pauses a tap can cut short — not 'rebuild', where taps place words.
  const skippable = status === 'correct' || status === 'wrong' || status === 'fixed' || status === 'rebuilt'
  const placing = status === 'playing' || status === 'rebuild'

  return (
    <div
      className={styles.screen}
      style={{
        ['--bg1' as string]: level.gradient[1],
        ['--bg2' as string]: level.gradient[0],
        ['--heat' as string]: heat,
      }}
      onPointerDown={(e) => {
        if (!skippable) return
        if ((e.target as HTMLElement).closest('button:not(:disabled)')) return
        skipFeedback()
      }}
    >
      <div className={`${styles.heatGlow} ${combo >= 5 ? styles.heatHot : ''}`} aria-hidden="true" />
      <div ref={boardRef} className={`${styles.shakeTarget} ${shake ? 'shake' : ''}`}>
        <div className={styles.hud}>
          {isEndless || quitArmed ? (
            <button
              className={`${styles.quitButton} ${quitArmed ? styles.quitArmed : ''}`}
              onClick={handleQuit}
              aria-label={
                quitArmed
                  ? 'もう一度押すとやめます'
                  : answeredCount === 0
                    ? 'レベル選択に戻る'
                    : 'やめて結果を見る'
              }
            >
              {quitArmed ? 'もう一度タップでやめる' : '← やめる'}
            </button>
          ) : (
            <button className={styles.backButton} onClick={handleQuit} aria-label="レベル選択に戻る">
              ←
            </button>
          )}
          <span className={styles.levelTag}>
            {`${level.icon} ${level.title}`}
            {focus && ` ${focusLabel(focus)}`}
            {practiceMode && ` 🧪`}
            {listening && ` 🎧`}
          </span>
          <span className={styles.progress}>
            {question.relearn
              ? '🔁 もう一回'
              : isEndless
                ? `${countScored(questions, qIndex + 1)}問目`
                : `${countScored(questions, qIndex + 1)} / ${countScored(questions)}`}
          </span>
          <div className={styles.spacer} />
          {!practiceMode && (
            <div className={styles.hearts}>
              {Array.from({ length: START_LIVES }).map((_, i) => (
                <span key={i} className={i >= lives ? styles.heartLost : ''}>
                  ❤️
                </span>
              ))}
            </div>
          )}
          <div className={`${styles.comboBadge} ${combo >= 5 ? styles.hot : ''}`} style={{ opacity: combo > 0 ? 1 : 0.35 }}>
            <span className={styles.flame}>🔥</span> COMBO{' '}
            <span key={combo} className={styles.comboNum}>
              {combo}
            </span>
          </div>
          <div className={styles.scoreWrap}>
            {displayedScore}
            {scorePop && (
              <span key={scorePop.id} className={styles.scorePop}>
                +{scorePop.value}
              </span>
            )}
          </div>
        </div>

        {/* The bar's urgency was carried by colour alone (green → amber →
            red), which says nothing to a player who can't tell those apart.
            The icon and the seconds count say the same thing in a second and
            third channel. */}
        {!practiceMode && (
          <div className={styles.timerRow}>
            <span
              className={`${styles.timerLabel} ${timerClass ? styles[timerClass] : ''}`}
              role="timer"
              aria-live="off"
            >
              <span aria-hidden="true">{timerClass === 'urgent' ? '⚠️' : timerClass === 'warn' ? '⏳' : '⏱️'}</span>
              <span className={styles.timerSeconds}>{secondsLeft}</span>
            </span>
            <div className={styles.timerTrack}>
              <div
                className={`${styles.timerFill} ${timerClass ? styles[timerClass] : ''}`}
                style={{ width: `${timerPct}%` }}
              />
            </div>
          </div>
        )}

        <div className={styles.promptArea}>
          <div className={styles.jpRow}>
            {/* In listening mode the meaning stays hidden until the question
                is answered, or a wrong tile earns a hint. */}
            {listening && status === 'playing' && !hintShown ? (
              <p className={`${styles.jpText} ${styles.jpHidden}`}>🎧 英語を聞いて ならべよう</p>
            ) : (
              <p className={styles.jpText}>{question.jp}</p>
            )}
            <button className={styles.speakButton} onClick={handleListen} aria-label="英語を再生する">
              🔊<span className={styles.speakLabel}>{listening ? 'もう一度聞く' : '英語を再生'}</span>
            </button>
          </div>
          {question.source && (
            <span className={styles.sourceTag}>
              出典: {question.source.region} {question.source.year}
            </span>
          )}
          {question.relearn && status === 'playing' && (
            <span className={styles.note}>🔁 さっき まちがえた問題だよ</span>
          )}
          {answer.phrasesChunked && status === 'playing' && (
            <span className={styles.note}>🧩 ことばのまとまりを1枚のカードにしているよ</span>
          )}
          {(status === 'wrong' || status === 'rebuild' || status === 'rebuilt') && (
            <>
              <p className={`${styles.note} ${styles.noteWrong}`}>正解: {question.words.join(' ')}</p>
              {orderHint && <span className={`${styles.note} ${styles.noteHint}`}>🔎 {ORDER_HINTS[orderHint]}</span>}
              {question.note && <span className={styles.note}>{noteFor(question)}</span>}
            </>
          )}
          {status === 'playing' && hintShown && hintFor(question) && (
            <span className={`${styles.note} ${styles.noteHint}`}>💡 ヒント: {hintFor(question)}</span>
          )}
          {status === 'playing' && hintShown && orderHint && (
            <span className={`${styles.note} ${styles.noteHint}`}>🔎 {ORDER_HINTS[orderHint]}</span>
          )}
          {status === 'rebuild' && <p className={styles.note}>✍️ 正しい順番で ならべてみよう</p>}
          {status === 'rebuilt' && <p className={styles.note}>👍 できた！</p>}
          {status === 'correct' && shaky && (
            <p className={styles.note}>📚 ちょっと迷ったね。あとで復習に出すよ</p>
          )}
          {status === 'fixed' && (
            <p className={`${styles.note} ${styles.noteWrong}`}>完成！でも まちがえたので正解には数えないよ</p>
          )}
          {(status === 'correct' || status === 'fixed') && question.note && (
            <span className={styles.note}>{noteFor(question)}</span>
          )}
        </div>

        <div ref={slotsAreaRef} className={styles.slotsArea}>
          <div className={styles.slotsRow} role="group" aria-label="解答欄">
            {slots.map((tile, i) => (
              <AnswerSlot
                key={i}
                index={i}
                uid={tile?.uid}
                word={tile ? tile.word : null}
                displayWord={tile ? displayFor(tile, capitalizeFirst, question.words[1]) : undefined}
                colorIndex={tile ? tile.uid : i}
                mismatch={!!misplaced?.[i] && !!tile}
                next={placing && dragUid === null && i === nextEmpty}
                hover={hoverIndex === i}
                dragging={!!tile && dragUid === tile.uid}
                cheerDelayMs={status === 'correct' || status === 'rebuilt' ? 120 + i * 55 : undefined}
                onClick={() => {
                  if (clickAllowed()) handleSlotTap(i)
                }}
                onPointerDown={tile ? (e) => beginPointer(e, tile.uid, 'slot', i) : undefined}
              />
            ))}
            {judge && (status === 'correct' || status === 'wrong') && (
              <div className={styles.judgeLayer} aria-live="polite">
                <div key={judge.id} className={`${styles.judge} ${styles[`judge_${judge.tone}`]}`}>
                  <span className={styles.judgeLabel}>{judge.label}</span>
                  {judge.combo >= 2 && <span className={styles.judgeCombo}>🔥 {judge.combo} COMBO</span>}
                </div>
              </div>
            )}
            {answer.punct && (
              <span className={styles.endPunct} aria-hidden="true">
                {answer.punct}
              </span>
            )}
          </div>
        </div>

        <div className={styles.actionRow}>
          {status === 'playing' && slots.some((s) => s !== null) && (
            <>
              {!retryOnMiss && (
                <button className={styles.clearAllButton} onClick={undoLast} aria-label="最後に置いた単語をトレイに戻す">
                  ⌫ 1つ戻す
                </button>
              )}
              <button className={styles.clearAllButton} onClick={handleClearAll} aria-label="解答欄の単語をすべてトレイに戻す">
                ↺ 全て戻す
              </button>
              {awaitingConfirm && (
                <button className={styles.confirmButton} onClick={confirmNow} aria-label="この解答で決定する">
                  ✓ これでOK（ちがう単語はタップで直せるよ）
                </button>
              )}
            </>
          )}
          {skippable && (
            <span className={styles.skipHint} aria-hidden="true">
              タップで次へ ▶
            </span>
          )}
        </div>

        <div className={styles.trayArea}>
          <div className={styles.trayRow} role="group" aria-label="単語カード">
            {tray.map((tile, i) => {
              const placed = slots.some((s) => s?.uid === tile.uid)
              return (
                <WordTile
                  key={tile.uid}
                  uid={tile.uid}
                  word={tile.word}
                  displayWord={displayFor(tile, capitalizeFirst, question.words[1])}
                  colorIndex={tile.uid}
                  onClick={() => {
                    if (clickAllowed()) placeTile(tile)
                  }}
                  onPointerDown={(e) => beginPointer(e, tile.uid, 'tray', -1)}
                  disabled={!placing || placed}
                  placed={placed}
                  error={errorTileUid === tile.uid}
                  dragging={dragUid === tile.uid}
                  hotkey={i < 10 ? String((i + 1) % 10) : undefined}
                />
              )
            })}
          </div>
        </div>
      </div>

      {status === 'correct' && (
        <>
          <div className={`${styles.flashOverlay} ${styles.correct}`} />
          <Confetti key={qIndex} pieceCount={judge?.confetti} />
        </>
      )}
      {status === 'wrong' && <div className={`${styles.flashOverlay} ${styles.wrong}`} />}
    </div>
  )
}
