import { describe, expect, it } from 'vitest'
import { parseNormalizedRegion, regionToCropRect } from '../utils/cropRegion'

/**
 * 図面の自動切り出しの矩形計算を守るテスト。
 * AI が返す範囲（0〜1000 正規化）を画像ピクセルへ変換する部分は
 * 純粋な計算なので、ここで境界条件を固めておく。
 */
describe('AI応答の範囲パース', () => {
  it('正常な範囲を受け付ける', () => {
    expect(parseNormalizedRegion({ x0: 100, y0: 50, x1: 900, y1: 800 })).toEqual({
      x0: 100,
      y0: 50,
      x1: 900,
      y1: 800,
    })
  })

  it('欠け・逆転・範囲外は null', () => {
    expect(parseNormalizedRegion({ x0: 100, y0: 50, x1: 900 })).toBeNull()
    expect(parseNormalizedRegion({ x0: 900, y0: 50, x1: 100, y1: 800 })).toBeNull()
    expect(parseNormalizedRegion({ x0: -10, y0: 0, x1: 500, y1: 500 })).toBeNull()
    expect(parseNormalizedRegion({ x0: 0, y0: 0, x1: 1200, y1: 500 })).toBeNull()
    expect(parseNormalizedRegion('not an object')).toBeNull()
    expect(parseNormalizedRegion(null)).toBeNull()
  })

  it('文字列の数値は数値として扱う（AI が "100" と返すことがある）', () => {
    expect(parseNormalizedRegion({ x0: '100', y0: '50', x1: '900', y1: '800' })).toEqual({
      x0: 100,
      y0: 50,
      x1: 900,
      y1: 800,
    })
  })
})

describe('切り出し矩形の計算', () => {
  // 2000x1500 の画像で中央 60% を検出したケース
  const region = { x0: 200, y0: 100, x1: 800, y1: 850 }

  it('正規化座標をピクセルに変換し、余白を付ける', () => {
    const rect = regionToCropRect(region, 2000, 1500)
    expect(rect).not.toBeNull()
    // x0=200/1000*2000=400、余白 2000*0.025=50 → 350
    expect(rect!.x).toBe(350)
    expect(rect!.y).toBe(113) // 150 - 37.5 → round(112.5)=113 相当
    expect(rect!.x + rect!.width).toBe(1650) // 1600 + 50
  })

  it('余白が画像の端を超えるときはクランプされる', () => {
    const rect = regionToCropRect({ x0: 0, y0: 0, x1: 700, y1: 700 }, 2000, 1500)
    expect(rect!.x).toBe(0)
    expect(rect!.y).toBe(0)
  })

  it('ほぼ全面の検出は null（切り出す意味がない）', () => {
    expect(regionToCropRect({ x0: 0, y0: 0, x1: 1000, y1: 950 }, 2000, 1500)).toBeNull()
  })

  it('極端に小さい検出は誤検出として null', () => {
    expect(regionToCropRect({ x0: 480, y0: 0, x1: 520, y1: 1000 }, 2000, 1500)).toBeNull()
  })

  it('画像サイズが不正なら null', () => {
    expect(regionToCropRect(region, 0, 1500)).toBeNull()
  })
})
