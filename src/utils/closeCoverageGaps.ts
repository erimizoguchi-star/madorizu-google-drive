import type { Floor, Point, Room } from '../types/floorPlan'
import { isAreaJoHiddenByType } from '../constants/roomTypes'
import { syncFloorWalls } from './ensureExteriorWalls'
import { snapPolygonsTogether, unionOrthogonalPolygons } from './mergeRooms'
import { MIN_ROOM_SIZE_SVG, mmToSvgUnits } from './roomGeometry'

const EPS = 0.05
/** これ未満の隙間はスナップで閉じる想定。それ以上の囲まれた空白を廊下として埋める */
const MIN_HOLE_DIM_SVG = MIN_ROOM_SIZE_SVG
const MIN_HOLE_AREA_SVG = mmToSvgUnits(400) * mmToSvgUnits(400)

function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** 直交多角形向け point-in-polygon（偶数奇遇） */
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

function isCovered(point: Point, polygons: Point[][]): boolean {
  return polygons.some((poly) => pointInPolygon(point, poly))
}

function cellPolygon(x0: number, x1: number, y0: number, y1: number): Point[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

/**
 * 建物外周の内側に残った未塗りつぶし領域を検出し、廊下ポリゴンにする。
 * 座標グリッド上で外側から flood fill し、到達できない空白を穴とみなす。
 */
function findEnclosedHolePolygons(polygons: Point[][]): Point[][] {
  if (polygons.length === 0) return []

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
  if (cols < 1 || rows < 1) return []

  const covered: boolean[][] = Array.from({ length: cols }, () => Array(rows).fill(false))
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const w = sortedX[i + 1] - sortedX[i]
      const h = sortedY[j + 1] - sortedY[j]
      if (w < EPS || h < EPS) {
        covered[i][j] = true
        continue
      }
      const cx = (sortedX[i] + sortedX[i + 1]) / 2
      const cy = (sortedY[j] + sortedY[j + 1]) / 2
      covered[i][j] = isCovered({ x: cx, y: cy }, polygons)
    }
  }

  const exterior: boolean[][] = Array.from({ length: cols }, () => Array(rows).fill(false))
  const queue: Array<[number, number]> = []

  const tryEnqueue = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return
    if (covered[i][j] || exterior[i][j]) return
    exterior[i][j] = true
    queue.push([i, j])
  }

  for (let i = 0; i < cols; i++) {
    tryEnqueue(i, 0)
    tryEnqueue(i, rows - 1)
  }
  for (let j = 0; j < rows; j++) {
    tryEnqueue(0, j)
    tryEnqueue(cols - 1, j)
  }

  while (queue.length > 0) {
    const [i, j] = queue.shift()!
    tryEnqueue(i - 1, j)
    tryEnqueue(i + 1, j)
    tryEnqueue(i, j - 1)
    tryEnqueue(i, j + 1)
  }

  const visited: boolean[][] = Array.from({ length: cols }, () => Array(rows).fill(false))
  const holes: Point[][] = []

  for (let si = 0; si < cols; si++) {
    for (let sj = 0; sj < rows; sj++) {
      if (covered[si][sj] || exterior[si][sj] || visited[si][sj]) continue

      const cells: Array<[number, number]> = []
      const q: Array<[number, number]> = [[si, sj]]
      visited[si][sj] = true

      while (q.length > 0) {
        const [i, j] = q.shift()!
        cells.push([i, j])
        for (const [di, dj] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const ni = i + di
          const nj = j + dj
          if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue
          if (covered[ni][nj] || exterior[ni][nj] || visited[ni][nj]) continue
          visited[ni][nj] = true
          q.push([ni, nj])
        }
      }

      const cellPolys = cells.map(([i, j]) =>
        cellPolygon(sortedX[i], sortedX[i + 1], sortedY[j], sortedY[j + 1])
      )
      const union = unionOrthogonalPolygons(cellPolys)
      if (!union || union.polygon.length < 3) continue

      const xsHole = union.polygon.map((p) => p.x)
      const ysHole = union.polygon.map((p) => p.y)
      const width = Math.max(...xsHole) - Math.min(...xsHole)
      const height = Math.max(...ysHole) - Math.min(...ysHole)
      if (width < MIN_HOLE_DIM_SVG || height < MIN_HOLE_DIM_SVG) continue
      if (width * height < MIN_HOLE_AREA_SVG) continue

      holes.push(union.polygon)
    }
  }

  return holes
}

function buildHallwayRoom(polygon: Point[], index: number): Room {
  const type = 'hallway' as const
  return {
    id: `auto-hallway-${index}`,
    name: '廊下',
    type,
    polygon,
    ...(isAreaJoHiddenByType(type) ? { showAreaJo: false as const } : {}),
  }
}

/**
 * 部屋・階段の隙間を閉じる。
 * 1) 部屋同士の近接辺をスナップ（階段は 910mm 幅を保つため動かさない）
 * 2) 建物内に残る囲まれた空白（階段縮小でできた隙間など）を廊下として追加する
 */
export function closeCoverageGaps(floor: Floor): Floor {
  if (floor.rooms.length === 0) return floor

  // 階段ポリゴンは触らない（幅制約を維持）。部屋同士だけ寄せる。
  const snappedRooms = snapPolygonsTogether(floor.rooms.map((r) => r.polygon))
  let rooms = floor.rooms.map((room, i) => ({
    ...room,
    polygon: snappedRooms[i] ?? room.polygon,
  }))
  const stairs = floor.stairs

  const coveragePolys = [
    ...rooms.map((r) => r.polygon),
    ...stairs.map((s) => s.polygon),
  ]
  const holes = findEnclosedHolePolygons(coveragePolys)
  if (holes.length > 0) {
    const startIndex = rooms.length
    rooms = [
      ...rooms,
      ...holes.map((polygon, i) => buildHallwayRoom(polygon, startIndex + i)),
    ]
  }

  return syncFloorWalls({
    ...floor,
    rooms,
    stairs,
  })
}
