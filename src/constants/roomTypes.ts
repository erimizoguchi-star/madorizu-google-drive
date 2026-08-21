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

/** type ごとの表示用デフォルト名（日本語） */
export const DEFAULT_ROOM_NAME: Record<RoomType, string> = {
  ld: 'LDK',
  kitchen: 'キッチン',
  bathroom: '浴室',
  toilet: 'トイレ',
  washroom: '洗面室',
  japanese: '和室',
  western: '洋室',
  hallway: '廊下',
  entrance: '玄関',
  stairs: '階段',
  storage: '収納',
  porch: 'ポーチ',
  attic: '屋根裏',
  void: '吹抜',
  other: 'その他',
}

/** 英語・略称ラベル → 日本語名 */
const ENGLISH_NAME_MAP: Array<{ pattern: RegExp; ja: string }> = [
  { pattern: /^living\s*dining\s*kitchen$/i, ja: 'LDK' },
  { pattern: /^living\s*dining$/i, ja: 'LD' },
  { pattern: /^living(\s*room)?$/i, ja: 'リビング' },
  { pattern: /^ldk$/i, ja: 'LDK' },
  { pattern: /^l\s*\/?\s*d$/i, ja: 'LD' },
  { pattern: /^ld$/i, ja: 'LD' },
  { pattern: /^kitchen$/i, ja: 'キッチン' },
  { pattern: /^bed\s*rooms?$/i, ja: '洋室' },
  { pattern: /^bedrooms?$/i, ja: '洋室' },
  { pattern: /^japanese\s*rooms?$/i, ja: '和室' },
  { pattern: /^japanese([-\s]?style)?(\s*rooms?)?$/i, ja: '和室' },
  { pattern: /^tatami(\s*rooms?)?$/i, ja: '和室' },
  { pattern: /^washitsu$/i, ja: '和室' },
  { pattern: /^entrance$/i, ja: '玄関' },
  { pattern: /^genkan$/i, ja: '玄関' },
  { pattern: /^porch$/i, ja: 'ポーチ' },
  { pattern: /^balcony$/i, ja: 'バルコニー' },
  { pattern: /^sanitary$/i, ja: '洗面室' },
  { pattern: /^wash\s*rooms?$/i, ja: '洗面室' },
  { pattern: /^bath\s*rooms?$/i, ja: '浴室' },
  { pattern: /^toliet$/i, ja: 'トイレ' },
  { pattern: /^toilets?$/i, ja: 'トイレ' },
  { pattern: /^lavatory$/i, ja: 'トイレ' },
  { pattern: /^w\.?i\.?c\.?$/i, ja: 'WIC' },
  { pattern: /^walk[-\s]?in\s*closets?$/i, ja: 'WIC' },
  { pattern: /^closets?$/i, ja: 'クローゼット' },
  { pattern: /^storage$/i, ja: '物入' },
  { pattern: /^shoes?\s*box(es)?$/i, ja: '下駄箱' },
  { pattern: /^hall(way)?$/i, ja: '廊下' },
  { pattern: /^corridor$/i, ja: '廊下' },
  { pattern: /^stairs?$/i, ja: '階段' },
  { pattern: /^void$/i, ja: '吹抜' },
  { pattern: /^meter\s*box$/i, ja: 'MB' },
  { pattern: /^mb$/i, ja: 'MB' },
]

export function getRoomTypeLabel(type: RoomType): string {
  return ROOM_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

/** 図面ラベルを日本語表示名に正規化 */
export function toJapaneseRoomName(name: string | undefined, type: RoomType): string {
  // 和室は表記を「和室」に固定（Japanese Room / 畳の間 なども統一）
  if (type === 'japanese') return '和室'

  const raw = (name ?? '').trim()
  if (!raw) return DEFAULT_ROOM_NAME[type] ?? '部屋'

  for (const { pattern, ja } of ENGLISH_NAME_MAP) {
    if (pattern.test(raw)) return ja
  }

  // ひらがな・カタカナ・漢字を含む → 日本語として採用
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(raw)) return raw

  // 英語のまま残っている場合は type のデフォルト名へ
  if (/^[A-Za-z0-9./\-\s]+$/.test(raw)) return DEFAULT_ROOM_NAME[type] ?? raw
  return raw
}

/** 廊下・ホール・階段は帖数を表示しない（固定） */
export function isAreaJoHiddenByType(type: RoomType): boolean {
  return type === 'hallway' || type === 'stairs'
}
