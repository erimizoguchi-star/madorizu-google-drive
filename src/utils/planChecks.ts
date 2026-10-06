import type { Floor, FloorPlan, Point } from '../types/floorPlan'
import { isAreaJoHiddenByType } from '../constants/roomTypes'
import { mm2ToJo, polygonArea } from '../renderer/styles'
import { doorCenter, findNearestSnapTarget } from './floorPlanAdd'
import type { SelectedElementRef } from './floorPlanEdit'
import { mmToSvgUnits, svgUnitsToMm } from './roomGeometry'

/**
 * AI の解析結果や編集の途中でよく起きる間違いを探す。
 * 一覧から押すとその要素を選べるので、全体を見回して間違いを探す時間を減らせる。
 */
export interface PlanIssue {
  kind: 'door-off-wall' | 'window-off-wall' | 'room-overlap' | 'area-mismatch'
  ref: SelectedElementRef
  message: string
}

/** 扉・窓が壁に乗っているとみなす距離 */
const ON_WALL_MM = 60
/** 重なりとして知らせる最小の面積 */
const OVERLAP_MIN_M2 = 0.2
/** 重なりを調べる間隔（図面の単位。5 = 50mm） */
const SAMPLE_STEP = 5
/** 帖数が合わないとみなす差（割合と帖数の両方を超えたとき） */
const AREA_MISMATCH_RATIO = 0.15
const AREA_MISMATCH_JO = 0.5

function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function offWall(floor: Floor, point: Point): boolean {
  return !findNearestSnapTarget(floor, point, mmToSvgUnits(ON_WALL_MM), { wallsOnly: true })
}

function floorIssues(floor: Floor): PlanIssue[] {
  const issues: PlanIssue[] = []
  const label = (name: string) => `${floor.label}「${name}」`

  floor.doors.forEach((door, i) => {
    if (offWall(floor, doorCenter(door))) {
      issues.push({
        kind: 'door-off-wall',
        ref: { kind: 'door', floorId: floor.id, doorId: door.id },
        message: `${floor.label} 扉 ${i + 1} が壁に乗っていません`,
      })
    }
  })

  floor.windows.forEach((win, i) => {
    const mid = { x: (win.start.x + win.end.x) / 2, y: (win.start.y + win.end.y) / 2 }
    if (offWall(floor, mid)) {
      issues.push({
        kind: 'window-off-wall',
        ref: { kind: 'window', floorId: floor.id, windowId: win.id },
        message: `${floor.label} 窓 ${i + 1} が壁に乗っていません`,
      })
    }
  })

  // 部屋・階段の重なり。直交でない形も扱えるよう、50mm 間隔の点がいくつの部屋に入るかで数える
  const shapes = [
    ...floor.rooms.map((r) => ({ name: r.name, polygon: r.polygon, ref: { kind: 'room' as const, floorId: floor.id, roomId: r.id } })),
    ...floor.stairs.map((s) => ({ name: '階段', polygon: s.polygon, ref: { kind: 'stair' as const, floorId: floor.id, stairId: s.id } })),
  ].filter((s) => s.polygon.length >= 3)
  const boxes = shapes.map((s) => ({
    minX: Math.min(...s.polygon.map((p) => p.x)),
    maxX: Math.max(...s.polygon.map((p) => p.x)),
    minY: Math.min(...s.polygon.map((p) => p.y)),
    maxY: Math.max(...s.polygon.map((p) => p.y)),
  }))
  const cellM2 = (svgUnitsToMm(SAMPLE_STEP) / 1000) ** 2
  for (let a = 0; a < shapes.length; a++) {
    for (let b = a + 1; b < shapes.length; b++) {
      const minX = Math.max(boxes[a].minX, boxes[b].minX)
      const maxX = Math.min(boxes[a].maxX, boxes[b].maxX)
      const minY = Math.max(boxes[a].minY, boxes[b].minY)
      const maxY = Math.min(boxes[a].maxY, boxes[b].maxY)
      if (maxX - minX < SAMPLE_STEP || maxY - minY < SAMPLE_STEP) continue
      let cells = 0
      // 境界線上の点を数えないよう、間隔の半分ずらして調べる
      for (let x = minX + SAMPLE_STEP / 2; x < maxX; x += SAMPLE_STEP) {
        for (let y = minY + SAMPLE_STEP / 2; y < maxY; y += SAMPLE_STEP) {
          const p = { x, y }
          if (pointInPolygon(p, shapes[a].polygon) && pointInPolygon(p, shapes[b].polygon)) cells++
        }
      }
      const m2 = cells * cellM2
      if (m2 >= OVERLAP_MIN_M2) {
        issues.push({
          kind: 'room-overlap',
          ref: shapes[a].ref,
          message: `${label(shapes[a].name)}と「${shapes[b].name}」が重なっています（約 ${m2.toFixed(1)}㎡）`,
        })
      }
    }
  }

  // 図面から読んだ帖数と、部屋の形から計算した帖数の食い違い。部屋の大きさを合わせ直す目安になる
  for (const room of floor.rooms) {
    if (room.areaJo == null || room.areaJo <= 0 || isAreaJoHiddenByType(room.type)) continue
    const shapeJo = mm2ToJo(polygonArea(room.polygon) * svgUnitsToMm(1) ** 2)
    const diff = Math.abs(shapeJo - room.areaJo)
    if (diff > AREA_MISMATCH_JO && diff / room.areaJo > AREA_MISMATCH_RATIO) {
      issues.push({
        kind: 'area-mismatch',
        ref: { kind: 'room', floorId: floor.id, roomId: room.id },
        message: `${label(room.name)}の帖数（${room.areaJo}帖）と大きさ（約 ${shapeJo}帖）が合いません`,
      })
    }
  }

  return issues
}

export function findPlanIssues(plan: FloorPlan): PlanIssue[] {
  return plan.floors.flatMap(floorIssues)
}
