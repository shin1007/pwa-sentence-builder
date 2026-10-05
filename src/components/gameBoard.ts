/**
 * The pure parts of a game run: which questions it draws, how a question is
 * cut into tiles, and how a tile is shown. Kept out of GameScreen so the
 * component is about what happens on screen.
 */
import { pickGrammarQuestions, pickQuestions, pickReviewQuestions, questionsByIds, warmUpFirst } from '../data/questions'
import { loadDueIds } from '../utils/reviewQueue'
import { grammarWeights } from '../utils/grammarStats'
import { idiomSpans, shouldChunkIdiom } from '../utils/idiomProgress'
import { recentlySolvedIds } from '../utils/solvedQuestions'
import { phraseChunks, unitsWithSpans } from '../utils/phraseScaffold'
import { acceptedOrders, splitFinalPunct } from '../utils/answerCheck'
import { grammarLabel } from '../data/grammar'
import { keepsCapital } from '../data/capitalization'
import { QUESTIONS_PER_SESSION } from '../utils/scoring'
import type { FocusSession, GameMode, LevelId, Question } from '../types'

/** How many questions an endless run draws at a time. Another batch is
 * appended before the current one runs out, so the run never hits an end. */
export const ENDLESS_BATCH = 30

export interface Tile {
  uid: number
  word: string
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface Answer {
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

export function answerFor(levelId: LevelId, question: Question): Answer {
  const phrases = phraseChunks(levelId, question)
  const withPunct = unitsWithSpans(question.words, [...idiomSpans(question, shouldChunkIdiom(question)), ...phrases])
  const { units, punct } = splitFinalPunct(withPunct)
  return { units, punct, orders: acceptedOrders(question.words, withPunct), phrasesChunked: phrases.length > 0 }
}

export function buildTiles(units: string[]): Tile[] {
  return shuffle(units.map((word, uid) => ({ uid, word })))
}

/** What the hint names: the idiom itself for an idiom question (its words
 * may be spread over several tiles), otherwise the grammar point. */
export function hintFor(question: Question): string | undefined {
  if (question.idiom) return `${question.idiom.phrase}（${question.idiom.meaning}）`
  return question.grammar ? grammarLabel(question.grammar) : question.note
}

/** The note shown after answering; an idiom question also spells out the
 * idiom, since the group label alone ("群動詞") doesn't say which one. */
export function noteFor(question: Question): string | undefined {
  if (question.idiom) return `${question.note}: ${question.idiom.phrase}（${question.idiom.meaning}）`
  return question.note
}

/** A normal draw: biased toward what's due for review, toward the grammar
 * the player is weakest on, and away from sentences they've recently solved
 * cleanly (see pickQuestions). */
export function drawQuestions(levelId: LevelId, count: number): Question[] {
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
export function initialQuestions(levelId: LevelId, mode: GameMode, focus: FocusSession | undefined): Question[] {
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
export function displayFor(tile: Tile, capitalizeFirst: boolean, secondWord: string | undefined): string {
  if (capitalizeFirst || tile.uid !== 0) return tile.word
  const [first, ...rest] = tile.word.split(' ')
  if (keepsCapital(first, rest[0] ?? secondWord)) return tile.word
  return tile.word.charAt(0).toLowerCase() + tile.word.slice(1)
}
