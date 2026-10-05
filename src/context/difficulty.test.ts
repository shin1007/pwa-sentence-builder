import { beforeEach, describe, expect, it } from 'vitest'
import { DIFFICULTY_KEY, behaviorFor, loadDifficulty } from './difficulty'

/** Minimal Storage stand-in — Node has no global localStorage. */
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
}

describe('difficulty', () => {
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage() as unknown as Storage
  })

  it('defaults to normal', () => {
    expect(loadDifficulty()).toBe('normal')
  })

  it('reads a saved difficulty', () => {
    localStorage.setItem(DIFFICULTY_KEY, 'hard')
    expect(loadDifficulty()).toBe('hard')
  })

  it('ignores an unknown saved value', () => {
    localStorage.setItem(DIFFICULTY_KEY, 'expert')
    expect(loadDifficulty()).toBe('normal')
  })

  it('carries over the old toggles', () => {
    localStorage.setItem('wordrush.practiceMode', '1')
    localStorage.setItem('wordrush.retryOnMiss', '0')
    expect(loadDifficulty()).toBe('easy')

    globalThis.localStorage = new MemoryStorage() as unknown as Storage
    localStorage.setItem('wordrush.practiceMode', '0')
    localStorage.setItem('wordrush.retryOnMiss', '0')
    expect(loadDifficulty()).toBe('hard')

    globalThis.localStorage = new MemoryStorage() as unknown as Storage
    localStorage.setItem('wordrush.practiceMode', '0')
    localStorage.setItem('wordrush.retryOnMiss', '1')
    expect(loadDifficulty()).toBe('normal')
  })

  it('a saved difficulty wins over the old toggles', () => {
    localStorage.setItem('wordrush.practiceMode', '1')
    localStorage.setItem(DIFFICULTY_KEY, 'normal')
    expect(loadDifficulty()).toBe('normal')
  })

  it('maps each difficulty to its play behavior', () => {
    expect(behaviorFor('easy')).toEqual({ practiceMode: true, retryOnMiss: true, capitalizeFirst: true })
    expect(behaviorFor('normal')).toEqual({ practiceMode: false, retryOnMiss: true, capitalizeFirst: false })
    expect(behaviorFor('hard')).toEqual({ practiceMode: false, retryOnMiss: false, capitalizeFirst: false })
  })
})
