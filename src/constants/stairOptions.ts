import type { StairLayout, StairOrientation } from '../types/floorPlan'

export const STAIR_LAYOUT_OPTIONS: { value: StairLayout; label: string }[] = [
  { value: 'straight', label: '直線' },
  { value: 'turn-right', label: '右回り' },
  { value: 'turn-left', label: '左回り' },
]

export const STAIR_ORIENTATION_OPTIONS: { value: StairOrientation; label: string }[] = [
  { value: 'up', label: '上 (↑)' },
  { value: 'down', label: '下 (↓)' },
  { value: 'left', label: '左 (←)' },
  { value: 'right', label: '右 (→)' },
]

export function orientationToDirection(orientation: StairOrientation): 'up' | 'down' {
  return orientation === 'down' || orientation === 'left' ? 'down' : 'up'
}

export function getStairLayoutLabel(layout: StairLayout | undefined): string {
  return STAIR_LAYOUT_OPTIONS.find((o) => o.value === (layout ?? 'straight'))?.label ?? '直線'
}

export function getStairOrientationLabel(orientation: StairOrientation | undefined): string {
  return STAIR_ORIENTATION_OPTIONS.find((o) => o.value === orientation)?.label ?? '自動'
}
