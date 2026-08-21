import { describe, expect, it } from 'vitest'
import type { FloorPlan, Point, Wall } from '../types/floorPlan'
import { normalizeFloorPlan } from '../utils/floorPlanNormalize'
import fixture from './fixtures/real-plan-flash.json'

/**
 * 実案件の図面（1/50 平面詳細図）を自動切り出し + Flash で解析した
 * 実際の AI 出力を使った回帰テスト。
 * 合成データでは出ない崩れ方（窓の過剰検出・位置ズレなど）に対して、
 * 正規化が最後まで立て直せることを守る。
 */

const EPS = 0.5 // 内部単位（1単位=10mm）

function onWall(point: Point, wall: Wall): boolean {
  const horizontal = Math.abs(wall.end.y - wall.start.y) < EPS
  if (horizontal) {
    const lo = Math.min(wall.start.x, wall.end.x) - EPS
    const hi = Math.max(wall.start.x, wall.end.x) + EPS
    return Math.abs(point.y - wall.start.y) < EPS && point.x >= lo && point.x <= hi
  }
  const lo = Math.min(wall.start.y, wall.end.y) - EPS
  const hi = Math.max(wall.start.y, wall.end.y) + EPS
  return Math.abs(point.x - wall.start.x) < EPS && point.y >= lo && point.y <= hi
}

describe('実図面のAI出力の正規化', () => {
  const out = normalizeFloorPlan(structuredClone(fixture) as FloorPlan)
  const floor = out.floors[0]

  it('建物外形が図面どおり（8190 x 9100mm）', () => {
    const xs = floor.rooms.flatMap((r) => r.polygon.map((p) => p.x))
    const ys = floor.rooms.flatMap((r) => r.polygon.map((p) => p.y))
    // 50mm スナップの丸めで ±1単位（10mm）程度は許容する
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(817)
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(821)
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(908)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(912)
  })

  it('すべての窓が壁の線上に収まる（正規化前は数百mmずれていた）', () => {
    expect(floor.windows.length).toBeGreaterThan(0)
    for (const win of floor.windows) {
      const hosted = floor.walls.some((w) => onWall(win.start, w) && onWall(win.end, w))
      expect(hosted, `窓 ${win.id} が壁に載っていない`).toBe(true)
    }
  })

  it('すべての扉が壁の上にあり、壁の端からはみ出さない', () => {
    expect(floor.doors.length).toBeGreaterThan(0)
    for (const door of floor.doors) {
      const horizontal = door.angle % 180 === 0
      const end = horizontal
        ? { x: door.position.x + door.width, y: door.position.y }
        : { x: door.position.x, y: door.position.y + door.width }
      const hosted = floor.walls.some((w) => onWall(door.position, w) && onWall(end, w))
      expect(hosted, `扉 ${door.id} が壁からはみ出している`).toBe(true)
    }
  })

  it('向きを持つ窓には外向きが自動設定される', () => {
    const directional = floor.windows.filter((w) =>
      ['casement', 'double_casement', 'single_sliding', 'pocket', 'folding'].includes(w.kind ?? 'sliding')
    )
    for (const win of directional) {
      expect(win.outward === 1 || win.outward === -1, `窓 ${win.id} に向きが付いていない`).toBe(
        true
      )
    }
  })
})
