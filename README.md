# 間取図ジェネレーター (Madorizu)

平面図（建築図面）をアップロードすると、参考画像のようなカラー間取図を自動生成するWebアプリです。

## 機能

- **平面図アップロード** — PNG / JPG / PDF 形式の平面図をドラッグ＆ドロップ
- **AI解析** — Google Gemini API で平面図から部屋・壁・扉・窓を自動認識
- **デモモード** — API キーなしでサンプル間取図を確認可能
- **SVGレンダリング** — 部屋タイプ別の色分け、畳格子、設備アイコン、階段記号
- **エクスポート** — PNG / SVG 形式で保存

## 部屋タイプと色

| タイプ | 色 | 例 |
|--------|-----|-----|
| LD | オレンジ | リビング・ダイニング |
| 水回り | 水色 | キッチン、浴室、トイレ |
| 和室 | 緑（畳格子） | 和室 |
| 洋室 | 黄色 | 寝室 |
| その他 | 白/グレー | 廊下、玄関、収納 |

## セットアップ

### 必要環境

- [Node.js](https://nodejs.org/) 18 以上

### インストール

```bash
cd madorizu
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開きます。

### APIキーの設定（推奨）

1. [Google AI Studio](https://aistudio.google.com/apikey) で API キーを取得
2. プロジェクト直下に `.env` ファイルを作成:

```
GEMINI_API_KEY=AIzaSyあなたのキー
```

3. `npm run dev` を再起動

### 利用上限（レートリミット）について

Gemini API には Google 側で**無料枠・レート制限**があります。このアプリから上限を外すことはできません。

| 対処法 | 内容 |
|--------|------|
| 待つ | 1〜2分後に再試行（1日の無料枠の場合は翌日まで） |
| 有料プラン | [Google AI Studio](https://aistudio.google.com/) で従量課金を有効化 |
| 連打を避ける | 「キーを確認」と「間取図を生成」を連続で押さない |

アプリ側では 429 エラー時に自動リトライ（最大3回）と、画像のリサイズによる消費量削減を行っています。

キーの確認:

```bash
npm run test-api-key
```

### 本番ビルド

```bash
npm run build
npm run preview
```

## 使い方

1. **デモモード** — 「サンプル表示」を選択し、平面図をアップロード → サンプル間取図を表示
2. **AI解析** — 「AI解析（Gemini）」を選択し、API キーを設定 → 平面図をアップロード → 「間取図を生成」
3. **エクスポート** — 「PNGで保存」または「SVGで保存」で出力

## データ形式

間取図は JSON で定義します（`src/types/floorPlan.ts` 参照）。

## アーキテクチャ

```
src/
├── types/floorPlan.ts    # データモデル
├── data/sampleHouse.ts   # サンプルデータ
├── renderer/             # SVG描画エンジン
├── services/             # Gemini AI解析
└── components/           # UIコンポーネント
```

## ライセンス

MIT
