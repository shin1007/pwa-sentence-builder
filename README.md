# 英文パズル

英語学習者（小学生〜高校生）向けの、英文パズル PWA ゲームです。日本語の文を見て、シャッフルされた単語タイルをタップして正しい語順の英文を組み立てます。

## 特徴

- **横画面固定**: スマホを縦に持っていても、CSS で画面を自動回転させて常に横画面でプレイできます（`useForcedLandscape` フック）。フルスクリーン + Screen Orientation API のロックも対応端末では試みます。
- **5段階の難易度**: 英検4級 / 英検3級 / 英検準2級 / 英検2級 / 高校入試。合計 2,300問以上のプールからランダムに出題します（高校入試コースには、公式の過去問と正答表から再構成した実際の整序英作文も含みます）。
- **文法項目タグ**: 全問に `This is 〜` から仮定法・分詞構文まで150項目の文法タグが付いており（`src/data/grammar.ts`）、どの文法項目が手薄かを機械的に把握できます。
- **ゲーム性のある演出**:
  - タイマーバー（残り秒数とアイコン ⏱️→⏳→⚠️ を併記。色だけに頼らずに緊急度が分かる。残り5秒でピンチ演出＆カウント音）。制限時間は固定ではなく、文の語数に応じて `BASE_TIME_SEC + secPerWord × 語数` で算出する（`src/data/timeLimit.ts`）
  - コンボ倍率・ハート（ライフ）・スコアポップアップ
  - 正解時のコンフェッティ演出、不正解時の画面シェイク＆フラッシュ
  - ベストスコア・星評価（1〜3）をローカル保存
- **サウンドエフェクト**: 外部音声ファイルなしで、Web Audio API によりすべての効果音をリアルタイム合成。オフラインでも完全に動作します。
- **PWA**: `vite-plugin-pwa` によりオフラインキャッシュ・ホーム画面への追加に対応。

## 開発

```bash
npm install
npm run dev      # 開発サーバー
npm run build    # 本番ビルド（型チェック + PWA生成）
npm run preview  # ビルド結果のプレビュー
npm run lint      # oxlint
npm test          # vitest
npm run grammar:coverage  # 文法タグごとの出題数と手薄な項目を表示
npm run vocab:audit       # レベルごとの語彙を CEFR-J Wordlist と照らして点検（--all で全件表示）
```

## アイコン生成

`public/` 内のアプリアイコン（マスカブルアイコン含む）は `scripts/icon-gen/` の HTML を Playwright でスクリーンショットして生成しています。再生成する場合:

```bash
node scripts/icon-gen/generate.cjs
```

## ディレクトリ構成

```
src/
  audio/soundEngine.ts     Web Audio API による効果音合成
  hooks/                   useSound, useForcedLandscape
  context/SoundContext.tsx サウンド状態の共有
  data/                    levels.ts, questions.ts（問題バンク）, grammar.ts（文法タグ台帳）
  data/templates/          レベルごとの問題テンプレート
  components/              画面・UIコンポーネント
  utils/storage.ts         ベストスコアの永続化 (localStorage)
```
