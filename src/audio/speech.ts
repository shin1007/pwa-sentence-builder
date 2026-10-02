/**
 * Reads sentences aloud via the browser's built-in Web Speech API. No audio
 * assets or network calls required — this is a silent no-op on browsers
 * without SpeechSynthesis support.
 */

/**
 * Hard cap on how long a caller will wait for an utterance to report back.
 *
 * Callers gate real game progress on these promises — the countdown only arms
 * once the Japanese prompt has been read, and the next question only loads
 * once the English sentence has. Chrome drops `end` events often enough for
 * that to matter (backgrounding the tab mid-utterance is the easy way to
 * reproduce it), and without a cap a dropped event leaves the run frozen with
 * no way out but a reload. Ten seconds is well past the longest sentence in
 * the bank read at 0.88x, so a healthy utterance never hits this.
 */
export const SPEECH_TIMEOUT_MS = 10_000

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// Resolves once the utterance has finished playing (or immediately if
// speech isn't supported), so callers can wait for the audio to actually
// finish before moving on instead of guessing at a fixed delay.
function speak(text: string, lang: string, rate: number): Promise<void> {
  if (!isSpeechSupported()) return Promise.resolve()
  const synth = window.speechSynthesis
  synth.cancel()

  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = lang
  utter.rate = rate

  const voices = synth.getVoices()
  const langPrefix = lang.slice(0, 2)
  const voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang?.startsWith(langPrefix))
  if (voice) utter.voice = voice

  return new Promise((resolve) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const settle = () => {
      if (settled) return
      settled = true
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      resolve()
    }

    utter.onend = settle
    utter.onerror = settle

    timeoutId = setTimeout(() => {
      // The utterance never reported back. Clear it out of the queue so it
      // can't block whatever is spoken next, then let the caller carry on.
      try {
        synth.cancel()
      } catch {
        /* nothing to cancel — carry on regardless */
      }
      settle()
    }, SPEECH_TIMEOUT_MS)

    synth.speak(utter)
  })
}

export function speakEnglish(text: string) {
  return speak(text, 'en-US', 0.88)
}

export function speakJapanese(text: string) {
  return speak(text, 'ja-JP', 1)
}

/** Cuts off whatever is being read aloud. Any pending speak() promise
 * resolves, since cancelling fires the utterance's error/end event. */
export function stopSpeaking() {
  if (!isSpeechSupported()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* nothing to cancel */
  }
}
