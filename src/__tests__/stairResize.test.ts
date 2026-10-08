import { describe, expect, it } from 'vitest'
import type { Stair } from '../types/floorPlan'
import { moveStairEdge } from '../utils/resizeStair'
import { resizeStairEdge } from '../utils/floorPlanEdit'
import { stairOutline } from '../utils/stairShape'
import { lStairGeometry, getStairBounds } from '../renderer/stairGraphics'
import { bbox, makePlan, makeRoom, rect } from './helpers'

const ref = { floorId: '1f', stairId: 's' }

describe('階段の辺をドラッグして大きさを変える', () => {
  it('動かした辺だけが動き、反対側は動かない。裏返ったり細くなりすぎたりしない', () => {
    const poly = rect(0, 0, 91, 273) // 0:上 1:右 2:下 3:左
    expect(bbox(moveStairEdge(poly, 2, 300))).toEqual({ x1: 0, y1: 0, x2: 91, y2: 300 })
    expect(bbox(moveStairEdge(poly, 1, 100))).toEqual({ x1: 0, y1: 0, x2: 100, y2: 273 })
    // 上の辺を下の辺より下へ動かそうとしても、200mm 手前で止まる
    expect(bbox(moveStairEdge(poly, 0, 400))).toEqual({ x1: 0, y1: 253, x2: 91, y2: 273 })
  })

  it('幅の辺を動かすと、階段の幅（mm）も変わる', () => {
    const plan = makePlan({
      rooms: [makeRoom('ホール', rect(91, 0, 300, 273))],
      stairs: [{ id: 's', direction: 'up', orientation: 'up', widthMm: 910, polygon: rect(0, 0, 91, 273) }],
    })
    const start = plan.floors[0].stairs[0].polygon
    const next = resizeStairEdge(plan, ref, start, 3, -9).floors[0].stairs[0]
    expect(bbox(next.polygon)).toEqual({ x1: -9, y1: 0, x2: 91, y2: 273 })
    expect(next.widthMm).toBe(1000)
  })

  it('L字・2方向に段は、内側の辺を動かすと段の幅が変わり、L 字のまま', () => {
    const base: Stair = {
      id: 's',
      direction: 'up',
      layout: 'l-right',
      orientation: 'right',
      widthMm: 910,
      polygon: rect(0, 0, 273, 182),
    }
    const stair = { ...base, polygon: stairOutline(base) }
    const plan = makePlan({ rooms: [makeRoom('ホール', rect(273, 0, 400, 182))], stairs: [stair] })
    // 輪郭の 5 番目の辺（内側の横の辺 (182,91)→(0,91)）を y=80 へ
    const inner = stair.polygon.findIndex((p, i) => {
      const q = stair.polygon[(i + 1) % stair.polygon.length]
      return p.y === 91 && q.y === 91
    })
    const next = resizeStairEdge(plan, ref, stair.polygon, inner, 80).floors[0].stairs[0]
    expect(next.polygon).toHaveLength(6)
    expect(lStairGeometry(next, getStairBounds(next.polygon)).w1).toBeCloseTo(80)
    expect(next.widthMm).toBe(800)
  })
})
