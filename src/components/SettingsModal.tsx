import { useSoundContext } from '../context/sound'
import { useSettingsContext } from '../context/settings'
import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from '../context/difficulty'
import styles from './SettingsModal.module.css'

const DIFFICULTY_DESC: Record<Difficulty, string> = {
  easy: 'タイマーもライフもなし。文頭は大文字のまま。自分のペースでじっくり（ベストスコアには残りません）。',
  normal: '制限時間とライフあり。単語を置いた瞬間に判定し、間違えた単語はその場で教えてくれます。',
  hard: '制限時間とライフあり。最後まで並べてから一括判定。間違えたら正解を見て並べ直します。',
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const sound = useSoundContext()
  const { difficulty, setDifficulty, listeningMode, toggleListeningMode } = useSettingsContext()

  const handleSelectDifficulty = (next: Difficulty) => {
    sound.click()
    setDifficulty(next)
  }

  const handleSelectListening = (enableListening: boolean) => {
    sound.click()
    if (listeningMode !== enableListening) {
      toggleListeningMode()
    }
  }

  const handleToggleSound = () => {
    sound.unlock()
    sound.toggleSfx()
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 id="settings-title" className={styles.title}>
            ⚙️ 設定
          </h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="設定を閉じる">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {/* あそびかた */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <span>🎯</span> あそびかた
            </div>
            <div className={`${styles.optionGrid} ${styles.optionGrid3}`}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`${styles.optionCard} ${difficulty === d ? styles.active : ''}`}
                  onClick={() => handleSelectDifficulty(d)}
                >
                  <div className={styles.optionHeader}>
                    <span className={styles.optionTitle}>{DIFFICULTY_LABEL[d]}</span>
                    {d === 'normal' && <span className={styles.optionBadge}>基本</span>}
                  </div>
                  <p className={styles.optionDesc}>{DIFFICULTY_DESC[d]}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 出題のしかた */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <span>👂</span> 出題のしかた
            </div>
            <div className={styles.optionGrid}>
              <button
                type="button"
                className={`${styles.optionCard} ${!listeningMode ? styles.active : ''}`}
                onClick={() => handleSelectListening(false)}
              >
                <div className={styles.optionHeader}>
                  <span className={styles.optionTitle}>📖 日本語を見て</span>
                  <span className={styles.optionBadge}>基本</span>
                </div>
                <p className={styles.optionDesc}>
                  日本語の文を見て、その意味になるように英語を並べます。
                </p>
              </button>

              <button
                type="button"
                className={`${styles.optionCard} ${listeningMode ? styles.active : ''}`}
                onClick={() => handleSelectListening(true)}
              >
                <div className={styles.optionHeader}>
                  <span className={styles.optionTitle}>🎧 英語を聞いて</span>
                </div>
                <p className={styles.optionDesc}>
                  日本語は隠して英語だけを読み上げます。聞こえた順に並べよう。日本語は答えたあとに出ます（音声OFFのときは日本語で出題）。
                </p>
              </button>
            </div>
          </div>

          {/* 効果音・音声 */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <span>🔊</span> 音声・効果音
            </div>
            <div className={styles.optionGrid}>
              <button
                type="button"
                className={`${styles.optionCard} ${sound.sfxOn ? styles.active : ''}`}
                onClick={handleToggleSound}
              >
                <div className={styles.optionHeader}>
                  <span className={styles.optionTitle}>🔊 音声 ON</span>
                </div>
                <p className={styles.optionDesc}>
                  効果音や日本語・英語の読み上げ音声を再生します。
                </p>
              </button>

              <button
                type="button"
                className={`${styles.optionCard} ${!sound.sfxOn ? styles.active : ''}`}
                onClick={handleToggleSound}
              >
                <div className={styles.optionHeader}>
                  <span className={styles.optionTitle}>🔈 ミュート</span>
                </div>
                <p className={styles.optionDesc}>
                  すべての音声・効果音を消音します。
                </p>
              </button>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.doneButton}
            onClick={() => {
              sound.click()
              onClose()
            }}
          >
            完了
          </button>
        </div>
      </div>
    </div>
  )
}
