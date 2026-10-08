import type { Floor, HiddenWall, Point, Room, Stair, Wall } from '../types/floorPlan'

type Segment = { x1: number; y1: number; x2: number; y2: number }
type OrthoSeg = { horizontal: boolean; fixed: number; start: number; end: number }

const EPS = 0.05
const MIN_SEGMENT = 0.5

function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000
}

function polygonToEdges(polygon: Point[]): Segment[] {
  const edges: Segment[] = []
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    const x1 = roundCoord(polygon[i].x)
    const y1 = roundCoord(polygon[i].y)
    const x2 = roundCoord(polygon[j].x)
    const y2 = roundCoord(polygon[j].y)
    if (x1 === x2 && y1 === y2) continue
    edges.push({ x1, y1, x2, y2 })
  }
  return edges
}

function toOrthoSeg(seg: Segment): OrthoSeg | null {
  if (Math.abs(seg.y1 - seg.y2) < EPS) {
    return {
      horizontal: true,
      fixed: roundCoord(seg.y1),
      start: Math.min(seg.x1, seg.x2),
      end: Math.max(seg.x1, seg.x2),
    }
  }
  if (Math.abs(seg.x1 - seg.x2) < EPS) {
    return {
      horizontal: false,
      fixed: roundCoord(seg.x1),
      start: Math.min(seg.y1, seg.y2),
      end: Math.max(seg.y1, seg.y2),
    }
  }
  return null
}

function overlapLength(a1: number, a2: number, b1: number, b2: number): number {
  const lo = Math.max(Math.min(a1, a2), Math.min(b1, b2))
  const hi = Math.min(Math.max(a1, a2), Math.max(b1, b2))
  return Math.max(0, hi - lo)
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return []
  const sorted = intervals
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number])
    .sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    if (sorted[i][0] <= last[1] + EPS) {
      last[1] = Math.max(last[1], sorted[i][1])
    } else {
      merged.push(sorted[i])
    }
  }
  return merged
}

function mergeCollinearSegments(segments: Segment[]): Segment[] {
  const hGroups = new Map<number, Array<[number, number]>>()
  const vGroups = new Map<number, Array<[number, number]>>()

  for (const seg of segments) {
    const ortho = toOrthoSeg(seg)
    if (!ortho) continue
    const groups = ortho.horizontal ? hGroups : vGroups
    const list = groups.get(ortho.fixed) ?? []
    list.push([ortho.start, ortho.end])
    groups.set(ortho.fixed, list)
  }

  const result: Segment[] = []
  for (const [y, intervals] of hGroups) {
    for (const [x1, x2] of mergeIntervals(intervals)) {
      if (x2 - x1 >= MIN_SEGMENT) {
        result.push({ x1, y1: y, x2, y2: y })
      }
    }
  }
  for (const [x, intervals] of vGroups) {
    for (const [y1, y2] of mergeIntervals(intervals)) {
      if (y2 - y1 >= MIN_SEGMENT) {
        result.push({ x1: x, y1, x2: x, y2 })
      }
    }
  }
  return result
}

/** 部屋・階段のポリゴンから、外周（1つの部屋・階段にしか接していない部分）を抽出する */
function collectExteriorBoundarySegments(rooms: Room[], stairs: Stair[]): Segment[] {
  return collectEdgePieces(rooms, stairs)
    .filter((entry) => entry.count === 1)
    .map((entry) => entry.seg)
}

function segmentLength(seg: Segment): number {
  const ortho = toOrthoSeg(seg)
  if (!ortho) return 0
  return ortho.end - ortho.start
}

function wallCoversSegment(wall: Wall, seg: Segment): boolean {
  const ws = toOrthoSeg({
    x1: wall.start.x,
    y1: wall.start.y,
    x2: wall.end.x,
    y2: wall.end.y,
  })
  const ss = toOrthoSeg(seg)
  if (!ws || !ss || ws.horizontal !== ss.horizontal) return false
  if (Math.abs(ws.fixed - ss.fixed) > EPS) return false
  const segLen = ss.end - ss.start
  if (segLen < MIN_SEGMENT) return true
  return overlapLength(ws.start, ws.end, ss.start, ss.end) >= segLen - EPS
}

/** 手で直した壁が、この辺と同じ線上でこれだけ重なっていれば、その辺は手で直した壁に任せる */
const MANAGED_OVERLAP = 10
/** 同じ線上とみなす座標の差（線合わせなどで 0.1 単位の丸めが入るため、少し幅を持たせる） */
const SAME_LINE_EPS = 0.6

/**
 * 手で直した壁（端をドラッグした・手で足した壁）が、この辺と同じ線上に重なっているか。
 * 重なっていれば、その辺の壁は自動で作らない。作ると、手で短くした壁の横に元の長さの壁が重なって
 * 「壁が増える」うえ、短くしたことも取り消されてしまう。
 */
export function isManagedByManualWall(walls: Wall[], seg: Segment): boolean {
  const ss = toOrthoSeg(seg)
  if (!ss) return false
  const segLen = ss.end - ss.start
  return walls.some((wall) => {
    if (!wall.manual) return false
    const ws = toOrthoSeg({ x1: wall.start.x, y1: wall.start.y, x2: wall.end.x, y2: wall.end.y })
    if (!ws || ws.horizontal !== ss.horizontal || Math.abs(ws.fixed - ss.fixed) > SAME_LINE_EPS) return false
    const overlap = overlapLength(ws.start, ws.end, ss.start, ss.end)
    return overlap >= Math.min(MANAGED_OVERLAP, segLen * 0.5)
  })
}

function segmentToInteriorWall(seg: Segment, id: string): Wall {
  return {
    id,
    start: { x: seg.x1, y: seg.y1 },
    end: { x: seg.x2, y: seg.y2 },
    exterior: false,
  }
}

type EdgeEntry = { seg: Segment; count: number; owners: string[] }

/**
 * 部屋・階段の辺を、同じ線上で「どの部屋・階段に接しているか」が変わる点で区切って数える。
 *
 * 辺をそのまま（端点の組で）数えると、LD の1辺に洋室と洗面所の2部屋が接しているような、
 * 端がそろわない境目は「1つの部屋にしか接していない辺」＝外壁とみなされ、部屋と部屋の間に太い外壁が描かれていた。
 * 線ごとに区切りを集めて小さな区間に分け、区間ごとに接している部屋・階段を数える。
 * 同じ組の部屋に接する区間が続くときは1本にまとめる（部屋の境目ごとに内壁1本）。
 */
function collectEdgePieces(rooms: Room[], stairs: Stair[]): EdgeEntry[] {
  const shapes = [
    ...rooms.map((r) => ({ id: r.id, polygon: r.polygon })),
    ...stairs.map((s) => ({ id: s.id, polygon: s.polygon })),
  ]
  const lines = new Map<string, { horizontal: boolean; fixed: number; spans: Array<{ start: number; end: number; owner: string }> }>()
  for (const shape of shapes) {
    for (const edge of polygonToEdges(shape.polygon)) {
      const o = toOrthoSeg(edge)
      if (!o) continue
      const key = `${o.horizontal ? 'h' : 'v'}:${o.fixed}`
      const line = lines.get(key) ?? { horizontal: o.horizontal, fixed: o.fixed, spans: [] }
      line.spans.push({ start: o.start, end: o.end, owner: shape.id })
      lines.set(key, line)
    }
  }

  const pieces: EdgeEntry[] = []
  for (const line of lines.values()) {
    const cuts = [...new Set(line.spans.flatMap((sp) => [sp.start, sp.end]))].sort((a, b) => a - b)
    let current: { start: number; end: number; owners: string[] } | null = null
    const flush = () => {
      if (!current) return
      const seg = line.horizontal
        ? { x1: current.start, y1: line.fixed, x2: current.end, y2: line.fixed }
        : { x1: line.fixed, y1: current.start, x2: line.fixed, y2: current.end }
      pieces.push({ seg, count: current.owners.length, owners: current.owners })
      current = null
    }
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i]
      const b = cuts[i + 1]
      if (b - a < EPS) continue
      const owners = [
        ...new Set(line.spans.filter((sp) => sp.start <= a + EPS && sp.end >= b - EPS).map((sp) => sp.owner)),
      ].sort()
      if (owners.length === 0) {
        flush()
        continue
      }
      if (current && Math.abs(current.end - a) < EPS && current.owners.join('|') === owners.join('|')) {
        current.end = b
      } else {
        flush()
        current = { start: a, end: b, owners }
      }
    }
    flush()
  }
  return pieces
}

/** 内壁を「接する2部屋の組」で表すキー（並び順に依存しない） */
export function wallPairKey(owners: string[]): string {
  return [...owners].sort().join('|')
}

/**
 * 部屋・階段の境目ごとに内壁を1本ずつ生成する（部屋をまたぐ長い線は結合しない）。
 * 2つ以上の部屋・階段に接している区間が内壁（3つ以上は部屋が重なっているとき）。
 */
function collectInteriorWallEntries(rooms: Room[], stairs: Stair[]): EdgeEntry[] {
  return collectEdgePieces(rooms, stairs)
    .filter((entry) => entry.count >= 2)
    .filter((entry) => segmentLength(entry.seg) >= MIN_SEGMENT)
}

/** 壁がどの部屋どうしの境界かを求める（削除を覚えておくために使う） */
export function findWallPairKey(floor: Floor, wall: Wall): string | null {
  for (const entry of collectInteriorWallEntries(floor.rooms, floor.stairs)) {
    if (wallCoversSegment(wall, entry.seg)) return wallPairKey(entry.owners)
  }
  return null
}

function isHiddenPair(hidden: HiddenWall[] | undefined, pair: string): boolean {
  return !!hidden?.some((h) => h.pair === pair)
}

function isHiddenSegment(hidden: HiddenWall[] | undefined, seg: Segment): boolean {
  return !!hidden?.some((h) => {
    if (!h.start || !h.end) return false
    return wallCoversSegment({ id: 'hidden', start: h.start, end: h.end }, seg)
  })
}

function collectInteriorWalls(
  rooms: Room[],
  stairs: Stair[],
  hidden?: HiddenWall[],
  manualWalls: Wall[] = []
): Wall[] {
  let counter = 0
  const nextId = () => `w-int-${counter++}`
  return collectInteriorWallEntries(rooms, stairs)
    .filter((entry) => !isHiddenPair(hidden, wallPairKey(entry.owners)))
    .filter((entry) => !isHiddenSegment(hidden, entry.seg))
    .filter((entry) => !isManagedByManualWall(manualWalls, entry.seg))
    .map((entry) => segmentToInteriorWall(entry.seg, nextId()))
}

function segmentToWall(seg: Segment, id: string): Wall {
  return {
    id,
    start: { x: seg.x1, y: seg.y1 },
    end: { x: seg.x2, y: seg.y2 },
    exterior: true,
  }
}

/**
 * 部屋・階段の外形から外壁を補完し、建物輪郭が途切れないようにする。
 */
export function ensureExteriorWalls(floor: Floor): Floor {
  if (floor.rooms.length === 0) return floor

  const boundary = mergeCollinearSegments(
    collectExteriorBoundarySegments(floor.rooms, floor.stairs)
  )
  if (boundary.length === 0) return floor

  const walls = floor.walls.map((wall) => {
    if (boundary.some((seg) => wallCoversSegment(wall, seg))) {
      return { ...wall, exterior: true }
    }
    return wall
  })

  let counter = 0
  const nextId = () => `w-ext-${Date.now()}-${counter++}`

  for (const seg of boundary) {
    if (segmentLength(seg) < MIN_SEGMENT) continue
    // ユーザーが消した外壁は復活させない
    if (isHiddenSegment(floor.hiddenWalls, seg)) continue
    // 手で直した壁がある辺は、その壁に任せる（元の長さの壁を重ねて作らない）
    if (isManagedByManualWall(walls, seg)) continue
    const covered = walls.some((wall) => wallCoversSegment(wall, seg))
    if (!covered) {
      walls.push(segmentToWall(seg, nextId()))
    }
  }

  return { ...floor, walls }
}

/**
 * 部屋ポリゴンから内壁・外壁を同期する。
 * 内壁は部屋（階段）の辺ごとに分割し、隣接部屋をまたぐ1本の長い線にはしない。
 */
export function syncFloorWalls(floor: Floor): Floor {
  if (floor.rooms.length === 0) return floor
  // 手動で追加・調整した壁は作り直さずそのまま残す
  const manualWalls = floor.walls.filter((wall) => wall.manual)
  const interiorWalls = collectInteriorWalls(floor.rooms, floor.stairs, floor.hiddenWalls, manualWalls)
  return ensureExteriorWalls({ ...floor, walls: [...interiorWalls, ...manualWalls] })
}
