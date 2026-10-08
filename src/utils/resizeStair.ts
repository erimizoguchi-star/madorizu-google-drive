import type { Point, Stair, StairOrientation } from '../types/floorPlan'
import { getStairBounds, resolveStairOrientation } from '../renderer/stairGraphics'
import { mmToSvgUnits, svgUnitsToMm } from './roomGeometry'

export const STAIR_DEFAULT_WIDTH_MM = 910

export function getStairWidthAxis(orientation: StairOrientation): 'x' | 'y' {
  return orientation === 'up' || orientation === 'down' ? 'x' : 'y'
}

export function applyStairWidth(
  polygon: Point[],
  orientation: StairOrientation,
  widthMm: number
): Point[] {
  const bounds = getStairBounds(polygon)
  const targetWidth = mmToSvgUnits(widthMm)
  const axis = getStairWidthAxis(orientation)
  const currentWidth = axis === 'x' ? bounds.maxX - bounds.minX : bounds.maxY - bounds.minY
  if (currentWidth < 1 || targetWidth < 1) return polygon

  const center = axis === 'x' ? (bounds.minX + bounds.maxX) / 2 : (bounds.minY + bounds.maxY) / 2
  const halfCurrent = currentWidth / 2
  const halfTarget = targetWidth / 2

  return polygon.map((p) => {
    if (axis === 'x') {
      const t = (p.x - center) / halfCurrent
      return { x: center + t * halfTarget, y: p.y }
    }
    const t = (p.y - center) / halfCurrent
    return { x: p.x, y: center + t * halfTarget }
  })
}

export function resizeStairPolygon(stair: Stair, widthMm: number): Point[] {
  const bounds = getStairBounds(stair.polygon)
  const orientation = resolveStairOrientation(stair, bounds)
  return applyStairWidth(stair.polygon, orientation, widthMm)
}

/** 上り方向に沿った軸（＝階段の長さ方向） */
export function getStairLengthAxis(orientation: StairOrientation): 'x' | 'y' {
  return orientation === 'up' || orientation === 'down' ? 'y' : 'x'
}

/** 上り方向の長さ（mm） */
export function getStairLengthMm(stair: Stair): number {
  const bounds = getStairBounds(stair.polygon)
  const orientation = resolveStairOrientation(stair, bounds)
  const axis = getStairLengthAxis(orientation)
  const length = axis === 'x' ? bounds.maxX - bounds.minX : bounds.maxY - bounds.minY
  return Math.round(svgUnitsToMm(length))
}

/** 上り始め側（左端・上端）を固定したまま、長さだけ変える */
export function withStairLength(stair: Stair, lengthMm: number): Stair {
  if (!(lengthMm > 0)) return stair
  const bounds = getStairBounds(stair.polygon)
  const orientation = resolveStairOrientation(stair, bounds)
  const axis = getStairLengthAxis(orientation)
  const current = axis === 'x' ? bounds.maxX - bounds.minX : bounds.maxY - bounds.minY
  const target = mmToSvgUnits(lengthMm)
  if (current < 1 || target < 1) return stair

  const anchor = axis === 'x' ? bounds.minX : bounds.minY
  const ratio = target / current
  return {
    ...stair,
    polygon: stair.polygon.map((p) =>
      axis === 'x'
        ? { x: anchor + (p.x - anchor) * ratio, y: p.y }
        : { x: p.x, y: anchor + (p.y - anchor) * ratio }
    ),
  }
}

/** 階段を平行移動する */
export function translateStair(stair: Stair, dx: number, dy: number): Stair {
  return {
    ...stair,
    polygon: stair.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy })),
  }
}

export function withStairWidth(stair: Stair, widthMm: number = STAIR_DEFAULT_WIDTH_MM): Stair {
  const safeWidth = widthMm > 0 ? widthMm : STAIR_DEFAULT_WIDTH_MM
  return {
    ...stair,
    widthMm: safeWidth,
    polygon: resizeStairPolygon(stair, safeWidth),
  }
}

/** 辺を動かしたときの、階段の最小の寸法（図面の単位。20 = 200mm） */
const MIN_STAIR_SPAN = 20

/** 階段の輪郭の i 番目の辺（点 i → 点 i+1）が横の辺か（縦の辺なら false） */
export function isHorizontalStairEdge(polygon: Point[], i: number): boolean {
  const a = polygon[i]
  const b = polygon[(i + 1) % polygon.length]
  return Math.abs(a.y - b.y) < Math.abs(a.x - b.x)
}

/**
 * 階段の輪郭の i 番目の辺を、横の辺なら y = value、縦の辺なら x = value へ動かす。
 * 両隣の辺が伸び縮みし、反対側の辺は動かない。辺が隣の辺の向こう側へ裏返ったり、
 * 階段が 200mm より細くなったりしないよう、動かせる範囲に収める。
 */
export function moveStairEdge(polygon: Point[], i: number, value: number): Point[] {
  const n = polygon.length
  if (n < 4) return polygon
  const ia = i % n
  const ib = (i + 1) % n
  const horizontal = isHorizontalStairEdge(polygon, ia)
  const coord = (p: Point) => (horizontal ? p.y : p.x)
  const prev = polygon[(ia - 1 + n) % n]
  const next = polygon[(ib + 1) % n]
  let v = value
  // 両隣の辺の向こう端（prev・next）から MIN_STAIR_SPAN 以上離し、今と同じ側に保つ
  for (const [end, other] of [
    [polygon[ia], prev],
    [polygon[ib], next],
  ] as const) {
    const side = Math.sign(coord(end) - coord(other))
    if (side > 0) v = Math.max(v, coord(other) + MIN_STAIR_SPAN)
    else if (side < 0) v = Math.min(v, coord(other) - MIN_STAIR_SPAN)
  }
  return polygon.map((p, k) => (k === ia || k === ib ? (horizontal ? { x: p.x, y: v } : { x: v, y: p.y }) : p))
}
