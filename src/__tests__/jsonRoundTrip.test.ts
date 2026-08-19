import { describe, expect, it } from 'vitest'
import { normalizeFloorPlan } from '../utils/floorPlanNormalize'
import { bbox, makePlan, makeRoom, rect } from './helpers'

/**
 * JSON 保存 → 読み込みの往復で図面が壊れないことを守るテスト。
 *
 * 背景: 座標が mm か内部単位かを数値の大きさで推定しており、閾値が 800 と
 * 低すぎたため、8m を超える建物の JSON を再読込すると mm と誤判定されて
 * 図面が 1/10 に縮むバグがあった（2026-08-06 修正）。
 */
describe('JSON往復: 単位の判定', () => {
  it('coordUnits: svg 付きなら、大きい座標でも縮小されない', () => {
    // 35m 相当（3500単位）。推定なら mm と誤判定される大きさ
    const plan = makePlan(
      { rooms: [makeRoom('r1', rect(0, 0, 3500, 300))] },
      { coordUnits: 'svg' }
    )
    const out = normalizeFloorPlan(plan)
    expect(bbox(out.floors[0].rooms[0].polygon).x2).toBe(3500)
  })

  it('マーカーなしでも 3000 以下なら内部単位として扱う（旧エクスポートの互換）', () => {
    // 9.1m の建物 = 910単位。旧バグではこれが 91 に縮んでいた
    const plan = makePlan({ rooms: [makeRoom('r1', rect(0, 0, 910, 728))] })
    const out = normalizeFloorPlan(plan)
    expect(bbox(out.floors[0].rooms[0].polygon).x2).toBe(910)
  })

  it('マーカーなしで 3000 を超えるなら mm（AI出力）として 1/10 に変換する', () => {
    const plan = makePlan({ rooms: [makeRoom('r1', rect(0, 0, 9100, 7300))] })
    const out = normalizeFloorPlan(plan)
    expect(bbox(out.floors[0].rooms[0].polygon).x2).toBe(910)
  })

  it('coordUnits: mm 付きなら、小さい座標でも mm として変換する', () => {
    const plan = makePlan(
      { rooms: [makeRoom('r1', rect(0, 0, 2000, 1500))] },
      { coordUnits: 'mm' }
    )
    const out = normalizeFloorPlan(plan)
    expect(bbox(out.floors[0].rooms[0].polygon).x2).toBe(200)
  })
})

describe('JSON往復: 編集内容の保持', () => {
  const editedPlan = () =>
    makePlan(
      {
        rooms: [
          makeRoom('r1', rect(0, 0, 400, 300)),
          makeRoom('r2', rect(400, 0, 800, 300)),
        ],
        walls: [
          {
            id: 'manual-1',
            start: { x: 100, y: 100 },
            end: { x: 300, y: 100 },
            manual: true,
          },
        ],
        hiddenWalls: [{ pair: 'r1|r2' }],
        doors: [
          {
            id: 'd1',
            position: { x: 100, y: 0 },
            width: 80,
            angle: 0,
            swing: -1,
            kind: 'double_sliding',
          },
        ],
        windows: [
          { id: 'w1', start: { x: 500, y: 0 }, end: { x: 600, y: 0 }, kind: 'awning', outward: 1 },
        ],
        fixtures: [
          { id: 'f1', type: 'bathtub', position: { x: 50, y: 50 }, width: 140, height: 70, angle: 90 },
        ],
        stairs: [
          {
            id: 's1',
            polygon: rect(700, 0, 791, 182),
            direction: 'up' as const,
            layout: 'turn-right' as const,
            orientation: 'up' as const,
            widthMm: 910,
          },
        ],
      },
      { coordUnits: 'svg' }
    )

  it('手動で追加した壁が残る（自動生成に上書きされない）', () => {
    const out = normalizeFloorPlan(editedPlan())
    const manual = out.floors[0].walls.find((w) => w.id === 'manual-1')
    expect(manual).toBeDefined()
    expect(manual?.manual).toBe(true)
  })

  it('削除した壁の記録（hiddenWalls）が残り、その内壁は再生成されない', () => {
    const out = normalizeFloorPlan(editedPlan())
    expect(out.floors[0].hiddenWalls).toEqual([{ pair: 'r1|r2' }])
    // r1 と r2 の境界（x=400 の縦壁）が生成されていないこと
    const boundary = out.floors[0].walls.find(
      (w) =>
        Math.abs(w.start.x - 400) < 1 &&
        Math.abs(w.end.x - 400) < 1 &&
        !w.exterior
    )
    expect(boundary).toBeUndefined()
  })

  it('窓の開く向き（outward）が上書きされない', () => {
    // 自動判定なら外側（この配置では -1）になるが、手動設定の 1 を尊重する
    const out = normalizeFloorPlan(editedPlan())
    expect(out.floors[0].windows[0].outward).toBe(1)
  })

  it('扉の種類・開き勝手、設備の寸法・回転、階段の形状が保持される', () => {
    const out = normalizeFloorPlan(editedPlan())
    const floor = out.floors[0]
    expect(floor.doors[0].kind).toBe('double_sliding')
    expect(floor.doors[0].swing).toBe(-1)
    expect(floor.fixtures[0]).toMatchObject({ width: 140, height: 70, angle: 90 })
    expect(floor.stairs[0]).toMatchObject({ layout: 'turn-right', orientation: 'up', widthMm: 910 })
  })

  it('2回連続で正規化しても結果が変わらない（冪等性）', () => {
    const once = normalizeFloorPlan(editedPlan())
    const twice = normalizeFloorPlan({ ...once, coordUnits: 'svg' })
    expect(twice.floors[0].rooms.map((r) => bbox(r.polygon))).toEqual(
      once.floors[0].rooms.map((r) => bbox(r.polygon))
    )
    expect(twice.floors[0].walls.length).toBe(once.floors[0].walls.length)
  })
})
