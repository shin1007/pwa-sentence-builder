import { describe, expect, it } from 'vitest'
import { validateQuestion, validateQuestionBank } from './grammarValidation'
import { QUESTIONS } from './questions'
import { q } from './questionGen'
import type { LevelId } from '../types'

describe('validateQuestion', () => {
  it('accepts a well-formed sentence', () => {
    expect(validateQuestion(q('ok', 'jp', 'This is my pen.'))).toEqual([])
  })

  it('accepts contractions and hyphenated compounds', () => {
    expect(validateQuestion(q('ok', 'jp', "You can't miss the face-to-face event."))).toEqual([])
  })

  it('flags a missing capital letter', () => {
    expect(validateQuestion(q('bad', 'jp', 'this is my pen.'))).toContain(
      'does not start with a capital letter: "this"',
    )
  })

  it('flags missing terminal punctuation', () => {
    expect(validateQuestion(q('bad', 'jp', 'This is my pen'))).toContain(
      'does not end with terminal punctuation: "pen"',
    )
  })

  it('flags a leftover template placeholder', () => {
    const question = q('bad', 'jp', 'This is my ${t.en}.')
    expect(validateQuestion(question).some((issue) => issue.includes('unexpected characters'))).toBe(true)
  })

  it('flags a doubled word', () => {
    expect(validateQuestion(q('bad', 'jp', 'This is is my pen.'))).toContain(
      'word 2 repeats the previous word: "is is"',
    )
  })

  it('flags a subject that does not agree with its verb', () => {
    expect(validateQuestion(q('bad', 'jp', "She don't like carrots."))).toContain(
      'subject and verb do not agree: "She don\'t"',
    )
  })

  it('accepts "were" with a singular subject, which the subjunctive needs', () => {
    expect(validateQuestion(q('ok', 'jp', 'If I were you, I would go.'))).toEqual([])
    expect(validateQuestion(q('ok', 'jp', 'He talks as if he were my teacher.'))).toEqual([])
  })

  it('flags the wrong article before a vowel sound', () => {
    expect(validateQuestion(q('bad', 'jp', 'She has a interesting book.'))).toContain(
      'should be "an" before "interesting": "a interesting"',
    )
    expect(validateQuestion(q('bad', 'jp', 'He found an old an letter.'))).toContain(
      'should be "a" before "letter": "an letter"',
    )
  })

  it('accepts articles that follow sound rather than spelling', () => {
    expect(validateQuestion(q('ok', 'jp', 'He is a university student.'))).toEqual([])
    expect(validateQuestion(q('ok', 'jp', 'We waited for an hour.'))).toEqual([])
    expect(validateQuestion(q('ok', 'jp', 'He is an honest boy.'))).toEqual([])
  })

  it('flags a third-person subject with a bare verb', () => {
    expect(validateQuestion(q('bad', 'jp', 'He play tennis every day.'))).toContain(
      'third-person subject takes a verb in -s or past form: "He play"',
    )
    expect(validateQuestion(q('bad', 'jp', 'I stay home when it rain.'))).toContain(
      'third-person subject takes a verb in -s or past form: "it rain."',
    )
  })

  it('accepts a bare verb where the grammar calls for one', () => {
    for (const sentence of [
      'He plays tennis every day.',
      'He put the book on the desk.',
      'She found the key.',
      'Does he play tennis?',
      'Can she swim?',
      'Let it go.',
      'I made him study.',
    ]) {
      expect(validateQuestion(q('ok', 'jp', sentence))).toEqual([])
    }
  })

  it('flags an inflected verb after a modal or do-support', () => {
    expect(validateQuestion(q('bad', 'jp', 'She can plays the piano.'))).toContain(
      'verb after "can" should be the base form: "plays"',
    )
    expect(validateQuestion(q('bad', 'jp', 'Did you went to the park?'))).toContain(
      'verb after "Did you" should be the base form: "went"',
    )
    expect(validateQuestion(q('bad', 'jp', 'He will visited Kyoto.'))).toContain(
      'verb after "will" should be the base form: "visited"',
    )
    expect(validateQuestion(q('bad', 'jp', "She doesn't likes cats."))).toContain(
      'verb after "doesn\'t" should be the base form: "likes"',
    )
  })

  it('leaves a noun reading after a modal alone', () => {
    expect(validateQuestion(q('ok', 'jp', 'Will students come tomorrow?'))).toEqual([])
    expect(validateQuestion(q('ok', 'jp', 'You should need a pen.'))).toEqual([])
  })

  it('flags a sentence with fewer than two words', () => {
    expect(validateQuestion(q('bad', 'jp', 'Hi.'))).toEqual(['sentence is too short (1 word)'])
  })
})

describe('question bank grammar sanity', () => {
  const LEVEL_IDS = Object.keys(QUESTIONS) as LevelId[]
  for (const levelId of LEVEL_IDS) {
    it(`${levelId}: every question passes structural sanity checks`, () => {
      expect(validateQuestionBank(QUESTIONS[levelId])).toEqual([])
    })

    it(`${levelId}: serves no sentence twice`, () => {
      // Hand-written banks are added a template at a time, so the same useful
      // sentence can easily be typed into two of them. A duplicate isn't
      // broken, but it wastes a slot and makes a session feel repetitive.
      const seen = new Map<string, string>()
      const duplicates: string[] = []
      for (const question of QUESTIONS[levelId]) {
        const sentence = question.words.join(' ')
        const first = seen.get(sentence)
        if (first) duplicates.push(`${question.id} repeats ${first}: "${sentence}"`)
        else seen.set(sentence, question.id)
      }
      expect(duplicates).toEqual([])
    })
  }
})
