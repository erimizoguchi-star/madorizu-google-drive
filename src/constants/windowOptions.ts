import type { WindowKind } from '../types/floorPlan'

/** 参考チャート表記（引き違い戸〜両開き戸）に合わせた窓種 */
export const WINDOW_KIND_OPTIONS: { value: WindowKind; label: string; hint: string }[] = [
  { value: 'sliding', label: '引き違い戸', hint: '2枚が中央で重なる引き違い' },
  { value: 'single_sliding', label: '片引き戸', hint: '1枚を片側へ引く' },
  { value: 'pocket', label: '引き込み戸', hint: '壁の中へ引き込む' },
  { value: 'folding', label: '折れ戸', hint: '中央で折り畳む' },
  { value: 'casement', label: '片開き戸', hint: '丁番で片側へ開く' },
  { value: 'double_casement', label: '両開き戸', hint: '左右2枚が開く' },
  { value: 'awning', label: '横すべり出し窓', hint: '上を軸に外へ押し出して開く（外側に破線の四角）' },
  { value: 'fix', label: 'FIX窓（はめ殺し）', hint: '開かないガラス窓' },
  { value: 'fix_casement', label: 'FIX＋両端すべり出し', hint: '中央は開かず、両端が外へ開く連窓' },
]

/** 旧データ互換 */
const LEGACY_WINDOW_KIND: Record<string, WindowKind> = {
  fixed: 'fix',
  floor: 'sliding',
  high: 'sliding',
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
