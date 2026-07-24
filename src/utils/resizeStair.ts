import type { Point, Stair, StairOrientation } from '../types/floorPlan'
import { getStairBounds, resolveStairOrientation } from '../renderer/stairGraphics'
import { mmToSvgUnits } from './roomGeometry'

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

export function withStairWidth(stair: Stair, widthMm: number = STAIR_DEFAULT_WIDTH_MM): Stair {
  const safeWidth = widthMm > 0 ? widthMm : STAIR_DEFAULT_WIDTH_MM
  return {
    ...stair,
    widthMm: safeWidth,
    polygon: resizeStairPolygon(stair, safeWidth),
  }
}
