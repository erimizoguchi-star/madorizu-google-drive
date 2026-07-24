import type { WindowKind } from '../types/floorPlan'

export const WINDOW_KIND_OPTIONS: { value: WindowKind; label: string; hint: string }[] = [
  { value: 'sliding', label: '引き違い窓', hint: '左右にすれ違う一般的な窓' },
  { value: 'fixed', label: '嵌め殺し窓', hint: '開閉しない固定窓' },
  { value: 'casement', label: '開き窓', hint: '縦軸で外へ開く窓' },
  { value: 'double_casement', label: '両開き窓', hint: '左右2枚の開き窓' },
  { value: 'awning', label: 'すべり出し窓', hint: '下端を軸に外へ突き出す窓' },
  { value: 'floor', label: '掃き出し窓', hint: '床まで続く大きな引き違い窓' },
  { value: 'high', label: '高窓', hint: '壁上部の横長の窓' },
]

export function windowKindLabel(kind: WindowKind | undefined): string {
  const k = kind ?? 'sliding'
  return WINDOW_KIND_OPTIONS.find((o) => o.value === k)?.label ?? '窓'
}

export function isValidWindowKind(value: unknown): value is WindowKind {
  return WINDOW_KIND_OPTIONS.some((o) => o.value === value)
}
