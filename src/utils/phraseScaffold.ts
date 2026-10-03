import type { LevelId, Question } from '../types'
import { GRAMMAR_BY_ID, type GrammarCategory, type GrammarId } from '../data/grammar'
import { looseNounPhraseSpans, nounPhraseSpans, prepositionalPhraseSpans } from '../data/nounPhrases'
import { loadGrammarStats, MIN_ATTEMPTS_FOR_RANKING } from './grammarStats'

/**
 * Phrase-level scaffolding: while a player is struggling with a grammar point,
 * its sentences come with each simple noun phrase (`the station`, `my little
 * sister`) as a single tile.
 *
 * Learners handle the order inside a phrase before the order of phrases in a
 * clause (processability theory), and a clause-level point like the passive
 * or a relative clause is about where the phrases go, not about `the` coming
 * before `station`. Merging the phrases leaves fewer tiles to juggle, so the
 * attention goes to the structure being drilled. Once the point's accuracy
 * recovers, the phrases split back into words.
 */

/** Recent accuracy on a grammar point (level by level) below which its
 * sentences get phrase tiles. */
export const PHRASE_CHUNK_BELOW = 0.6
/**
 * Long sentences: from this many words on, a sentence is served with some of
 * its phrases already merged, whoever is playing. Ten or more loose tiles is
 * mostly a search through the tray, not a decision about word order; merging
 * the phrases that aren't what the question drills leaves the tiles that are.
 */
export const LONG_SENTENCE_WORDS = 9
/** Merging for length stops once the tiles are down to this many. */
export const LONG_SENTENCE_TARGET_TILES = 7

/** Short sentences are left alone: there's little to lighten. */
export const PHRASE_CHUNK_MIN_WORDS = 6
/** Merging never leaves fewer tiles than this. */
export const MIN_TILES_AFTER_CHUNKING = 4

/** Points where the order inside the noun phrase is the thing being
 * practised (`a` vs `the`, where the adjective goes, `the tallest boy`), so
 * merging the phrase would answer the question for the player. */
const PHRASE_IS_THE_POINT_CATEGORIES: readonly GrammarCategory[] = ['comparison', 'modifier']
const PHRASE_IS_THE_POINT: ReadonlySet<GrammarId> = new Set<GrammarId>([
  'article',
  'adjective',
  'plural',
  'pronoun',
  'participleAttributive',
  'superlativeEverPerfect',
  'whoseQuestion',
  'whichQuestion',
  'howMany',
  'howMuch',
  'exclamatory',
])

export function phraseIsThePoint(grammar: GrammarId): boolean {
  return PHRASE_IS_THE_POINT.has(grammar) || PHRASE_IS_THE_POINT_CATEGORIES.includes(GRAMMAR_BY_ID[grammar].category)
}

/** Points where the preposition is what's being practised — which one, or
 * where it goes — so it has to stay a tile of its own. Idioms (`look for`,
 * `be good at`) and the passive's `by` are covered by their categories. */
const PREPOSITION_IS_THE_POINT_CATEGORIES: readonly GrammarCategory[] = ['idiom', 'passive']
const PREPOSITION_IS_THE_POINT: ReadonlySet<GrammarId> = new Set<GrammarId>([
  'prepositionPlace',
  'prepositionTime',
  'prepPhraseModifier',
  'gerundPreposition',
  'svooGive',
  'svooFor',
])

export function prepositionIsThePoint(grammar: GrammarId): boolean {
  return (
    PREPOSITION_IS_THE_POINT.has(grammar) ||
    PREPOSITION_IS_THE_POINT_CATEGORIES.includes(GRAMMAR_BY_ID[grammar].category)
  )
}

const tilesAfter = (wordCount: number, spans: readonly [number, number][]): number =>
  wordCount - spans.reduce((sum, [s, e]) => sum + (e - s - 1), 0)

/**
 * The phrases to merge in a long sentence: noun phrases, and prepositional
 * phrases (`at the station`) unless the preposition is the point. Biggest
 * first, stopping at LONG_SENTENCE_TARGET_TILES so the sentence keeps some
 * order to work out, and never leaving fewer than MIN_TILES_AFTER_CHUNKING.
 */
function longSentenceSpans(words: readonly string[], candidates: [number, number][]): [number, number][] {
  const chosen: [number, number][] = []
  for (const span of [...candidates].sort((a, b) => b[1] - b[0] - (a[1] - a[0]) || a[0] - b[0])) {
    if (tilesAfter(words.length, chosen) <= LONG_SENTENCE_TARGET_TILES) break
    if (tilesAfter(words.length, [...chosen, span]) < MIN_TILES_AFTER_CHUNKING) continue
    chosen.push(span)
  }
  return chosen.sort((a, b) => a[0] - b[0])
}

/** Whether the player is struggling with this question's grammar on this
 * level: enough recent answers to go on, and too few of them right. */
export function isStrugglingWith(levelId: LevelId, grammar: GrammarId): boolean {
  const stat = loadGrammarStats().find((s) => s.levelId === levelId && s.grammar === grammar)
  return !!stat && stat.attempts >= MIN_ATTEMPTS_FOR_RANKING && stat.accuracy < PHRASE_CHUNK_BELOW
}

/**
 * The phrases to serve as single tiles for this question right now. Never
 * one that is the point of the question's grammar, or that overlaps the idiom.
 * - A long sentence (LONG_SENTENCE_WORDS+) always gets some: see
 *   longSentenceSpans.
 * - Otherwise, only while the player is struggling with its grammar: every
 *   noun phrase, unless that would leave fewer than MIN_TILES_AFTER_CHUNKING
 *   tiles.
 */
export function phraseChunks(levelId: LevelId, question: Question): [number, number][] {
  const { words, grammar, idiom } = question
  if (!grammar || words.length < PHRASE_CHUNK_MIN_WORDS || phraseIsThePoint(grammar)) return []
  const outsideIdiom = ([s, e]: [number, number]) => !idiom || e <= idiom.start || s >= idiom.end
  if (words.length >= LONG_SENTENCE_WORDS) {
    const phrases = looseNounPhraseSpans(words)
    const candidates = prepositionIsThePoint(grammar) ? phrases : prepositionalPhraseSpans(words, phrases)
    return longSentenceSpans(words, candidates.filter(outsideIdiom))
  }
  if (!isStrugglingWith(levelId, grammar)) return []
  const spans = nounPhraseSpans(words).filter(outsideIdiom)
  return tilesAfter(words.length, spans) >= MIN_TILES_AFTER_CHUNKING ? spans : []
}

/**
 * The answer as tiles: one per word, except that each span given becomes a
 * single tile. Spans must not overlap. Joining the result with spaces always
 * gives back the full sentence.
 */
export function unitsWithSpans(words: readonly string[], spans: readonly [number, number][]): string[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  const units: string[] = []
  let i = 0
  for (const [s, e] of sorted) {
    units.push(...words.slice(i, s), words.slice(s, e).join(' '))
    i = e
  }
  units.push(...words.slice(i))
  return units
}
