import { useEffect, useState } from 'react'
import { DIFFICULTY_KEY, LISTENING_MODE_KEY, behaviorFor, loadDifficulty, type Difficulty } from '../context/difficulty'

function readBool(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw === '1'
  } catch {
    return fallback
  }
}

export function useGameSettings() {
  // One choice sets how forgiving play is: retry-on-miss, the timer and
  // hearts, and the first-word capital hint (see context/difficulty.ts).
  const [difficulty, setDifficulty] = useState<Difficulty>(loadDifficulty)
  // Listening mode hides the Japanese prompt and reads the English sentence
  // instead, so the player builds it from what they heard.
  const [listeningMode, setListeningMode] = useState(() => readBool(LISTENING_MODE_KEY, false))

  useEffect(() => {
    try {
      localStorage.setItem(DIFFICULTY_KEY, difficulty)
    } catch {
      /* storage unavailable — preference just won't persist */
    }
  }, [difficulty])

  useEffect(() => {
    try {
      localStorage.setItem(LISTENING_MODE_KEY, listeningMode ? '1' : '0')
    } catch {
      /* storage unavailable — preference just won't persist */
    }
  }, [listeningMode])

  return {
    difficulty,
    setDifficulty,
    ...behaviorFor(difficulty),
    listeningMode,
    toggleListeningMode: () => setListeningMode((v) => !v),
  }
}
