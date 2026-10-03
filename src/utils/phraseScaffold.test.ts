import { beforeEach, describe, expect, it } from 'vitest'
import { q } from '../data/questionGen'
import type { Question } from '../types'
import { recordGrammarResult } from './grammarStats'
import { LONG_SENTENCE_TARGET_TILES, phraseChunks, phraseIsThePoint, unitsWithSpans } from './phraseScaffold'
import { QUESTIONS } from '../data/questions'
import type { GrammarId } from '../data/grammar'

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
}

const passive: Question = { ...q('t-0', '', 'The old castle was visited by many tourists.'), grammar: 'passivePast' }

describe('phraseChunks', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage() as unknown as Storage
  })

  it('merges nothing until the player is struggling with the grammar', () => {
    expect(phraseChunks('eikenPre2', passive)).toEqual([])
    recordGrammarResult('eikenPre2', 'passivePast', true)
    recordGrammarResult('eikenPre2', 'passivePast', true)
    recordGrammarResult('eikenPre2', 'passivePast', false)
    expect(phraseChunks('eikenPre2', passive)).toEqual([])
  })

  it('merges noun phrases while accuracy is low, on that level only', () => {
    for (let i = 0; i < 3; i++) recordGrammarResult('eikenPre2', 'passivePast', false)
    expect(unitsWithSpans(passive.words, phraseChunks('eikenPre2', passive))).toEqual([
      'The old castle',
      'was',
      'visited',
      'by',
      'many',
      'tourists.',
    ])
    expect(phraseChunks('eiken2', passive)).toEqual([])
  })

  it('leaves the phrase alone when it is the point of the question', () => {
    expect(phraseIsThePoint('article')).toBe(true)
    expect(phraseIsThePoint('superlativeEst')).toBe(true)
    expect(phraseIsThePoint('passivePast')).toBe(false)
    const article: Question = { ...passive, grammar: 'article' }
    for (let i = 0; i < 3; i++) recordGrammarResult('eikenPre2', 'article', false)
    expect(phraseChunks('eikenPre2', article)).toEqual([])
  })
})

describe('phraseChunks on long sentences', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage() as unknown as Storage
  })

  const sentence = (text: string, grammar: GrammarId): Question => ({ ...q('t-1', '', text), grammar })
  const tiles = (question: Question) => unitsWithSpans(question.words, phraseChunks('eiken3', question))

  it('merges phrases in a long sentence without waiting for mistakes', () => {
    expect(tiles(sentence('Many children were playing in the field at that time.', 'pastProgressive'))).toEqual([
      'Many',
      'children',
      'were',
      'playing',
      'in the field',
      'at that time.',
    ])
  })

  it('keeps the words the grammar point is about as their own tiles', () => {
    // The relative pronoun and the verbs stay loose; only the noun phrases merge.
    expect(tiles(sentence('The movie that we saw last night was exciting.', 'relativeObject'))).toEqual([
      'The movie',
      'that',
      'we',
      'saw',
      'last night',
      'was',
      'exciting.',
    ])
  })

  it('keeps the preposition loose when the preposition is the point', () => {
    expect(tiles(sentence('The bookstore is between the bank and the old cafe.', 'prepositionPlace'))).toContain('between')
    expect(tiles(sentence('I am looking for the way to the station.', 'phrasalVerb'))).toContain('for')
  })

  it('merges nothing when the phrase itself is the point', () => {
    expect(phraseChunks('eiken3', sentence('He is the most famous player on the team.', 'superlativeMost'))).toEqual([])
  })

  it('leaves sentences under nine words alone', () => {
    expect(phraseChunks('eiken3', sentence('I went to the park with my dog.', 'pastIrregular'))).toEqual([])
  })

  it('does not glue a verb onto the noun before it', () => {
    expect(tiles(sentence('It was so quiet that I could hear a pin drop.', 'soThat'))).toContain('drop.')
    expect(tiles(sentence('Yesterday I saw her play tennis in the big park.', 'perceptionVerb'))).toContain('her')
    expect(
      tiles(sentence('One of the places tourists should visit is the old castle.', 'relativeOmitted')),
    ).toContain('tourists')
  })

  it('brings every long sentence in the banks down only so far', () => {
    for (const [levelId, questions] of Object.entries(QUESTIONS)) {
      for (const question of questions) {
        const spans = phraseChunks(levelId as keyof typeof QUESTIONS, question)
        if (spans.length === 0) continue
        const units = unitsWithSpans(question.words, spans)
        expect(units.join(' ')).toBe(question.words.join(' '))
        // Stops once at the target; one more merge may overshoot it by its size.
        expect(units.length).toBeGreaterThanOrEqual(Math.min(LONG_SENTENCE_TARGET_TILES - 3, question.words.length))
      }
    }
  })
})

describe('unitsWithSpans', () => {
  it('joins each span into one tile and keeps the sentence intact', () => {
    const words = 'I take care of my dog every day.'.split(' ')
    const units = unitsWithSpans(words, [[4, 6], [1, 4]])
    expect(units).toEqual(['I', 'take care of', 'my dog', 'every', 'day.'])
    expect(units.join(' ')).toBe(words.join(' '))
  })
})
