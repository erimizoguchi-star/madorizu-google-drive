import { describe, expect, it } from 'vitest'
import type { Fixture } from '../types/floorPlan'
import { normalizeFloorPlan } from '../utils/floorPlanNormalize'
import { makePlan, makeRoom, rect } from './helpers'

/**
 * AI 出力（mm 座標・形式ゆれあり）の受け口を守るテスト。
 * ここが壊れると「設備が消える」「扉が壁からはみ出す」が再発する。
 * 入力座標はすべて mm（3000 超の座標を含むため mm と判定される）。
 */

const mmRoom = () => makeRoom('r1', rect(0, 0, 9000, 7000))

describe('設備の形式ゆれ', () => {
  it('position の代わりに x/y、height の代わりに depth でも受け付ける（旧: 全破棄されていた）', () => {
    const plan = makePlan({
      rooms: [mmRoom()],
      fixtures: [
        // Gemini が実際に返した形式
        { id: 'f1', type: 'bathtub', x: 1000, y: 1000, width: 1400, depth: 700 } as unknown as Fixture,
      ],
    })
    const out = normalizeFloorPlan(plan)
    expect(out.floors[0].fixtures).toHaveLength(1)
    expect(out.floors[0].fixtures[0]).toMatchObject({
      position: { x: 100, y: 100 },
      width: 140,
      height: 70,
    })
  })

  it('位置情報がまったくない設備は破棄する', () => {
    const plan = makePlan({
      rooms: [mmRoom()],
      fixtures: [{ id: 'f1', type: 'sink', width: 500, height: 400 } as unknown as Fixture],
    })
    const out = normalizeFloorPlan(plan)
    expect(out.floors[0].fixtures).toHaveLength(0)
  })

  it('不明な設備タイプは sink に落とす', () => {
    const plan = makePlan({
      rooms: [mmRoom()],
      fixtures: [
        { id: 'f1', type: 'jacuzzi', position: { x: 1000, y: 1000 }, width: 500, height: 400 } as unknown as Fixture,
      ],
    })
    const out = normalizeFloorPlan(plan)
    expect(out.floors[0].fixtures[0].type).toBe('sink')
  })
})

describe('扉を壁に合わせる補正（fitDoorsToWalls）', () => {
  it('水平な壁の扉に angle 90 が来ても 0 に直す（旧: 戸が壁を突き抜けた）', () => {
    const plan = makePlan({
      rooms: [mmRoom()],
      doors: [{ id: 'd1', position: { x: 900, y: 7000 }, width: 800, angle: 90, swing: 1 }],
    })
    const out = normalizeFloorPlan(plan)
    expect(out.floors[0].doors[0].angle).toBe(0)
    expect(out.floors[0].doors[0].position.y).toBe(700)
  })

  it('壁の端からはみ出す扉は、逆向きに反転して壁内に収める', () => {
    // 上辺の壁は x 0〜900（内部単位）。x=880 から幅 80 では 960 まで伸びてはみ出す
    const plan = makePlan({
      rooms: [mmRoom()],
      doors: [{ id: 'd1', position: { x: 8800, y: 0 }, width: 800, angle: 0, swing: 1 }],
    })
    const out = normalizeFloorPlan(plan)
    const door = out.floors[0].doors[0]
    expect(door.position.x).toBe(800)
    expect(door.position.x + door.width).toBeLessThanOrEqual(900)
  })
})

describe('窓を壁に載せ替える補正（fitWindowsToWalls）', () => {
  it('壁から浮いた窓（実測130mm相当のズレ）を壁の線上に載せる', () => {
    const plan = makePlan({
      rooms: [mmRoom()],
      // 上辺の壁 y=0 に対し、y=130 に浮いている
      windows: [{ id: 'w1', start: { x: 1000, y: 130 }, end: { x: 2000, y: 130 }, kind: 'sliding' }],
    })
    const out = normalizeFloorPlan(plan)
    const w = out.floors[0].windows[0]
    expect(w.start.y).toBe(0)
    expect(w.end.y).toBe(0)
    // 長さは保たれる（1000mm = 100単位）
    expect(Math.abs(w.end.x - w.start.x)).toBeCloseTo(100, 5)
  })

  it('壁の端からはみ出す窓は、長さを保ったまま壁内に収める', () => {
    const plan = makePlan({
      rooms: [mmRoom()],
      // 上辺の壁は x 0〜9000。8500〜9500 では 500mm はみ出す
      windows: [{ id: 'w1', start: { x: 8500, y: 0 }, end: { x: 9500, y: 0 }, kind: 'sliding' }],
    })
    const out = normalizeFloorPlan(plan)
    const w = out.floors[0].windows[0]
    expect(Math.max(w.start.x, w.end.x)).toBeLessThanOrEqual(900)
    expect(Math.abs(w.end.x - w.start.x)).toBeCloseTo(100, 5)
  })

  it('壁より長い窓は壁の長さまで詰める', () => {
    const plan = makePlan({
      rooms: [
        makeRoom('r1', rect(0, 0, 2000, 7000)),
        makeRoom('r2', rect(2000, 0, 9000, 7000)),
      ],
      // r1 の上辺（幅2000mm）に 3000mm の窓
      windows: [{ id: 'w1', start: { x: -500, y: 0 }, end: { x: 2500, y: 0 }, kind: 'sliding' }],
    })
    const out = normalizeFloorPlan(plan)
    const w = out.floors[0].windows[0]
    expect(Math.abs(w.end.x - w.start.x)).toBeLessThanOrEqual(900)
  })

  it('start/end の並び順を保つ（開く向き outward の基準を壊さない）', () => {
    const plan = makePlan({
      rooms: [mmRoom()],
      // end → start の順（x が減る向き）で浮いている窓
      windows: [
        { id: 'w1', start: { x: 2000, y: 130 }, end: { x: 1000, y: 130 }, kind: 'awning', outward: -1 },
      ],
    })
    const out = normalizeFloorPlan(plan)
    const w = out.floors[0].windows[0]
    expect(w.start.x).toBeGreaterThan(w.end.x) // 並び順そのまま
    expect(w.outward).toBe(-1) // 手動設定も保持
  })

  it('壁から大きく離れた窓（600mm超）は動かさない', () => {
    const plan = makePlan({
      rooms: [mmRoom()],
      windows: [{ id: 'w1', start: { x: 1000, y: 1500 }, end: { x: 2000, y: 1500 }, kind: 'sliding' }],
    })
    const out = normalizeFloorPlan(plan)
    expect(out.floors[0].windows[0].start.y).toBe(150)
  })
})

describe('窓の開く向きの自動判定（orientWindowsOutward）', () => {
  it('すべり出し窓は建物の外側を向く（上辺と下辺で逆向きになる）', () => {
    const plan = makePlan({
      rooms: [mmRoom()],
      windows: [
        { id: 'w-top', start: { x: 1000, y: 0 }, end: { x: 2000, y: 0 }, kind: 'awning' },
        { id: 'w-bottom', start: { x: 1000, y: 7000 }, end: { x: 2000, y: 7000 }, kind: 'awning' },
      ],
    })
    const out = normalizeFloorPlan(plan)
    const top = out.floors[0].windows.find((w) => w.id === 'w-top')
    const bottom = out.floors[0].windows.find((w) => w.id === 'w-bottom')
    expect(top?.outward).toBe(-1)
    expect(bottom?.outward).toBe(1)
  })

  it('向きを持たない引き違い窓には outward を付けない', () => {
    const plan = makePlan({
      rooms: [mmRoom()],
      windows: [{ id: 'w1', start: { x: 1000, y: 0 }, end: { x: 2000, y: 0 }, kind: 'sliding' }],
    })
    const out = normalizeFloorPlan(plan)
    expect(out.floors[0].windows[0].outward).toBeUndefined()
  })
})

describe('部屋の正規化', () => {
  it('不明な部屋タイプは other に落とす', () => {
    const plan = makePlan({
      rooms: [makeRoom('r1', rect(0, 0, 9000, 7000), { type: 'garage' as never })],
    })
    const out = normalizeFloorPlan(plan)
    expect(out.floors[0].rooms[0].type).toBe('other')
  })

  it('部屋が1つもなければエラーを投げる', () => {
    expect(() => normalizeFloorPlan(makePlan({ rooms: [] }))).toThrow(/部屋データ/)
  })

  it('mm 座標は 50mm 刻みにスナップされる', () => {
    const plan = makePlan({
      rooms: [makeRoom('r1', rect(0, 0, 9070, 7020))],
    })
    const out = normalizeFloorPlan(plan)
    // 9070 → 9050mm → 905単位, 7020 → 7000mm → 700単位
    const polygon = out.floors[0].rooms[0].polygon
    const xs = polygon.map((p) => p.x)
    const ys = polygon.map((p) => p.y)
    expect(Math.max(...xs)).toBe(905)
    expect(Math.max(...ys)).toBe(700)
  })
})
