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
