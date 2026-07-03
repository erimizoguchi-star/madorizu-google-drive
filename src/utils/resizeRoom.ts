import type { Floor, Point } from '../types/floorPlan'
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

function snap(n: number): number {
  return Math.round(n * 1000) / 1000
}

function movePointOnEdge(
  p: Point,
  edge: RectEdge,
  oldCoord: number,
  newCoord: number,
  seg: AxisAlignedRect
): Point | null {
  const { minX, minY, maxX, maxY } = seg
  switch (edge) {
    case 'east':
      if (isOnVerticalEdge(p, oldCoord, minY, maxY)) return { x: snap(newCoord), y: snap(p.y) }
      break
    case 'west':
      if (isOnVerticalEdge(p, oldCoord, minY, maxY)) return { x: snap(newCoord), y: snap(p.y) }
      break
    case 'south':
      if (isOnHorizontalEdge(p, oldCoord, minX, maxX)) return { x: snap(p.x), y: snap(newCoord) }
      break
    case 'north':
      if (isOnHorizontalEdge(p, oldCoord, minX, maxX)) return { x: snap(p.x), y: snap(newCoord) }
      break
  }
  return null
}

function mapPoint(
  p: Point,
  edge: RectEdge,
  oldCoord: number,
  newCoord: number,
  seg: AxisAlignedRect
): Point {
  return movePointOnEdge(p, edge, oldCoord, newCoord, seg) ?? p
}

function validateRect(rect: AxisAlignedRect): string | null {
  if (rect.maxX - rect.minX < MIN_ROOM_SIZE_SVG - EPS) return '幅が小さすぎます。'
  if (rect.maxY - rect.minY < MIN_ROOM_SIZE_SVG - EPS) return '高さが小さすぎます。'
  return null
}

/**
 * 選択部屋のポリゴンと、その部屋の辺上にある壁・扉・窓・設備を更新する。
 * 隣接部屋のポリゴンは変更しない。
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

  const move = (p: Point) => mapPoint(p, edge, oldCoord, snapped, rect)

  return {
    ...floor,
    rooms: floor.rooms.map((r) =>
      r.id === roomId ? { ...r, polygon: rectToPolygon(nextRect) } : r
    ),
    walls: floor.walls.map((w) => ({ ...w, start: move(w.start), end: move(w.end) })),
    doors: floor.doors.map((d) => ({ ...d, position: move(d.position) })),
    windows: floor.windows.map((w) => ({ ...w, start: move(w.start), end: move(w.end) })),
    fixtures: floor.fixtures.map((f) => ({ ...f, position: move(f.position) })),
    stairs: floor.stairs.map((s) => ({ ...s, polygon: s.polygon.map(move) })),
  }
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
