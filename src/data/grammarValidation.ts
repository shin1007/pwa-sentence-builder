import type { Question } from '../types'
import { posOf } from './pos'

/**
 * Structural sanity checks over the assembled question bank. This isn't a
 * real grammar checker — beyond a few narrow agreement patterns below it
 * can't judge a sentence — but the
 * templates generate hundreds of sentences per level by combining literal
 * English with vocab banks (see data/templates/*.ts), so the realistic
 * failure mode is a mechanical one: a leftover placeholder, a dropped
 * capital letter, a missing terminal punctuation mark, a doubled word from
 * a bad `%` index, or a stray character from a typo. These checks catch
 * that class of bug without risking false positives on legitimate but
 * unusual English (contractions, hyphenated compounds, proper nouns).
 */
/**
 * Subject/verb pairings that are always wrong in a well-formed sentence,
 * as lowercase "subject verb" keys. Hand-written sentences (data/templates/
 * *Extra.ts) are where agreement slips actually happen — a generated template
 * gets the verb right or wrong for all 20 of its sentences at once, but a
 * typed-out sentence can go wrong on its own.
 *
 * "he/she/it were" is deliberately absent: it is correct in the subjunctive
 * ("If I were you", "as if she were a child"), which the 英検2級 bank uses.
 */
const AGREEMENT_SLIPS = new Set([
  'he are',
  'he do',
  "he don't",
  'he have',
  'she are',
  'she do',
  "she don't",
  'she have',
  'it are',
  'it do',
  "it don't",
  'it have',
  'i is',
  'i are',
  'i has',
  'i does',
  "i doesn't",
  'you is',
  'you was',
  'you has',
  'you does',
  "you doesn't",
  'they is',
  'they was',
  'they has',
  'they does',
  "they doesn't",
  'we is',
  'we was',
  'we has',
  'we does',
  "we doesn't",
])

/**
 * Words that take "a" despite starting with a vowel letter (they begin with a
 * /j/ or /w/ sound) or "an" despite starting with a consonant letter (a silent
 * h). The article rule follows sound, not spelling, so a plain letter test
 * would flag these correct sentences.
 */
const A_BEFORE_VOWEL_LETTER = new Set([
  'university',
  'uniform',
  'unique',
  'union',
  'useful',
  'used',
  'user',
  'usual',
  'unit',
  'united',
  'universe',
  'european',
  'one',
  'once',
])
const AN_BEFORE_CONSONANT_LETTER = new Set(['hour', 'honest', 'honor', 'honour', 'heir'])

const bare = (word: string): string => word.replace(/[.,?!]$/, '').toLowerCase()

/** Clause openers after which "he/she/it" is the subject of a finite verb. */
const CLAUSE_OPENERS = new Set([
  'and', 'but', 'or', 'so', 'because', 'when', 'if', 'before', 'after',
  'while', 'though', 'although', 'until', 'since', 'where', 'as',
])

/** Verbs whose past tense is spelled like the base form ("He put …"). */
const BASE_EQUALS_PAST = new Set([
  'put', 'cut', 'hit', 'set', 'let', 'read', 'hurt', 'cost', 'quit', 'shut', 'spread', 'beat', 'bet', 'cast',
])

/** Words after which the verb must be in its base form (modals and do-support). */
const BASE_FORM_TRIGGERS = new Set([
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  "can't", "couldn't", "won't", "wouldn't", "shouldn't", "mustn't",
  'do', 'does', 'did', "don't", "doesn't", "didn't",
])

const SUBJECT_PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they'])

/**
 * Irregular past forms, which look like a base form to the suffix rules. A
 * "third-person subject" failure on a correct past-tense sentence means the
 * verb belongs here.
 */
const IRREGULAR_PAST = new Set([
  'ate', 'became', 'began', 'bent', 'bit', 'blew', 'bought', 'broke', 'brought', 'built',
  'caught', 'chose', 'came', 'dealt', 'did', 'drank', 'drew', 'drove', 'dug', 'fed',
  'fell', 'felt', 'fled', 'flew', 'forgave', 'forgot', 'fought', 'found', 'froze', 'gave',
  'got', 'grew', 'had', 'heard', 'held', 'hid', 'hung', 'kept', 'knew', 'laid',
  'lay', 'led', 'left', 'lent', 'lit', 'lost', 'made', 'meant', 'met', 'paid',
  'ran', 'rang', 'rode', 'rose', 'said', 'sang', 'sank', 'sat', 'saw', 'sent',
  'shook', 'shone', 'shot', 'slept', 'sold', 'sought', 'spent', 'spoke', 'stole', 'stood',
  'stuck', 'struck', 'swam', 'swung', 'taught', 'thought', 'threw', 'told', 'took', 'tore',
  'understood', 'went', 'woke', 'won', 'wore', 'wrote',
])

const isVerb = (word: string): boolean => posOf(word).has('v')

/**
 * The verb's base form if `word` is a regular past (-ed) or third-person
 * (-s/-es) form of a verb the lexicon knows, else undefined. Words that can
 * also be an adjective ("used", "tired") are skipped, and so are ones that
 * can be a noun unless `nounImpossible`: a question opening with a modal is
 * often followed by its subject ("Will students come?").
 */
function inflectedVerbBase(word: string, nounImpossible = false): string | undefined {
  const pos = posOf(word)
  if (!pos.has('v') || pos.has('a') || pos.has('m') || (pos.has('n') && !nounImpossible)) return undefined
  const stems: string[] = []
  if (word.endsWith('ed')) {
    stems.push(word.slice(0, -2), word.slice(0, -1))
    if (word.endsWith('ied')) stems.push(word.slice(0, -3) + 'y')
    if (word.length > 4 && word[word.length - 3] === word[word.length - 4]) stems.push(word.slice(0, -3))
  } else if (word.endsWith('s') && !word.endsWith('ss')) {
    stems.push(word.slice(0, -1))
    if (word.endsWith('es')) stems.push(word.slice(0, -2))
    if (word.endsWith('ies')) stems.push(word.slice(0, -3) + 'y')
  }
  return stems.find((stem) => stem !== word && isVerb(stem))
}

/** A verb in its bare base form, e.g. "play" — not "plays"/"played"/"be". */
function isBareBaseVerb(word: string): boolean {
  const pos = posOf(word)
  if (!pos.has('v') || pos.has('m') || pos.has('a')) return false
  if (BASE_EQUALS_PAST.has(word) || IRREGULAR_PAST.has(word)) return false
  return inflectedVerbBase(word) === undefined && !/(?:s|ed|ing)$/.test(word)
}

export function validateQuestion(question: Question): string[] {
  const issues: string[] = []
  const { words } = question

  if (words.length < 2) {
    issues.push(`sentence is too short (${words.length} word${words.length === 1 ? '' : 's'})`)
    return issues
  }

  const first = words[0]
  if (!/^[A-Z]/.test(first)) {
    issues.push(`does not start with a capital letter: "${first}"`)
  }

  const last = words[words.length - 1]
  if (!/[.?!]$/.test(last)) {
    issues.push(`does not end with terminal punctuation: "${last}"`)
  }

  words.forEach((word, i) => {
    if (word !== word.trim() || word === '') {
      issues.push(`word ${i} is blank or has stray whitespace: "${word}"`)
      return
    }
    // One word — letters or digits (years like "2017" appear in real exam
    // sentences), optionally with internal apostrophes/hyphens
    // (contractions, compounds like "face-to-face"), and at most one
    // trailing punctuation mark. Anything else (a leftover "${...}"
    // placeholder, stray braces, doubled punctuation) is a sign the
    // template generation went wrong.
    if (!/^[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*[.,?!]?$/.test(word)) {
      issues.push(`word ${i} has unexpected characters: "${word}"`)
    }
    if (i > 0 && word.toLowerCase() === words[i - 1].toLowerCase()) {
      issues.push(`word ${i} repeats the previous word: "${words[i - 1]} ${word}"`)
    }
    if (i > 0 && AGREEMENT_SLIPS.has(`${bare(words[i - 1])} ${bare(word)}`)) {
      issues.push(`subject and verb do not agree: "${words[i - 1]} ${word}"`)
    }
    if (i > 0) {
      const subject = bare(words[i - 1])
      const before = i > 1 ? words[i - 2] : undefined
      const opensClause = before === undefined || /,$/.test(before) || CLAUSE_OPENERS.has(bare(before))
      if (['he', 'she', 'it'].includes(subject) && opensClause && isBareBaseVerb(bare(word))) {
        issues.push(`third-person subject takes a verb in -s or past form: "${words[i - 1]} ${word}"`)
      }
    }
    // "Can he plays", "Did you went", "will played": the verb after a modal
    // or do-support must be the base form, with or without a pronoun between.
    {
      const verb = bare(word)
      const afterModal = i > 0 && BASE_FORM_TRIGGERS.has(bare(words[i - 1]))
      const afterModalAndPronoun =
        i > 1 && SUBJECT_PRONOUNS.has(bare(words[i - 1])) && BASE_FORM_TRIGGERS.has(bare(words[i - 2]))
      const trigger = afterModal ? words[i - 1] : afterModalAndPronoun ? `${words[i - 2]} ${words[i - 1]}` : undefined
      // Only a modal that opens the sentence can be followed by a noun subject.
      const nounImpossible = afterModalAndPronoun || (afterModal && i > 1)
      if (trigger && (inflectedVerbBase(verb, nounImpossible) !== undefined || IRREGULAR_PAST.has(verb))) {
        issues.push(`verb after "${trigger}" should be the base form: "${word}"`)
      }
    }
    if (i + 1 < words.length) {
      const article = bare(word)
      const next = bare(words[i + 1])
      const startsWithVowelLetter = /^[aeiou]/.test(next)
      if (article === 'a' && startsWithVowelLetter && !A_BEFORE_VOWEL_LETTER.has(next)) {
        issues.push(`should be "an" before "${next}": "a ${next}"`)
      }
      if (article === 'an' && !startsWithVowelLetter && !AN_BEFORE_CONSONANT_LETTER.has(next)) {
        issues.push(`should be "a" before "${next}": "an ${next}"`)
      }
    }
  })

  return issues
}

/** Runs {@link validateQuestion} over a whole bank, prefixing each issue
 * with the question id so a failure is easy to trace back to its source
 * template. */
export function validateQuestionBank(questions: readonly Question[]): string[] {
  const issues: string[] = []
  for (const question of questions) {
    for (const issue of validateQuestion(question)) {
      issues.push(`${question.id}: ${issue}`)
    }
  }
  return issues
}
