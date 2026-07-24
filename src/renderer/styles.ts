import type { RoomType } from '../types/floorPlan'

/**
 * 参考間取図に近いパステル配色
 * 廊下・玄関・収納・バルコニーは白基調
 */
export const ROOM_COLORS: Record<RoomType, { fill: string; stroke?: string }> = {
  ld: { fill: '#FFF4C8' },
  kitchen: { fill: '#FFF0B8' },
  bathroom: { fill: '#D4E8F7' },
  toilet: { fill: '#D4E8F7' },
  washroom: { fill: '#D4E8F7' },
  japanese: { fill: '#C8E8C0' },
  western: { fill: '#F8D4E0' },
  hallway: { fill: '#FFFFFF' },
  entrance: { fill: '#FFFFFF' },
  stairs: { fill: '#F5EDE3' },
  storage: { fill: '#F3EEE6' },
  porch: { fill: '#FFFFFF' },
  attic: { fill: '#EFEAE3' },
  void: { fill: '#FFFFFF' },
  other: { fill: '#F5F0E8' },
}

export const CANVAS = {
  background: '#FFFFFF',
  border: '#E8E4DC',
  shadow: 'rgba(40, 40, 40, 0.06)',
}

/** 参考図の太い壁帯 */
export const WALL = {
  exteriorWidth: 7.5,
  interiorWidth: 4.8,
  color: '#4A4A4A',
  exteriorColor: '#3D3D3D',
}

/** 製図調の扉（細め・高コントラスト） */
export const DOOR = {
  color: '#111111',
  leafWidth: 1.8,
  leafWidthSelected: 2.6,
  detailWidth: 1.5,
  arcWidth: 1.35,
  arcWidthSelected: 1.9,
  arcOpacity: 0.75,
  endTick: 3.2,
}

/** 壁開口内の二重線（濃いグレー） */
export const WINDOW = {
  color: '#1A1A1A',
  gap: 2.2,
  lineWidth: 1.6,
  lineWidthSelected: 2.3,
  detailWidth: 1.4,
  endTick: 3.5,
}

export const LABEL = {
  fontFamily: '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
  defaultFontSize: 22,
  fontSizeMin: 6,
  fontSizeMax: 48,
  areaSizeRatio: 0.78,
  noteSizeRatio: 0.68,
  color: '#111111',
  noteColor: '#222222',
  letterSpacing: '0.02em',
  fontWeight: 600,
  areaFontWeight: 500,
}

export const TATAMI = {
  gridColor: '#7AAD74',
  gridWidth: 0.5,
}

export const WOOD_FLOORING = {
  plankSpacing: 135,
  grainSpacing: 16,
  grainStepX: 34,
  seamColor: '#D4B45A',
  seamWidth: 0.85,
  grainColor: '#C9A84A',
  grainWidth: 0.5,
  grainOpacity: 0.5,
  seamOpacity: 0.65,
}

export const TILE = {
  spacing: 75,
  lineWidth: 0.75,
  porch: { grout: '#D0D0D0', opacity: 0.85 },
  entrance: { grout: '#C8C8C8', opacity: 0.7 },
}

export const ATTIC_HATCH = {
  color: '#D0CCC4',
  spacing: 7,
}

export const FIXTURE = {
  stroke: '#2A2A2A',
  fill: '#FFFFFF',
  strokeWidth: 1.35,
}

export const STAIR = {
  fill: '#FFFFFF',
  line: '#222222',
  accent: '#222222',
}

export const SELECTION = {
  stroke: '#C45C26',
  strokeWidth: 2.2,
}

export const NORTH_ARROW = {
  color: '#222222',
  size: 28,
}

export const SCALE = 10

export const LEGEND_ITEMS: { type: RoomType; label: string }[] = [
  { type: 'ld', label: 'LD・DK' },
  { type: 'western', label: '洋室' },
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
