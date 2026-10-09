import type { Floor, FloorPlan, Point } from '../types/floorPlan'
import { syncFloorWalls } from './ensureExteriorWalls'

/**
 * 重なった部屋を、重ならないようにする。
 *
 * 部屋の形が隣の部屋の上まではみ出していると、あとから描いた部屋の色・模様が上に来て、
 * 下の部屋に色を付けても見えない。帖数（大きさ）も重なった分だけ多くなる。
 * 大きいほうの部屋から重なった部分を切り取れば、どちらの部屋も正しい形になる（階段と重なったときは部屋を切る）。
 */

const EPS = 0.05
/** これより小さい重なりは扱わない（図面の単位の2乗。5×5 = 50mm 角） */
const MIN_OVERLAP_AREA = 25

function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.filter((v, i) => i === 0 || v - sorted[i - 1] > EPS)
}

/** 縦横の辺だけの多角形の、a と b が重なっている面積 */
export function orthogonalOverlapArea(a: Point[], b: Point[]): number {
  const xs = uniqueSorted([...a, ...b].map((p) => p.x))
  const ys = uniqueSorted([...a, ...b].map((p) => p.y))
  let area = 0
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }
      if (pointInPolygon(c, a) && pointInPolygon(c, b)) area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j])
    }
  }
  return area
}

/** 一直線に並んだ点を取り除く */
function simplify(points: Point[]): Point[] {
  const n = points.length
  const out = points.filter((p, i) => {
    const prev = points[(i - 1 + n) % n]
    const next = points[(i + 1) % n]
    const sameX = Math.abs(prev.x - p.x) < EPS && Math.abs(p.x - next.x) < EPS
    const sameY = Math.abs(prev.y - p.y) < EPS && Math.abs(p.y - next.y) < EPS
    return !sameX && !sameY
  })
  return out.length >= 4 ? out : points
}

/**
 * a から b と重なる部分を取り除いた形（縦横の辺だけの多角形）。
 * 重なりがなければ a のまま。取り除くと2つに分かれる・穴があく（b が a の内側にある）ときは null
 */
export function subtractOrthogonal(a: Point[], b: Point[]): Point[] | null {
  return combineOrthogonal(a, b, 'subtract')
}

/**
 * a と b を合わせた形。重なっていても接しているだけでもよい。離れていて1つの形にならないとき・穴があくときは null
 */
export function unionOrthogonal(a: Point[], b: Point[]): Point[] | null {
  return combineOrthogonal(a, b, 'union')
}

/**
 * 両方の頂点の座標で区切った格子の区画ごとに、残すかどうかを決めて外周をたどる。
 * subtract: a の中で b の外、union: a か b の中
 */
function combineOrthogonal(a: Point[], b: Point[], op: 'subtract' | 'union'): Point[] | null {
  const xs = uniqueSorted([...a, ...b].map((p) => p.x))
  const ys = uniqueSorted([...a, ...b].map((p) => p.y))
  const cols = xs.length - 1
  const rows = ys.length - 1
  const keep: boolean[][] = []
  let removed = false
  for (let i = 0; i < cols; i++) {
    keep.push([])
    for (let j = 0; j < rows; j++) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }
      const inA = pointInPolygon(c, a)
      const inB = pointInPolygon(c, b)
      if (op === 'subtract') {
        if (inA && inB) removed = true
        keep[i].push(inA && !inB)
      } else {
        keep[i].push(inA || inB)
      }
    }
  }
  if (op === 'subtract' && !removed) return a
  const kept = (i: number, j: number) => i >= 0 && j >= 0 && i < cols && j < rows && keep[i][j]

  // 残る部分がひとつながりか（2つに分かれるなら扱わない）
  const cells: Array<[number, number]> = []
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (keep[i][j]) cells.push([i, j])
  if (cells.length === 0) return null
  const seen = new Set<string>([cells[0].join(',')])
  const stack = [cells[0]]
  while (stack.length) {
    const [i, j] = stack.pop()!
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${i + di},${j + dj}`
      if (kept(i + di, j + dj) && !seen.has(key)) {
        seen.add(key)
        stack.push([i + di, j + dj])
      }
    }
  }
  if (seen.size !== cells.length) return null

  // 残る区画の外周を、時計回りの向き付きの辺でたどる（隣も残る辺は内側なので使わない）
  const next = new Map<string, Array<[number, number]>>()
  const addEdge = (from: [number, number], to: [number, number]) => {
    const key = from.join(',')
    next.set(key, [...(next.get(key) ?? []), to])
  }
  let edgeCount = 0
  for (const [i, j] of cells) {
    const sides: Array<[boolean, [number, number], [number, number]]> = [
      [kept(i, j - 1), [i, j], [i + 1, j]],
      [kept(i + 1, j), [i + 1, j], [i + 1, j + 1]],
      [kept(i, j + 1), [i + 1, j + 1], [i, j + 1]],
      [kept(i - 1, j), [i, j + 1], [i, j]],
    ]
    for (const [neighborKept, from, to] of sides) {
      if (neighborKept) continue
      addEdge(from, to)
      edgeCount++
    }
  }
  const start = next.keys().next().value as string
  const loop: Point[] = []
  let current = start
  for (let step = 0; step <= edgeCount; step++) {
    const [i, j] = current.split(',').map(Number)
    loop.push({ x: xs[i], y: ys[j] })
    const outs = next.get(current)
    if (!outs || outs.length === 0) return null
    const to = outs.shift()!
    current = to.join(',')
    if (current === start) break
  }
  // 1周で辺を使い切らなければ、穴がある（b が a の内側にある）
  if (loop.length !== edgeCount) return null
  return simplify(loop)
}

export interface RoomOverlap {
  floorId: string
  /** 形を切り取る部屋 */
  cutRoomId: string
  /** 切り取る形（もう一方の部屋・階段） */
  by: Point[]
}

/** 階の中の、部屋どうし・部屋と階段の重なり。切り取るのは大きいほうの部屋（階段とは部屋のほう） */
export function findRoomOverlaps(floor: Floor): RoomOverlap[] {
  const result: RoomOverlap[] = []
  const area = (poly: Point[]) => {
    let s = 0
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      s += p.x * q.y - q.x * p.y
    }
    return Math.abs(s) / 2
  }
  const rooms = floor.rooms.filter((r) => r.polygon.length >= 4)
  for (let a = 0; a < rooms.length; a++) {
    for (let b = a + 1; b < rooms.length; b++) {
      if (orthogonalOverlapArea(rooms[a].polygon, rooms[b].polygon) < MIN_OVERLAP_AREA) continue
      const [big, small] = area(rooms[a].polygon) >= area(rooms[b].polygon) ? [rooms[a], rooms[b]] : [rooms[b], rooms[a]]
      result.push({ floorId: floor.id, cutRoomId: big.id, by: small.polygon })
    }
    for (const stair of floor.stairs) {
      if (orthogonalOverlapArea(rooms[a].polygon, stair.polygon) < MIN_OVERLAP_AREA) continue
      result.push({ floorId: floor.id, cutRoomId: rooms[a].id, by: stair.polygon })
    }
  }
  return result
}

/**
 * 重なりを切り取れるものはすべて切り取る。切り取ると穴があく・2つに分かれるものはそのまま残す。
 * 切り取った数も返す
 */
export function cutRoomOverlaps(plan: FloorPlan): { plan: FloorPlan; cut: number; skipped: number } {
  let cut = 0
  let skipped = 0
  const floors = plan.floors.map((floor) => {
    let current = floor
    for (const overlap of findRoomOverlaps(floor)) {
      const room = current.rooms.find((r) => r.id === overlap.cutRoomId)
      if (!room) continue
      const polygon = subtractOrthogonal(room.polygon, overlap.by)
      if (!polygon) {
        skipped++
        continue
      }
      if (polygon === room.polygon) continue
      cut++
      current = { ...current, rooms: current.rooms.map((r) => (r.id === room.id ? { ...r, polygon } : r)) }
    }
    return current === floor ? floor : syncFloorWalls(current)
  })
  return { plan: cut > 0 ? { ...plan, floors } : plan, cut, skipped }
}
