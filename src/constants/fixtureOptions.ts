import type { FixtureType } from '../types/floorPlan'

export const FIXTURE_TYPE_OPTIONS: {
  value: FixtureType
  label: string
  hint: string
  defaultWidthMm: number
  defaultHeightMm: number
}[] = [
  { value: 'bathtub', label: '浴槽', hint: '浴室のバスタブ', defaultWidthMm: 700, defaultHeightMm: 400 },
  { value: 'toilet', label: '便器', hint: 'トイレ', defaultWidthMm: 350, defaultHeightMm: 500 },
  { value: 'sink', label: '洗面', hint: '洗面台', defaultWidthMm: 500, defaultHeightMm: 400 },
  { value: 'kitchen_sink', label: 'キッチンシンク', hint: '流し台', defaultWidthMm: 600, defaultHeightMm: 400 },
  { value: 'stove', label: 'コンロ', hint: 'ガス・IHコンロ', defaultWidthMm: 600, defaultHeightMm: 350 },
  { value: 'refrigerator', label: '冷蔵庫（冷）', hint: '「冷」の文字記号', defaultWidthMm: 500, defaultHeightMm: 500 },
  { value: 'washer', label: '洗濯機（洗）', hint: '「洗」の文字記号', defaultWidthMm: 500, defaultHeightMm: 500 },
  { value: 'car', label: '駐車（車）', hint: '駐車場の車アウトライン', defaultWidthMm: 1800, defaultHeightMm: 4200 },
]

export function fixtureTypeLabel(type: FixtureType): string {
  return FIXTURE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

export function isValidFixtureType(value: unknown): value is FixtureType {
  return FIXTURE_TYPE_OPTIONS.some((o) => o.value === value)
}

/** 設備の回転角を 0 / 90 / 180 / 270 のいずれかに丸める */
export function normalizeFixtureAngle(angle: number | undefined): number {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) return 0
  return ((Math.round(angle / 90) % 4) + 4) % 4 * 90
}

export function defaultFixtureSizeMm(type: FixtureType): { widthMm: number; heightMm: number } {
  const opt = FIXTURE_TYPE_OPTIONS.find((o) => o.value === type)
  return {
    widthMm: opt?.defaultWidthMm ?? 600,
    heightMm: opt?.defaultHeightMm ?? 400,
  }
}
