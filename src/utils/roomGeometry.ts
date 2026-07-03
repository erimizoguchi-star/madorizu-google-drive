import type { Point } from '../types/floorPlan'
import { SCALE } from '../renderer/styles'

const EPS = 0.05

function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function svgUnitsToMm(v: number): number {
  return v * (100 / SCALE)
}

export function mmToSvgUnits(mm: number): number {
  return mm * (SCALE / 100)
}

export const MIN_ROOM_SIZE_MM = 300
export const MIN_ROOM_SIZE_SVG = mmToSvgUnits(MIN_ROOM_SIZE_MM)
export const RESIZE_SNAP_MM = 50

export interface AxisAlignedRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type RectEdge = 'north' | 'south' | 'east' | 'west'

export function parseAxisAlignedRect(polygon: Point[]): AxisAlignedRect | null {
  if (polygon.length !== 4) return null

  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  if (maxX - minX < EPS || maxY - minY < EPS) return null

  const cornerKeys = new Set(polygon.map((p) => `${roundCoord(p.x)},${roundCoord(p.y)}`))
  const expected = [
    `${roundCoord(minX)},${roundCoord(minY)}`,
    `${roundCoord(maxX)},${roundCoord(minY)}`,
    `${roundCoord(maxX)},${roundCoord(maxY)}`,
    `${roundCoord(minX)},${roundCoord(maxY)}`,
  ]
  if (!expected.every((key) => cornerKeys.has(key))) return null

  return { minX, minY, maxX, maxY }
}

export function rectToPolygon(rect: AxisAlignedRect): Point[] {
  const { minX, minY, maxX, maxY } = rect
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
}

export function getRectDimensionsMm(rect: AxisAlignedRect): { widthMm: number; heightMm: number } {
  return {
    widthMm: Math.round(svgUnitsToMm(rect.maxX - rect.minX)),
    heightMm: Math.round(svgUnitsToMm(rect.maxY - rect.minY)),
  }
}

export function snapSvgToMmGrid(valueSvg: number): number {
  const mm = svgUnitsToMm(valueSvg)
  const snapped = Math.round(mm / RESIZE_SNAP_MM) * RESIZE_SNAP_MM
  return mmToSvgUnits(snapped)
}

export function isOnVerticalEdge(
  p: Point,
  x: number,
  yMin: number,
  yMax: number
): boolean {
  const lo = Math.min(yMin, yMax)
  const hi = Math.max(yMin, yMax)
  return Math.abs(p.x - x) < EPS && p.y >= lo - EPS && p.y <= hi + EPS
}

export function isOnHorizontalEdge(
  p: Point,
  y: number,
  xMin: number,
  xMax: number
): boolean {
  const lo = Math.min(xMin, xMax)
  const hi = Math.max(xMin, xMax)
  return Math.abs(p.y - y) < EPS && p.x >= lo - EPS && p.x <= hi + EPS
}
