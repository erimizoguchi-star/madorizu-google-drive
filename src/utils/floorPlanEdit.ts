import type { Door, DoorKind, Fixture, FixtureType, Floor, FloorPlan, HiddenWall, Point, Room, RoomFillPattern, Stair, StairLayout, StairOrientation, TextLabel, Wall, Window, WindowKind } from '../types/floorPlan'
import { orientationToDirection } from '../constants/stairOptions'
import { doorKindLabel } from '../constants/doorOptions'
import { windowKindLabel } from '../constants/windowOptions'
import { defaultFixtureSizeMm, fixtureTypeLabel } from '../constants/fixtureOptions'
import {
  STAIR_DEFAULT_WIDTH_MM,
  withStairLength,
  withStairWidth,
} from './resizeStair'
import { isAreaJoHiddenByType, toJapaneseRoomName } from '../constants/roomTypes'
import type { LabelLineKind } from '../renderer/roomLabelLayout'
import { mmToSvgUnits, snapSvgToMmGrid, type RectEdge } from './roomGeometry'
import { resizeRoomDimensionsOnFloor, resizeRoomEdgeOnFloor } from './resizeRoom'
import { findWallPairKey, syncFloorWalls } from './ensureExteriorWalls'
import { reseatDoorOnWall, snapWindowOntoNearestWall } from './floorPlanAdd'

export type SelectOptions = {
  /** Ctrl / Cmd クリックで合成用の複数選択 */
  additive?: boolean
  /**
   * 合成用の選択リストを触らずに、詳細パネルの対象だけ切り替える。
   * 合成リストのチェックボックス側が選択を管理しているときに使う。
   */
  keepMergeSelection?: boolean
}

export type SelectedElementRef =
  | { kind: 'room'; floorId: string; roomId: string }
  | { kind: 'stair'; floorId: string; stairId: string }
  | { kind: 'wall'; floorId: string; wallId: string }
  | { kind: 'door'; floorId: string; doorId: string }
  | { kind: 'window'; floorId: string; windowId: string }
  | { kind: 'fixture'; floorId: string; fixtureId: string }
  | { kind: 'text'; floorId: string; textId: string }

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

export function findWall(
  floorPlan: FloorPlan,
  ref: { floorId: string; wallId: string }
): { floorIndex: number; wallIndex: number; wall: Wall } | null {
  const floorIndex = floorPlan.floors.findIndex((f) => f.id === ref.floorId)
  if (floorIndex < 0) return null
  const wallIndex = floorPlan.floors[floorIndex].walls.findIndex((w) => w.id === ref.wallId)
  if (wallIndex < 0) return null
  return { floorIndex, wallIndex, wall: floorPlan.floors[floorIndex].walls[wallIndex] }
}

export function findDoor(
  floorPlan: FloorPlan,
  ref: { floorId: string; doorId: string }
): { floorIndex: number; doorIndex: number; door: Door } | null {
  const floorIndex = floorPlan.floors.findIndex((f) => f.id === ref.floorId)
  if (floorIndex < 0) return null
  const doorIndex = floorPlan.floors[floorIndex].doors.findIndex((d) => d.id === ref.doorId)
  if (doorIndex < 0) return null
  return { floorIndex, doorIndex, door: floorPlan.floors[floorIndex].doors[doorIndex] }
}

export function findWindow(
  floorPlan: FloorPlan,
  ref: { floorId: string; windowId: string }
): { floorIndex: number; windowIndex: number; window: Window } | null {
  const floorIndex = floorPlan.floors.findIndex((f) => f.id === ref.floorId)
  if (floorIndex < 0) return null
  const windowIndex = floorPlan.floors[floorIndex].windows.findIndex((w) => w.id === ref.windowId)
  if (windowIndex < 0) return null
  return { floorIndex, windowIndex, window: floorPlan.floors[floorIndex].windows[windowIndex] }
}

export function findFixture(
  floorPlan: FloorPlan,
  ref: { floorId: string; fixtureId: string }
): { floorIndex: number; fixtureIndex: number; fixture: Fixture } | null {
  const floorIndex = floorPlan.floors.findIndex((f) => f.id === ref.floorId)
  if (floorIndex < 0) return null
  const fixtureIndex = floorPlan.floors[floorIndex].fixtures.findIndex((f) => f.id === ref.fixtureId)
  if (fixtureIndex < 0) return null
  return { floorIndex, fixtureIndex, fixture: floorPlan.floors[floorIndex].fixtures[fixtureIndex] }
}

export function findTextLabel(
  floorPlan: FloorPlan,
  ref: { floorId: string; textId: string }
): { floorIndex: number; textIndex: number; label: TextLabel } | null {
  const floorIndex = floorPlan.floors.findIndex((f) => f.id === ref.floorId)
  if (floorIndex < 0) return null
  const texts = floorPlan.floors[floorIndex].texts ?? []
  const textIndex = texts.findIndex((t) => t.id === ref.textId)
  if (textIndex < 0) return null
  return { floorIndex, textIndex, label: texts[textIndex] }
}

export function updateTextLabel(
  floorPlan: FloorPlan,
  ref: { floorId: string; textId: string },
  patch: { text?: string; fontSize?: number | null; angle?: number | null }
): FloorPlan {
  const found = findTextLabel(floorPlan, ref)
  if (!found) return floorPlan

  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    const texts = floor.texts ?? []
    return {
      ...floor,
      texts: texts.map((label, i) => {
        if (i !== found.textIndex) return label
        let updated = { ...label }
        if (typeof patch.text === 'string') {
          const trimmed = patch.text.trim()
          updated.text = trimmed.length > 0 ? trimmed : label.text
        }
        if (patch.fontSize === null) delete updated.fontSize
        else if (typeof patch.fontSize === 'number' && !Number.isNaN(patch.fontSize)) {
          updated.fontSize = patch.fontSize
        }
        if (patch.angle === null) delete updated.angle
        else if (typeof patch.angle === 'number' && Number.isFinite(patch.angle)) {
          updated.angle = patch.angle
        }
        return updated
      }),
    }
  })
  return { ...floorPlan, floors }
}

export function deleteTextLabel(
  floorPlan: FloorPlan,
  ref: { floorId: string; textId: string }
): FloorPlan {
  const found = findTextLabel(floorPlan, ref)
  if (!found) return floorPlan
  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    return {
      ...floor,
      texts: (floor.texts ?? []).filter((_, i) => i !== found.textIndex),
    }
  })
  return { ...floorPlan, floors }
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
    /** null でクリア。配列は polygon 頂点と同じ長さ */
    cornerRadiiMm?: number[] | null
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
          // タイプ変更時は表示名も日本語デフォルトに合わせる（名前を明示変更していない場合）
          if (patch.name === undefined) {
            updated.name = toJapaneseRoomName(updated.name, patch.type)
          }
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
        if (patch.cornerRadiiMm === null) delete updated.cornerRadiiMm
        else if (patch.cornerRadiiMm !== undefined) {
          const cleaned = patch.cornerRadiiMm.map((v) =>
            typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0
          )
          if (cleaned.some((v) => v > 0)) updated.cornerRadiiMm = cleaned
          else delete updated.cornerRadiiMm
        }
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
    layout?: StairLayout
    orientation?: StairOrientation | null
    direction?: 'up' | 'down'
    widthMm?: number
    lengthMm?: number
    /** 平行移動（SVG単位） */
    moveBy?: Point
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
        if (patch.layout !== undefined) updated.layout = patch.layout
        if (patch.orientation === null) delete updated.orientation
        else if (patch.orientation !== undefined) {
          updated.orientation = patch.orientation
          updated.direction = orientationToDirection(patch.orientation)
        }
        if (patch.direction !== undefined) updated.direction = patch.direction
        if (typeof patch.widthMm === 'number' && patch.widthMm > 0) {
          updated = withStairWidth(updated, patch.widthMm)
        } else if (patch.layout !== undefined || patch.orientation !== undefined || patch.orientation === null) {
          updated = withStairWidth(updated, updated.widthMm ?? STAIR_DEFAULT_WIDTH_MM)
        }
        if (typeof patch.lengthMm === 'number' && patch.lengthMm > 0) {
          updated = withStairLength(updated, patch.lengthMm)
        }
        // 平行移動は moveStair / setStairPolygon 側で開口追従と壁同期する
        updated = applyLabelOffsetPatch(updated, patch)
        return updated
      }),
    }
  })

  let nextPlan: FloorPlan = { ...floorPlan, floors }
  if (patch.moveBy) {
    nextPlan = moveStair(nextPlan, ref, patch.moveBy)
  }
  return nextPlan
}

export function deleteStair(
  floorPlan: FloorPlan,
  ref: { floorId: string; stairId: string }
): FloorPlan {
  const found = findStair(floorPlan, ref)
  if (!found) return floorPlan

  const stair = found.stair
  const edgeTol = mmToSvgUnits(50)
  const spaceKey = `stair:${stair.id}`

  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    const next = {
      ...floor,
      stairs: floor.stairs.filter((_, si) => si !== found.stairIndex),
      doors: floor.doors.filter(
        (door) =>
          !openingBelongsOnlyToSpace(
            doorSamplePoints(door),
            spaceKey,
            stair.polygon,
            floor,
            edgeTol
          )
      ),
      windows: floor.windows.filter(
        (win) =>
          !openingBelongsOnlyToSpace(
            [win.start, win.end],
            spaceKey,
            stair.polygon,
            floor,
            edgeTol
          )
      ),
      fixtures: floor.fixtures.filter((fixture) => {
        const center = {
          x: fixture.position.x + fixture.width / 2,
          y: fixture.position.y + fixture.height / 2,
        }
        return !isPointInsidePolygon(center, stair.polygon)
      }),
    }
    // 階段があった場所が空白にならないよう、壁と部屋の充填をやり直す
    return next.rooms.length > 0 ? syncFloorWalls(next) : next
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
  if (selection.kind === 'stair' && kind === 'name') {
    return updateStair(floorPlan, selection, patch)
  }
  return floorPlan
}

export function deleteRoom(floorPlan: FloorPlan, ref: { floorId: string; roomId: string }): FloorPlan {
  const found = findRoom(floorPlan, ref)
  if (!found) return floorPlan

  const room = found.room
  const edgeTol = mmToSvgUnits(50)
  const spaceKey = `room:${room.id}`

  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    const next = {
      ...floor,
      rooms: floor.rooms.filter((_, ri) => ri !== found.roomIndex),
      // 消した部屋専用の開口・設備も一緒に消す（他室・階段共有壁のものは残す）
      doors: floor.doors.filter(
        (door) =>
          !openingBelongsOnlyToSpace(doorSamplePoints(door), spaceKey, room.polygon, floor, edgeTol)
      ),
      windows: floor.windows.filter(
        (win) =>
          !openingBelongsOnlyToSpace([win.start, win.end], spaceKey, room.polygon, floor, edgeTol)
      ),
      fixtures: floor.fixtures.filter((fixture) => {
        const center = {
          x: fixture.position.x + fixture.width / 2,
          y: fixture.position.y + fixture.height / 2,
        }
        return !isPointInsidePolygon(center, room.polygon)
      }),
    }
    return next.rooms.length > 0 ? syncFloorWalls(next) : next
  })

  return { ...floorPlan, floors }
}

export function updateDoor(
  floorPlan: FloorPlan,
  ref: { floorId: string; doorId: string },
  patch: {
    widthMm?: number
    angle?: number
    swing?: 1 | -1
    kind?: DoorKind
    /** 丁番を反対側へ移す（角度を180°反転） */
    flipHinge?: boolean
  }
): FloorPlan {
  const found = findDoor(floorPlan, ref)
  if (!found) return floorPlan

  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    return {
      ...floor,
      doors: floor.doors.map((door, di) => {
        if (di !== found.doorIndex) return door
        let updated = { ...door }
        if (typeof patch.angle === 'number' && Number.isFinite(patch.angle)) {
          updated.angle = patch.angle
        }
        if (patch.swing === 1 || patch.swing === -1) updated.swing = patch.swing
        if (patch.kind === 'swing') delete updated.kind
        else if (patch.kind !== undefined) updated.kind = patch.kind
        if (patch.flipHinge) {
          const rad = (updated.angle * Math.PI) / 180
          updated = {
            ...updated,
            position: {
              x: updated.position.x + updated.width * Math.cos(rad),
              y: updated.position.y + updated.width * Math.sin(rad),
            },
            angle: ((updated.angle + 180) % 360 + 360) % 360,
            swing: updated.swing === 1 ? -1 : 1,
          }
        }
        if (typeof patch.widthMm === 'number' && patch.widthMm > 0) {
          const widthSvg = mmToSvgUnits(Math.min(3000, Math.max(300, patch.widthMm)))
          updated = reseatDoorOnWall(floor, updated, widthSvg)
        } else if (patch.angle !== undefined || patch.flipHinge) {
          // 向き変更後も壁上に載せ直す
          updated = reseatDoorOnWall(floor, updated)
        }
        return updated
      }),
    }
  })

  return { ...floorPlan, floors }
}

export function updateFixture(
  floorPlan: FloorPlan,
  ref: { floorId: string; fixtureId: string },
  patch: {
    type?: FixtureType
    widthMm?: number
    heightMm?: number
    angle?: number
  }
): FloorPlan {
  const found = findFixture(floorPlan, ref)
  if (!found) return floorPlan

  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    return {
      ...floor,
      fixtures: floor.fixtures.map((fixture, i) => {
        if (i !== found.fixtureIndex) return fixture
        let updated = { ...fixture }
        if (patch.type !== undefined && patch.type !== fixture.type) {
          const size = defaultFixtureSizeMm(patch.type)
          const cx = fixture.position.x + fixture.width / 2
          const cy = fixture.position.y + fixture.height / 2
          const width = mmToSvgUnits(size.widthMm)
          const height = mmToSvgUnits(size.heightMm)
          updated = {
            ...updated,
            type: patch.type,
            width,
            height,
            position: {
              x: cx - width / 2,
              y: cy - height / 2,
            },
          }
        }
        if (typeof patch.widthMm === 'number' && patch.widthMm > 0) {
          const width = mmToSvgUnits(patch.widthMm)
          const cx = updated.position.x + updated.width / 2
          updated = {
            ...updated,
            width,
            position: { ...updated.position, x: cx - width / 2 },
          }
        }
        if (typeof patch.heightMm === 'number' && patch.heightMm > 0) {
          const height = mmToSvgUnits(patch.heightMm)
          const cy = updated.position.y + updated.height / 2
          updated = {
            ...updated,
            height,
            position: { ...updated.position, y: cy - height / 2 },
          }
        }
        if (typeof patch.angle === 'number' && Number.isFinite(patch.angle)) {
          updated.angle = patch.angle
        }
        return updated
      }),
    }
  })

  return { ...floorPlan, floors }
}

export function updateWindow(
  floorPlan: FloorPlan,
  ref: { floorId: string; windowId: string },
  patch: {
    kind?: WindowKind
    /** すべり出し窓などが開く向き */
    outward?: 1 | -1
    /** 窓の幅（mm）。壁上で中心を保って伸縮 */
    widthMm?: number
  }
): FloorPlan {
  const found = findWindow(floorPlan, ref)
  if (!found) return floorPlan

  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    return {
      ...floor,
      windows: floor.windows.map((win, wi) => {
        if (wi !== found.windowIndex) return win
        let updated = { ...win }
        if (patch.kind === 'sliding') delete updated.kind
        else if (patch.kind !== undefined) updated.kind = patch.kind
        if (patch.outward !== undefined) updated.outward = patch.outward
        if (typeof patch.widthMm === 'number' && patch.widthMm > 0) {
          const widthSvg = mmToSvgUnits(Math.min(6000, Math.max(300, patch.widthMm)))
          const mid = {
            x: (updated.start.x + updated.end.x) / 2,
            y: (updated.start.y + updated.end.y) / 2,
          }
          const half = widthSvg / 2
          const draft = {
            ...updated,
            start: { x: mid.x - half, y: mid.y },
            end: { x: mid.x + half, y: mid.y },
          }
          updated = snapWindowOntoNearestWall(floor, draft, mid) ?? draft
        }
        return updated
      }),
    }
  })

  return { ...floorPlan, floors }
}

export function moveRoom(
  floorPlan: FloorPlan,
  ref: { floorId: string; roomId: string },
  delta: Point
): FloorPlan {
  const found = findRoom(floorPlan, ref)
  if (!found) return floorPlan

  const dx = snapSvgToMmGrid(delta.x)
  const dy = snapSvgToMmGrid(delta.y)
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return floorPlan

  const movedPolygon = found.room.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy }))
  return setRoomPolygon(floorPlan, ref, movedPolygon)
}

export function moveStair(
  floorPlan: FloorPlan,
  ref: { floorId: string; stairId: string },
  delta: Point
): FloorPlan {
  const found = findStair(floorPlan, ref)
  if (!found) return floorPlan

  const dx = snapSvgToMmGrid(delta.x)
  const dy = snapSvgToMmGrid(delta.y)
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return floorPlan

  const movedPolygon = found.stair.polygon.map((p) => ({ x: p.x + dx, y: p.y + dy }))
  return setStairPolygon(floorPlan, ref, movedPolygon)
}

/** 部屋ポリゴンを絶対座標で置き換え（平行移動時は、その部屋専用の扉・窓・室内設備だけ追従） */
export function setRoomPolygon(
  floorPlan: FloorPlan,
  ref: { floorId: string; roomId: string },
  polygon: Point[]
): FloorPlan {
  const found = findRoom(floorPlan, ref)
  if (!found || polygon.length < 3) return floorPlan
  return setSpacePolygon(floorPlan, found.floorIndex, {
    kind: 'room',
    index: found.roomIndex,
    id: found.room.id,
    oldPolygon: found.room.polygon,
    newPolygon: polygon,
  })
}

/** 階段ポリゴンを絶対座標で置き換え（部屋と同じく、専用の扉・窓・設備だけ追従＋壁同期） */
export function setStairPolygon(
  floorPlan: FloorPlan,
  ref: { floorId: string; stairId: string },
  polygon: Point[]
): FloorPlan {
  const found = findStair(floorPlan, ref)
  if (!found || polygon.length < 3) return floorPlan
  return setSpacePolygon(floorPlan, found.floorIndex, {
    kind: 'stair',
    index: found.stairIndex,
    id: found.stair.id,
    oldPolygon: found.stair.polygon,
    newPolygon: polygon,
  })
}

type SpaceMoveTarget = {
  kind: 'room' | 'stair'
  index: number
  id: string
  oldPolygon: Point[]
  newPolygon: Point[]
}

function setSpacePolygon(
  floorPlan: FloorPlan,
  floorIndex: number,
  target: SpaceMoveTarget
): FloorPlan {
  const incoming = target.newPolygon
  const oldPolygon = target.oldPolygon
  if (incoming.length < 3 || oldPolygon.length < 3) return floorPlan

  const rawDx = incoming[0].x - oldPolygon[0].x
  const rawDy = incoming[0].y - oldPolygon[0].y
  // スナップ前の入力で平行移動かを判定（頂点ごとの mm スナップで形状がわずかに変わると追従が外れるため）
  const translating =
    oldPolygon.length === incoming.length &&
    oldPolygon.every((p, i) => {
      const q = incoming[i]
      return Math.abs(q.x - p.x - rawDx) < 0.05 && Math.abs(q.y - p.y - rawDy) < 0.05
    })

  const dx = translating ? snapSvgToMmGrid(rawDx) : 0
  const dy = translating ? snapSvgToMmGrid(rawDy) : 0
  const snapped = translating
    ? oldPolygon.map((p) => ({ x: p.x + dx, y: p.y + dy }))
    : incoming.map((p) => ({
        x: snapSvgToMmGrid(p.x),
        y: snapSvgToMmGrid(p.y),
      }))

  if (translating && Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return floorPlan

  const spaceKey = `${target.kind}:${target.id}`
  const edgeTol = mmToSvgUnits(50)

  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== floorIndex) return floor
    const next = {
      ...floor,
      rooms:
        target.kind === 'room'
          ? floor.rooms.map((r, ri) => (ri === target.index ? { ...r, polygon: snapped } : r))
          : floor.rooms,
      stairs:
        target.kind === 'stair'
          ? floor.stairs.map((s, si) => (si === target.index ? { ...s, polygon: snapped } : s))
          : floor.stairs,
      doors: translating
        ? floor.doors.map((door) => {
            if (
              !openingBelongsOnlyToSpace(
                doorSamplePoints(door),
                spaceKey,
                oldPolygon,
                floor,
                edgeTol
              )
            ) {
              return door
            }
            return { ...door, position: { x: door.position.x + dx, y: door.position.y + dy } }
          })
        : floor.doors,
      windows: translating
        ? floor.windows.map((win) => {
            if (
              !openingBelongsOnlyToSpace(
                [win.start, win.end],
                spaceKey,
                oldPolygon,
                floor,
                edgeTol
              )
            ) {
              return win
            }
            return {
              ...win,
              start: { x: win.start.x + dx, y: win.start.y + dy },
              end: { x: win.end.x + dx, y: win.end.y + dy },
            }
          })
        : floor.windows,
      fixtures: translating
        ? floor.fixtures.map((fixture) => {
            const center = {
              x: fixture.position.x + fixture.width / 2,
              y: fixture.position.y + fixture.height / 2,
            }
            if (!isPointInsidePolygon(center, oldPolygon)) return fixture
            if (
              floorSpaceEntries(floor).some(
                (other) =>
                  other.key !== spaceKey && isPointInsidePolygon(center, other.polygon)
              )
            ) {
              return fixture
            }
            return {
              ...fixture,
              position: {
                x: fixture.position.x + dx,
                y: fixture.position.y + dy,
              },
            }
          })
        : floor.fixtures,
    }
    return syncFloorWalls(next)
  })

  return { ...floorPlan, floors }
}

function doorSamplePoints(door: Door): Point[] {
  const rad = (door.angle * Math.PI) / 180
  const a = door.position
  const b = {
    x: a.x + door.width * Math.cos(rad),
    y: a.y + door.width * Math.sin(rad),
  }
  return [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b]
}

function floorSpaceEntries(floor: Floor): { key: string; polygon: Point[] }[] {
  return [
    ...floor.rooms.map((r) => ({ key: `room:${r.id}`, polygon: r.polygon })),
    ...floor.stairs.map((s) => ({ key: `stair:${s.id}`, polygon: s.polygon })),
  ]
}

/**
 * 開口が「移動中の空間（部屋 or 階段）の辺上にあり、かつ他空間の辺上にはない」ときだけ true。
 * 隣接して追加した部屋・階段を動かすとき、共有壁の扉・窓を持っていかない。
 */
function openingBelongsOnlyToSpace(
  points: Point[],
  spaceKey: string,
  spacePolygon: Point[],
  floor: Floor,
  tolerance: number
): boolean {
  if (points.length === 0) return false
  if (!points.every((p) => isPointNearPolygonEdge(p, spacePolygon, tolerance))) {
    return false
  }
  for (const other of floorSpaceEntries(floor)) {
    if (other.key === spaceKey) continue
    if (points.some((p) => isPointNearPolygonEdge(p, other.polygon, tolerance))) {
      return false
    }
  }
  return true
}

function isPointInsidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function isPointNearPolygonEdge(point: Point, polygon: Point[], tolerance: number): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-6) continue
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
    const projX = a.x + t * dx
    const projY = a.y + t * dy
    if (Math.hypot(point.x - projX, point.y - projY) <= tolerance) return true
  }
  return false
}

export function deleteWall(floorPlan: FloorPlan, ref: { floorId: string; wallId: string }): FloorPlan {
  const found = findWall(floorPlan, ref)
  if (!found) return floorPlan

  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor

    const wall = floor.walls[found.wallIndex]
    const next = {
      ...floor,
      walls: floor.walls.filter((_, wi) => wi !== found.wallIndex),
    }
    // 手動で足した壁は消せば終わりだが、自動生成の壁は「消したこと」を覚えないと
    // 部屋を動かしたときに作り直されて復活してしまう
    if (!wall || wall.manual) return next

    const pair = findWallPairKey(floor, wall)
    const hidden: HiddenWall = pair
      ? { pair }
      : { start: { ...wall.start }, end: { ...wall.end } }

    return { ...next, hiddenWalls: [...(floor.hiddenWalls ?? []), hidden] }
  })

  return { ...floorPlan, floors }
}

export function deleteDoor(floorPlan: FloorPlan, ref: { floorId: string; doorId: string }): FloorPlan {
  const found = findDoor(floorPlan, ref)
  if (!found) return floorPlan
  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    return { ...floor, doors: floor.doors.filter((_, i) => i !== found.doorIndex) }
  })
  return { ...floorPlan, floors }
}

export function deleteWindow(floorPlan: FloorPlan, ref: { floorId: string; windowId: string }): FloorPlan {
  const found = findWindow(floorPlan, ref)
  if (!found) return floorPlan
  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    return { ...floor, windows: floor.windows.filter((_, i) => i !== found.windowIndex) }
  })
  return { ...floorPlan, floors }
}

export function deleteFixture(floorPlan: FloorPlan, ref: { floorId: string; fixtureId: string }): FloorPlan {
  const found = findFixture(floorPlan, ref)
  if (!found) return floorPlan
  const floors = floorPlan.floors.map((floor, fi) => {
    if (fi !== found.floorIndex) return floor
    return { ...floor, fixtures: floor.fixtures.filter((_, i) => i !== found.fixtureIndex) }
  })
  return { ...floorPlan, floors }
}

/** 選択できる要素はすべて削除できる（階段も対象） */
export function isDeletableSelection(_ref: SelectedElementRef): boolean {
  return true
}

export function deleteSelectedElement(floorPlan: FloorPlan, ref: SelectedElementRef): FloorPlan {
  switch (ref.kind) {
    case 'room':
      return deleteRoom(floorPlan, ref)
    case 'wall':
      return deleteWall(floorPlan, ref)
    case 'door':
      return deleteDoor(floorPlan, ref)
    case 'window':
      return deleteWindow(floorPlan, ref)
    case 'fixture':
      return deleteFixture(floorPlan, ref)
    case 'stair':
      return deleteStair(floorPlan, ref)
    case 'text':
      return deleteTextLabel(floorPlan, ref)
  }
}

export function isTypingInEditableField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
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
      label: `${floor.label} / 階段 ${stair.direction === 'down' ? 'DOWN' : 'UP'}`,
    }))
  )
  const walls = floorPlan.floors.flatMap((floor) =>
    floor.walls.map((wall) => ({
      key: `wall:${floor.id}:${wall.id}`,
      ref: { kind: 'wall' as const, floorId: floor.id, wallId: wall.id },
      label: `${floor.label} / ${wall.exterior ? '外壁' : '内壁'} ${wall.id}`,
    }))
  )
  const doors = floorPlan.floors.flatMap((floor) =>
    floor.doors.map((door, i) => {
      const label = doorKindLabel(door.kind)
      return {
        key: `door:${floor.id}:${door.id}`,
        ref: { kind: 'door' as const, floorId: floor.id, doorId: door.id },
        label: `${floor.label} / ${label} ${i + 1}`,
      }
    })
  )
  const windows = floorPlan.floors.flatMap((floor) =>
    floor.windows.map((win, i) => ({
      key: `window:${floor.id}:${win.id}`,
      ref: { kind: 'window' as const, floorId: floor.id, windowId: win.id },
      label: `${floor.label} / ${windowKindLabel(win.kind)} ${i + 1}`,
    }))
  )
  const fixtures = floorPlan.floors.flatMap((floor) =>
    floor.fixtures.map((fixture) => ({
      key: `fixture:${floor.id}:${fixture.id}`,
      ref: { kind: 'fixture' as const, floorId: floor.id, fixtureId: fixture.id },
      label: `${floor.label} / ${fixtureTypeLabel(fixture.type)}`,
    }))
  )
  const texts = floorPlan.floors.flatMap((floor) =>
    (floor.texts ?? []).map((t, i) => ({
      key: `text:${floor.id}:${t.id}`,
      ref: { kind: 'text' as const, floorId: floor.id, textId: t.id },
      label: `${floor.label} / 文字「${t.text || i + 1}」`,
    }))
  )
  return [...rooms, ...stairs, ...walls, ...doors, ...windows, ...fixtures, ...texts]
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
  if (ref.kind === 'stair') return `stair:${ref.floorId}:${ref.stairId}`
  if (ref.kind === 'wall') return `wall:${ref.floorId}:${ref.wallId}`
  if (ref.kind === 'door') return `door:${ref.floorId}:${ref.doorId}`
  if (ref.kind === 'window') return `window:${ref.floorId}:${ref.windowId}`
  if (ref.kind === 'text') return `text:${ref.floorId}:${ref.textId}`
  return `fixture:${ref.floorId}:${ref.fixtureId}`
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
  if (kind === 'wall') return { kind: 'wall', floorId, wallId: id }
  if (kind === 'door') return { kind: 'door', floorId, doorId: id }
  if (kind === 'window') return { kind: 'window', floorId, windowId: id }
  if (kind === 'fixture') return { kind: 'fixture', floorId, fixtureId: id }
  if (kind === 'text') return { kind: 'text', floorId, textId: id }
  return null
}
