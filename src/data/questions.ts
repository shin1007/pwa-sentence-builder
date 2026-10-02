import type { LevelId, Question } from '../types'
import { contrastingGrammar, grammarIdForNote, type GrammarId } from './grammar'
import { REMOVED_QUESTION_IDS } from './removedQuestions'
import { RECENTLY_SOLVED_WEIGHT } from '../utils/solvedQuestions'
import { eiken4Questions } from './templates/eiken4'
import { eiken4ExtraQuestions } from './templates/eiken4Extra'
import { eiken3Questions } from './templates/eiken3'
import { eiken3ExtraQuestions } from './templates/eiken3Extra'
import { eikenPre2Questions } from './templates/eikenPre2'
import { eikenPre2ExtraQuestions } from './templates/eikenPre2Extra'
import { eiken2Questions } from './templates/eiken2'
import { eiken2ExtraQuestions } from './templates/eiken2Extra'
import { koukoNyushiQuestions } from './templates/koukoNyushi'
import { koukoNyushiRealQuestions } from './templates/koukoNyushiReal'
import { idiomQuestions } from './templates/idioms'
import { eiken4VocabQuestions } from './templates/eiken4Vocab'
import { eiken3VocabQuestions } from './templates/eiken3Vocab'
import { eikenPre2VocabQuestions } from './templates/eikenPre2Vocab'
import { eiken2VocabQuestions } from './templates/eiken2Vocab'
import { koukoNyushiVocabQuestions } from './templates/koukoNyushiVocab'

/**
 * Longest answer the game will serve, in words.
 *
 * The banks are mostly short (90% of questions are 10 words or fewer), but
 * the real past-exam set reached 21 words — a sentence that can't be solved
 * inside any sane time limit and whose 21 tiles don't fit the tray on a
 * phone-sized landscape screen. Anything past this cap is held back rather
 * than served as an unwinnable question. Raise it if the tray layout ever
 * grows to handle longer sentences; the bank keeps the data either way.
 */
export const MAX_WORDS_PER_QUESTION = 12

/** Ids from REMOVED_QUESTION_IDS that some template actually produced. */
const removedSeen = new Set<string>()

/**
 * Filters out over-long questions and nonsense pairings (see
 * removedQuestions.ts) and stamps each survivor with its grammar tag.
 * Templates only write the display `note`; the normalized tag is derived
 * here so a template author has one thing to keep in sync rather than two
 * (grammar.test.ts fails if a note has no mapping).
 */
const buildBank = (questions: Question[]): Question[] =>
  questions
    .filter((question) => {
      if (!REMOVED_QUESTION_IDS.has(question.id)) return true
      removedSeen.add(question.id)
      return false
    })
    .filter((question) => question.words.length <= MAX_WORDS_PER_QUESTION)
    .map((question) => ({ ...question, grammar: grammarIdForNote(question.note) }))

/**
 * Each level's bank is generated from a small set of grammar templates
 * combined with shared vocabulary banks (see data/templates/*.ts and
 * data/vocab.ts), so the pool stays grammatically correct while covering
 * far more lexical variety than hand-typing every sentence would allow.
 */
export const QUESTIONS: Record<LevelId, Question[]> = {
  eiken4: buildBank([...eiken4Questions, ...eiken4ExtraQuestions, ...eiken4VocabQuestions, ...idiomQuestions.eiken4]),
  eiken3: buildBank([...eiken3Questions, ...eiken3ExtraQuestions, ...eiken3VocabQuestions, ...idiomQuestions.eiken3]),
  eikenPre2: buildBank([...eikenPre2Questions, ...eikenPre2ExtraQuestions, ...eikenPre2VocabQuestions, ...idiomQuestions.eikenPre2]),
  eiken2: buildBank([...eiken2Questions, ...eiken2ExtraQuestions, ...eiken2VocabQuestions, ...idiomQuestions.eiken2]),
  koukoNyushi: buildBank([...koukoNyushiQuestions, ...koukoNyushiRealQuestions, ...koukoNyushiVocabQuestions, ...idiomQuestions.koukoNyushi]),
}

/**
 * Each level's questions indexed by grammar tag. Review that resurfaces a
 * grammar point needs *other* sentences drilling the same point, and this is
 * the lookup for them; it also makes thin tags (one or two sentences, where
 * "review" would just replay the same sentence) easy to spot.
 */
/** Removal-list ids no template produces — a typo, or a template that changed. */
export const staleRemovedIds = (): string[] => [...REMOVED_QUESTION_IDS].filter((id) => !removedSeen.has(id))

export const QUESTIONS_BY_GRAMMAR: Record<LevelId, Partial<Record<GrammarId, Question[]>>> = Object.fromEntries(
  Object.entries(QUESTIONS).map(([levelId, questions]) => {
    const byGrammar: Partial<Record<GrammarId, Question[]>> = {}
    for (const question of questions) {
      if (!question.grammar) continue
      ;(byGrammar[question.grammar] ??= []).push(question)
    }
    return [levelId, byGrammar]
  }),
) as Record<LevelId, Partial<Record<GrammarId, Question[]>>>

/** How many questions exist for each grammar tag, across every level. */
export function grammarCoverage(): Map<GrammarId, number> {
  const counts = new Map<GrammarId, number>()
  for (const questions of Object.values(QUESTIONS)) {
    for (const question of questions) {
      if (!question.grammar) continue
      counts.set(question.grammar, (counts.get(question.grammar) ?? 0) + 1)
    }
  }
  return counts
}

function shuffle<T>(items: readonly T[]): T[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Relative draw weight per grammar tag (see utils/grammarStats.ts's
 * grammarWeights). A tag left out is weighted 1.
 */
export type GrammarWeights = Partial<Record<GrammarId, number>>

/**
 * Shuffles so that heavier items tend to come first (Efraimidis–Spirakis
 * weighted sampling without replacement: each item's key is u^(1/w)). With
 * every weight 1 this is a plain uniform shuffle.
 */
function weightedShuffle<T>(items: readonly T[], weightOf: (item: T) => number): T[] {
  return items
    .map((item) => ({ item, key: Math.random() ** (1 / Math.max(weightOf(item), 1e-6)) }))
    .sort((a, b) => b.key - a.key)
    .map(({ item }) => item)
}

/**
 * Shuffles, then moves sentences in `recentlySolved` (see
 * utils/solvedQuestions.ts) behind the rest, so a sentence the player just
 * answered cleanly is only served once the fresh ones run out.
 */
function freshFirst(questions: readonly Question[], recentlySolved: ReadonlySet<string>): Question[] {
  const shuffled = shuffle(questions)
  return [
    ...shuffled.filter((question) => !recentlySolved.has(question.id)),
    ...shuffled.filter((question) => recentlySolved.has(question.id)),
  ]
}

/**
 * The review questions among `priorityIds` found in this level, each followed
 * by one *other* sentence drilling the same grammar point.
 *
 * Replaying only the exact sentence that was missed lets a player pass review
 * by remembering that sentence's tile order; a sibling on the same point
 * checks the grammar has actually stuck. They're interleaved so that, when
 * there's more review due than fits, a session still covers pairs rather than
 * spending every slot on repeats and none on siblings. The sibling is one the
 * player hasn't recently solved where possible, since a sentence they've just
 * answered could again be passed from memory.
 */
function reviewWithSiblings(
  levelId: LevelId,
  priorityIds: readonly string[],
  recentlySolved: ReadonlySet<string>,
): Question[] {
  const prioritySet = new Set(priorityIds)
  const priority = shuffle(QUESTIONS[levelId].filter((question) => prioritySet.has(question.id)))
  const chosen = new Set(priority.map((question) => question.id))

  const review: Question[] = []
  for (const question of priority) {
    review.push(question)
    const sameGrammar = question.grammar ? (QUESTIONS_BY_GRAMMAR[levelId][question.grammar] ?? []) : []
    const sibling = freshFirst(sameGrammar, recentlySolved).find((candidate) => !chosen.has(candidate.id))
    if (sibling) {
      review.push(sibling)
      chosen.add(sibling.id)
    }
  }
  return review
}

/**
 * Picks `count` questions for a session, biased toward `priorityIds` —
 * questions the player previously got wrong on this level (see
 * utils/reviewQueue.ts) — so they resurface instead of only ever seeing a
 * fresh random slice of the pool. Each comes with a same-grammar sibling (see
 * reviewWithSiblings).
 *
 * The rest of the session is drawn at random, weighted by `grammarWeights`, so
 * that grammar the player keeps missing comes up more often and grammar
 * they've clearly got comes up less, instead of every point getting equal
 * time. Sentences in `recentlySolved` — answered cleanly not long ago — are
 * drawn at RECENTLY_SOLVED_WEIGHT on top of that, so a session goes to
 * sentences the player hasn't mastered rather than ones they already have.
 * Priority questions aren't clustered at the front of the session; the
 * final order is shuffled.
 */
export function pickQuestions(
  levelId: LevelId,
  count: number,
  priorityIds: readonly string[] = [],
  grammarWeights: GrammarWeights = {},
  recentlySolved: ReadonlySet<string> = new Set(),
): Question[] {
  const pool = QUESTIONS[levelId]
  const review = reviewWithSiblings(levelId, priorityIds, recentlySolved)
  const chosen = new Set(review.map((question) => question.id))

  const rest = weightedShuffle(
    pool.filter((question) => !chosen.has(question.id)),
    (question) =>
      (question.grammar ? (grammarWeights[question.grammar] ?? 1) : 1) *
      (recentlySolved.has(question.id) ? RECENTLY_SOLVED_WEIGHT : 1),
  )
  const ordered = [...review, ...rest].slice(0, Math.min(count, pool.length))
  return shuffle(ordered)
}

/**
 * Moves the shortest sentence (fewest tiles) to the front, keeping the rest
 * in their order. A fully random order can open a run with the longest,
 * hardest sentence of the draw, before the player has warmed up; a short
 * first question gets them a quick success to start from. Only the opening
 * slot is touched — ramping the whole run from easy to hard would make every
 * run end on its hardest questions, when lives are lowest.
 */
export function warmUpFirst(questions: readonly Question[]): Question[] {
  if (questions.length === 0) return []
  const shortest = questions.reduce(
    (best, question, i) => (question.words.length < questions[best].words.length ? i : best),
    0,
  )
  return [questions[shortest], ...questions.filter((_, i) => i !== shortest)]
}

/**
 * Questions for a dedicated review run: only what's due (`dueIds`) and each
 * one's same-grammar sibling, capped at `count`. Empty when nothing is due.
 */
export function pickReviewQuestions(
  levelId: LevelId,
  dueIds: readonly string[],
  count: number,
  recentlySolved: ReadonlySet<string> = new Set(),
): Question[] {
  return shuffle(reviewWithSiblings(levelId, dueIds, recentlySolved).slice(0, count))
}

/** How many of `dueIds` still exist in this level's bank — the review count
 * worth showing, since ids of questions dropped from the bank can linger in
 * a player's saved queue. */
export function countDueQuestions(levelId: LevelId, dueIds: readonly string[]): number {
  return questionsByIds(levelId, dueIds).length
}

/** Questions on the drilled point that open a grammar practice run before
 * anything else is mixed in: a short blocked start to settle the pattern. */
export const GRAMMAR_BLOCKED_LEAD = 3

/**
 * Questions for a practice run on one grammar point within a level.
 *
 * Ten in a row on the same point can be solved by repeating one pattern
 * without ever deciding it's the right one. So after GRAMMAR_BLOCKED_LEAD
 * questions on the point, every other question is from a grammar point that's
 * easily confused with it (see contrastingGrammar) — 3 in a run of 10 — and
 * the player has to tell which structure each sentence needs. With no
 * contrasting questions in the level, the run is all on the point, as before.
 * Within each grammar point, sentences not recently solved come first.
 */
export function pickGrammarQuestions(
  levelId: LevelId,
  grammar: GrammarId,
  count: number,
  recentlySolved: ReadonlySet<string> = new Set(),
): Question[] {
  const target = freshFirst(QUESTIONS_BY_GRAMMAR[levelId][grammar] ?? [], recentlySolved)
  const byGrammar = QUESTIONS_BY_GRAMMAR[levelId]
  // Round-robin over the contrasting points so one big bank doesn't crowd
  // the others out.
  const pools = shuffle(contrastingGrammar(grammar))
    .map((id) => freshFirst(byGrammar[id] ?? [], recentlySolved))
    .filter((pool) => pool.length > 0)
  const contrast: Question[] = []
  for (let i = 0; pools.some((pool) => i < pool.length); i++) {
    for (const pool of pools) if (i < pool.length) contrast.push(pool[i])
  }

  const picked: Question[] = []
  let t = 0
  let c = 0
  // Ends with the drilled point's own questions: contrast is mixed in, never
  // used to pad out a point with only a few questions.
  while (picked.length < count && t < target.length) {
    const afterLead = picked.length >= GRAMMAR_BLOCKED_LEAD
    const wantContrast = afterLead && (picked.length - GRAMMAR_BLOCKED_LEAD) % 2 === 1
    if (wantContrast && c < contrast.length) picked.push(contrast[c++])
    else picked.push(target[t++])
  }
  return picked
}

/** Looks questions up by id in a level, in the order given, skipping unknown ids. */
export function questionsByIds(levelId: LevelId, ids: readonly string[]): Question[] {
  const byId = new Map(QUESTIONS[levelId].map((question) => [question.id, question]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}
