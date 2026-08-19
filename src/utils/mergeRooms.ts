import type { FloorPlan, Point, Room, Wall } from '../types/floorPlan'
import { polygonArea } from '../renderer/styles'
import { syncFloorWalls } from './ensureExteriorWalls'
import { mmToSvgUnits } from './roomGeometry'
type Segment = { x1: number; y1: number; x2: number; y2: number }
type OrthoSeg = { horizontal: boolean; fixed: number; start: number; end: number }

const PRECISION = 1000
const EPS = 0.05
/** 隣接とみなす最大の隙間（内壁＋わずかなズレ） */
const ADJACENCY_TOLERANCE_SVG = mmToSvgUnits(300)
/** 辺が隣接しているとみなす最小の重なり長さ */
const MIN_EDGE_OVERLAP_SVG = mmToSvgUnits(200)

function roundCoord(n: number): number {
  return Math.round(n * PRECISION) / PRECISION
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
      fixed: seg.y1,
      start: Math.min(seg.x1, seg.x2),
      end: Math.max(seg.x1, seg.x2),
    }
  }
  if (Math.abs(seg.x1 - seg.x2) < EPS) {
    return {
      horizontal: false,
      fixed: seg.x1,
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

function segmentsShareExact(a: Segment, b: Segment): boolean {
  return segmentKey(a) === segmentKey(b)
}

function segmentsAreAdjacent(a: Segment, b: Segment, tolerance: number): boolean {
  if (segmentsShareExact(a, b)) return true

  const sa = toOrthoSeg(a)
  const sb = toOrthoSeg(b)
  if (!sa || !sb || sa.horizontal !== sb.horizontal) return false
  if (Math.abs(sa.fixed - sb.fixed) > tolerance) return false

  return overlapLength(sa.start, sa.end, sb.start, sb.end) >= MIN_EDGE_OVERLAP_SVG - EPS
}

function polygonsShareOrAdjacentEdge(a: Point[], b: Point[]): boolean {
  const edgesA = polygonToEdges(a)
  const edgesB = polygonToEdges(b)
  return edgesA.some((ea) => edgesB.some((eb) => segmentsAreAdjacent(ea, eb, ADJACENCY_TOLERANCE_SVG)))
}

/** 内壁が2部屋の間にあるか（ポリゴン辺との近接で判定。L字など非矩形も可） */
function wallSeparatesRooms(wall: Wall, roomA: Room, roomB: Room): boolean {
  if (wall.exterior) return false

  const ws = toOrthoSeg({
    x1: wall.start.x,
    y1: wall.start.y,
    x2: wall.end.x,
    y2: wall.end.y,
  })
  if (!ws) return false

  return polygonHasEdgeNearWall(roomA.polygon, ws) && polygonHasEdgeNearWall(roomB.polygon, ws)
}

function polygonHasEdgeNearWall(polygon: Point[], ws: OrthoSeg): boolean {
  for (const edge of polygonToEdges(polygon)) {
    const o = toOrthoSeg(edge)
    if (!o || o.horizontal !== ws.horizontal) continue
    if (Math.abs(o.fixed - ws.fixed) > ADJACENCY_TOLERANCE_SVG) continue
    if (overlapLength(o.start, o.end, ws.start, ws.end) >= MIN_EDGE_OVERLAP_SVG - EPS) return true
  }
  return false
}

function roomsAreNeighbors(roomA: Room, roomB: Room, walls: Wall[]): boolean {
  if (polygonsShareOrAdjacentEdge(roomA.polygon, roomB.polygon)) return true
  return walls.some((w) => !w.exterior && wallSeparatesRooms(w, roomA, roomB))
}

function areRoomsConnected(rooms: Room[], walls: Wall[]): boolean {
  if (rooms.length <= 1) return rooms.length === 1
  const n = rooms.length
  const visited = new Set<number>([0])
  const queue = [0]
  while (queue.length > 0) {
    const u = queue.shift()!
    for (let v = 0; v < n; v++) {
      if (!visited.has(v) && roomsAreNeighbors(rooms[u], rooms[v], walls)) {
        visited.add(v)
        queue.push(v)
      }
    }
  }
  return visited.size === n
}

function pointNearWall(p: Point, ws: OrthoSeg): boolean {
  if (ws.horizontal) {
    if (Math.abs(p.y - ws.fixed) > ADJACENCY_TOLERANCE_SVG) return false
    return p.x >= Math.min(ws.start, ws.end) - EPS && p.x <= Math.max(ws.start, ws.end) + EPS
  }
  if (Math.abs(p.x - ws.fixed) > ADJACENCY_TOLERANCE_SVG) return false
  return p.y >= Math.min(ws.start, ws.end) - EPS && p.y <= Math.max(ws.start, ws.end) + EPS
}

function snapPointToWall(p: Point, ws: OrthoSeg): Point {
  if (ws.horizontal) return { x: p.x, y: roundCoord(ws.fixed) }
  return { x: roundCoord(ws.fixed), y: p.y }
}

function snapPolygonToWall(polygon: Point[], wall: Wall): Point[] {
  const ws = toOrthoSeg({
    x1: wall.start.x,
    y1: wall.start.y,
    x2: wall.end.x,
    y2: wall.end.y,
  })
  if (!ws) return polygon
  return polygon.map((p) => (pointNearWall(p, ws) ? snapPointToWall(p, ws) : p))
}

function preparePolygonsForUnion(rooms: Room[], walls: Wall[]): Point[][] {
  let polys = rooms.map((r) => r.polygon.map((p) => ({ ...p })))

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      for (const wall of walls) {
        if (wall.exterior || !wallSeparatesRooms(wall, rooms[i], rooms[j])) continue
        polys[i] = snapPolygonToWall(polys[i], wall)
        polys[j] = snapPolygonToWall(polys[j], wall)
      }
    }
  }

  polys = snapPolygonsTogether(polys)
  return polys.map((poly) => simplifyOrthoPolygon(poly))
}

function snapVertexToEdge(p: Point, seg: OrthoSeg, newFixed: number): Point {
  if (seg.horizontal) {
    if (Math.abs(p.y - seg.fixed) < EPS && p.x >= seg.start - EPS && p.x <= seg.end + EPS) {
      return { x: p.x, y: roundCoord(newFixed) }
    }
  } else if (Math.abs(p.x - seg.fixed) < EPS && p.y >= seg.start - EPS && p.y <= seg.end + EPS) {
    return { x: roundCoord(newFixed), y: p.y }
  }
  return p
}

export function snapPolygonsTogether(polygons: Point[][]): Point[][] {
  const polys = polygons.map((poly) => poly.map((p) => ({ ...p })))

  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      const edgesA = polygonToEdges(polys[i])
      const edgesB = polygonToEdges(polys[j])

      for (const ea of edgesA) {
        for (const eb of edgesB) {
          const oa = toOrthoSeg(ea)
          const ob = toOrthoSeg(eb)
          if (!oa || !ob || oa.horizontal !== ob.horizontal) continue
          if (!segmentsAreAdjacent(ea, eb, ADJACENCY_TOLERANCE_SVG)) continue
          if (Math.abs(oa.fixed - ob.fixed) < EPS) continue

          const mergedFixed = roundCoord((oa.fixed + ob.fixed) / 2)
          polys[i] = polys[i].map((p) => snapVertexToEdge(p, oa, mergedFixed))
          polys[j] = polys[j].map((p) => snapVertexToEdge(p, ob, mergedFixed))
        }
      }
    }
  }

  return polys.map((poly) => simplifyOrthoPolygon(poly))
}

function simplifyOrthoPolygon(points: Point[]): Point[] {
  if (points.length < 4) return points
  const result: Point[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const curr = points[i]
    const next = points[(i + 1) % n]
    const colinear =
      (prev.x === curr.x && curr.x === next.x) || (prev.y === curr.y && curr.y === next.y)
    if (!colinear) result.push(curr)
  }
  return result.length >= 3 ? result : points
}

function mergeCollinearBoundarySegments(edges: Segment[]): Segment[] {
  const buckets = new Map<string, { horizontal: boolean; fixed: number; intervals: Array<{ start: number; end: number }> }>()

  for (const edge of edges) {
    const o = toOrthoSeg(edge)
    if (!o) continue
    const key = o.horizontal ? `h:${roundCoord(o.fixed)}` : `v:${roundCoord(o.fixed)}`
    const bucket = buckets.get(key) ?? { horizontal: o.horizontal, fixed: o.fixed, intervals: [] }
    bucket.intervals.push({ start: Math.min(o.start, o.end), end: Math.max(o.start, o.end) })
    buckets.set(key, bucket)
  }

  const merged: Segment[] = []
  for (const bucket of buckets.values()) {
    const sorted = bucket.intervals.sort((a, b) => a.start - b.start)
    const combined: Array<{ start: number; end: number }> = []
    for (const iv of sorted) {
      const last = combined[combined.length - 1]
      if (!last || iv.start > last.end + EPS) combined.push({ ...iv })
      else last.end = Math.max(last.end, iv.end)
    }
    for (const iv of combined) {
      if (iv.end - iv.start < EPS) continue
      if (bucket.horizontal) {
        merged.push({ x1: iv.start, y1: bucket.fixed, x2: iv.end, y2: bucket.fixed })
      } else {
        merged.push({ x1: bucket.fixed, y1: iv.start, x2: bucket.fixed, y2: iv.end })
      }
    }
  }
  return merged
}

function traceBoundaryPolygon(boundaryEdges: Segment[]): Point[] | null {
  const mergedEdges = mergeCollinearBoundarySegments(boundaryEdges)
  if (mergedEdges.length < 3) return null

  const points = new Map<string, Point>()
  const adj = new Map<string, string[]>()

  const link = (a: string, b: string) => {
    const listA = adj.get(a) ?? []
    if (!listA.includes(b)) listA.push(b)
    adj.set(a, listA)
  }

  for (const e of mergedEdges) {
    const k1 = pointKey(e.x1, e.y1)
    const k2 = pointKey(e.x2, e.y2)
    points.set(k1, { x: e.x1, y: e.y1 })
    points.set(k2, { x: e.x2, y: e.y2 })
    link(k1, k2)
    link(k2, k1)
  }

  for (const [, neighbors] of adj) {
    if (neighbors.length !== 2) return null
  }

  const start = adj.keys().next().value as string
  const result: Point[] = []
  let current = start
  let prev: string | null = null

  do {
    result.push(points.get(current)!)
    const next = adj.get(current)!.find((n) => n !== prev)
    if (!next) return null
    prev = current
    current = next
  } while (current !== start && result.length <= boundaryEdges.length + 1)

  if (result.length < 3) return null
  return simplifyOrthoPolygon(result)
}

function intervalContains(outerStart: number, outerEnd: number, innerStart: number, innerEnd: number): boolean {
  const lo = Math.min(outerStart, outerEnd)
  const hi = Math.max(outerStart, outerEnd)
  const ilo = Math.min(innerStart, innerEnd)
  const ihi = Math.max(innerStart, innerEnd)
  return ilo >= lo - EPS && ihi <= hi + EPS
}

function polygonHasEdgeCovering(
  polygon: Point[],
  horizontal: boolean,
  fixed: number,
  start: number,
  end: number
): boolean {
  for (const edge of polygonToEdges(polygon)) {
    const o = toOrthoSeg(edge)
    if (!o || o.horizontal !== horizontal) continue
    if (Math.abs(o.fixed - fixed) > EPS) continue
    if (intervalContains(o.start, o.end, start, end)) return true
  }
  return false
}

function atomicSegmentsOnLine(
  polygons: Point[][],
  horizontal: boolean,
  fixed: number,
  intervals: OrthoSeg[]
): Segment[] {
  const boundaries = new Set<number>()
  for (const interval of intervals) {
    boundaries.add(roundCoord(interval.start))
    boundaries.add(roundCoord(interval.end))
  }

  const sorted = [...boundaries].sort((a, b) => a - b)
  const result: Segment[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (end - start < EPS) continue

    let coverage = 0
    for (const poly of polygons) {
      if (polygonHasEdgeCovering(poly, horizontal, fixed, start, end)) coverage++
    }

    if (coverage === 0) continue

    if (horizontal) {
      result.push({ x1: start, y1: fixed, x2: end, y2: fixed })
    } else {
      result.push({ x1: fixed, y1: start, x2: fixed, y2: end })
    }
  }

  return result
}

function collectAtomicSegments(polygons: Point[][]): Array<{ seg: Segment; coverage: number }> {
  const verticalByX = new Map<number, OrthoSeg[]>()
  const horizontalByY = new Map<number, OrthoSeg[]>()

  for (const poly of polygons) {
    for (const edge of polygonToEdges(poly)) {
      const o = toOrthoSeg(edge)
      if (!o) continue
      const key = roundCoord(o.fixed)
      if (o.horizontal) {
        const list = horizontalByY.get(key) ?? []
        list.push(o)
        horizontalByY.set(key, list)
      } else {
        const list = verticalByX.get(key) ?? []
        list.push(o)
        verticalByX.set(key, list)
      }
    }
  }

  const atomic: Array<{ seg: Segment; coverage: number }> = []

  for (const [x, intervals] of verticalByX) {
    for (const seg of atomicSegmentsOnLine(polygons, false, x, intervals)) {
      let coverage = 0
      const o = toOrthoSeg(seg)!
      for (const poly of polygons) {
        if (polygonHasEdgeCovering(poly, false, x, o.start, o.end)) coverage++
      }
      atomic.push({ seg, coverage })
    }
  }

  for (const [y, intervals] of horizontalByY) {
    for (const seg of atomicSegmentsOnLine(polygons, true, y, intervals)) {
      let coverage = 0
      const o = toOrthoSeg(seg)!
      for (const poly of polygons) {
        if (polygonHasEdgeCovering(poly, true, y, o.start, o.end)) coverage++
      }
      atomic.push({ seg, coverage })
    }
  }

  return atomic
}

export function unionOrthogonalPolygons(polygons: Point[][]): {
  polygon: Point[]
  internalEdgeKeys: Set<string>
} | null {
  const byEdges = unionOrthogonalPolygonsByEdges(polygons)
  if (byEdges) return byEdges
  return unionOrthogonalPolygonsByCoverage(polygons)
}

/** 辺の完全一致／原子分割による合成（矩形同士の共有辺向き） */
function unionOrthogonalPolygonsByEdges(polygons: Point[][]): {
  polygon: Point[]
  internalEdgeKeys: Set<string>
} | null {
  const atomic = collectAtomicSegments(polygons)
  const boundaryEdges: Segment[] = []
  const internalEdgeKeys = new Set<string>()

  for (const { seg, coverage } of atomic) {
    const key = segmentKey(seg)
    if (coverage >= 2) internalEdgeKeys.add(key)
    else if (coverage === 1) boundaryEdges.push(seg)
  }

  const polygon = traceBoundaryPolygon(boundaryEdges)
  if (!polygon) return null
  return { polygon, internalEdgeKeys }
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function cellRectPolygon(x0: number, x1: number, y0: number, y1: number): Point[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

/**
 * 格子被覆による直交多角形の合成。
 * L字・U字・T字など頂点数が4を超える部屋や、辺が途中で接するケース向け。
 */
function unionOrthogonalPolygonsByCoverage(polygons: Point[][]): {
  polygon: Point[]
  internalEdgeKeys: Set<string>
} | null {
  if (polygons.length === 0) return null

  const xs = new Set<number>()
  const ys = new Set<number>()
  for (const poly of polygons) {
    for (const p of poly) {
      xs.add(roundCoord(p.x))
      ys.add(roundCoord(p.y))
    }
  }

  const sortedX = [...xs].sort((a, b) => a - b)
  const sortedY = [...ys].sort((a, b) => a - b)
  const cols = sortedX.length - 1
  const rows = sortedY.length - 1
  if (cols < 1 || rows < 1) return null

  const covered: boolean[][] = Array.from({ length: cols }, () => Array(rows).fill(false))
  let coveredCount = 0

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const w = sortedX[i + 1] - sortedX[i]
      const h = sortedY[j + 1] - sortedY[j]
      if (w < EPS || h < EPS) continue
      const cx = (sortedX[i] + sortedX[i + 1]) / 2
      const cy = (sortedY[j] + sortedY[j + 1]) / 2
      if (polygons.some((poly) => pointInPolygon({ x: cx, y: cy }, poly))) {
        covered[i][j] = true
        coveredCount++
      }
    }
  }

  if (coveredCount === 0) return null

  // 被覆セルが1連結でなければ合成不可
  let start: [number, number] | null = null
  outer: for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (covered[i][j]) {
        start = [i, j]
        break outer
      }
    }
  }
  if (!start) return null

  const visited: boolean[][] = Array.from({ length: cols }, () => Array(rows).fill(false))
  const queue: Array<[number, number]> = [start]
  visited[start[0]][start[1]] = true
  let seen = 0
  while (queue.length > 0) {
    const [i, j] = queue.shift()!
    seen++
    for (const [di, dj] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue
      if (!covered[ni][nj] || visited[ni][nj]) continue
      visited[ni][nj] = true
      queue.push([ni, nj])
    }
  }
  if (seen !== coveredCount) return null

  const cellPolys: Point[][] = []
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (!covered[i][j]) continue
      cellPolys.push(cellRectPolygon(sortedX[i], sortedX[i + 1], sortedY[j], sortedY[j + 1]))
    }
  }

  const union = unionOrthogonalPolygonsByEdges(cellPolys)
  if (!union) return null

  // 壁削除用: 元ポリゴン同士の共有辺（原子分割）を内部辺とする
  const originalInternal = new Set<string>()
  const atomic = collectAtomicSegments(polygons)
  for (const { seg, coverage } of atomic) {
    if (coverage >= 2) originalInternal.add(segmentKey(seg))
  }

  return { polygon: union.polygon, internalEdgeKeys: originalInternal }
}

function wallMatchesKey(wall: Wall, key: string): boolean {
  return segmentKey({ x1: wall.start.x, y1: wall.start.y, x2: wall.end.x, y2: wall.end.y }) === key
}

function isWallBetweenRooms(wall: Wall, roomA: Room, roomB: Room): boolean {
  return wallSeparatesRooms(wall, roomA, roomB)
}

function collectWallsToRemove(
  floor: { walls: Wall[] },
  mergingRooms: Room[],
  internalEdgeKeys: Set<string>
): Set<string> {
  const removeIds = new Set<string>()

  for (const wall of floor.walls) {
    if (internalEdgeKeys.size > 0) {
      for (const key of internalEdgeKeys) {
        if (wallMatchesKey(wall, key)) {
          removeIds.add(wall.id)
          break
        }
      }
    }
    if (removeIds.has(wall.id)) continue

    for (let i = 0; i < mergingRooms.length; i++) {
      for (let j = i + 1; j < mergingRooms.length; j++) {
        if (isWallBetweenRooms(wall, mergingRooms[i], mergingRooms[j])) {
          removeIds.add(wall.id)
          break
        }
      }
      if (removeIds.has(wall.id)) break
    }
  }

  return removeIds
}

function sumAreaJo(rooms: Room[]): number | undefined {
  let sum = 0
  let hasManual = false
  for (const room of rooms) {
    if (room.areaJo !== undefined && room.areaJo > 0) {
      sum += room.areaJo
      hasManual = true
    }
  }
  return hasManual ? Math.round(sum * 10) / 10 : undefined
}

function buildMergedRoom(primary: Room, others: Room[], polygon: Point[]): Room {
  const ordered = [primary, ...others].sort(
    (a, b) => polygonArea(b.polygon) - polygonArea(a.polygon)
  )
  const merged: Room = {
    ...primary,
    polygon,
    name: ordered.map((r) => r.name).join('・'),
  }
  delete merged.cornerRadiiMm

  const totalJo = sumAreaJo([primary, ...others])
  if (totalJo !== undefined) merged.areaJo = totalJo
  else delete merged.areaJo

  return merged
}

function pickPrimaryRoom(rooms: Room[]): Room {
  return rooms.reduce((best, room) =>
    polygonArea(room.polygon) > polygonArea(best.polygon) ? room : best
  )
}

export function mergeRooms(
  floorPlan: FloorPlan,
  floorId: string,
  roomIds: string[],
  primaryRoomId?: string
): { floorPlan: FloorPlan; mergedRoomId: string } | { error: string } {
  void primaryRoomId
  const uniqueIds = [...new Set(roomIds)]
  if (uniqueIds.length < 2) {
    return { error: '合成する部屋を2つ以上選択してください。' }
  }

  const floorIndex = floorPlan.floors.findIndex((f) => f.id === floorId)
  if (floorIndex < 0) return { error: '階が見つかりません。' }

  const floor = floorPlan.floors[floorIndex]
  const rooms = uniqueIds
    .map((id) => floor.rooms.find((r) => r.id === id))
    .filter((r): r is Room => r != null)

  if (rooms.length !== uniqueIds.length) {
    return { error: '選択した部屋の一部が見つかりません。' }
  }

  if (!areRoomsConnected(rooms, floor.walls)) {
    return { error: '隣り合った部屋のみ合成できます。離れた部屋が含まれています。' }
  }

  const snappedPolygons = preparePolygonsForUnion(rooms, floor.walls)
  const union = unionOrthogonalPolygons(snappedPolygons)
  if (!union) {
    return { error: '部屋の形状を合成できませんでした。' }
  }

  const primary = pickPrimaryRoom(rooms)
  const primaryId = primary.id
  const others = rooms.filter((r) => r.id !== primaryId)
  const mergedRoom = buildMergedRoom(primary, others, union.polygon)
  const removeIds = new Set(others.map((r) => r.id))
  const wallsToRemove = collectWallsToRemove(floor, rooms, union.internalEdgeKeys)

  const walls = floor.walls.filter((wall) => !wallsToRemove.has(wall.id))

  const nextFloor = syncFloorWalls({
    ...floor,
    walls,
    rooms: floor.rooms.filter((r) => !removeIds.has(r.id)).map((r) => (r.id === primaryId ? mergedRoom : r)),
  })

  const floors = floorPlan.floors.map((f, i) => (i === floorIndex ? nextFloor : f))
  return { floorPlan: { ...floorPlan, floors }, mergedRoomId: primaryId }
}
