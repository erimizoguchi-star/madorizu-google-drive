import { describe, expect, it } from 'vitest'
import type { Point } from '../types/floorPlan'
import {
  normalizeAngle,
  rotatedBoxSize,
  solveThreePointAlignment,
  splitRotation,
} from '../utils/overlayRotation'

/** 中心 center まわりに deg 回して k 倍し、move だけ動かす（CSS の回転・拡大と同じ） */
function apply(p: Point, center: Point, deg: number, k: number, move: Point): Point {
  const r = (deg * Math.PI) / 180
  const v = { x: p.x - center.x, y: p.y - center.y }
  return {
    x: center.x + move.x + k * (v.x * Math.cos(r) - v.y * Math.sin(r)),
    y: center.y + move.y + k * (v.x * Math.sin(r) + v.y * Math.cos(r)),
  }
}

describe('重ねた平面図の回転', () => {
  it('角度を 90° の向きと残りの傾きに分ける', () => {
    expect(splitRotation(0)).toEqual({ quarter: 0, tilt: 0 })
    expect(splitRotation(92.5)).toEqual({ quarter: 90, tilt: 2.5 })
    expect(splitRotation(-1.2)).toEqual({ quarter: 0, tilt: -1.2 })
    expect(splitRotation(270)).toEqual({ quarter: -90, tilt: 0 })
    expect(splitRotation(178)).toEqual({ quarter: 180, tilt: -2 })
  })

  it('角度を -180〜180 にそろえる', () => {
    expect(normalizeAngle(360)).toBe(0)
    expect(normalizeAngle(-180)).toBe(180)
    expect(normalizeAngle(450)).toBe(90)
  })

  it('90° 回すと枠の縦横が入れ替わる', () => {
    const box = rotatedBoxSize(400, 300, 90)
    expect(box.width).toBeCloseTo(300)
    expect(box.height).toBeCloseTo(400)
  })

  it('傾いて小さく写った平面図を、3点で間取図の建物に重ねる', () => {
    const plan = { p1: { x: 100, y: 100 }, p2: { x: 500, y: 400 } }
    const center = { x: 320, y: 260 }
    // 間取図の建物の角を、中心まわりに -3° 回して 0.8 倍・少しずらした位置に平面図の角があるとする
    const corners = [plan.p1, { x: plan.p2.x, y: plan.p1.y }, plan.p2]
    const clicks = corners.map((p) => apply(p, center, -3, 0.8, { x: 15, y: -10 })) as [Point, Point, Point]

    const result = solveThreePointAlignment({ clicks, plan, center })
    expect(result).not.toBeNull()
    expect(result!.rotateDeg).toBeCloseTo(3, 6)
    expect(result!.scale).toBeCloseTo(1 / 0.8, 6)
    expect(result!.planStretch.sx).toBeCloseTo(1, 6)
    expect(result!.planStretch.sy).toBeCloseTo(1, 6)
    // 求めた回転・倍率・移動で、3つの角がすべて間取図の角に重なる
    for (let i = 0; i < 3; i++) {
      const moved = apply(clicks[i], center, result!.rotateDeg, result!.scale, result!.move)
      expect(moved.x).toBeCloseTo(corners[i].x, 6)
      expect(moved.y).toBeCloseTo(corners[i].y, 6)
    }
  })

  it('縦横比が違っても、傾きは上の辺から正しく求め、違いは縦横の倍率として返す', () => {
    const plan = { p1: { x: 0, y: 0 }, p2: { x: 400, y: 300 } }
    const center = { x: 200, y: 150 }
    // 平面図の建物は縦が 10% 長く、2° 傾いている
    const corners = [plan.p1, { x: 400, y: 0 }, { x: 400, y: 330 }]
    const clicks = corners.map((p) => apply(p, center, 2, 1, { x: 0, y: 0 })) as [Point, Point, Point]

    const result = solveThreePointAlignment({ clicks, plan, center })!
    expect(result.rotateDeg).toBeCloseTo(-2, 6)
    // 平面図の建物は上の辺 400・右の辺 330。間取図は 400・300
    const kx = 1
    const ky = 300 / 330
    expect(result.scale).toBeCloseTo((kx + ky) / 2, 6)
    expect(result.planStretch.sx).toBeCloseTo(result.scale / kx, 6)
    expect(result.planStretch.sy).toBeCloseTo(result.scale / ky, 6)
  })

  it('2点が近すぎるときは合わせない', () => {
    const plan = { p1: { x: 0, y: 0 }, p2: { x: 400, y: 300 } }
    const clicks: [Point, Point, Point] = [{ x: 10, y: 10 }, { x: 12, y: 11 }, { x: 12, y: 300 }]
    expect(solveThreePointAlignment({ clicks, plan, center: { x: 0, y: 0 } })).toBeNull()
  })
})
