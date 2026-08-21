import type { WindowKind } from '../types/floorPlan'

/** 参考チャート表記（引き違い戸〜両開き戸）に合わせた窓種 */
export const WINDOW_KIND_OPTIONS: { value: WindowKind; label: string; hint: string }[] = [
  { value: 'sliding', label: '引き違い戸', hint: '2枚が中央で重なる引き違い' },
  { value: 'single_sliding', label: '片引き戸', hint: '1枚を片側へ引く' },
  { value: 'pocket', label: '引き込み戸', hint: '壁の中へ引き込む' },
  { value: 'folding', label: '折れ戸', hint: '中央で折り畳む' },
  { value: 'casement', label: '片開き戸', hint: '丁番で片側へ開く' },
  { value: 'double_casement', label: '両開き戸', hint: '左右2枚が開く' },
]

/** 旧データ互換 */
const LEGACY_WINDOW_KIND: Record<string, WindowKind> = {
  fixed: 'sliding',
  floor: 'sliding',
  high: 'sliding',
  awning: 'casement',
  double_sliding: 'sliding',
}

export function normalizeWindowKind(value: unknown): WindowKind {
  if (typeof value === 'string') {
    if (isValidWindowKind(value)) return value
    const mapped = LEGACY_WINDOW_KIND[value]
    if (mapped) return mapped
  }
  return 'sliding'
}

export function windowKindLabel(kind: WindowKind | undefined): string {
  const k = normalizeWindowKind(kind)
  return WINDOW_KIND_OPTIONS.find((o) => o.value === k)?.label ?? '引き違い戸'
}

export function isValidWindowKind(value: unknown): value is WindowKind {
  return WINDOW_KIND_OPTIONS.some((o) => o.value === value)
}
