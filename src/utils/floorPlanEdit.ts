import type { FloorPlan, Point, Room, RoomFillPattern, Stair } from '../types/floorPlan'
import { isAreaJoHiddenByType } from '../constants/roomTypes'
import type { LabelLineKind } from '../renderer/roomLabelLayout'
import type { RectEdge } from './roomGeometry'
import { resizeRoomDimensionsOnFloor, resizeRoomEdgeOnFloor } from './resizeRoom'

export type SelectOptions = {
  /** Ctrl / Cmd クリックで合成用の複数選択 */
  additive?: boolean
}

export type SelectedElementRef =
  | { kind: 'room'; floorId: string; roomId: string }
  | { kind: 'stair'; floorId: string; stairId: string }

/** @deprecated SelectedElementRef を使用 */
export type SelectedRoomRef = { floorId: string; roomId: string }

type LabelOffsetPatch = {
  nameLabelOffset?: Point | null
  areaLabelOffset?: Point | null
  noteLabelOffset?: Point | null
}

export function findRoom(
  floorPlan: FloorPlan,
  ref: { floorId: string; roomId: string }
): { floorIndex: number; roomIndex: number; room: Room } | null {
  const floorIndex = floorPlan.floors.findIndex((f) => f.id === ref.floorId)
  if (floorIndex < 0) return null
  const roomIndex = floorPlan.floors[floorIndex].rooms.findIndex((r) => r.id === ref.roomId)
  if (roomIndex < 0) return null
  return { floorIndex, roomIndex, room: floorPlan.floors[floorIndex].rooms[roomIndex] }
}

export function findStair(
  floorPlan: FloorPlan,
  ref: { floorId: string; stairId: string }
): { floorIndex: number; stairIndex: number; stair: Stair } | null {
  const floorIndex = floorPlan.floors.findIndex((f) => f.id === ref.floorId)
  if (floorIndex < 0) return null
  const stairIndex = floorPlan.floors[floorIndex].stairs.findIndex((s) => s.id === ref.stairId)
  if (stairIndex < 0) return null
  return { floorIndex, stairIndex, stair: floorPlan.floors[floorIndex].stairs[stairIndex] }
}

function applyLabelOffsetPatch<T extends Room | Stair>(target: T, patch: LabelOffsetPatch): T {
  const updated = { ...target } as Room & Stair

  if ('nameLabelOffset' in patch) {
    if (patch.nameLabelOffset === null) {
      delete updated.nameLabelOffset
    } else if (patch.nameLabelOffset !== undefined) {
      updated.nameLabelOffset = { ...patch.nameLabelOffset }
    }
  }

  if ('areaLabelOffset' in patch) {
    if (patch.areaLabelOffset === null) {
      delete updated.areaLabelOffset
    } else if (patch.areaLabelOffset !== undefined) {
      updated.areaLabelOffset = { ...patch.areaLabelOffset }
    }
  }

  if ('noteLabelOffset' in patch) {
    if (patch.noteLabelOffset === null) {
      delete updated.noteLabelOffset
    } else if (patch.noteLabelOffset !== undefined) {
      updated.noteLabelOffset = { ...patch.noteLabelOffset }
    }
  }

  return updated as T
}

export function updateFloorPlanTitle(floorPlan: FloorPlan, title: string): FloorPlan {
  return { ...floorPlan, title }
}

export function updateRoom(
  floorPlan: FloorPlan,
  ref: { floorId: string; roomId: string },
  patch: {
    name?: string
    type?: Room['type']
    areaJo?: number | null
    note?: string | null
    showName?: boolean
    showAreaJo?: boolean
    showNote?: boolean
    labelFontSize?: number | null
    noteFontSize?: number | null
    fillColor?: string | null
    fillPattern?: RoomFillPattern | null
  } & LabelOffsetPatch
): FloorPlan {
  const found = findRoom(floorPlan, ref)
  if (!found) return floorPlan

  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    return {
      ...floor,
      rooms: floor.rooms.map((room, ri) => {
        if (ri !== found.roomIndex) return room
        let updated = { ...room }
        if (patch.name !== undefined) updated.name = patch.name
        if (patch.type !== undefined) {
          updated.type = patch.type
          if (isAreaJoHiddenByType(patch.type)) updated.showAreaJo = false
        }
        if (patch.areaJo === null) delete updated.areaJo
        else if (typeof patch.areaJo === 'number' && !Number.isNaN(patch.areaJo)) {
          updated.areaJo = patch.areaJo
        }
        if (patch.note === null || patch.note === '') {
          delete updated.note
          delete updated.noteFontSize
          delete updated.noteLabelOffset
          delete updated.showNote
        } else if (patch.note !== undefined) updated.note = patch.note
        if (patch.showName === true) delete updated.showName
        else if (patch.showName === false) updated.showName = false
        if (patch.showAreaJo === true) delete updated.showAreaJo
        else if (patch.showAreaJo === false) updated.showAreaJo = false
        if (patch.showNote === true) delete updated.showNote
        else if (patch.showNote === false) updated.showNote = false
        if (patch.labelFontSize === null) delete updated.labelFontSize
        else if (typeof patch.labelFontSize === 'number' && !Number.isNaN(patch.labelFontSize)) {
          updated.labelFontSize = patch.labelFontSize
        }
        if (patch.noteFontSize === null) delete updated.noteFontSize
        else if (typeof patch.noteFontSize === 'number' && !Number.isNaN(patch.noteFontSize)) {
          updated.noteFontSize = patch.noteFontSize
        }
        if (patch.fillColor === null) delete updated.fillColor
        else if (patch.fillColor !== undefined) updated.fillColor = patch.fillColor
        if (patch.fillPattern === null) delete updated.fillPattern
        else if (patch.fillPattern !== undefined) updated.fillPattern = patch.fillPattern
        updated = applyLabelOffsetPatch(updated, patch)
        return updated
      }),
    }
  })

  return { ...floorPlan, floors }
}

export function updateStair(
  floorPlan: FloorPlan,
  ref: { floorId: string; stairId: string },
  patch: {
    name?: string
    showName?: boolean
    labelFontSize?: number | null
  } & Pick<LabelOffsetPatch, 'nameLabelOffset'>
): FloorPlan {
  const found = findStair(floorPlan, ref)
  if (!found) return floorPlan

  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    return {
      ...floor,
      stairs: floor.stairs.map((stair, si) => {
        if (si !== found.stairIndex) return stair
        let updated = { ...stair }
        if (patch.name !== undefined) updated.name = patch.name
        if (patch.showName === true) delete updated.showName
        else if (patch.showName === false) updated.showName = false
        if (patch.labelFontSize === null) delete updated.labelFontSize
        else if (typeof patch.labelFontSize === 'number' && !Number.isNaN(patch.labelFontSize)) {
          updated.labelFontSize = patch.labelFontSize
        }
        updated = applyLabelOffsetPatch(updated, patch)
        return updated
      }),
    }
  })

  return { ...floorPlan, floors }
}

export function updateLabelOffset(
  floorPlan: FloorPlan,
  selection: SelectedElementRef,
  kind: LabelLineKind,
  offset: Point
): FloorPlan {
  const isZero = offset.x === 0 && offset.y === 0
  const patch: LabelOffsetPatch = {}
  if (kind === 'name') patch.nameLabelOffset = isZero ? null : offset
  if (kind === 'area') patch.areaLabelOffset = isZero ? null : offset
  if (kind === 'note') patch.noteLabelOffset = isZero ? null : offset

  if (selection.kind === 'room') {
    return updateRoom(floorPlan, selection, patch)
  }
  if (kind === 'name') {
    return updateStair(floorPlan, selection, patch)
  }
  return floorPlan
}

export function deleteRoom(floorPlan: FloorPlan, ref: { floorId: string; roomId: string }): FloorPlan {
  const found = findRoom(floorPlan, ref)
  if (!found) return floorPlan

  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    return {
      ...floor,
      rooms: floor.rooms.filter((_, ri) => ri !== found.roomIndex),
    }
  })

  return { ...floorPlan, floors }
}

export function resizeRoomEdge(
  floorPlan: FloorPlan,
  ref: { floorId: string; roomId: string },
  edge: RectEdge,
  positionSvg: number
): FloorPlan | { error: string } {
  const floorIndex = floorPlan.floors.findIndex((f) => f.id === ref.floorId)
  if (floorIndex < 0) return { error: '階が見つかりません。' }

  const result = resizeRoomEdgeOnFloor(floorPlan.floors[floorIndex], ref.roomId, edge, positionSvg)
  if ('error' in result) return result

  const floors = floorPlan.floors.map((floor, fi) => (fi === floorIndex ? result : floor))
  return { ...floorPlan, floors }
}

export function resizeRoomDimensions(
  floorPlan: FloorPlan,
  ref: { floorId: string; roomId: string },
  size: { widthMm?: number; heightMm?: number }
): FloorPlan | { error: string } {
  const floorIndex = floorPlan.floors.findIndex((f) => f.id === ref.floorId)
  if (floorIndex < 0) return { error: '階が見つかりません。' }

  const result = resizeRoomDimensionsOnFloor(floorPlan.floors[floorIndex], ref.roomId, size)
  if ('error' in result) return result

  const floors = floorPlan.floors.map((floor, fi) => (fi === floorIndex ? result : floor))
  return { ...floorPlan, floors }
}

export function listAllEditableElements(
  floorPlan: FloorPlan
): Array<{ key: string; ref: SelectedElementRef; label: string }> {
  const rooms = floorPlan.floors.flatMap((floor) =>
    floor.rooms.map((room) => ({
      key: `room:${floor.id}:${room.id}`,
      ref: { kind: 'room' as const, floorId: floor.id, roomId: room.id },
      label: `${floor.label} / ${room.name}`,
    }))
  )
  const stairs = floorPlan.floors.flatMap((floor) =>
    floor.stairs.map((stair) => ({
      key: `stair:${floor.id}:${stair.id}`,
      ref: { kind: 'stair' as const, floorId: floor.id, stairId: stair.id },
      label: `${floor.label} / ${stair.name ?? '階段'}`,
    }))
  )
  return [...rooms, ...stairs]
}

export function listAllRooms(
  floorPlan: FloorPlan
): Array<{ floorId: string; roomId: string; label: string }> {
  return listAllEditableElements(floorPlan)
    .filter((e) => e.ref.kind === 'room')
    .map((e) => ({
      floorId: e.ref.floorId,
      roomId: (e.ref as { kind: 'room'; floorId: string; roomId: string }).roomId,
      label: e.label,
    }))
}

export function elementRefToKey(ref: SelectedElementRef): string {
  if (ref.kind === 'room') return `room:${ref.floorId}:${ref.roomId}`
  return `stair:${ref.floorId}:${ref.stairId}`
}

export function parseElementRefKey(key: string): SelectedElementRef | null {
  const firstColon = key.indexOf(':')
  if (firstColon < 0) return null
  const kind = key.slice(0, firstColon)
  const rest = key.slice(firstColon + 1)
  const secondColon = rest.indexOf(':')
  if (secondColon < 0) return null
  const floorId = rest.slice(0, secondColon)
  const id = rest.slice(secondColon + 1)
  if (!floorId || !id) return null
  if (kind === 'room') return { kind: 'room', floorId, roomId: id }
  if (kind === 'stair') return { kind: 'stair', floorId, stairId: id }
  return null
}
