import { describe, expect, it } from 'vitest'
import { computeStairGraphics } from '../renderer/stairGraphics'
import { stairDirectionLabel } from '../renderer/roomLabelLayout'
import type { Stair } from '../types/floorPlan'
import { rect } from './helpers'

// 横長 300×90（3m × 910mm）の直線階段。左へ上る（右端が上り始め）
function stair(extra: Partial<Stair> = {}): Stair {
  return { id: 's', polygon: rect(0, 0, 300, 90), direction: 'up', orientation: 'left', ...extra }
}

const last = (points: { x: number; y: number }[]) => points[points.length - 1]

describe('階段の描き方', () => {
  it('1階（UP）: 上り始め（右端）の○から上り終わり（左）へ矢印。UP は矢印の始点の横', () => {
    const g = computeStairGraphics(stair())
    expect(g.arrowPath!.start.x).toBeGreaterThan(250)
    expect(last(g.arrowPath!.points).x).toBeLessThan(50)
    expect(g.arrowPath!.tipAngleDeg).toBe(180)
    // 文字は始点の近く（中央ではない）
    expect(Math.abs(g.labelPoint.x - g.arrowPath!.start.x)).toBeLessThan(10)
    expect(Math.abs(g.labelPoint.y - 45)).toBeGreaterThan(10)
  })

  it('2階（DN）: 上り方向はそのままで、上り終わり側から下りの向きに矢印', () => {
    const g = computeStairGraphics(stair({ direction: 'down' }))
    expect(g.arrowPath!.start.x).toBeLessThan(50)
    expect(last(g.arrowPath!.points).x).toBeGreaterThan(250)
    expect(Math.round(g.arrowPath!.tipAngleDeg)).toBe(0)
    expect(stairDirectionLabel({ direction: 'down' })).toBe('DN')
  })

  it('破断線: 矢印は破断線まで、先の段は破線。DN には入れない', () => {
    const g = computeStairGraphics(stair({ cutLine: true }))
    expect(g.breakLine).not.toBeNull()
    const tip = last(g.arrowPath!.points)
    // 右端（上り始め）から 55% 付近で止まる
    expect(tip.x).toBeGreaterThan(100)
    expect(tip.x).toBeLessThan(160)
    const dashed = g.stepLines.filter((l) => l.dashed)
    expect(dashed.length).toBeGreaterThan(0)
    // 破線は破断線より先（左側）の段だけ
    expect(dashed.every((l) => (l.x1 + l.x2) / 2 < tip.x)).toBe(true)
    expect(computeStairGraphics(stair({ cutLine: true, direction: 'down' })).breakLine).toBeNull()
  })

  it('U字（右回り・上へ）: 左の通路を上り、突き当たりで折り返して右の通路を下る', () => {
    const g = computeStairGraphics({ id: 'u', polygon: rect(0, 0, 182, 270), direction: 'up', orientation: 'up', layout: 'u-right' })
    const { start, points } = g.arrowPath!
    expect(start.x).toBeLessThan(91)
    expect(start.y).toBeGreaterThan(200)
    expect(last(points).x).toBeGreaterThan(91)
    expect(last(points).y).toBeGreaterThan(200)
    expect(Math.round(g.arrowPath!.tipAngleDeg)).toBe(90)
    // すべての段の線が階段の範囲に収まる
    expect(g.stepLines.every((l) => [l.x1, l.x2].every((x) => x >= -0.01 && x <= 182.01))).toBe(true)
  })

  it('L字・下で曲がる（上へ）: 最後は上る向き（↑）に進む', () => {
    const g = computeStairGraphics({ id: 'l', polygon: rect(0, 0, 182, 270), direction: 'up', orientation: 'up', layout: 'turn-right-start' })
    expect(Math.round(g.arrowPath!.tipAngleDeg)).toBe(-90)
    expect(last(g.arrowPath!.points).y).toBeLessThan(g.arrowPath!.start.y)
  })
})

describe('段の数', () => {
  const lines = (s: Stair) => computeStairGraphics(s).stepLines.length
  it('直線は指定した段数になる（段板の境の線は段数−1本）', () => {
    expect(lines(stair())).toBe(6)
    expect(lines(stair({ steps: 12 }))).toBe(11)
  })

  it('L字・U字はまっすぐな部分の段数が変わる', () => {
    const l = { id: 'l', polygon: rect(0, 0, 91, 270), direction: 'up' as const, orientation: 'up' as const, layout: 'turn-right' as const }
    // L字: 段の境（段数−1）＋直線と曲がる部分の境＋回り段の2本
    expect(computeStairGraphics({ ...l, steps: 10 }).stepLines.length).toBe(9 + 1 + 2)
    const u = { id: 'u', polygon: rect(0, 0, 182, 270), direction: 'up' as const, orientation: 'up' as const, layout: 'u-right' as const }
    // U字: 片側ごとに（段数−1）×2＋通路の境＋折り返しの境＋回り段4本
    expect(computeStairGraphics({ ...u, steps: 8 }).stepLines.length).toBe(7 * 2 + 1 + 1 + 4)
  })
})
