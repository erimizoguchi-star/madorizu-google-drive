import type { Point } from '../types/floorPlan'
import { polygonArea } from './styles'

/** 畳1枚分として表示できる最小サイズ（SVG単位 ≒ 1.2m） */
const MIN_ROOM_DIM = 12

export interface TatamiLayout {
  minX: number
  minY: number
  width: number
  height: number
  cols: number
  rows: number
  /** 最終行が半畳のとき true */
  halfRow: boolean
}

interface LayoutCandidate {
  cols: number
  rows: number
  halfRow: boolean
  jo: number
}

/** 帖数ごとの代表的な畳配置 */
const KNOWN_LAYOUTS: Record<string, LayoutCandidate[]> = {
  '3': [{ cols: 3, rows: 1, halfRow: false, jo: 3 }],
  '4': [
    { cols: 2, rows: 2, halfRow: false, jo: 4 },
    { cols: 4, rows: 1, halfRow: false, jo: 4 },
  ],
  '4.5': [{ cols: 3, rows: 2, halfRow: true, jo: 4.5 }],
  '6': [
    { cols: 3, rows: 2, halfRow: false, jo: 6 },
    { cols: 2, rows: 3, halfRow: false, jo: 6 },
  ],
  '7.5': [{ cols: 3, rows: 3, halfRow: true, jo: 7.5 }],
  '8': [
    { cols: 4, rows: 2, halfRow: false, jo: 8 },
    { cols: 2, rows: 4, halfRow: false, jo: 8 },
  ],
  '9': [{ cols: 3, rows: 3, halfRow: false, jo: 9 }],
  '10': [{ cols: 5, rows: 2, halfRow: false, jo: 10 }],
  '12': [{ cols: 4, rows: 3, halfRow: false, jo: 12 }],
}

function getBounds(polygon: Point[]) {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function estimateJoFromPolygon(polygon: Point[], width: number, height: number): number {
  const area = polygonArea(polygon)
  const bboxArea = width * height
  if (bboxArea <= 0) return 0

  const fill = area / bboxArea
  const baseArea = fill > 0.75 ? bboxArea : area

  const refJo = 6
  const refArea = 210 * 90
  const estimated = (baseArea / refArea) * refJo
  return Math.round(estimated * 2) / 2
}

function factorLayouts(jo: number): LayoutCandidate[] {
  const results: LayoutCandidate[] = []
  const intJo = Math.floor(jo)
  const isHalf = jo % 1 !== 0

  if (isHalf) {
    const fullRows = intJo
    for (let cols = 2; cols <= 6; cols++) {
      if (Math.abs(cols * (fullRows + 0.5) - jo) < 0.01) {
        results.push({ cols, rows: fullRows + 1, halfRow: true, jo })
      }
    }
  } else {
    for (let cols = 1; cols <= 8; cols++) {
      if (intJo % cols === 0) {
        const rows = intJo / cols
        if (rows >= 1 && rows <= 8) {
          results.push({ cols, rows, halfRow: false, jo })
        }
      }
    }
  }

  return results
}

function pickBestLayout(candidates: LayoutCandidate[], aspect: number): LayoutCandidate | null {
  if (candidates.length === 0) return null

  let best = candidates[0]
  let bestScore = Infinity

  for (const c of candidates) {
    const layoutAspect = c.cols / c.rows
    const score = Math.abs(Math.log(layoutAspect / aspect))
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }

  return best
}

function resolveLayout(jo: number, aspect: number): LayoutCandidate | null {
  const key = String(jo)
  const known = KNOWN_LAYOUTS[key]
  if (known?.length) {
    return pickBestLayout(known, aspect) ?? known[0]
  }

  const factored = factorLayouts(jo)
  if (factored.length) {
    return pickBestLayout(factored, aspect)
  }

  return null
}

/** 和室の広さに応じた畳レイアウト（表示不可なら null） */
export function computeTatamiLayout(polygon: Point[], areaJo?: number): TatamiLayout | null {
  const { minX, maxX, minY, maxY } = getBounds(polygon)
  const width = maxX - minX
  const height = maxY - minY

  if (width < MIN_ROOM_DIM || height < MIN_ROOM_DIM) {
    return null
  }

  let jo = areaJo && areaJo >= 1.5 ? Math.round(areaJo * 2) / 2 : 0
  if (!jo) {
    jo = estimateJoFromPolygon(polygon, width, height)
  }
  if (jo < 1.5) {
    return null
  }

  const aspect = width / height
  const layout = resolveLayout(jo, aspect)
  if (!layout) {
    return null
  }

  return {
    minX,
    minY,
    width,
    height,
    cols: layout.cols,
    rows: layout.rows,
    halfRow: layout.halfRow,
  }
}

export function tatamiGridLines(
  layout: TatamiLayout
): { x1: number; y1: number; x2: number; y2: number }[] {
  const { minX, minY, width, height, cols, rows, halfRow } = layout
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []

  const cellW = width / cols
  const rowUnits = halfRow ? rows - 0.5 : rows
  const cellH = height / rowUnits

  for (let col = 1; col < cols; col++) {
    const x = minX + col * cellW
    lines.push({ x1: x, y1: minY, x2: x, y2: minY + height })
  }

  if (halfRow) {
    const fullRows = rows - 1
    for (let row = 1; row < fullRows; row++) {
      const y = minY + row * cellH
      lines.push({ x1: minX, y1: y, x2: minX + width, y2: y })
    }
    const halfY = minY + (rows - 1) * cellH
    lines.push({ x1: minX, y1: halfY, x2: minX + width, y2: halfY })
  } else {
    for (let row = 1; row < rows; row++) {
      const y = minY + row * cellH
      lines.push({ x1: minX, y1: y, x2: minX + width, y2: y })
    }
  }

  return lines
}
