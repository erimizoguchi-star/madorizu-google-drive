import type { StairLayout, StairOrientation } from '../types/floorPlan'

export const STAIR_LAYOUT_OPTIONS: { value: StairLayout; label: string }[] = [
  { value: 'straight', label: '直線' },
  { value: 'turn-right', label: 'L字・上で曲がる（右回り）' },
  { value: 'turn-left', label: 'L字・上で曲がる（左回り）' },
  { value: 'turn-right-start', label: 'L字・下で曲がる（右回り）' },
  { value: 'turn-left-start', label: 'L字・下で曲がる（左回り）' },
  { value: 'u-right', label: 'U字・折り返し（右回り）' },
  { value: 'u-left', label: 'U字・折り返し（左回り）' },
]

/** 右回り ⇔ 左回り（同じ形のまま曲がる向きだけ反対にする） */
export function mirrorStairLayout(layout: StairLayout): StairLayout {
  const pairs: Record<StairLayout, StairLayout> = {
    straight: 'straight',
    'turn-right': 'turn-left',
    'turn-left': 'turn-right',
    'turn-right-start': 'turn-left-start',
    'turn-left-start': 'turn-right-start',
    'u-right': 'u-left',
    'u-left': 'u-right',
  }
  return pairs[layout]
}

/** 上り方向を時計回りに次へ（↑ → → → ↓ → ←） */
export function nextStairOrientation(orientation: StairOrientation): StairOrientation {
  const order: StairOrientation[] = ['up', 'right', 'down', 'left']
  return order[(order.indexOf(orientation) + 1) % order.length]
}

export const STAIR_ORIENTATION_OPTIONS: { value: StairOrientation; label: string }[] = [
  { value: 'up', label: '上 (↑)' },
  { value: 'down', label: '下 (↓)' },
  { value: 'left', label: '左 (←)' },
  { value: 'right', label: '右 (→)' },
]

export function getStairLayoutLabel(layout: StairLayout | undefined): string {
  return STAIR_LAYOUT_OPTIONS.find((o) => o.value === (layout ?? 'straight'))?.label ?? '直線'
}

export function getStairOrientationLabel(orientation: StairOrientation | undefined): string {
  return STAIR_ORIENTATION_OPTIONS.find((o) => o.value === orientation)?.label ?? '自動'
}
