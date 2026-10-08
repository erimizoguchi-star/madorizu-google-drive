import type { Floor, FloorPlan, Point } from '../types/floorPlan'
import { collectGridLines, moveGridLine, type GridAxis } from './gridLines'

/**
 * 数 cm だけずれた壁を見つけて、1本の線にそろえる。
 *
 * 部屋の辺を1つずつ動かしたり、幅・奥行きを数字で打ったりすると、隣の部屋との間に
 * 数 cm のすき間や重なりができる。すると、それぞれの部屋の辺に壁ができ、2本の線が並んで太い壁に見える。
 * 同じように、並んだ部屋の外側の辺が数 cm ずれると、外壁に小さな段差ができる。
 * どちらも、ずれた2本の通り（同じ線上に並ぶ辺）を1本にまとめれば直る。
 */

/** これ以下のずれを「そろえ忘れ」とみなす（図面の単位。10 = 100mm） */
export const MISALIGN_MAX = 10
/** すき間・重なりとして知らせる、向かい合う辺の重なりの長さ（200mm） */
const MIN_FACING = 20
const EPS = 0.05

export type MisalignKind = 'gap' | 'overlap' | 'step'

export interface WallMisalignment {
  axis: GridAxis
  /** ずれている2本の通りの座標 */
  a: number
  b: number
  kind: MisalignKind
  /** ずれの大きさ（図面の単位） */
  distance: number
  /** 関わる部屋・階段の id（1つ目を選ぶと場所が分かる） */
  shapeIds: [string, string]
}

interface Edge {
  shapeId: string
  axis: GridAxis
  value: number
  start: number
  end: number
  /** 部屋の内側が、座標の大きい側にあるか */
  insidePositive: boolean
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

function collectEdges(floor: Floor): Edge[] {
  const shapes = [
    ...floor.rooms.map((r) => ({ id: r.id, polygon: r.polygon })),
    ...floor.stairs.map((s) => ({ id: s.id, polygon: s.polygon })),
  ]
  const edges: Edge[] = []
  for (const shape of shapes) {
    const poly = shape.polygon
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const vertical = Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) >= EPS
      const horizontal = Math.abs(p.y - q.y) < EPS && Math.abs(p.x - q.x) >= EPS
      if (!vertical && !horizontal) continue
      const axis: GridAxis = vertical ? 'x' : 'y'
      const value = vertical ? p.x : p.y
      const start = vertical ? Math.min(p.y, q.y) : Math.min(p.x, q.x)
      const end = vertical ? Math.max(p.y, q.y) : Math.max(p.x, q.x)
      const mid = (start + end) / 2
      // 辺のすぐ外（座標の大きい側）が部屋の内側か
      const probe = vertical ? { x: value + 0.25, y: mid } : { x: mid, y: value + 0.25 }
      edges.push({ shapeId: shape.id, axis, value, start, end, insidePositive: pointInPolygon(probe, poly) })
    }
  }
  return edges
}

/** 1つの階で、数 cm ずれた壁を探す（同じ2本の通りの組は1つにまとめる） */
export function findWallMisalignments(floor: Floor, maxDistance = MISALIGN_MAX): WallMisalignment[] {
  const edges = collectEdges(floor)
  const found = new Map<string, WallMisalignment>()
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i]
      const f = edges[j]
      if (e.shapeId === f.shapeId || e.axis !== f.axis) continue
      const distance = Math.abs(e.value - f.value)
      if (distance < 0.5 || distance > maxDistance) continue
      const overlap = Math.min(e.end, f.end) - Math.max(e.start, f.start)

      let kind: MisalignKind | null = null
      if (e.insidePositive !== f.insidePositive) {
        // 向かい合う辺（隣どうしの部屋の境目）。内側が大きい側にある辺のほうが大きい座標ならすき間
        if (overlap >= MIN_FACING) {
          const pos = e.insidePositive ? e : f
          const neg = e.insidePositive ? f : e
          kind = pos.value > neg.value ? 'gap' : 'overlap'
        }
      } else if (overlap <= 1 && overlap >= -1) {
        // 同じ側を向いた辺が端と端で続いている（並んだ部屋の外側の辺の段差）
        kind = 'step'
      }
      if (!kind) continue

      const a = Math.min(e.value, f.value)
      const b = Math.max(e.value, f.value)
      const key = `${e.axis}:${a}:${b}`
      if (!found.has(key)) {
        found.set(key, { axis: e.axis, a, b, kind, distance, shapeIds: [e.shapeId, f.shapeId] })
      }
    }
  }
  return [...found.values()]
}

/** 通りの長さ（その線上にある辺の長さの合計）。長いほうへそろえる */
function lineLength(floor: Floor, axis: GridAxis, value: number): number {
  const line = collectGridLines(floor).find((l) => l.axis === axis && Math.abs(l.value - value) < 0.5)
  return line ? line.spans.reduce((sum, [s, e]) => sum + (e - s), 0) : 0
}

/**
 * ずれた2本の通りを1本にする。長いほうの通り（ほかの部屋もそろっている線）に、短いほうを合わせる。
 * 線に接する部屋・階段・扉・窓は一緒に動く（「線を合わせる」と同じ動き）。
 */
export function alignMisalignment(floor: Floor, m: WallMisalignment): Floor {
  const keepA = lineLength(floor, m.axis, m.a) >= lineLength(floor, m.axis, m.b)
  const from = keepA ? m.b : m.a
  const to = keepA ? m.a : m.b
  return moveGridLine(floor, m.axis, from, to)
}

/** 階の中の、数 cm ずれた壁をすべてそろえる */
export function alignFloorWalls(floor: Floor): Floor {
  let current = floor
  // そろえるたびに通りが1本減るので必ず終わるが、念のため回数に上限を設ける
  for (let i = 0; i < 100; i++) {
    const next = findWallMisalignments(current)
      .map((m) => alignMisalignment(current, m))
      .find((f) => f !== current)
    if (!next) break
    current = next
  }
  return current
}

export function alignPlanWalls(plan: FloorPlan, floorId?: string): FloorPlan {
  return {
    ...plan,
    floors: plan.floors.map((floor) => (floorId && floor.id !== floorId ? floor : alignFloorWalls(floor))),
  }
}

/** ドラッグ中に、ほかの部屋の辺へ吸い付く距離の上限（図面の単位。15 = 150mm） */
export const EDGE_SNAP_MAX = 15

/** ほかの部屋・階段の、縦の辺（axis 'x'）または横の辺（axis 'y'）の座標 */
export function otherEdgeValues(floor: Floor, axis: GridAxis, excludeId: string): number[] {
  return collectEdges(floor)
    .filter((e) => e.axis === axis && e.shapeId !== excludeId)
    .map((e) => e.value)
}

/** value をいちばん近い候補へ吸い付かせる。tolerance より遠ければそのまま */
export function snapToNearest(value: number, candidates: number[], tolerance: number): number {
  let best: number | null = null
  for (const c of candidates) {
    if (Math.abs(c - value) <= tolerance && (best == null || Math.abs(c - value) < Math.abs(best - value))) best = c
  }
  return best ?? value
}

/**
 * 部屋をドラッグで動かすとき、部屋の辺がほかの部屋の辺の近くに来たら、ぴったり重なるよう少しずらす。
 * 縦と横は別々に、いちばん近い組で合わせる。
 */
export function snapPolygonToEdges(polygon: Point[], floor: Floor, excludeId: string, tolerance: number): Point[] {
  const shift = (axis: GridAxis) => {
    const own = [...new Set(polygon.map((p) => (axis === 'x' ? p.x : p.y)))]
    const others = otherEdgeValues(floor, axis, excludeId)
    let best: number | null = null
    for (const v of own) {
      const snapped = snapToNearest(v, others, tolerance)
      const d = snapped - v
      if (snapped !== v && (best == null || Math.abs(d) < Math.abs(best))) best = d
    }
    return best ?? 0
  }
  const dx = shift('x')
  const dy = shift('y')
  if (dx === 0 && dy === 0) return polygon
  return polygon.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}
