import { describe, expect, it } from 'vitest'
import type { Stair } from '../types/floorPlan'
import {
  getStairLengthMm,
  translateStair,
  withStairLength,
  withStairWidth,
} from '../utils/resizeStair'
import { moveWallEndpointOnFloor, resizeFixtureCorner } from '../utils/floorPlanDrag'
import { mergeRooms } from '../utils/mergeRooms'
import { bbox, makeFloor, makePlan, makeRoom, rect } from './helpers'

/** 編集操作の幾何計算を守るテスト */

const stair = (): Stair => ({
  id: 's1',
  polygon: rect(0, 0, 91, 182),
  direction: 'up',
  orientation: 'up',
  widthMm: 910,
})

describe('階段のサイズ変更', () => {
  it('長さ（上り方向）を mm で取得できる', () => {
    expect(getStairLengthMm(stair())).toBe(1820)
  })

  it('長さを変えると上り始め側（上端）は動かない', () => {
    const out = withStairLength(stair(), 2730)
    const b = bbox(out.polygon)
    expect(b.y1).toBe(0)
    expect(b.y2).toBeCloseTo(273, 5)
    expect(b.x2 - b.x1).toBeCloseTo(91, 5) // 幅は変わらない
  })

  it('幅を変えると中心を保ったまま広がる', () => {
    const out = withStairWidth(stair(), 1200)
    const b = bbox(out.polygon)
    expect(b.x2 - b.x1).toBeCloseTo(120, 5)
    expect((b.x1 + b.x2) / 2).toBeCloseTo(45.5, 5) // 中心固定
  })

  it('平行移動で全頂点が同じ量だけ動く', () => {
    const out = translateStair(stair(), 10, -5)
    const b = bbox(out.polygon)
    expect(b.x1).toBe(10)
    expect(b.y1).toBe(-5)
  })
})

describe('設備の四隅ドラッグ', () => {
  const planWithFixture = () =>
    makePlan({
      rooms: [makeRoom('r1', rect(0, 0, 400, 300))],
      fixtures: [
        { id: 'f1', type: 'bathtub', position: { x: 100, y: 100 }, width: 50, height: 40 },
      ],
    })

  const ref = { floorId: '1f', fixtureId: 'f1' }

  it('右下（se）を外へドラッグすると、左上を固定したまま大きくなる', () => {
    const out = resizeFixtureCorner(planWithFixture(), ref, 'se', { x: 180, y: 170 })
    expect(out.floors[0].fixtures[0]).toMatchObject({
      position: { x: 100, y: 100 },
      width: 80,
      height: 70,
    })
  })

  it('左上（nw）をドラッグすると、右下を固定したまま位置とサイズが変わる', () => {
    const out = resizeFixtureCorner(planWithFixture(), ref, 'nw', { x: 90, y: 90 })
    expect(out.floors[0].fixtures[0]).toMatchObject({
      position: { x: 90, y: 90 },
      width: 60,
      height: 50,
    })
  })

  it('最小サイズ（100mm）より小さくは潰れない', () => {
    const out = resizeFixtureCorner(planWithFixture(), ref, 'se', { x: 101, y: 101 })
    const f = out.floors[0].fixtures[0]
    expect(f.width).toBeGreaterThanOrEqual(10)
    expect(f.height).toBeGreaterThanOrEqual(10)
    expect(f.position).toEqual({ x: 100, y: 100 }) // 固定側は動かない
  })
})

describe('壁の端点ドラッグ', () => {
  it('水平な壁は端点を動かしても水平のまま（y は変わらない）', () => {
    const floor = makeFloor({
      walls: [{ id: 'w1', start: { x: 0, y: 100 }, end: { x: 200, y: 100 }, manual: true }],
    })
    const out = moveWallEndpointOnFloor(floor, 'w1', 'end', { x: 150.3, y: 120 })
    expect(out.walls[0].end).toEqual({ x: 150, y: 100 })
  })
})

describe('部屋の合成', () => {
  it('隣接する2部屋は1つに合成される', () => {
    const plan = makePlan({
      rooms: [makeRoom('r1', rect(0, 0, 400, 300)), makeRoom('r2', rect(400, 0, 800, 300))],
    })
    const result = mergeRooms(plan, '1f', ['r1', 'r2'], 'r1')
    if ('error' in result) throw new Error(result.error)
    const floor = result.floorPlan.floors[0]
    expect(floor.rooms).toHaveLength(1)
    expect(bbox(floor.rooms[0].polygon)).toEqual({ x1: 0, y1: 0, x2: 800, y2: 300 })
  })

  it('離れた2部屋の合成はエラーになる', () => {
    const plan = makePlan({
      rooms: [makeRoom('r1', rect(0, 0, 400, 300)), makeRoom('r2', rect(500, 0, 800, 300))],
    })
    const result = mergeRooms(plan, '1f', ['r1', 'r2'], 'r1')
    expect('error' in result).toBe(true)
  })

  it('L字になる合成（3部屋）も1つの多角形になる', () => {
    const plan = makePlan({
      rooms: [
        makeRoom('a', rect(0, 0, 400, 300)),
        makeRoom('b', rect(400, 0, 800, 300)),
        makeRoom('c', rect(0, 300, 400, 600)),
      ],
    })
    const result = mergeRooms(plan, '1f', ['a', 'b', 'c'], 'a')
    if ('error' in result) throw new Error(result.error)
    const merged = result.floorPlan.floors[0].rooms[0]
    expect(merged.polygon.length).toBeGreaterThanOrEqual(6) // L字は6頂点以上
  })
})
