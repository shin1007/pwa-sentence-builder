import { describe, expect, it } from 'vitest'
import {
  countDueQuestions,
  GRAMMAR_BLOCKED_LEAD,
  pickGrammarQuestions,
  pickQuestions,
  pickReviewQuestions,
  questionsByIds,
  warmUpFirst,
  QUESTIONS,
  QUESTIONS_BY_GRAMMAR,
  MAX_WORDS_PER_QUESTION,
  staleRemovedIds,
} from './questions'
import { REMOVED_QUESTION_IDS } from './removedQuestions'
import { contrastingGrammar, type GrammarId } from './grammar'
import type { LevelId } from '../types'

const LEVEL_IDS = Object.keys(QUESTIONS) as LevelId[]

describe('pickQuestions', () => {
  it('returns the requested count when the pool is large enough', () => {
    for (const levelId of LEVEL_IDS) {
      expect(pickQuestions(levelId, 10)).toHaveLength(10)
    }
  })

  it('never returns the same question twice within one session', () => {
    for (const levelId of LEVEL_IDS) {
      const ids = pickQuestions(levelId, 10).map((question) => question.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('caps at the pool size when asked for more questions than exist', () => {
    for (const levelId of LEVEL_IDS) {
      const poolSize = QUESTIONS[levelId].length
      expect(pickQuestions(levelId, poolSize + 1000)).toHaveLength(poolSize)
    }
  })

  it('does not mutate the underlying question bank', () => {
    for (const levelId of LEVEL_IDS) {
      const before = QUESTIONS[levelId].map((question) => question.id)
      pickQuestions(levelId, 5)
      expect(QUESTIONS[levelId].map((question) => question.id)).toEqual(before)
    }
  })

  it('includes every priority id when it fits within count', () => {
    const levelId = LEVEL_IDS[0]
    const priorityIds = QUESTIONS[levelId].slice(0, 3).map((question) => question.id)
    const picked = pickQuestions(levelId, 10, priorityIds)
    const pickedIds = picked.map((question) => question.id)
    for (const id of priorityIds) {
      expect(pickedIds).toContain(id)
    }
  })

  it('ignores priority ids that are not in the level pool', () => {
    const levelId = LEVEL_IDS[0]
    expect(() => pickQuestions(levelId, 10, ['does-not-exist'])).not.toThrow()
    expect(pickQuestions(levelId, 10, ['does-not-exist'])).toHaveLength(10)
  })

  it('brings along another sentence on the same grammar point for each review question', () => {
    for (const levelId of LEVEL_IDS) {
      const due = QUESTIONS[levelId].filter((question) => question.grammar).slice(0, 3)
      const picked = pickQuestions(levelId, 10, due.map((question) => question.id))
      for (const question of due) {
        const siblings = (QUESTIONS_BY_GRAMMAR[levelId][question.grammar!] ?? []).filter(
          (candidate) => candidate.id !== question.id,
        )
        if (siblings.length === 0) continue
        const hasSibling = picked.some(
          (candidate) => candidate.id !== question.id && candidate.grammar === question.grammar,
        )
        expect(hasSibling).toBe(true)
      }
    }
  })

  it('keeps the requested count and stays duplicate-free when more review is due than fits', () => {
    for (const levelId of LEVEL_IDS) {
      const due = QUESTIONS[levelId].slice(0, 30).map((question) => question.id)
      const ids = pickQuestions(levelId, 10, due).map((question) => question.id)
      expect(ids).toHaveLength(10)
      expect(new Set(ids).size).toBe(10)
    }
  })

  it('still returns the requested count with no priority ids given', () => {
    for (const levelId of LEVEL_IDS) {
      expect(pickQuestions(levelId, 10, [])).toHaveLength(10)
    }
  })

  it('draws heavily-weighted grammar more often than lightly-weighted grammar', () => {
    const levelId: LevelId = 'eiken3'
    const tags = Object.entries(QUESTIONS_BY_GRAMMAR[levelId])
      .filter(([, questions]) => questions!.length >= 10)
      .map(([grammar]) => grammar as GrammarId)
    const [heavy, light] = tags
    const tally = (weights: Partial<Record<GrammarId, number>>) => {
      let heavyCount = 0
      let lightCount = 0
      for (let i = 0; i < 300; i++) {
        for (const question of pickQuestions(levelId, 10, [], weights)) {
          if (question.grammar === heavy) heavyCount++
          if (question.grammar === light) lightCount++
        }
      }
      return { heavyCount, lightCount }
    }
    const neutral = tally({})
    const weighted = tally({ [heavy]: 2, [light]: 0.4 })
    expect(weighted.heavyCount).toBeGreaterThan(neutral.heavyCount * 1.3)
    expect(weighted.lightCount).toBeLessThan(neutral.lightCount * 0.8)
  })

  it('still puts every priority id in even when the rest is weighted away from its grammar', () => {
    const levelId: LevelId = 'eiken4'
    const due = QUESTIONS[levelId].slice(0, 2)
    const weights = Object.fromEntries(due.map((question) => [question.grammar, 0.01]))
    const ids = pickQuestions(levelId, 10, due.map((question) => question.id), weights).map((question) => question.id)
    for (const question of due) expect(ids).toContain(question.id)
  })

  it('draws recently solved sentences far less often, but still fills a session from them', () => {
    const levelId: LevelId = 'eiken4'
    const pool = QUESTIONS[levelId]
    const solved = new Set(pool.slice(0, Math.floor(pool.length / 2)).map((question) => question.id))
    let solvedCount = 0
    for (let i = 0; i < 200; i++) {
      solvedCount += pickQuestions(levelId, 10, [], {}, solved).filter((question) => solved.has(question.id)).length
    }
    // Half the pool is solved, so a blind draw would give about 1,000 of them.
    expect(solvedCount).toBeLessThan(300)

    const allSolved = new Set(pool.map((question) => question.id))
    expect(pickQuestions(levelId, 10, [], {}, allSolved)).toHaveLength(10)
  })

  it('pairs a review question with a sibling not recently solved when there is one', () => {
    const levelId: LevelId = 'eiken4'
    const [grammar, questions] = Object.entries(QUESTIONS_BY_GRAMMAR[levelId]).find(([, qs]) => qs!.length >= 3)!
    const [due, fresh, ...rest] = questions!
    const solved = new Set(rest.map((question) => question.id))
    for (let i = 0; i < 20; i++) {
      const picked = pickReviewQuestions(levelId, [due.id], 10, solved)
      expect(picked.map((question) => question.id).sort()).toEqual([due.id, fresh.id].sort())
      expect(picked.every((question) => question.grammar === grammar)).toBe(true)
    }
  })
})

describe('pickReviewQuestions', () => {
  it('returns only due questions and same-grammar siblings', () => {
    for (const levelId of LEVEL_IDS) {
      const due = QUESTIONS[levelId].slice(0, 3)
      const dueGrammar = new Set(due.map((question) => question.grammar))
      const picked = pickReviewQuestions(levelId, due.map((question) => question.id), 10)
      for (const question of due) expect(picked).toContainEqual(question)
      expect(picked.every((question) => dueGrammar.has(question.grammar))).toBe(true)
      expect(new Set(picked.map((question) => question.id)).size).toBe(picked.length)
    }
  })

  it('caps at count and is empty when nothing is due', () => {
    const due = QUESTIONS.eiken4.slice(0, 8).map((question) => question.id)
    expect(pickReviewQuestions('eiken4', due, 10)).toHaveLength(10)
    expect(pickReviewQuestions('eiken4', [], 10)).toEqual([])
  })
})

describe('countDueQuestions', () => {
  it('counts only ids still in the level bank', () => {
    const [a, b] = QUESTIONS.eiken4
    expect(countDueQuestions('eiken4', [a.id, 'gone', b.id])).toBe(2)
  })
})

describe('pickGrammarQuestions', () => {
  it('opens on the point, then mixes in only contrasting points, ending once its own questions run out', () => {
    for (const levelId of LEVEL_IDS) {
      for (const [grammar, questions] of Object.entries(QUESTIONS_BY_GRAMMAR[levelId])) {
        const picked = pickGrammarQuestions(levelId, grammar as GrammarId, 10)
        const own = picked.filter((question) => question.grammar === grammar)
        const allowed = new Set<string>([grammar, ...contrastingGrammar(grammar as GrammarId)])
        expect(picked.length).toBeLessThanOrEqual(10)
        expect(picked.every((question) => allowed.has(question.grammar!))).toBe(true)
        expect(picked.slice(0, GRAMMAR_BLOCKED_LEAD).every((question) => question.grammar === grammar)).toBe(true)
        expect(new Set(picked.map((question) => question.id)).size).toBe(picked.length)
        // Never padded out with contrast: a short run means the point's own
        // questions ran out, and it ends on one of them.
        if (picked.length < 10) {
          expect(own).toHaveLength(questions!.length)
          expect(picked[picked.length - 1].grammar).toBe(grammar)
        }
      }
    }
  })

  it('mixes 3 contrasting questions into a full run when the level has them', () => {
    const levelId = 'eikenPre2'
    const picked = pickGrammarQuestions(levelId, 'presentPerfectExperience', 10)
    expect(picked).toHaveLength(10)
    expect(picked.filter((question) => question.grammar !== 'presentPerfectExperience')).toHaveLength(3)
  })

  it('serves sentences not recently solved before ones that were', () => {
    const levelId: LevelId = 'eiken4'
    const questions = QUESTIONS_BY_GRAMMAR[levelId].beCopula!
    const solved = new Set(questions.slice(0, questions.length - 5).map((question) => question.id))
    const picked = pickGrammarQuestions(levelId, 'beCopula', 10, solved)
    expect(picked.slice(0, 5).some((question) => solved.has(question.id))).toBe(false)
    expect(picked.slice(5).every((question) => solved.has(question.id))).toBe(true)
  })

  it('is all on the point when nothing in the level contrasts with it', () => {
    const picked = pickGrammarQuestions('eiken4', 'beCopula', 10)
    expect(picked.every((question) => question.grammar === 'beCopula')).toBe(true)
  })
})

describe('questionsByIds', () => {
  it('keeps the given order and skips unknown ids', () => {
    const [a, b] = QUESTIONS.eiken4
    expect(questionsByIds('eiken4', [b.id, 'nope', a.id])).toEqual([b, a])
  })
})

describe('question bank data integrity', () => {
  it('drops every removed question, and every removed id names a real question', () => {
    expect(staleRemovedIds()).toEqual([])
    const served = Object.values(QUESTIONS).flat()
    expect(served.filter((question) => REMOVED_QUESTION_IDS.has(question.id))).toEqual([])
  })

  for (const levelId of LEVEL_IDS) {
    it(`${levelId}: every question has a non-empty jp prompt and non-empty words`, () => {
      for (const question of QUESTIONS[levelId]) {
        expect(question.jp.length).toBeGreaterThan(0)
        expect(question.words.length).toBeGreaterThan(0)
        for (const word of question.words) {
          expect(word.length).toBeGreaterThan(0)
        }
      }
    })

    it(`${levelId}: has enough questions for a full 10-question session`, () => {
      expect(QUESTIONS[levelId].length).toBeGreaterThanOrEqual(10)
    })

    it(`${levelId}: has no duplicate question ids`, () => {
      const ids = QUESTIONS[levelId].map((question) => question.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  }
})

describe('question length cap', () => {
  it('never serves a question longer than the cap', () => {
    for (const levelId of LEVEL_IDS) {
      for (const question of QUESTIONS[levelId]) {
        expect(question.words.length).toBeLessThanOrEqual(MAX_WORDS_PER_QUESTION)
      }
    }
  })

  it('still leaves every level a pool worth drawing from', () => {
    // Filtering must not quietly gut a bank — the cap is meant to remove a
    // handful of outliers, not a meaningful share of the questions.
    for (const levelId of LEVEL_IDS) {
      expect(QUESTIONS[levelId].length).toBeGreaterThan(100)
    }
  })
})

describe('warmUpFirst', () => {
  const sentence = (id: string, length: number) => ({ id, jp: id, words: Array.from({ length }, (_, i) => `w${i}`) })

  it('opens with the shortest sentence and keeps the rest in order', () => {
    const picked = warmUpFirst([sentence('a', 7), sentence('b', 9), sentence('c', 4), sentence('d', 6)])
    expect(picked.map((question) => question.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('takes the first of several equally short sentences', () => {
    const picked = warmUpFirst([sentence('a', 5), sentence('b', 3), sentence('c', 3)])
    expect(picked.map((question) => question.id)).toEqual(['b', 'a', 'c'])
  })

  it('handles an empty draw', () => {
    expect(warmUpFirst([])).toEqual([])
  })

  it('keeps every question of a real draw', () => {
    for (const levelId of LEVEL_IDS) {
      const draw = pickQuestions(levelId, 10)
      const warmed = warmUpFirst(draw)
      expect(warmed.map((question) => question.id).sort()).toEqual(draw.map((question) => question.id).sort())
      expect(warmed[0].words.length).toBe(Math.min(...draw.map((question) => question.words.length)))
    }
  })
})
