import type { Point, Room, RoomType, Stair } from '../types/floorPlan'
import { isAreaJoHiddenByType, toJapaneseRoomName } from '../constants/roomTypes'
import { LABEL, mm2ToJo, polygonArea } from './styles'

const SVG_MM = 10
const LINE_LEADING = 1.28

export type LabelLineKind = 'name' | 'area' | 'note'

export interface LabelLine {
  kind: LabelLineKind
  text: string
  x: number
  y: number
  fontSize: number
  fontWeight: number
  fill: string
}

export interface RoomLabelLayout {
  lines: LabelLine[]
  showName: boolean
  showAreaJo: boolean
}

export interface LabelSource {
  polygon: Point[]
  name: string
  type?: RoomType
  areaJo?: number
  note?: string
  showName?: boolean
  showAreaJo?: boolean
  showNote?: boolean
  labelFontSize?: number
  noteFontSize?: number
  nameLabelOffset?: Point
  areaLabelOffset?: Point
  noteLabelOffset?: Point
}

function polygonBounds(points: Point[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}

function labelAnchor(polygon: Point[]): Point {
  const { minX, maxX, minY, maxY } = polygonBounds(polygon)
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

function resolveAreaJo(source: LabelSource): number {
  if (source.areaJo !== undefined && source.areaJo > 0) return source.areaJo
  const areaMm2 = polygonArea(source.polygon) * SVG_MM * SVG_MM
  return mm2ToJo(areaMm2)
}

function formatJo(jo: number): string {
  const rounded = Math.round(jo * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}帖` : `${rounded.toFixed(1)}帖`
}

function resolveFontSizes(source: LabelSource): { nameSize: number; areaSize: number; noteSize: number } {
  const nameSize = source.labelFontSize ?? LABEL.defaultFontSize
  const areaSize = Math.round(nameSize * LABEL.areaSizeRatio * 10) / 10
  const defaultNoteSize = Math.round(nameSize * LABEL.noteSizeRatio * 10) / 10
  const noteSize = source.noteFontSize ?? defaultNoteSize
  return { nameSize, areaSize, noteSize }
}

function layoutLineYs(centerY: number, entries: { fontSize: number }[]): number[] {
  const blockHeight = entries.reduce((sum, e) => sum + e.fontSize * LINE_LEADING, 0)
  let y = centerY - blockHeight / 2

  return entries.map((entry) => {
    const lineY = y + entry.fontSize * 0.5
    y += entry.fontSize * LINE_LEADING
    return lineY
  })
}

export function roomToLabelSource(room: Room): LabelSource {
  return {
    polygon: room.polygon,
    name: toJapaneseRoomName(room.name, room.type),
    type: room.type,
    areaJo: room.areaJo,
    note: room.note,
    showName: room.showName,
    showAreaJo: room.showAreaJo,
    showNote: room.showNote,
    labelFontSize: room.labelFontSize,
    noteFontSize: room.noteFontSize,
    nameLabelOffset: room.nameLabelOffset,
    areaLabelOffset: room.areaLabelOffset,
    noteLabelOffset: room.noteLabelOffset,
  }
}

export function stairDirectionLabel(stair: Pick<Stair, 'direction' | 'name'>): 'UP' | 'DOWN' {
  // 明示的に DOWN のときだけ DOWN。それ以外（up / 省略）は UP
  if (stair.direction === 'down') return 'DOWN'
  // 旧データで name だけ "DOWN" になっている場合の互換
  if (stair.name && /^down$/i.test(stair.name.trim())) return 'DOWN'
  return 'UP'
}

export function stairToLabelSource(stair: Stair): LabelSource {
  return {
    polygon: stair.polygon,
    name: stairDirectionLabel(stair),
    type: 'stairs',
    showName: stair.showName,
    showAreaJo: false,
    labelFontSize: stair.labelFontSize,
    nameLabelOffset: stair.nameLabelOffset,
  }
}

export function computeLabelLayout(source: LabelSource): RoomLabelLayout | null {
  const showName = source.showName !== false
  const hideAreaByType = source.type !== undefined && isAreaJoHiddenByType(source.type)
  const showAreaJo = !hideAreaByType && source.showAreaJo !== false
  const hasNote = Boolean(source.note) && source.showNote !== false
  const visibleLineCount = (showName ? 1 : 0) + (showAreaJo ? 1 : 0) + (hasNote ? 1 : 0)
  if (visibleLineCount === 0) return null

  const anchor = labelAnchor(source.polygon)
  const areaText = formatJo(resolveAreaJo(source))
  const { nameSize, areaSize, noteSize } = resolveFontSizes(source)

  const entries: {
    kind: LabelLineKind
    text: string
    fontSize: number
    fontWeight: number
    fill: string
    offset?: Point
    baseY: number
  }[] = []

  const sizes: { fontSize: number }[] = []
  if (showName) sizes.push({ fontSize: nameSize })
  if (showAreaJo) sizes.push({ fontSize: areaSize })
  if (hasNote) sizes.push({ fontSize: noteSize })
  const ys = layoutLineYs(anchor.y, sizes)
  let yi = 0

  if (showName) {
    entries.push({
      kind: 'name',
      text: source.name,
      fontSize: nameSize,
      fontWeight: LABEL.fontWeight,
      fill: LABEL.color,
      offset: source.nameLabelOffset,
      baseY: ys[yi++],
    })
  }
  if (showAreaJo) {
    entries.push({
      kind: 'area',
      text: areaText,
      fontSize: areaSize,
      fontWeight: LABEL.areaFontWeight,
      fill: LABEL.color,
      offset: source.areaLabelOffset,
      baseY: ys[yi++],
    })
  }
  if (hasNote) {
    entries.push({
      kind: 'note',
      text: source.note!,
      fontSize: noteSize,
      fontWeight: LABEL.areaFontWeight,
      fill: LABEL.noteColor,
      offset: source.noteLabelOffset,
      baseY: ys[yi],
    })
  }

  const lines: LabelLine[] = entries.map((entry) => ({
    kind: entry.kind,
    text: entry.text,
    x: anchor.x + (entry.offset?.x ?? 0),
    y: entry.baseY + (entry.offset?.y ?? 0),
    fontSize: entry.fontSize,
    fontWeight: entry.fontWeight,
    fill: entry.fill,
  }))

  return { lines, showName, showAreaJo }
}

export function computeRoomLabelLayout(room: Room): RoomLabelLayout | null {
  return computeLabelLayout(roomToLabelSource(room))
}

export function computeStairLabelLayout(stair: Stair): RoomLabelLayout | null {
  return computeLabelLayout(stairToLabelSource(stair))
}
