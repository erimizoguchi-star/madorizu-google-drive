/**
 * 図面の自動切り出しで使う矩形計算。
 * AI が返す正規化座標（0〜1000）を画像のピクセル矩形に変換する。
 * 計算だけを分離してテストできるようにしてある。
 */

/** AI が返す範囲。画像左上が (0,0)、右下が (1000,1000) */
export interface NormalizedRegion {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/** 寸法数値が縁で欠けないよう、検出範囲の外側に足す余白（画像サイズ比） */
const MARGIN_RATIO = 0.025
/** 画像のほぼ全体なら切り出す意味がない */
const SKIP_AREA_RATIO = 0.85
/** 極端に小さい検出は誤検出とみなす（幅・高さそれぞれ） */
const MIN_SIDE_RATIO = 0.2

export function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** AI 応答（unknown）を NormalizedRegion に整える。不正なら null */
export function parseNormalizedRegion(value: unknown): NormalizedRegion | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const x0 = toFiniteNumber(v.x0)
  const y0 = toFiniteNumber(v.y0)
  const x1 = toFiniteNumber(v.x1)
  const y1 = toFiniteNumber(v.y1)
  if (x0 == null || y0 == null || x1 == null || y1 == null) return null
  if (x0 < 0 || y0 < 0 || x1 > 1000 || y1 > 1000) return null
  if (x1 <= x0 || y1 <= y0) return null
  return { x0, y0, x1, y1 }
}

/**
 * 正規化範囲 → 画像ピクセルの切り出し矩形。
 * 切り出す価値がない（ほぼ全面／誤検出らしい）場合は null。
 */
export function regionToCropRect(
  region: NormalizedRegion,
  imageWidth: number,
  imageHeight: number
): PixelRect | null {
  if (imageWidth < 1 || imageHeight < 1) return null

  const wRatio = (region.x1 - region.x0) / 1000
  const hRatio = (region.y1 - region.y0) / 1000
  if (wRatio * hRatio >= SKIP_AREA_RATIO) return null
  if (wRatio < MIN_SIDE_RATIO || hRatio < MIN_SIDE_RATIO) return null

  const marginX = imageWidth * MARGIN_RATIO
  const marginY = imageHeight * MARGIN_RATIO
  const x = Math.max(0, Math.round((region.x0 / 1000) * imageWidth - marginX))
  const y = Math.max(0, Math.round((region.y0 / 1000) * imageHeight - marginY))
  const right = Math.min(imageWidth, Math.round((region.x1 / 1000) * imageWidth + marginX))
  const bottom = Math.min(imageHeight, Math.round((region.y1 / 1000) * imageHeight + marginY))

  const width = right - x
  const height = bottom - y
  if (width < 1 || height < 1) return null

  return { x, y, width, height }
}
