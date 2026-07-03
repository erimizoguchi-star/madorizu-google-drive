import type { RoomType } from '../types/floorPlan'

/** シック・ナチュラルなインテリア調パレット（明るめ） */
export const ROOM_COLORS: Record<RoomType, { fill: string; stroke?: string }> = {
  ld: { fill: '#C9A57A' },
  kitchen: { fill: '#F0E0A0' },
  bathroom: { fill: '#A8D4E8' },
  toilet: { fill: '#A8D4E8' },
  washroom: { fill: '#A8D4E8' },
  japanese: { fill: '#B8D4B0' },
  western: { fill: '#F0B8C8' },
  hallway: { fill: '#E8DFCF' },
  entrance: { fill: '#D0D0D0' },
  stairs: { fill: '#E8DFCF' },
  storage: { fill: '#E0DDD6' },
  porch: { fill: '#D0D0D0' },
  attic: { fill: '#E0DDD6' },
  void: { fill: '#FEFEFE' },
  other: { fill: '#E8DFCF' },
}

export const CANVAS = {
  background: '#FFFFFF',
  border: '#EDE8E0',
  shadow: 'rgba(45, 42, 38, 0.04)',
}

export const WALL = {
  exteriorWidth: 6,
  interiorWidth: 3,
  color: '#000000',
}

export const DOOR = {
  color: '#5C5854',
  arcOpacity: 0.35,
}

export const WINDOW = {
  color: '#7A756D',
  gap: 2.5,
}

export const LABEL = {
  fontFamily: '"Noto Sans JP", "Hiragino Sans", sans-serif',
  defaultFontSize: 24,
  fontSizeMin: 6,
  fontSizeMax: 48,
  areaSizeRatio: 0.82,
  noteSizeRatio: 0.7,
  color: '#000000',
  noteColor: '#000000',
  letterSpacing: '0.02em',
  fontWeight: 500,
  areaFontWeight: 400,
}

export const TATAMI = {
  gridColor: '#8FB88A',
  gridWidth: 0.45,
}

export const ATTIC_HATCH = {
  color: '#D8D4CC',
  spacing: 7,
}

export const FIXTURE = {
  stroke: '#8A857D',
  fill: '#F2EFE9',
  strokeWidth: 0.9,
}

export const STAIR = {
  fill: '#E8DFCF',
  line: '#C8BFB0',
  accent: '#8A857D',
}

export const SELECTION = {
  stroke: '#B8A080',
  strokeWidth: 2,
}

export const SCALE = 10

/** 凡例表示用 */
export const LEGEND_ITEMS: { type: RoomType; label: string }[] = [
  { type: 'ld', label: 'LD' },
  { type: 'kitchen', label: 'キッチン' },
  { type: 'bathroom', label: '水回り' },
  { type: 'japanese', label: '和室' },
  { type: 'western', label: '洋室' },
  { type: 'entrance', label: '玄関・ポーチ' },
  { type: 'hallway', label: '廊下・階段' },
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
