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
  kind: 'door-off-wall' | 'window-off-wall' | 'room-overlap' | 'area-mismatch' | 'wall-duplicate' | 'wall-stray'
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
/** 同じ線上とみなす差と、重なりとして知らせる長さ（図面の単位。10 = 100mm） */
const WALL_LINE_EPS = 0.6
const WALL_OVERLAP_MIN = 10
/** 部屋の辺に乗っているとみなす距離 */
const WALL_ON_EDGE = 3

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** 縦横の壁を「向き・線の位置・範囲」で表す。斜めの壁は null */
function wallLine(w: { start: Point; end: Point }) {
  if (Math.abs(w.start.y - w.end.y) < WALL_LINE_EPS) {
    return { horizontal: true, fixed: w.start.y, lo: Math.min(w.start.x, w.end.x), hi: Math.max(w.start.x, w.end.x) }
  }
  if (Math.abs(w.start.x - w.end.x) < WALL_LINE_EPS) {
    return { horizontal: false, fixed: w.start.x, lo: Math.min(w.start.y, w.end.y), hi: Math.max(w.start.y, w.end.y) }
  }
  return null
}

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

  // 同じ線上で重なっている壁（手で直した壁と自動の壁が重なって「壁が増えた」状態など）
  const lines = floor.walls.map((w) => ({ wall: w, line: wallLine(w) }))
  for (let a = 0; a < lines.length; a++) {
    for (let b = a + 1; b < lines.length; b++) {
      const la = lines[a].line
      const lb = lines[b].line
      if (!la || !lb || la.horizontal !== lb.horizontal || Math.abs(la.fixed - lb.fixed) > WALL_LINE_EPS) continue
      const overlap = Math.min(la.hi, lb.hi) - Math.max(la.lo, lb.lo)
      if (overlap < WALL_OVERLAP_MIN) continue
      // 消すならたいてい手で直した壁のほうなので、そちらを選ぶ
      const target = lines[b].wall.manual && !lines[a].wall.manual ? lines[b].wall : lines[a].wall
      issues.push({
        kind: 'wall-duplicate',
        ref: { kind: 'wall', floorId: floor.id, wallId: target.id },
        message: `${floor.label} 壁が2本重なっています（約 ${Math.round(svgUnitsToMm(overlap))}mm）`,
      })
    }
  }

  // 部屋の境目にない壁（部屋を動かしたあとに取り残された壁など。意図して足した仕切り壁も出る）
  const edges = [...floor.rooms.map((r) => r.polygon), ...floor.stairs.map((s) => s.polygon)].flatMap((poly) =>
    poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as const)
  )
  for (const wall of floor.walls) {
    // 壁に沿って 50mm ごとに調べ、部屋の辺に乗っている割合が半分未満なら知らせる
    const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
    const steps = Math.max(1, Math.round(len / SAMPLE_STEP))
    let onEdge = 0
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const p = { x: wall.start.x + (wall.end.x - wall.start.x) * t, y: wall.start.y + (wall.end.y - wall.start.y) * t }
      if (edges.some(([a, b]) => distanceToSegment(p, a, b) <= WALL_ON_EDGE)) onEdge++
    }
    if (onEdge / (steps + 1) >= 0.5) continue
    issues.push({
      kind: 'wall-stray',
      ref: { kind: 'wall', floorId: floor.id, wallId: wall.id },
      message: `${floor.label} 部屋の境目にない壁があります（不要なら削除）`,
    })
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
