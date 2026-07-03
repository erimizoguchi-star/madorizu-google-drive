import type { FloorPlan, Point, Room, Wall } from '../types/floorPlan'

type Segment = { x1: number; y1: number; x2: number; y2: number }

const PRECISION = 1000

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

function polygonsShareEdge(a: Point[], b: Point[]): boolean {
  const keysA = new Set(polygonToEdges(a).map(segmentKey))
  return polygonToEdges(b).some((e) => keysA.has(segmentKey(e)))
}

function arePolygonsConnected(polygons: Point[][]): boolean {
  if (polygons.length <= 1) return polygons.length === 1
  const n = polygons.length
  const visited = new Set<number>([0])
  const queue = [0]
  while (queue.length > 0) {
    const u = queue.shift()!
    for (let v = 0; v < n; v++) {
      if (!visited.has(v) && polygonsShareEdge(polygons[u], polygons[v])) {
        visited.add(v)
        queue.push(v)
      }
    }
  }
  return visited.size === n
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

function traceBoundaryPolygon(boundaryEdges: Segment[]): Point[] | null {
  if (boundaryEdges.length < 3) return null

  const points = new Map<string, Point>()
  const adj = new Map<string, string[]>()

  for (const e of boundaryEdges) {
    const k1 = pointKey(e.x1, e.y1)
    const k2 = pointKey(e.x2, e.y2)
    points.set(k1, { x: e.x1, y: e.y1 })
    points.set(k2, { x: e.x2, y: e.y2 })
    adj.set(k1, [...(adj.get(k1) ?? []), k2])
    adj.set(k2, [...(adj.get(k2) ?? []), k1])
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

export function unionOrthogonalPolygons(polygons: Point[][]): {
  polygon: Point[]
  internalEdgeKeys: Set<string>
} | null {
  const edgeCount = new Map<string, { seg: Segment; count: number }>()

  for (const poly of polygons) {
    for (const edge of polygonToEdges(poly)) {
      const key = segmentKey(edge)
      const existing = edgeCount.get(key)
      if (existing) existing.count++
      else edgeCount.set(key, { seg: edge, count: 1 })
    }
  }

  const boundaryEdges: Segment[] = []
  const internalEdgeKeys = new Set<string>()

  for (const [key, entry] of edgeCount) {
    if (entry.count === 1) boundaryEdges.push(entry.seg)
    else if (entry.count >= 2) internalEdgeKeys.add(key)
  }

  const polygon = traceBoundaryPolygon(boundaryEdges)
  if (!polygon) return null
  return { polygon, internalEdgeKeys }
}

function wallMatchesKey(wall: Wall, key: string): boolean {
  return segmentKey({ x1: wall.start.x, y1: wall.start.y, x2: wall.end.x, y2: wall.end.y }) === key
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
  const merged: Room = {
    ...primary,
    polygon,
    name: [primary, ...others].map((r) => r.name).join('・'),
  }

  const totalJo = sumAreaJo([primary, ...others])
  if (totalJo !== undefined) merged.areaJo = totalJo
  else delete merged.areaJo

  return merged
}

export function mergeRooms(
  floorPlan: FloorPlan,
  floorId: string,
  roomIds: string[],
  primaryRoomId?: string
): { floorPlan: FloorPlan; mergedRoomId: string } | { error: string } {
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

  const polygons = rooms.map((r) => r.polygon)
  if (!arePolygonsConnected(polygons)) {
    return { error: '隣り合った部屋のみ合成できます。離れた部屋が含まれています。' }
  }

  const union = unionOrthogonalPolygons(polygons)
  if (!union) {
    return { error: '部屋の形状を合成できませんでした。' }
  }

  const primaryId = primaryRoomId && uniqueIds.includes(primaryRoomId) ? primaryRoomId : uniqueIds[0]
  const primary = rooms.find((r) => r.id === primaryId)!
  const others = rooms.filter((r) => r.id !== primaryId)
  const mergedRoom = buildMergedRoom(primary, others, union.polygon)
  const removeIds = new Set(others.map((r) => r.id))

  const walls = floor.walls.filter((wall) => {
    for (const key of union.internalEdgeKeys) {
      if (wallMatchesKey(wall, key)) return false
    }
    return true
  })

  const nextFloor = {
    ...floor,
    walls,
    rooms: floor.rooms.filter((r) => !removeIds.has(r.id)).map((r) => (r.id === primaryId ? mergedRoom : r)),
  }

  const floors = floorPlan.floors.map((f, i) => (i === floorIndex ? nextFloor : f))
  return { floorPlan: { ...floorPlan, floors }, mergedRoomId: primaryId }
}
