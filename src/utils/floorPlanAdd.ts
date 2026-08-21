import { defaultFixtureSizeMm, isValidFixtureType } from '../constants/fixtureOptions'
import type {
  Door,
  DoorKind,
  Fixture,
  FixtureType,
  Floor,
  FloorPlan,
  Point,
  Room,
  RoomType,
  TextLabel,
  Wall,
  Window,
} from '../types/floorPlan'
import { syncFloorWalls } from './ensureExteriorWalls'
import { mmToSvgUnits, snapSvgToMmGrid } from './roomGeometry'

export type PlaceKind =
  | 'room'
  | 'door'
  | 'window'
  | 'opening'
  | 'wall'
  | 'text'
  | `fixture:${FixtureType}`

export function isFixturePlaceKind(kind: PlaceKind): kind is `fixture:${FixtureType}` {
  return kind.startsWith('fixture:')
}

export function fixtureTypeFromPlaceKind(kind: `fixture:${FixtureType}`): FixtureType {
  const type = kind.slice('fixture:'.length)
  return isValidFixtureType(type) ? type : 'sink'
}

export function fixturePlaceKind(type: FixtureType): PlaceKind {
  return `fixture:${type}`
}

export const DEFAULT_ROOM_SIZE_MM = 2700
export const DEFAULT_DOOR_WIDTH_MM = 800
export const DEFAULT_WINDOW_WIDTH_MM = 1200
export const DEFAULT_OPENING_WIDTH_MM = 900

const EPS = 0.05
/** クリックから壁／部屋辺へ吸着する最大距離（mm） */
const SNAP_MAX_MM = 1500

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

function snapPoint(p: Point): Point {
  return { x: snapSvgToMmGrid(p.x), y: snapSvgToMmGrid(p.y) }
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function updateFloor(
  floorPlan: FloorPlan,
  floorId: string,
  updater: (floor: Floor) => Floor
): FloorPlan {
  const floorIndex = floorPlan.floors.findIndex((f) => f.id === floorId)
  if (floorIndex < 0) return floorPlan
  return {
    ...floorPlan,
    floors: floorPlan.floors.map((floor, i) => (i === floorIndex ? updater(floor) : floor)),
  }
}

function floorBounds(floor: Floor): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts = [
    ...floor.rooms.flatMap((r) => r.polygon),
    ...floor.walls.flatMap((w) => [w.start, w.end]),
    ...floor.stairs.flatMap((s) => s.polygon),
  ]
  if (pts.length === 0) {
    return { minX: 0, minY: 0, maxX: mmToSvgUnits(5400), maxY: mmToSvgUnits(5400) }
  }
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  }
}

function segmentAngleDeg(start: Point, end: Point): number {
  const raw = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI
  // 0 / 90 / 180 / -90 に丸める（描画・編集を安定させる）
  const snapped = Math.round(raw / 90) * 90
  if (snapped === 360 || snapped === -360) return 0
  if (snapped === 270) return -90
  if (snapped === -270) return 90
  return snapped
}

function projectPointOnSegment(
  point: Point,
  start: Point,
  end: Point
): { point: Point; t: number; dist: number } {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < EPS * EPS) {
    const dist = Math.hypot(point.x - start.x, point.y - start.y)
    return { point: { ...start }, t: 0, dist }
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq))
  const proj = { x: start.x + t * dx, y: start.y + t * dy }
  const dist = Math.hypot(point.x - proj.x, point.y - proj.y)
  return { point: proj, t, dist }
}

export type SnapTarget = {
  start: Point
  end: Point
  projected: Point
  angle: number
  distance: number
  wall?: Wall
}

function snapFromSegment(
  point: Point,
  start: Point,
  end: Point,
  wall?: Wall
): SnapTarget | null {
  const len = Math.hypot(end.x - start.x, end.y - start.y)
  if (len < EPS) return null
  const { point: projected, dist } = projectPointOnSegment(point, start, end)
  return {
    start,
    end,
    projected,
    angle: segmentAngleDeg(start, end),
    distance: dist,
    wall,
  }
}

function betterSnap(a: SnapTarget | null, b: SnapTarget | null): SnapTarget | null {
  if (!a) return b
  if (!b) return a
  return b.distance < a.distance ? b : a
}

/**
 * 壁と部屋・階段の辺から、クリック位置に最も近い線分へ吸着。
 * 壁があれば壁を優先（部屋辺よりわずかに遠くても壁へ載せる）。
 * preferredWallId があるときは、その壁が許容距離内なら必ずそれを使う。
 */
export function findNearestSnapTarget(
  floor: Floor,
  point: Point,
  maxDistSvg = mmToSvgUnits(SNAP_MAX_MM),
  options?: { preferredWallId?: string; wallsOnly?: boolean }
): SnapTarget | null {
  const preferredId = options?.preferredWallId
  if (preferredId) {
    const preferred = floor.walls.find((w) => w.id === preferredId)
    if (preferred) {
      const snap = snapFromSegment(point, preferred.start, preferred.end, preferred)
      // 指定壁上なら、クリックが壁から多少離れてもその壁へ投影する
      if (snap && snap.distance <= maxDistSvg * 2.5) return snap
      // 離れていても「指定壁の最近傍」に置く（設置先を明示したとき用）
      if (snap) return snap
    }
  }

  let bestWall: SnapTarget | null = null
  for (const wall of floor.walls) {
    const snap = snapFromSegment(point, wall.start, wall.end, wall)
    if (!snap || snap.distance > maxDistSvg) continue
    bestWall = betterSnap(bestWall, snap)
  }
  if (options?.wallsOnly) return bestWall

  let bestEdge: SnapTarget | null = null
  const edgeCandidates: Array<{ start: Point; end: Point }> = []
  for (const room of floor.rooms) {
    const poly = room.polygon
    for (let i = 0; i < poly.length; i++) {
      edgeCandidates.push({ start: poly[i], end: poly[(i + 1) % poly.length] })
    }
  }
  for (const stair of floor.stairs) {
    const poly = stair.polygon
    for (let i = 0; i < poly.length; i++) {
      edgeCandidates.push({ start: poly[i], end: poly[(i + 1) % poly.length] })
    }
  }
  for (const edge of edgeCandidates) {
    const snap = snapFromSegment(point, edge.start, edge.end)
    if (!snap || snap.distance > maxDistSvg) continue
    bestEdge = betterSnap(bestEdge, snap)
  }

  // 壁が近いときは壁を優先（部屋辺がわずかに近くても壁へ）
  if (bestWall && bestEdge) {
    return bestWall.distance <= bestEdge.distance + mmToSvgUnits(200) ? bestWall : bestEdge
  }
  return bestWall ?? bestEdge
}

/** @deprecated findNearestSnapTarget を使用 */
export function findNearestWall(
  floor: Floor,
  point: Point,
  maxDistSvg = mmToSvgUnits(SNAP_MAX_MM)
): { wall: Wall; projected: Point; angle: number; distance: number } | null {
  const snap = findNearestSnapTarget(floor, point, maxDistSvg)
  if (!snap?.wall) return null
  return {
    wall: snap.wall,
    projected: snap.projected,
    angle: snap.angle,
    distance: snap.distance,
  }
}

function alongSegment(
  start: Point,
  end: Point,
  center: Point,
  halfWidthSvg: number
): { start: Point; end: Point } {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return {
    start: snapPoint({ x: center.x - ux * halfWidthSvg, y: center.y - uy * halfWidthSvg }),
    end: snapPoint({ x: center.x + ux * halfWidthSvg, y: center.y + uy * halfWidthSvg }),
  }
}

/** 線分上に幅 half*2 が収まるよう中心をクランプ */
function clampCenterOnSegment(
  start: Point,
  end: Point,
  center: Point,
  halfWidthSvg: number
): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy)
  if (len < EPS) return center
  const ux = dx / len
  const uy = dy / len
  const t = ((center.x - start.x) * ux + (center.y - start.y) * uy) / len
  const halfT = Math.min(0.45, halfWidthSvg / len)
  const clampedT = Math.max(halfT, Math.min(1 - halfT, t))
  return {
    x: start.x + ux * clampedT * len,
    y: start.y + uy * clampedT * len,
  }
}

function doorHingeFromCenter(center: Point, angleDeg: number, widthSvg: number): Point {
  const rad = (angleDeg * Math.PI) / 180
  return snapPoint({
    x: center.x - Math.cos(rad) * (widthSvg / 2),
    y: center.y - Math.sin(rad) * (widthSvg / 2),
  })
}

/** 扉の中心（開口の中央） */
export function doorCenter(door: { position: Point; width: number; angle: number }): Point {
  const rad = (door.angle * Math.PI) / 180
  return {
    x: door.position.x + Math.cos(rad) * (door.width / 2),
    y: door.position.y + Math.sin(rad) * (door.width / 2),
  }
}

/**
 * クリック／ドラッグ位置を壁上に載せ、幅が収まるようクランプした扉にする。
 * 近くに壁がなければ null（呼び出し側は現状維持）。
 */
export function snapDoorOntoNearestWall(
  floor: Floor,
  door: Door,
  pointer: Point,
  options?: { preferredWallId?: string; maxDistSvg?: number }
): Door | null {
  const snap = findNearestSnapTarget(
    floor,
    pointer,
    options?.maxDistSvg ?? mmToSvgUnits(SNAP_MAX_MM),
    { preferredWallId: options?.preferredWallId, wallsOnly: true }
  )
  if (!snap) return null
  const half = door.width / 2
  const center = clampCenterOnSegment(snap.start, snap.end, snap.projected, half)
  const hinge = doorHingeFromCenter(center, snap.angle, door.width)
  return {
    ...door,
    position: { x: round(hinge.x), y: round(hinge.y) },
    angle: snap.angle,
    width: door.width,
  }
}

/** 幅変更時など、中心を保ったまま壁上に載せ直す */
export function reseatDoorOnWall(floor: Floor, door: Door, widthSvg?: number): Door {
  const nextWidth = widthSvg ?? door.width
  const center = doorCenter({ ...door, width: door.width })
  const seated = snapDoorOntoNearestWall(
    floor,
    { ...door, width: nextWidth },
    center,
    { maxDistSvg: mmToSvgUnits(SNAP_MAX_MM * 2) }
  )
  if (seated) return seated
  // 壁が見つからないときは丁番固定で幅だけ変える
  return { ...door, width: nextWidth }
}

/**
 * 窓を壁上に載せ、長さを保ったまま平行移動／端点調整する。
 */
export function snapWindowOntoNearestWall(
  floor: Floor,
  win: Window,
  pointer: Point,
  options?: { preferredWallId?: string }
): Window | null {
  const len = Math.hypot(win.end.x - win.start.x, win.end.y - win.start.y)
  const half = Math.max(len / 2, mmToSvgUnits(100))
  const snap = findNearestSnapTarget(floor, pointer, mmToSvgUnits(SNAP_MAX_MM), {
    preferredWallId: options?.preferredWallId,
    wallsOnly: true,
  })
  if (!snap) return null
  const center = clampCenterOnSegment(snap.start, snap.end, snap.projected, half)
  const { start, end } = alongSegment(snap.start, snap.end, center, half)
  return { ...win, start, end }
}

export function addRoomAt(
  floorPlan: FloorPlan,
  floorId: string,
  center: Point,
  options?: { widthMm?: number; heightMm?: number; name?: string; type?: RoomType }
): { floorPlan: FloorPlan; roomId: string } | { error: string } {
  const floor = floorPlan.floors.find((f) => f.id === floorId)
  if (!floor) return { error: '階が見つかりません。' }

  const width = mmToSvgUnits(options?.widthMm ?? DEFAULT_ROOM_SIZE_MM)
  const height = mmToSvgUnits(options?.heightMm ?? DEFAULT_ROOM_SIZE_MM)
  const c = snapPoint(center)
  const halfW = width / 2
  const halfH = height / 2
  const roomId = uid('room')
  const room: Room = {
    id: roomId,
    name: options?.name ?? '新しい部屋',
    type: options?.type ?? 'western',
    polygon: [
      { x: round(c.x - halfW), y: round(c.y - halfH) },
      { x: round(c.x + halfW), y: round(c.y - halfH) },
      { x: round(c.x + halfW), y: round(c.y + halfH) },
      { x: round(c.x - halfW), y: round(c.y + halfH) },
    ],
  }

  const next = updateFloor(floorPlan, floorId, (f) =>
    syncFloorWalls({ ...f, rooms: [...f.rooms, room] })
  )
  return { floorPlan: next, roomId }
}

export function addRoomBesideExisting(
  floorPlan: FloorPlan,
  floorId: string
): { floorPlan: FloorPlan; roomId: string } | { error: string } {
  const floor = floorPlan.floors.find((f) => f.id === floorId)
  if (!floor) return { error: '階が見つかりません。' }
  const b = floorBounds(floor)
  const size = mmToSvgUnits(DEFAULT_ROOM_SIZE_MM)
  const center = {
    x: b.maxX + size / 2 + mmToSvgUnits(100),
    y: (b.minY + b.maxY) / 2,
  }
  return addRoomAt(floorPlan, floorId, center)
}

export function addDoorAt(
  floorPlan: FloorPlan,
  floorId: string,
  position: Point,
  options?: {
    widthMm?: number
    kind?: DoorKind
    swing?: 1 | -1
    preferredWallId?: string
    /** true のとき壁・辺への吸着必須（失敗時は error） */
    requireSnap?: boolean
  }
): { floorPlan: FloorPlan; doorId: string } | { error: string } {
  const floor = floorPlan.floors.find((f) => f.id === floorId)
  if (!floor) return { error: '階が見つかりません。' }

  const kind = options?.kind ?? 'swing'
  const widthMm =
    options?.widthMm ?? (kind === 'opening' ? DEFAULT_OPENING_WIDTH_MM : DEFAULT_DOOR_WIDTH_MM)
  const widthSvg = mmToSvgUnits(widthMm)
  const requireSnap = options?.requireSnap !== false
  const snap = findNearestSnapTarget(floor, position, mmToSvgUnits(SNAP_MAX_MM), {
    preferredWallId: options?.preferredWallId,
  })

  if (!snap) {
    if (requireSnap) {
      return { error: '壁または部屋の辺の近くをクリックしてください。' }
    }
  }

  let angle = 0
  let hinge: Point

  if (snap) {
    angle = snap.angle
    const center = clampCenterOnSegment(snap.start, snap.end, snap.projected, widthSvg / 2)
    hinge = doorHingeFromCenter(center, angle, widthSvg)
  } else {
    hinge = snapPoint(position)
  }

  const doorId = uid(kind === 'opening' ? 'open' : 'door')
  const door: Door = {
    id: doorId,
    position: { x: round(hinge.x), y: round(hinge.y) },
    width: widthSvg,
    angle,
    swing: options?.swing ?? 1,
    ...(kind !== 'swing' ? { kind } : {}),
  }

  const next = updateFloor(floorPlan, floorId, (f) => ({
    ...f,
    doors: [...f.doors, door],
  }))
  return { floorPlan: next, doorId }
}

/** 選択中の壁の中央に扉／開口を置く */
export function addDoorOnWall(
  floorPlan: FloorPlan,
  floorId: string,
  wallId: string,
  options?: { widthMm?: number; kind?: DoorKind; swing?: 1 | -1 }
): { floorPlan: FloorPlan; doorId: string } | { error: string } {
  const floor = floorPlan.floors.find((f) => f.id === floorId)
  if (!floor) return { error: '階が見つかりません。' }
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return { error: '壁が見つかりません。' }
  const mid = {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  }
  return addDoorAt(floorPlan, floorId, mid, {
    ...options,
    preferredWallId: wallId,
    requireSnap: true,
  })
}

export function addWindowAt(
  floorPlan: FloorPlan,
  floorId: string,
  position: Point,
  options?: { widthMm?: number; preferredWallId?: string; requireSnap?: boolean }
): { floorPlan: FloorPlan; windowId: string } | { error: string } {
  const floor = floorPlan.floors.find((f) => f.id === floorId)
  if (!floor) return { error: '階が見つかりません。' }

  const widthMm = options?.widthMm ?? DEFAULT_WINDOW_WIDTH_MM
  const half = mmToSvgUnits(widthMm) / 2
  const requireSnap = options?.requireSnap !== false
  const snap = findNearestSnapTarget(floor, position, mmToSvgUnits(SNAP_MAX_MM), {
    preferredWallId: options?.preferredWallId,
  })

  if (!snap) {
    if (requireSnap) {
      return { error: '壁または部屋の辺の近くをクリックしてください。' }
    }
    const c = snapPoint(position)
    const start = { x: round(c.x - half), y: round(c.y) }
    const end = { x: round(c.x + half), y: round(c.y) }
    const windowId = uid('win')
    const next = updateFloor(floorPlan, floorId, (f) => ({
      ...f,
      windows: [...f.windows, { id: windowId, start, end }],
    }))
    return { floorPlan: next, windowId }
  }

  const center = clampCenterOnSegment(snap.start, snap.end, snap.projected, half)
  let { start, end } = alongSegment(snap.start, snap.end, center, half)

  // スナップ後に長さゼロになった場合のフォールバック
  if (Math.hypot(end.x - start.x, end.y - start.y) < EPS) {
    const c = snapPoint(snap.projected)
    start = { x: round(c.x - half), y: round(c.y) }
    end = { x: round(c.x + half), y: round(c.y) }
  }

  const windowId = uid('win')
  const win: Window = { id: windowId, start, end }

  const next = updateFloor(floorPlan, floorId, (f) => ({
    ...f,
    windows: [...f.windows, win],
  }))
  return { floorPlan: next, windowId }
}

/** 選択中の壁の中央に窓を置く */
export function addWindowOnWall(
  floorPlan: FloorPlan,
  floorId: string,
  wallId: string,
  options?: { widthMm?: number }
): { floorPlan: FloorPlan; windowId: string } | { error: string } {
  const floor = floorPlan.floors.find((f) => f.id === floorId)
  if (!floor) return { error: '階が見つかりません。' }
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return { error: '壁が見つかりません。' }
  const mid = {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  }
  return addWindowAt(floorPlan, floorId, mid, {
    ...options,
    preferredWallId: wallId,
    requireSnap: true,
  })
}

export function addFixtureAt(
  floorPlan: FloorPlan,
  floorId: string,
  center: Point,
  type: FixtureType,
  options?: { widthMm?: number; heightMm?: number; angle?: number }
): { floorPlan: FloorPlan; fixtureId: string } | { error: string } {
  const floor = floorPlan.floors.find((f) => f.id === floorId)
  if (!floor) return { error: '階が見つかりません。' }

  const defaults = defaultFixtureSizeMm(type)
  const width = mmToSvgUnits(options?.widthMm ?? defaults.widthMm)
  const height = mmToSvgUnits(options?.heightMm ?? defaults.heightMm)
  const c = snapPoint(center)
  const fixtureId = uid('fix')
  const fixture: Fixture = {
    id: fixtureId,
    type,
    position: { x: round(c.x - width / 2), y: round(c.y - height / 2) },
    width,
    height,
    ...(typeof options?.angle === 'number' ? { angle: options.angle } : {}),
  }

  const next = updateFloor(floorPlan, floorId, (f) => ({
    ...f,
    fixtures: [...f.fixtures, fixture],
  }))
  return { floorPlan: next, fixtureId }
}

export function addWallSegment(
  floorPlan: FloorPlan,
  floorId: string,
  start: Point,
  end: Point,
  options?: { exterior?: boolean }
): { floorPlan: FloorPlan; wallId: string } | { error: string } {
  const floor = floorPlan.floors.find((f) => f.id === floorId)
  if (!floor) return { error: '階が見つかりません。' }

  const s = snapPoint(start)
  const e = snapPoint(end)
  const dx = Math.abs(s.x - e.x)
  const dy = Math.abs(s.y - e.y)
  let startPt: Point
  let endPt: Point
  if (dx >= dy) {
    const y = round((s.y + e.y) / 2)
    startPt = { x: round(s.x), y }
    endPt = { x: round(e.x), y }
  } else {
    const x = round((s.x + e.x) / 2)
    startPt = { x, y: round(s.y) }
    endPt = { x, y: round(e.y) }
  }
  if (Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y) < mmToSvgUnits(300)) {
    return { error: '壁が短すぎます。もう少し離れた位置をクリックしてください。' }
  }

  const wallId = uid('wall')
  const wall: Wall = {
    id: wallId,
    start: startPt,
    end: endPt,
    exterior: options?.exterior ?? false,
    // 部屋を編集しても消えないようにする（壁は通常、部屋の形から作り直される）
    manual: true,
  }
  const next = updateFloor(floorPlan, floorId, (f) => ({
    ...f,
    walls: [...f.walls, wall],
  }))
  return { floorPlan: next, wallId }
}

export const DEFAULT_TEXT_LABEL = 'テキスト'

export function addTextAt(
  floorPlan: FloorPlan,
  floorId: string,
  position: Point,
  options?: { text?: string; fontSize?: number }
): { floorPlan: FloorPlan; textId: string } | { error: string } {
  const floor = floorPlan.floors.find((f) => f.id === floorId)
  if (!floor) return { error: '階が見つかりません。' }

  const c = snapPoint(position)
  const textId = uid('text')
  const label: TextLabel = {
    id: textId,
    text: (options?.text ?? DEFAULT_TEXT_LABEL).trim() || DEFAULT_TEXT_LABEL,
    position: { x: round(c.x), y: round(c.y) },
    ...(typeof options?.fontSize === 'number' ? { fontSize: options.fontSize } : {}),
  }

  const next = updateFloor(floorPlan, floorId, (f) => ({
    ...f,
    texts: [...(f.texts ?? []), label],
  }))
  return { floorPlan: next, textId }
}

