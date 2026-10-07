import { describe, expect, it } from 'vitest'
import { resizeFixtureCorner } from '../utils/floorPlanDrag'
import type { Fixture, FloorPlan, Point } from '../types/floorPlan'
import { makePlan } from './helpers'

/** 設備の角（設備自身の向きでの nw/ne/se/sw）の、画面上の位置 */
function cornerOnScreen(f: Fixture, corner: 'nw' | 'ne' | 'se' | 'sw'): Point {
  const rad = ((f.angle ?? 0) * Math.PI) / 180
  const lx = (corner === 'ne' || corner === 'se' ? 1 : -1) * (f.width / 2)
  const ly = (corner === 'se' || corner === 'sw' ? 1 : -1) * (f.height / 2)
  const cx = f.position.x + f.width / 2
  const cy = f.position.y + f.height / 2
  return { x: cx + lx * Math.cos(rad) - ly * Math.sin(rad), y: cy + lx * Math.sin(rad) + ly * Math.cos(rad) }
}

describe('回転した設備の角をドラッグして大きさを変える', () => {
  for (const angle of [0, 90, 180, 270]) {
    it(`${angle}°: 少しずつ動かしても大きさが暴走せず、反対側の角は動かない`, () => {
      const start: Fixture = { id: 'f', type: 'toilet', position: { x: 100, y: 100 }, width: 35, height: 50, angle }
      let plan: FloorPlan = makePlan({ fixtures: [start] })
      const ref = { floorId: '1f', fixtureId: 'f' }
      const grabbed = cornerOnScreen(start, 'se')
      const fixed = cornerOnScreen(start, 'nw')
      // 掴んだ角を、反対側の角から離れる向きへ 2 単位（20mm）ずつ 20 回動かす
      const away = { x: Math.sign(grabbed.x - fixed.x), y: Math.sign(grabbed.y - fixed.y) }
      for (let i = 1; i <= 20; i++) {
        const cursor = { x: grabbed.x + away.x * i * 2, y: grabbed.y + away.y * i * 2 }
        plan = resizeFixtureCorner(plan, ref, 'se', cursor, start)
      }
      const f = plan.floors[0].fixtures[0]
      // 40 単位（400mm）ずつ大きくなる（以前は加速して数億 mm になった）
      expect(f.width).toBeCloseTo(75, 5)
      expect(f.height).toBeCloseTo(90, 5)
      const stillFixed = cornerOnScreen(f, 'nw')
      expect(stillFixed.x).toBeCloseTo(fixed.x, 5)
      expect(stillFixed.y).toBeCloseTo(fixed.y, 5)
    })
  }

  it('反対側の角を越えても裏返らず、最小 100mm で止まる', () => {
    const start: Fixture = { id: 'f', type: 'toilet', position: { x: 100, y: 100 }, width: 35, height: 50, angle: 0 }
    const plan = resizeFixtureCorner(makePlan({ fixtures: [start] }), { floorId: '1f', fixtureId: 'f' }, 'se', { x: 0, y: 0 }, start)
    const f = plan.floors[0].fixtures[0]
    expect([f.width, f.height]).toEqual([10, 10])
    expect(f.position).toEqual({ x: 100, y: 100 })
  })
})
