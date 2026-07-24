import type { Door, Fixture, Floor, Point, Stair, Wall, Window } from '../types/floorPlan'
import { syncFloorWalls } from './ensureExteriorWalls'
import {
  isOnHorizontalEdge,
  isOnVerticalEdge,
  MIN_ROOM_SIZE_SVG,
  mmToSvgUnits,
  parseAxisAlignedRect,
  rectToPolygon,
  snapSvgToMmGrid,
  type AxisAlignedRect,
  type RectEdge,
} from './roomGeometry'

const EPS = 0.05
const MIN_SEGMENT_SVG = 0.5

function snap(n: number): number {
  return Math.round(n * 1000) / 1000
}

function validateRect(rect: AxisAlignedRect): string | null {
  if (rect.maxX - rect.minX < MIN_ROOM_SIZE_SVG - EPS) return '幅が小さすぎます。'
  if (rect.maxY - rect.minY < MIN_ROOM_SIZE_SVG - EPS) return '高さが小さすぎます。'
  return null
}

type EdgeMove = {
  edge: RectEdge
  horizontal: boolean
  oldCoord: number
  newCoord: number
  spanLo: number
  spanHi: number
}

function buildEdgeMove(
  edge: RectEdge,
  rect: AxisAlignedRect,
  oldCoord: number,
  newCoord: number
): EdgeMove {
  const horizontal = edge === 'north' || edge === 'south'
  return {
    edge,
    horizontal,
    oldCoord,
    newCoord,
    spanLo: horizontal ? rect.minX : rect.minY,
    spanHi: horizontal ? rect.maxX : rect.maxY,
  }
}

function overlap1D(a1: number, a2: number, b1: number, b2: number): { lo: number; hi: number } | null {
  const lo = Math.max(Math.min(a1, a2), Math.min(b1, b2))
  const hi = Math.min(Math.max(a1, a2), Math.max(b1, b2))
  if (hi - lo < EPS) return null
  return { lo: snap(lo), hi: snap(hi) }
}

function isHorizontalWall(wall: Wall): boolean {
  return Math.abs(wall.start.y - wall.end.y) < EPS
}

function isVerticalWall(wall: Wall): boolean {
  return Math.abs(wall.start.x - wall.end.x) < EPS
}

function isPointOnMovingEdge(p: Point, move: EdgeMove): boolean {
  if (move.horizontal) {
    return isOnHorizontalEdge(p, move.oldCoord, move.spanLo, move.spanHi)
  }
  return isOnVerticalEdge(p, move.oldCoord, move.spanLo, move.spanHi)
}

function movePointIfOnEdge(p: Point, move: EdgeMove): Point {
  if (!isPointOnMovingEdge(p, move)) return p
  if (move.horizontal) return { x: snap(p.x), y: snap(move.newCoord) }
  return { x: snap(move.newCoord), y: snap(p.y) }
}

function splitAndMoveWall(wall: Wall, move: EdgeMove, nextId: () => string): Wall[] {
  if (move.horizontal) {
    if (!isHorizontalWall(wall)) return [wall]
    const y = snap(wall.start.y)
    if (Math.abs(y - move.oldCoord) > EPS) return [wall]

    const wx1 = Math.min(wall.start.x, wall.end.x)
    const wx2 = Math.max(wall.start.x, wall.end.x)
    const overlap = overlap1D(wx1, wx2, move.spanLo, move.spanHi)
    if (!overlap) return [wall]

    const result: Wall[] = []
    if (overlap.lo - wx1 >= MIN_SEGMENT_SVG) {
      result.push({
        ...wall,
        id: nextId(),
        start: { x: wx1, y },
        end: { x: overlap.lo, y },
      })
    }
    if (overlap.hi - overlap.lo >= MIN_SEGMENT_SVG) {
      result.push({
        ...wall,
        id: nextId(),
        start: { x: overlap.lo, y: move.newCoord },
        end: { x: overlap.hi, y: move.newCoord },
      })
    }
    if (wx2 - overlap.hi >= MIN_SEGMENT_SVG) {
      result.push({
        ...wall,
        id: nextId(),
        start: { x: overlap.hi, y },
        end: { x: wx2, y },
      })
    }
    return result.length > 0 ? result : [wall]
  }

  if (!isVerticalWall(wall)) return [wall]
  const x = snap(wall.start.x)
  if (Math.abs(x - move.oldCoord) > EPS) return [wall]

  const wy1 = Math.min(wall.start.y, wall.end.y)
  const wy2 = Math.max(wall.start.y, wall.end.y)
  const overlap = overlap1D(wy1, wy2, move.spanLo, move.spanHi)
  if (!overlap) return [wall]

  const result: Wall[] = []
  if (overlap.lo - wy1 >= MIN_SEGMENT_SVG) {
    result.push({
      ...wall,
      id: nextId(),
      start: { x, y: wy1 },
      end: { x, y: overlap.lo },
    })
  }
  if (overlap.hi - overlap.lo >= MIN_SEGMENT_SVG) {
    result.push({
      ...wall,
      id: nextId(),
      start: { x: move.newCoord, y: overlap.lo },
      end: { x: move.newCoord, y: overlap.hi },
    })
  }
  if (wy2 - overlap.hi >= MIN_SEGMENT_SVG) {
    result.push({
      ...wall,
      id: nextId(),
      start: { x, y: overlap.hi },
      end: { x, y: wy2 },
    })
  }
  return result.length > 0 ? result : [wall]
}

function adjustPerpendicularWallEndpoints(walls: Wall[], move: EdgeMove): Wall[] {
  return walls.map((wall) => {
    let start = wall.start
    let end = wall.end

    if (move.horizontal) {
      if (!isVerticalWall(wall)) return wall
      const x = snap(wall.start.x)
      if (x < move.spanLo - EPS || x > move.spanHi + EPS) return wall
      start = movePointIfOnEdge(start, move)
      end = movePointIfOnEdge(end, move)
    } else {
      if (!isHorizontalWall(wall)) return wall
      const y = snap(wall.start.y)
      if (y < move.spanLo - EPS || y > move.spanHi + EPS) return wall
      start = movePointIfOnEdge(start, move)
      end = movePointIfOnEdge(end, move)
    }

    if (start === wall.start && end === wall.end) return wall
    return { ...wall, start, end }
  })
}

function adjustWallsForEdge(walls: Wall[], move: EdgeMove): Wall[] {
  let counter = 0
  const nextId = () => `w-resize-${Date.now()}-${counter++}`
  const split = walls.flatMap((wall) => splitAndMoveWall(wall, move, nextId))
  return adjustPerpendicularWallEndpoints(split, move)
}

function adjustDoorsForEdge(doors: Door[], move: EdgeMove): Door[] {
  return doors.map((door) => ({
    ...door,
    position: movePointIfOnEdge(door.position, move),
  }))
}

function adjustWindowsForEdge(windows: Window[], move: EdgeMove): Window[] {
  return windows.map((win) => ({
    ...win,
    start: movePointIfOnEdge(win.start, move),
    end: movePointIfOnEdge(win.end, move),
  }))
}

function adjustFixturesForEdge(fixtures: Fixture[], move: EdgeMove): Fixture[] {
  return fixtures.map((fixture) => ({
    ...fixture,
    position: movePointIfOnEdge(fixture.position, move),
  }))
}

function adjustStairsForEdge(stairs: Stair[], move: EdgeMove): Stair[] {
  return stairs.map((stair) => ({
    ...stair,
    polygon: stair.polygon.map((p) => movePointIfOnEdge(p, move)),
  }))
}

/**
 * 選択部屋のポリゴンと、その部屋の辺に重なる壁区間のみ直交に移動する。
 * 長い共有壁は部屋の範囲で分割し、斜めにならないようにする。
 */
export function resizeRoomEdgeOnFloor(
  floor: Floor,
  roomId: string,
  edge: RectEdge,
  newCoordSvg: number,
  options?: { snap?: boolean }
): Floor | { error: string } {
  const room = floor.rooms.find((r) => r.id === roomId)
  if (!room) return { error: '部屋が見つかりません。' }

  const rect = parseAxisAlignedRect(room.polygon)
  if (!rect) return { error: '矩形の部屋のみサイズ調整できます。' }

  const snapped = options?.snap !== false ? snapSvgToMmGrid(newCoordSvg) : snap(newCoordSvg)
  const oldCoord =
    edge === 'east' ? rect.maxX : edge === 'west' ? rect.minX : edge === 'south' ? rect.maxY : rect.minY

  const nextRect: AxisAlignedRect = { ...rect }
  if (edge === 'east') nextRect.maxX = snapped
  else if (edge === 'west') nextRect.minX = snapped
  else if (edge === 'south') nextRect.maxY = snapped
  else nextRect.minY = snapped

  const validation = validateRect(nextRect)
  if (validation) return { error: validation }

  if (Math.abs(snapped - oldCoord) < EPS) return floor

  const move = buildEdgeMove(edge, rect, oldCoord, snapped)

  return syncFloorWalls({
    ...floor,
    rooms: floor.rooms.map((r) =>
      r.id === roomId ? { ...r, polygon: rectToPolygon(nextRect) } : r
    ),
    walls: adjustWallsForEdge(floor.walls, move),
    doors: adjustDoorsForEdge(floor.doors, move),
    windows: adjustWindowsForEdge(floor.windows, move),
    fixtures: adjustFixturesForEdge(floor.fixtures, move),
    stairs: adjustStairsForEdge(floor.stairs, move),
  })
}

export function resizeRoomDimensionsOnFloor(
  floor: Floor,
  roomId: string,
  size: { widthMm?: number; heightMm?: number }
): Floor | { error: string } {
  const room = floor.rooms.find((r) => r.id === roomId)
  if (!room) return { error: '部屋が見つかりません。' }

  const rect = parseAxisAlignedRect(room.polygon)
  if (!rect) return { error: '矩形の部屋のみサイズ調整できます。' }

  let next = floor
  let currentRect = rect

  if (size.widthMm != null) {
    const newMaxX = currentRect.minX + mmToSvgUnits(size.widthMm)
    const result = resizeRoomEdgeOnFloor(next, roomId, 'east', newMaxX, { snap: false })
    if ('error' in result) return result
    next = result
    const updated = next.rooms.find((r) => r.id === roomId)
    const parsed = updated ? parseAxisAlignedRect(updated.polygon) : null
    if (!parsed) return { error: '部屋の形状を更新できませんでした。' }
    currentRect = parsed
  }

  if (size.heightMm != null) {
    const newMaxY = currentRect.minY + mmToSvgUnits(size.heightMm)
    const result = resizeRoomEdgeOnFloor(next, roomId, 'south', newMaxY, { snap: false })
    if ('error' in result) return result
    next = result
  }

  return next
}
