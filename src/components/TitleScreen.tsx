import { useState } from 'react'
import { requestFullscreenLandscape } from '../hooks/useForcedLandscape'
import { useSoundContext } from '../context/sound'
import { useSettingsContext } from '../context/settings'
import SettingsModal from './SettingsModal'
import { MODE_LABEL, REVIEW_LABEL } from '../data/modes'
import { LEVELS } from '../data/levels'
import { dueReviewCount } from '../utils/reviewQueue'
import type { LevelSelectMode } from '../types'
import styles from './TitleScreen.module.css'

export default function TitleScreen({
  onStart,
  onProgress,
}: {
  onStart: (mode: LevelSelectMode) => void
  onProgress: () => void
}) {
  const sound = useSoundContext()
  const { retryOnMiss, practiceMode, listeningMode } = useSettingsContext()
  const [showSettings, setShowSettings] = useState(false)
  // Spaced repetition only works if due questions actually get answered on
  // time, so the title says when some are waiting rather than leaving them to
  // surface only if the player happens to pick that level.
  const [dueTotal] = useState(() => LEVELS.reduce((sum, level) => sum + dueReviewCount(level.id), 0))

  const handleStart = (mode: LevelSelectMode) => {
    sound.unlock()
    sound.click()
    void requestFullscreenLandscape()
    onStart(mode)
  }

  return (
    <div className={styles.screen}>
      <div className={`${styles.orb} ${styles.orb1}`} />
      <div className={`${styles.orb} ${styles.orb2}`} />

      <div className={styles.settingsRow}>
        <button
          className={`${styles.iconButton} ${sound.sfxOn ? '' : styles.off}`}
          onClick={() => {
            sound.unlock()
            sound.toggleSfx()
          }}
          aria-label="効果音の切り替え"
          title={sound.sfxOn ? '音声: ON' : '音声: OFF'}
        >
          {sound.sfxOn ? '🔊' : '🔈'}
        </button>
        <button
          className={styles.settingsButton}
          onClick={() => {
            sound.click()
            setShowSettings(true)
          }}
          aria-label="ゲーム設定を開く"
        >
          ⚙️ 設定
        </button>
      </div>

      <div className={styles.tileRow}>
        <div className={styles.tile}>英</div>
        <div className={styles.tile}>単</div>
        <div className={styles.tile}>語</div>
      </div>

      <h1 className={styles.title}>英文パズル</h1>
      <p className={styles.subtitle}>並べかえて 英文を 作ろう！</p>

      <div className={styles.modeRow}>
        <button
          className={`${styles.startButton} ${styles.challenge}`}
          onClick={() => handleStart('challenge')}
        >
          <span className={styles.modeTitle}>▶ {MODE_LABEL.challenge}</span>
          <span className={styles.modeHint}>10問で スコアを きそう</span>
        </button>
        <button
          className={`${styles.startButton} ${styles.endless}`}
          onClick={() => handleStart('endless')}
        >
          <span className={styles.modeTitle}>∞ {MODE_LABEL.endless}</span>
          <span className={styles.modeHint}>やめるまで 出題しつづける</span>
        </button>
      </div>

      <div className={styles.badgeRow}>
        <button
          className={`${styles.badge} ${styles.badgeButton} ${dueTotal > 0 ? styles.reviewDue : ''}`}
          onClick={() => handleStart('review')}
          disabled={dueTotal === 0}
        >
          {dueTotal > 0 ? `${REVIEW_LABEL} ${dueTotal}問` : `${REVIEW_LABEL}なし`}
        </button>
        <button
          className={`${styles.badge} ${styles.badgeButton}`}
          onClick={() => {
            sound.click()
            setShowSettings(true)
          }}
          title="クリックして設定を変更"
        >
          {retryOnMiss ? '🔄 やり直しモード' : '⏩ 一発勝負モード'}
          {practiceMode && '・練習'}
          {listeningMode && '・🎧'}
        </button>
        <button
          className={`${styles.badge} ${styles.badgeButton}`}
          onClick={() => {
            sound.click()
            onProgress()
          }}
        >
          📈 成長記録
        </button>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
