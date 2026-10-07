import type { Floor, Point } from '../types/floorPlan'
import { doorPaintExtentPoints } from './doorPaintBounds'

/**
 * 階の図面（SVG）の描画範囲。FloorCanvas の描画と、階を並べるときの位置合わせで同じ計算を使う。
 * 1単位 = 1px で描くので、ここで求めた値はそのまま画面上の px（拡大率 100% のとき）になる。
 */

/** 図面の端から建物までの余白 */
export const FLOOR_CANVAS_PADDING = 36

/** 壁の外へ張り出して描く窓の、張り出しの先端（両側。どちらが外かはここでは区別しない） */
function windowProjectionPoints(win: Floor['windows'][number]): Point[] {
  if (win.kind !== 'awning' && win.kind !== 'fix_casement' && win.kind !== 'slide_out') return []
  const dx = win.end.x - win.start.x
  const dy = win.end.y - win.start.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return []
  // 縦すべり出しは障子が窓の幅ほど外へ開く
  const reach = win.kind === 'slide_out' ? Math.max(50, len * 0.8) : 50
  const nx = (-dy / len) * reach
  const ny = (dx / len) * reach
  return [win.start, win.end].flatMap((p) => [
    { x: p.x + nx, y: p.y + ny },
    { x: p.x - nx, y: p.y - ny },
  ])
}

export function getFloorBounds(floor: Floor) {
  const allPoints = [
    ...floor.rooms.flatMap((r) => r.polygon ?? []),
    ...floor.walls.flatMap((w) => [w.start, w.end]),
    // 開き弧・戸先など壁外にはみ出す記号も含める（位置点だけだと viewBox で切れる）
    ...floor.doors.flatMap((d) => doorPaintExtentPoints(d)),
    // 横すべり出し・FIX＋両端すべり出しは壁の外へ張り出して描くので、その分も含める（含めないと図面の端で切れる）
    ...floor.windows.flatMap((w) => [w.start, w.end, ...windowProjectionPoints(w)]),
    ...floor.fixtures.flatMap((f) => [
      f.position,
      { x: f.position.x + f.width, y: f.position.y + f.height },
    ]),
    ...floor.stairs.flatMap((s) => s.polygon ?? []),
    ...(floor.texts ?? []).map((t) => t.position),
  ].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))

  if (allPoints.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 }
  }

  const xs = allPoints.map((p) => p.x)
  const ys = allPoints.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX - minX < 1) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 }
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY - minY < 1) {
    return { minX, minY: 0, maxX, maxY: 100 }
  }

  return { minX, minY, maxX, maxY }
}

/** 図面（SVG）の大きさと、間取図の座標 (0,0) が SVG のどこに来るか */
export function floorCanvasGeometry(floor: Floor, padding = FLOOR_CANVAS_PADDING) {
  const bounds = getFloorBounds(floor)
  return {
    width: bounds.maxX - bounds.minX + padding * 2,
    height: bounds.maxY - bounds.minY + padding * 2,
    offsetX: -bounds.minX + padding,
    offsetY: -bounds.minY + padding,
  }
}
