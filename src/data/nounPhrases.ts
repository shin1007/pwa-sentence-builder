import { isOnly, normalizeToken, posOf } from './pos'

/** Words that open a noun phrase. `that` is left out: it's as often a
 * conjunction or relative pronoun ("I think that people …"). */
const DETERMINERS = new Set(['a', 'an', 'the', 'my', 'your', 'his', 'her', 'our', 'their', 'its', 'this', 'these', 'those'])

/** Verbs that take two objects, after which `her` is more likely the first
 * object than a possessive ("I gave her books"). */
const TWO_OBJECT_VERBS = new Set(
  'give gives gave given giving show shows showed shown tell tells told buy buys bought send sends sent teach teaches taught make makes made bring brings brought lend lends lent pass passes passed ask asks asked get gets got find finds found cook cooks cooked write writes wrote read reads'.split(
    ' ',
  ),
)

/** `her` right after a two-object verb, where it's more likely the first
 * object than a possessive ("I gave her books"). */
const isObjectHer = (words: readonly string[], i: number): boolean =>
  normalizeToken(words[i]) === 'her' && i > 0 && TWO_OBJECT_VERBS.has(normalizeToken(words[i - 1]))

/** At most this many adjectives between the determiner and the noun. */
const MAX_ADJECTIVES = 2

/** Punctuation inside the sentence (a comma, `Mr.`) ends any phrase there. */
const hasInnerPunct = (word: string, isLast: boolean) => (isLast ? /[,;:]$/.test(word) : /[.,;:!?]$/.test(word))

/**
 * Simple noun phrases in a sentence, as [start, end) word ranges: a
 * determiner, up to two adjectives, and a noun — `the station`, `my father`,
 * `a red umbrella`. Deliberately cautious, since a wrong chunk would glue
 * together words that don't belong together:
 * - the noun has to be a word that can only be a noun (so `the boy plays`
 *   stops at `boy`),
 * - a phrase followed by another noun is skipped rather than guessed at
 *   (`the tennis club`), as is one followed by `of` (`a lot of`, `a cup of`),
 * - `her` right after a two-object verb is skipped (`gave her books`).
 */
export function nounPhraseSpans(words: readonly string[]): [number, number][] {
  const n = words.length
  const spans: [number, number][] = []
  for (let i = 0; i < n - 1; i++) {
    const det = normalizeToken(words[i])
    if (!DETERMINERS.has(det) || hasInnerPunct(words[i], false)) continue
    if (isObjectHer(words, i)) continue

    let j = i + 1
    while (j < n - 1 && j - i - 1 < MAX_ADJECTIVES && posOf(words[j]).has('a') && !isOnly(words[j], 'n')) {
      if (hasInnerPunct(words[j], false)) break
      j++
    }
    if (!isOnly(words[j], 'n') || /^[A-Z]/.test(words[j]) || hasInnerPunct(words[j], j === n - 1)) continue
    const after = words[j + 1]
    if (after !== undefined && (isOnly(after, 'n') || normalizeToken(after) === 'of')) continue
    spans.push([i, j + 1])
    i = j
  }
  return spans
}

/** Prepositions that open a phrase worth merging with the noun phrase after
 * them. `to` and `than` are left out: `to` is as often the infinitive marker
 * right before a word the lexicon also calls a noun ("to dance"), and `than`
 * belongs to comparison. */
const PREPOSITIONS = new Set(
  'in on at for from with by near under about into after before during over without behind around across through along of'.split(' '),
)

/**
 * Noun phrases (see nounPhraseSpans), each widened to take in the
 * preposition right before it — `at the station`, `for my sister`. The
 * preposition has to be a plain word (no punctuation) and directly before the
 * phrase.
 */
export function prepositionalPhraseSpans(
  words: readonly string[],
  phrases: [number, number][] = nounPhraseSpans(words),
): [number, number][] {
  return phrases.map(([s, e]): [number, number] => {
    const before = words[s - 1]
    return before !== undefined && PREPOSITIONS.has(normalizeToken(before)) && !hasInnerPunct(before, false)
      ? [s - 1, e]
      : [s, e]
  })
}

/** Words that can open a clause or phrase, so a noun phrase may end before them. */
const PHRASE_BOUNDARY_WORDS = new Set(['who', 'which', 'that', 'where', 'when', 'whose', 'to', 'than'])

/** Whether a noun phrase can end right before `next` (undefined: the sentence end). */
function endsBefore(next: string | undefined): boolean {
  if (next === undefined) return true
  const pos = posOf(next)
  return (
    PHRASE_BOUNDARY_WORDS.has(normalizeToken(next)) ||
    ((pos.has('p') || pos.has('c') || pos.has('m')) && !pos.has('n') && !pos.has('a'))
  )
}

const TIME_NOUNS = new Set(
  'day week month year morning afternoon evening night weekend time spring summer fall autumn winter monday tuesday wednesday thursday friday saturday sunday'.split(
    ' ',
  ),
)
const TIME_OPENERS = new Set(['last', 'next', 'every', 'each', 'this', 'that'])

/**
 * A wider net than nounPhraseSpans, for long sentences where fewer tiles is
 * the goal: the noun may be a word that is also a verb (`a song`, `the way`)
 * or a two-noun compound (`the volunteer activity`), as long as the phrase is
 * followed by the end of the sentence or by a word that clearly starts
 * something else — a preposition, a conjunction, an auxiliary, a relative
 * word. That check is what keeps `her play` out of "I saw her play tennis".
 * Also takes time phrases: `last year`, `every day`, `that time`. Every
 * phrase nounPhraseSpans finds is kept; these only add to it.
 */
export function looseNounPhraseSpans(words: readonly string[]): [number, number][] {
  const strict = nounPhraseSpans(words)
  const overlapsStrict = ([s, e]: [number, number]) => strict.some(([a, b]) => s < b && a < e)
  return [...strict, ...widerPhraseSpans(words).filter((span) => !overlapsStrict(span))].sort((a, b) => a[0] - b[0])
}

function widerPhraseSpans(words: readonly string[]): [number, number][] {
  const n = words.length
  const spans: [number, number][] = []
  for (let i = 0; i < n - 1; i++) {
    const first = normalizeToken(words[i])
    if (hasInnerPunct(words[i], false)) continue
    if (TIME_OPENERS.has(first) && TIME_NOUNS.has(normalizeToken(words[i + 1])) && endsBefore(words[i + 2])) {
      spans.push([i, i + 2])
      i += 1
      continue
    }
    if (!DETERMINERS.has(first) || isObjectHer(words, i)) continue

    let j = i + 1
    while (j < n - 1 && j - i - 1 < MAX_ADJECTIVES && posOf(words[j]).has('a') && !isOnly(words[j], 'n')) {
      if (hasInnerPunct(words[j], false)) break
      j++
    }
    const isNoun = (k: number) => k < n && posOf(words[k]).has('n') && !/^[A-Z]/.test(words[k])
    if (!isNoun(j)) continue
    // One noun, or two in a row as a compound.
    let end = -1
    if (hasInnerPunct(words[j], j === n - 1) && j < n - 1) continue
    if (endsBefore(words[j + 1]) || /[.,?!]$/.test(words[j])) end = j + 1
    // A plural first noun isn't a compound but a clause starting ("one of
    // the places tourists visit"), and a word that can be a verb may be one
    // ("hear a pin drop", "saw her play tennis").
    else if (isOnly(words[j], 'n') && isOnly(words[j + 1], 'n') && !/^[A-Z]/.test(words[j + 1]) && !/s$/.test(words[j]) && !/[,;:]$/.test(words[j + 1]) && endsBefore(words[j + 2])) end = j + 2
    if (end < 0) continue
    spans.push([i, end])
    i = end - 1
  }
  return spans
}
