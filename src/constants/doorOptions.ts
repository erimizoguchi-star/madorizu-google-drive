import type { DoorKind } from '../types/floorPlan'

export const DOOR_KIND_OPTIONS: { value: DoorKind; label: string; hint: string }[] = [
  { value: 'swing', label: '片開き戸', hint: '一般的な開き戸（弧で開閉）' },
  { value: 'double_swing', label: '両開き戸', hint: '中央で分かれる2枚の開き戸' },
  { value: 'parent_child', label: '親子戸', hint: '幅の違う2枚の開き戸（親＋子）' },
  { value: 'sliding', label: '片引き戸', hint: '一方へ引き込む引き戸' },
  { value: 'double_sliding', label: '引き違い戸', hint: '左右にすれ違う2枚の引き戸' },
  { value: 'pocket', label: '引き込み戸', hint: '壁の中へ引き込む戸' },
  { value: 'folding', label: '折れ戸', hint: '折りたたみ式の戸' },
  { value: 'double_folding', label: '両折れ戸', hint: '左右から折りたたむ戸' },
  { value: 'opening', label: '開口部', hint: '戸のない開口' },
]

/** 開閉方向が意味を持つ扉種 */
export const DOOR_KINDS_WITH_SWING = new Set<DoorKind>([
  'swing',
  'double_swing',
  'parent_child',
  'sliding',
  'double_sliding',
  'pocket',
  'folding',
  'double_folding',
])

export const DOOR_SWING_OPTIONS: { value: 1 | -1; label: string; hint: string }[] = [
  { value: 1, label: '左開き', hint: '反時計回りに開く（弧が左へ）' },
  { value: -1, label: '右開き', hint: '時計回りに開く（弧が右へ）' },
]

export function doorKindLabel(kind: DoorKind | undefined): string {
  const k = kind ?? 'swing'
  return DOOR_KIND_OPTIONS.find((o) => o.value === k)?.label ?? '扉'
}

export function isValidDoorKind(value: unknown): value is DoorKind {
  return DOOR_KIND_OPTIONS.some((o) => o.value === value)
}
