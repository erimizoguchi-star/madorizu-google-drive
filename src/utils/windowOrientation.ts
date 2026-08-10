import type { Floor, Point, Window } from '../types/floorPlan'

/**
 * すべり出し窓・開き窓が開く向き（外側）を決める。
 *
 * 窓は start→end の並び順でしか向きが決まらないため、AI の出力次第で
 * 室内側へ開いた記号になってしまう。窓の両側に点を置き、部屋の中に入って
 * いない方（＝建物の外）を「開く向き」とする。
 */

/** 向きを持つ窓の種類 */
const DIRECTIONAL_KINDS = new Set(['awning', 'casement', 'double_casement'])

export function hasWindowDirection(kind: Window['kind']): boolean {
  return DIRECTIONAL_KINDS.has(kind ?? 'sliding')
}

function isPointInsidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** 窓から法線方向に少し離れた点が、どこかの部屋の中にあるか */
function isInsideBuilding(floor: Floor, probe: Point): boolean {
  return floor.rooms.some((room) => isPointInsidePolygon(probe, room.polygon))
}

/** この窓の外側（1 または -1）。判定できないときは null */
export function detectOutwardSide(floor: Floor, win: Window): 1 | -1 | null {
  const dx = win.end.x - win.start.x
  const dy = win.end.y - win.start.y
  const len = Math.hypot(dx, dy)
  if (len < 0.001) return null

  // 壁の厚み分より少し外に出した位置で判定する
  const probeDistance = Math.max(4, len * 0.25)
  const nx = (-dy / len) * probeDistance
  const ny = (dx / len) * probeDistance
  const midX = (win.start.x + win.end.x) / 2
  const midY = (win.start.y + win.end.y) / 2

  const positiveInside = isInsideBuilding(floor, { x: midX + nx, y: midY + ny })
  const negativeInside = isInsideBuilding(floor, { x: midX - nx, y: midY - ny })

  if (positiveInside === negativeInside) return null // 両側とも室内／両側とも外は判定不能
  return positiveInside ? -1 : 1
}

/** 向きが未設定の窓に、外側を自動でセットする */
export function orientWindowsOutward(floor: Floor): Floor {
  if (floor.windows.length === 0 || floor.rooms.length === 0) return floor

  return {
    ...floor,
    windows: floor.windows.map((win) => {
      if (!hasWindowDirection(win.kind)) return win
      if (win.outward === 1 || win.outward === -1) return win
      const side = detectOutwardSide(floor, win)
      return side ? { ...win, outward: side } : win
    }),
  }
}
