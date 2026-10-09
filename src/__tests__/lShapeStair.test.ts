import { describe, expect, it } from 'vitest'
import type { Stair } from '../types/floorPlan'
import { computeStairGraphics, effectiveStairSteps, effectiveStairSteps2, getStairBounds } from '../renderer/stairGraphics'
import { rectifyFloorStairs, stairOutline } from '../utils/stairShape'
import { syncFloorWalls } from '../utils/ensureExteriorWalls'
import { updateStair } from '../utils/floorPlanEdit'
import { normalizeFloorPlan } from '../utils/floorPlanNormalize'
import { moveGridLine } from '../utils/gridLines'
import { bbox, makeFloor, makePlan, makeRoom, rect } from './helpers'

/** 画像の階段: 右へ上り、右上の角で右回り（下向き）に曲がって、曲がったあとも段が続く */
const lStair = (extra: Partial<Stair> = {}): Stair => ({
  id: 's',
  direction: 'up',
  layout: 'l-right',
  orientation: 'right',
  widthMm: 910,
  polygon: rect(0, 0, 273, 182),
  ...extra,
})

const has = (poly: { x: number; y: number }[], x: number, y: number) =>
  poly.some((p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01)

describe('L字・2方向に段の階段', () => {
  it('輪郭は L 字（上の帯と右の列）になる', () => {
    const outline = stairOutline(lStair())
    expect(outline).toHaveLength(6)
    // 上の帯（幅 91）と右の列（幅 91）。左下は階段ではない
    for (const [x, y] of [[0, 0], [273, 0], [273, 182], [182, 182], [182, 91], [0, 91]]) {
      expect(has(outline, x, y)).toBe(true)
    }
  })

  it('段・回り段・矢印を描く。踊り場にすると回り段の斜めの線がなくなる', () => {
    const stair = { ...lStair(), polygon: stairOutline(lStair()) }
    const winder = computeStairGraphics(stair)
    const diagonal = (l: { x1: number; y1: number; x2: number; y2: number }) =>
      Math.abs(l.x1 - l.x2) > 0.01 && Math.abs(l.y1 - l.y2) > 0.01
    expect(winder.stepLines.filter(diagonal)).toHaveLength(2)
    expect(computeStairGraphics({ ...stair, corner: 'landing' }).stepLines.filter(diagonal)).toHaveLength(0)
    // 矢印は右へ進んでから下へ曲がる
    const pts = winder.arrowPath!.points
    expect(pts[1].x).toBeGreaterThan(pts[0].x)
    expect(pts[2].y).toBeGreaterThan(pts[1].y)
    // 段の数は、曲がる前と曲がったあとで別々に数える
    expect(effectiveStairSteps(stair)).toBe(8)
    expect(effectiveStairSteps2(stair)).toBe(4)
    const fewer = computeStairGraphics({ ...stair, steps: 3, steps2: 2 })
    expect(fewer.stepLines.length).toBeLessThan(winder.stepLines.length)
  })

  it('壁は L 字の輪郭に沿う（左下の空いた所には壁を作らない）', () => {
    const floor = syncFloorWalls(
      makeFloor({ rooms: [makeRoom('ホール', rect(273, 0, 400, 182))], stairs: [{ ...lStair(), polygon: stairOutline(lStair()) }] })
    )
    const insideCorner = floor.walls.some(
      (w) => w.start.x === w.end.x && w.start.x === 182 && Math.min(w.start.y, w.end.y) >= 91
    )
    expect(insideCorner).toBe(true)
    expect(floor.walls.some((w) => w.start.y === w.end.y && w.start.y === 182 && Math.max(w.start.x, w.end.x) <= 182)).toBe(false)
  })

  it('直線の階段から変えると、曲がったあとにも段が入るよう曲がる向きへ伸ばす', () => {
    const plan = makePlan({ stairs: [{ id: 's', direction: 'up', orientation: 'right', widthMm: 910, polygon: rect(0, 0, 273, 91) }] })
    const next = updateStair(plan, { floorId: '1f', stairId: 's' }, { layout: 'l-right' })
    const stair = next.floors[0].stairs[0]
    expect(bbox(stair.polygon)).toEqual({ x1: 0, y1: 0, x2: 273, y2: 182 })
    expect(stair.polygon).toHaveLength(6)
    // 直線に戻すと長方形で、幅は階段の幅
    const back = updateStair(next, { floorId: '1f', stairId: 's' }, { layout: 'straight' }).floors[0].stairs[0]
    expect(back.polygon).toHaveLength(4)
    expect(getStairBounds(back.polygon).maxY - getStairBounds(back.polygon).minY).toBeCloseTo(91)
  })

  it('曲がったあとの長さを変えられ、上り始めの側は動かない', () => {
    const plan = makePlan({ stairs: [{ ...lStair(), polygon: stairOutline(lStair()) }] })
    const next = updateStair(plan, { floorId: '1f', stairId: 's' }, { turnLengthMm: 2730 }).floors[0].stairs[0]
    expect(bbox(next.polygon)).toEqual({ x1: 0, y1: 0, x2: 273, y2: 273 })
  })

  it('線合わせで内側の角を動かしても、その幅のまま L 字を保つ', () => {
    const floor = rectifyFloorStairs(makeFloor({ stairs: [{ ...lStair(), polygon: stairOutline(lStair()) }] }))
    const moved = moveGridLine(floor, 'y', 91, 100)
    const poly = moved.stairs[0].polygon
    expect(poly).toHaveLength(6)
    expect(has(poly, 182, 100)).toBe(true)
    expect(has(poly, 0, 100)).toBe(true)
  })

  it('JSON に保存して読み込んでも L 字のまま', () => {
    const plan = makePlan(
      {
        rooms: [makeRoom('ホール', rect(273, 0, 400, 182))],
        stairs: [{ ...lStair({ steps2: 3, corner: 'landing' }), polygon: stairOutline(lStair()) }],
      },
      { coordUnits: 'svg' }
    )
    const stair = normalizeFloorPlan(plan).floors[0].stairs[0]
    expect(stair.layout).toBe('l-right')
    expect(stair.polygon).toHaveLength(6)
    expect(stair.steps2).toBe(3)
    expect(stair.corner).toBe('landing')
  })
})

describe('階段の塗り色', () => {
  it('色を付けられ、白に戻せる。JSON に保存して読み込んでも残る', () => {
    const plan = makePlan({
      rooms: [makeRoom('ホール', rect(273, 0, 400, 182))],
      stairs: [{ ...lStair({ layout: 'straight', polygon: rect(0, 0, 91, 182) }) }],
    })
    const ref = { floorId: '1f', stairId: 's' }
    const colored = updateStair(plan, ref, { fillColor: '#E8D9C0' })
    expect(colored.floors[0].stairs[0].fillColor).toBe('#E8D9C0')
    expect(normalizeFloorPlan({ ...colored, coordUnits: 'svg' }).floors[0].stairs[0].fillColor).toBe('#E8D9C0')
    expect(updateStair(colored, ref, { fillColor: null }).floors[0].stairs[0].fillColor).toBeUndefined()
    // 色でない値は読み込まない
    const broken = { ...colored, coordUnits: 'svg' as const }
    broken.floors[0].stairs[0] = { ...broken.floors[0].stairs[0], fillColor: 'red; x' }
    expect(normalizeFloorPlan(broken).floors[0].stairs[0].fillColor).toBeUndefined()
  })
})
