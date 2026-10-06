import { describe, expect, it } from 'vitest'
import { buildDarkMap, findLineNear } from '../utils/imageLines'

/** 白地の画像に、黒い縦線（列 x0〜x1、行 y0〜y1）を描いた RGBA を作る */
function image(width: number, height: number, blacks: Array<[number, number, number, number]>) {
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const [x0, x1, y0, y1] of blacks) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * width + x) * 4
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 0
      }
    }
  }
  return buildDarkMap(rgba, width, height)
}

describe('平面図の壁の線を探す', () => {
  it('黒く塗った太い壁は、帯の中央を返す', () => {
    const map = image(200, 100, [[100, 105, 0, 99]])
    expect(findLineNear(map, 'x', 95, [[0, 100]], 15, 20)).toBe(102.5)
  })

  it('2本線で描いた壁（中が白い）は、2本の中央を返す', () => {
    const map = image(200, 100, [
      [100, 100, 0, 99],
      [110, 110, 0, 99],
    ])
    expect(findLineNear(map, 'x', 98, [[0, 100]], 20, 15)).toBe(105)
  })

  it('離れた2本の線は別の壁として、近いほうを返す', () => {
    const map = image(200, 100, [
      [80, 81, 0, 99],
      [120, 121, 0, 99],
    ])
    expect(findLineNear(map, 'x', 118, [[0, 100]], 50, 15)).toBe(120.5)
  })

  it('範囲の一部が開口で途切れていても見つける', () => {
    const map = image(200, 100, [
      [100, 102, 0, 40],
      [100, 102, 70, 99],
    ])
    expect(findLineNear(map, 'x', 96, [[0, 100]], 10, 15)).toBe(101)
  })

  it('探す範囲に線がなければ null（文字など短い黒は線とみなさない）', () => {
    const map = image(200, 100, [[150, 152, 0, 99], [60, 62, 40, 50]])
    expect(findLineNear(map, 'x', 60, [[0, 100]], 10, 15)).toBeNull()
  })

  it('横の線も探せる', () => {
    const map = image(100, 200, [[0, 99, 50, 53]])
    expect(findLineNear(map, 'y', 45, [[0, 100]], 10, 15)).toBe(51.5)
  })
})
