import type { RoomType } from '../types/floorPlan'

/**
 * 参考間取図（おしゃれパステル）寄り配色
 * LD・洋室は薄いベージュ、和室はミント、水回りはスカイブルー、通路・収納は白
 */
export const ROOM_COLORS: Record<RoomType, { fill: string; stroke?: string }> = {
  ld: { fill: '#F3EEE4' },
  kitchen: { fill: '#F3EEE4' },
  bathroom: { fill: '#D9ECF6' },
  toilet: { fill: '#D9ECF6' },
  washroom: { fill: '#D9ECF6' },
  japanese: { fill: '#D5EBDA' },
  western: { fill: '#F3EEE4' },
  hallway: { fill: '#FFFFFF' },
  entrance: { fill: '#FAFAF8' },
  stairs: { fill: '#FFFFFF' },
  storage: { fill: '#FFFFFF' },
  porch: { fill: '#FAFAF8' },
  attic: { fill: '#F0EBE4' },
  void: { fill: '#FFFFFF' },
  other: { fill: '#F7F4EF' },
}

export const CANVAS = {
  background: '#FFFFFF',
  border: '#E8E4DC',
  shadow: 'rgba(40, 40, 40, 0.05)',
}

/** 参考図の太いチャコールグレー壁帯 */
export const WALL = {
  exteriorWidth: 8.2,
  interiorWidth: 5.2,
  color: '#4A4A4A',
  exteriorColor: '#2F2F2F',
}

/** 参考図の細めグレー建具 */
export const DOOR = {
  color: '#5A5A5A',
  leafWidth: 1.35,
  leafWidthSelected: 2.2,
  detailWidth: 1.15,
  arcWidth: 1.05,
  arcWidthSelected: 1.6,
  arcOpacity: 0.7,
  endTick: 2.8,
}

/** 壁開口内の二重線（ソフトグレー） */
export const WINDOW = {
  color: '#5A5A5A',
  gap: 2.0,
  lineWidth: 1.25,
  lineWidthSelected: 2.0,
  detailWidth: 1.1,
  endTick: 3.0,
}

/** 参考図風のセリフ体（日本語は Noto Serif JP） */
export const LABEL = {
  fontFamily: '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
  defaultFontSize: 20,
  fontSizeMin: 6,
  fontSizeMax: 48,
  areaSizeRatio: 0.82,
  noteSizeRatio: 0.7,
  color: '#555555',
  noteColor: '#666666',
  letterSpacing: '0.04em',
  fontWeight: 500,
  areaFontWeight: 400,
  fontStyle: 'italic' as const,
}

export const TATAMI = {
  gridColor: '#8BB88A',
  gridWidth: 0.55,
}

/** 薄いベージュ床＋細い縦ピンストライプ（参考図のフローリング） */
export const WOOD_FLOORING = {
  spacing: 5.2,
  color: '#C5C0B6',
  width: 0.42,
  opacity: 0.5,
  /** vertical = 上下方向の板目（参考図） */
  direction: 'vertical' as 'vertical' | 'horizontal',
}

export const TILE = {
  spacing: 68,
  lineWidth: 0.55,
  porch: { grout: '#D5D5D5', opacity: 0.75 },
  entrance: { grout: '#CECECE', opacity: 0.65 },
}

export const ATTIC_HATCH = {
  color: '#D0CCC4',
  spacing: 7,
}

export const FIXTURE = {
  stroke: '#5A5A5A',
  fill: '#FFFFFF',
  strokeWidth: 1.15,
}

export const STAIR = {
  fill: '#FFFFFF',
  line: '#5A5A5A',
  accent: '#5A5A5A',
}

export const SELECTION = {
  stroke: '#C45C26',
  strokeWidth: 2.2,
}

export const NORTH_ARROW = {
  color: '#555555',
  accent: '#7CB87C',
  size: 32,
}

export const SCALE = 10

export const LEGEND_ITEMS: { type: RoomType; label: string }[] = [
  { type: 'ld', label: 'LD・洋室' },
  { type: 'japanese', label: '和室' },
  { type: 'bathroom', label: '水回り' },
  { type: 'hallway', label: '廊下・玄関' },
  { type: 'storage', label: '収納' },
]

export function mmToSvg(mm: number): number {
  return mm * (SCALE / 100)
}

export function polygonCentroid(points: { x: number; y: number }[]): { x: number; y: number } {
  let cx = 0
  let cy = 0
  for (const p of points) {
    cx += p.x
    cy += p.y
  }
  return { x: cx / points.length, y: cy / points.length }
}

export function polygonArea(points: { x: number; y: number }[]): number {
  let area = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  return Math.abs(area) / 2
}

export function mm2ToJo(areaMm2: number): number {
  return Math.round((areaMm2 / 1_620_000) * 10) / 10
}

export function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')} Z`
}
