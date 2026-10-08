import { describe, expect, it } from 'vitest'
import { cutRoomOverlaps, orthogonalOverlapArea, subtractOrthogonal } from '../utils/roomOverlap'
import { polygonArea } from '../renderer/styles'
import { makePlan, makeRoom, rect } from './helpers'

describe('重なった部屋', () => {
  it('LD の角に洗面室が重なっていたら、LD を L 字に切り取る', () => {
    const ld = rect(0, 0, 400, 300)
    const wash = rect(300, 200, 450, 350) // LD の右下の角に 100×100 重なる
    const cut = subtractOrthogonal(ld, wash)!
    expect(cut).toHaveLength(6)
    expect(polygonArea(cut)).toBe(400 * 300 - 100 * 100)
    expect(orthogonalOverlapArea(cut, wash)).toBe(0)
  })

  it('重なりがなければそのまま。内側にすっぽり入っている・2つに分かれるときは切り取らない', () => {
    const ld = rect(0, 0, 400, 300)
    expect(subtractOrthogonal(ld, rect(400, 0, 500, 300))).toBe(ld)
    expect(subtractOrthogonal(ld, rect(100, 100, 200, 200))).toBeNull() // 穴があく
    expect(subtractOrthogonal(ld, rect(150, -10, 250, 310))).toBeNull() // 2つに分かれる
  })

  it('まとめて除くと、大きい部屋が切り取られ、小さい部屋はそのまま', () => {
    const plan = makePlan({
      rooms: [makeRoom('LD', rect(0, 0, 400, 300)), makeRoom('洗面室', rect(300, 0, 450, 150))],
    })
    const { plan: next, cut, skipped } = cutRoomOverlaps(plan)
    expect(cut).toBe(1)
    expect(skipped).toBe(0)
    const [ld, wash] = next.floors[0].rooms
    expect(wash.polygon).toEqual(rect(300, 0, 450, 150))
    expect(orthogonalOverlapArea(ld.polygon, wash.polygon)).toBe(0)
    expect(polygonArea(ld.polygon)).toBe(400 * 300 - 100 * 150)
  })
})
