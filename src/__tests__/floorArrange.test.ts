import { describe, expect, it } from 'vitest'
import { areaScaleSuggestion, buildingSizeMm, scaleFloorToWidth, scaleFloorUniform } from '../utils/floorArrange'
import { syncFloorWalls } from '../utils/ensureExteriorWalls'
import { bbox, makeFloor, makeRoom, rect } from './helpers'

// 1単位 = 10mm。400×300 = 12㎡ ≒ 7.4帖、200×300 = 6㎡ ≒ 3.7帖
function floor(scale = 1, labels: Array<number | undefined> = [7.4, 3.7]) {
  const s = (v: number) => v * scale
  return syncFloorWalls(
    makeFloor({
      rooms: [
        makeRoom('a', rect(0, 0, s(400), s(300)), { areaJo: labels[0] }),
        makeRoom('b', rect(s(400), 0, s(600), s(300)), { areaJo: labels[1] }),
      ],
    })
  )
}

describe('階の大きさをそろえる', () => {
  it('建物の幅・奥行を mm で返す', () => {
    expect(buildingSizeMm(floor())).toEqual({ widthMm: 6000, depthMm: 3000 })
  })

  it('帖数と形が合っていれば直さない', () => {
    expect(areaScaleSuggestion(floor())).toBeNull()
  })

  it('1.1倍に大きく描かれた階は、帖数から 1/1.1 に直す倍率を出す', () => {
    const big = floor(1.1)
    const suggestion = areaScaleSuggestion(big)!
    expect(suggestion.scale).toBeCloseTo(1 / 1.1, 2)
    const fixed = scaleFloorUniform(big, suggestion.scale)
    // 帖数は小数1桁なので、その丸めの分（50mm 以内）は残る
    expect(Math.abs(buildingSizeMm(fixed)!.widthMm - 6000)).toBeLessThan(50)
  })

  it('1部屋だけ帖数を読み違えていても、ほかの部屋に合わせる（中央値）', () => {
    const f = syncFloorWalls(
      makeFloor({
        rooms: [
          makeRoom('a', rect(0, 0, 400, 300), { areaJo: 7.4 }),
          makeRoom('b', rect(400, 0, 600, 300), { areaJo: 3.7 }),
          makeRoom('c', rect(0, 300, 600, 600), { areaJo: 11.1 }),
          // 読み違い（本当は 3.7帖）
          makeRoom('d', rect(600, 0, 800, 300), { areaJo: 12 }),
        ],
      })
    )
    expect(areaScaleSuggestion(f)).toBeNull()
  })

  it('帖数のある部屋が2つ未満なら判断しない', () => {
    expect(areaScaleSuggestion(floor(1.2, [7.4, undefined]))).toBeNull()
  })

  it('建物の幅を指定して、縦横同じ倍率で直す（左上は動かない）', () => {
    const fixed = scaleFloorToWidth(floor(), 9000)
    expect(buildingSizeMm(fixed)).toEqual({ widthMm: 9000, depthMm: 4500 })
    expect(bbox(fixed.rooms[0].polygon)).toEqual({ x1: 0, y1: 0, x2: 600, y2: 450 })
  })
})
