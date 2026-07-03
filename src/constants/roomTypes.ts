import type { RoomType } from '../types/floorPlan'

export const ROOM_TYPE_OPTIONS: { value: RoomType; label: string }[] = [
  { value: 'ld', label: 'LD（リビング・ダイニング）' },
  { value: 'kitchen', label: 'キッチン' },
  { value: 'bathroom', label: '浴室' },
  { value: 'toilet', label: 'トイレ' },
  { value: 'washroom', label: '洗面・脱衣' },
  { value: 'japanese', label: '和室' },
  { value: 'western', label: '洋室' },
  { value: 'hallway', label: '廊下・ホール' },
  { value: 'entrance', label: '玄関' },
  { value: 'stairs', label: '階段' },
  { value: 'storage', label: '収納' },
  { value: 'porch', label: 'ポーチ' },
  { value: 'attic', label: '屋根裏' },
  { value: 'void', label: '吹抜' },
  { value: 'other', label: 'その他' },
]

export function getRoomTypeLabel(type: RoomType): string {
  return ROOM_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

/** 廊下・ホール・階段は帖数を表示しない（固定） */
export function isAreaJoHiddenByType(type: RoomType): boolean {
  return type === 'hallway' || type === 'stairs'
}
