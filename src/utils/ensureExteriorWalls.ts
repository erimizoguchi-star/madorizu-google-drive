import type { Floor, Point, Room, Stair, Wall } from '../types/floorPlan'

type Segment = { x1: number; y1: number; x2: number; y2: number }
type OrthoSeg = { horizontal: boolean; fixed: number; start: number; end: number }

const EPS = 0.05
const MIN_SEGMENT = 0.5

function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000
}

function pointKey(x: number, y: number): string {
  return `${roundCoord(x)},${roundCoord(y)}`
}

function segmentKey(seg: Segment): string {
  const a = pointKey(seg.x1, seg.y1)
  const b = pointKey(seg.x2, seg.y2)
  return a < b ? `${a}|${b}` : `${b}|${a}`
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

/** 部屋・階段のポリゴンから、外周（1回だけ現れる辺）を抽出する */
function collectExteriorBoundarySegments(rooms: Room[], stairs: Stair[]): Segment[] {
  const edgeCount = countPolygonEdges(rooms, stairs)
  return [...edgeCount.values()]
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

function segmentToInteriorWall(seg: Segment, id: string): Wall {
  return {
    id,
    start: { x: seg.x1, y: seg.y1 },
    end: { x: seg.x2, y: seg.y2 },
    exterior: false,
  }
}

function countPolygonEdges(rooms: Room[], stairs: Stair[]): Map<string, { seg: Segment; count: number }> {
  const edgeCount = new Map<string, { seg: Segment; count: number }>()
  const polygons = [...rooms.map((r) => r.polygon), ...stairs.map((s) => s.polygon)]

  for (const polygon of polygons) {
    for (const edge of polygonToEdges(polygon)) {
      const key = segmentKey(edge)
      const entry = edgeCount.get(key)
      if (entry) entry.count += 1
      else edgeCount.set(key, { seg: edge, count: 1 })
    }
  }

  return edgeCount
}

/**
 * 部屋・階段の共有辺ごとに内壁を1本ずつ生成する（部屋をまたぐ長い線は結合しない）。
 */
function collectInteriorWallSegments(rooms: Room[], stairs: Stair[]): Segment[] {
  const edgeCount = countPolygonEdges(rooms, stairs)
  return [...edgeCount.values()]
    .filter((entry) => entry.count === 2)
    .map((entry) => entry.seg)
    .filter((seg) => segmentLength(seg) >= MIN_SEGMENT)
}

function collectInteriorWalls(rooms: Room[], stairs: Stair[]): Wall[] {
  let counter = 0
  const nextId = () => `w-int-${counter++}`
  return collectInteriorWallSegments(rooms, stairs).map((seg) => segmentToInteriorWall(seg, nextId()))
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

  let walls = floor.walls.map((wall) => {
    if (boundary.some((seg) => wallCoversSegment(wall, seg))) {
      return { ...wall, exterior: true }
    }
    return wall
  })

  let counter = 0
  const nextId = () => `w-ext-${Date.now()}-${counter++}`

  for (const seg of boundary) {
    if (segmentLength(seg) < MIN_SEGMENT) continue
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
  const interiorWalls = collectInteriorWalls(floor.rooms, floor.stairs)
  return ensureExteriorWalls({ ...floor, walls: interiorWalls })
}
