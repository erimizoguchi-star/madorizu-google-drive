import type { Room, RoomFillPattern } from '../types/floorPlan'
import { ROOM_COLORS } from './styles'

export const ROOM_PATTERN_OPTIONS: { value: RoomFillPattern | ''; label: string }[] = [
  { value: '', label: 'タイプのデフォルト' },
  { value: 'none', label: 'なし（単色）' },
  { value: 'wood', label: '木目（フローリング）' },
  { value: 'tile', label: 'タイル' },
  { value: 'grid', label: '格子' },
  { value: 'hatch', label: '斜線' },
  { value: 'tatami', label: '畳目' },
]

export function getDefaultFillColor(type: Room['type']): string {
  return ROOM_COLORS[type]?.fill ?? ROOM_COLORS.other.fill
}

export function resolveRoomFillColor(room: Room): string {
  return room.fillColor ?? getDefaultFillColor(room.type)
}

export function resolveRoomFillPattern(room: Room): RoomFillPattern {
  if (room.fillPattern !== undefined) return room.fillPattern
  return getDefaultFillPattern(room.type)
}

export function getDefaultFillPattern(type: Room['type']): RoomFillPattern {
  if (type === 'ld' || type === 'western' || type === 'kitchen') return 'wood'
  if (type === 'hallway' || type === 'storage' || type === 'void' || type === 'stairs') return 'none'
  if (type === 'japanese') return 'tatami'
  if (type === 'attic') return 'hatch'
  if (type === 'porch' || type === 'entrance') return 'tile'
  return 'none'
}

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase()
  if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) return `#${trimmed.toUpperCase()}`
  return null
}
