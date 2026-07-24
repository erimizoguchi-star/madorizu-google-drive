import type {
  Door,
  Fixture,
  FixtureType,
  Floor,
  FloorPlan,
  Point,
  Room,
  RoomType,
  Stair,
  StairLayout,
  StairOrientation,
  Wall,
  Window,
} from '../types/floorPlan'
import { isValidDoorKind } from '../constants/doorOptions'
import { isValidWindowKind } from '../constants/windowOptions'
import { isAreaJoHiddenByType } from '../constants/roomTypes'
import { closeCoverageGaps } from './closeCoverageGaps'
import { syncFloorWalls } from './ensureExteriorWalls'
import { mmToSvgUnits } from './roomGeometry'
import { STAIR_DEFAULT_WIDTH_MM, withStairWidth } from './resizeStair'

const VALID_ROOM_TYPES = new Set<RoomType>([
  'ld',
  'kitchen',
  'bathroom',
  'toilet',
  'washroom',
  'japanese',
  'western',
  'hallway',
  'entrance',
  'stairs',
  'storage',
  'porch',
  'attic',
  'void',
  'other',
])

const VALID_FIXTURE_TYPES = new Set<FixtureType>([
  'bathtub',
  'toilet',
  'sink',
  'stove',
  'kitchen_sink',
  'refrigerator',
  'washer',
  'car',
])

const MM_THRESHOLD = 800
const SNAP_MM = 50
const RECT_TOLERANCE_MM = 200

function snapMm(n: number): number {
  return Math.round(n / SNAP_MM) * SNAP_MM
}

function snapMmPoint(p: Point): Point {
  return { x: snapMm(p.x), y: snapMm(p.y) }
}

function refineRoomPolygonMm(points: Point[]): Point[] {
  const snapped = points.map(snapMmPoint)
  if (snapped.length !== 4) return snapped

  const xs = snapped.map((p) => p.x)
  const ys = snapped.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]

  const matchesRect = snapped.every((p) =>
    corners.some(
      (c) => Math.abs(p.x - c.x) <= RECT_TOLERANCE_MM && Math.abs(p.y - c.y) <= RECT_TOLERANCE_MM
    )
  )
  return matchesRect ? corners : snapped
}

function refineWallMm(start: Point, end: Point): { start: Point; end: Point } {
  const s = snapMmPoint(start)
  const e = snapMmPoint(end)
  const dx = Math.abs(s.x - e.x)
  const dy = Math.abs(s.y - e.y)

  if (dx < dy * 0.15) {
    const x = snapMm((s.x + e.x) / 2)
    return { start: { x, y: s.y }, end: { x, y: e.y } }
  }
  if (dy < dx * 0.15) {
    const y = snapMm((s.y + e.y) / 2)
    return { start: { x: s.x, y }, end: { x: e.x, y } }
  }
  return { start: s, end: e }
}

function prepareMmPoint(p: Point): Point {
  return snapMmPoint(p)
}

function prepareMmPolygon(points: Point[]): Point[] {
  return refineRoomPolygonMm(points)
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toPoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object') return null
  const p = value as { x?: unknown; y?: unknown }
  const x = toNumber(p.x, NaN)
  const y = toNumber(p.y, NaN)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function toPolygon(value: unknown): Point[] {
  if (!Array.isArray(value)) return []
  return value.map(toPoint).filter((p): p is Point => p != null)
}

function collectPlanPoints(plan: FloorPlan): Point[] {
  const points: Point[] = []
  for (const floor of plan.floors ?? []) {
    for (const room of floor.rooms ?? []) {
      points.push(...(room.polygon ?? []))
    }
    for (const wall of floor.walls ?? []) {
      if (wall.start) points.push(wall.start)
      if (wall.end) points.push(wall.end)
    }
    for (const door of floor.doors ?? []) {
      if (door.position) points.push(door.position)
    }
    for (const win of floor.windows ?? []) {
      if (win.start) points.push(win.start)
      if (win.end) points.push(win.end)
    }
    for (const fixture of floor.fixtures ?? []) {
      if (fixture.position) points.push(fixture.position)
    }
    for (const stair of floor.stairs ?? []) {
      points.push(...(stair.polygon ?? []))
    }
  }
  return points
}

function planUsesMmCoordinates(plan: FloorPlan): boolean {
  const points = collectPlanPoints(plan)
  if (points.length === 0) return false
  const maxCoord = Math.max(...points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))
  return maxCoord > MM_THRESHOLD
}

function scalePoint(p: Point): Point {
  return { x: mmToSvgUnits(p.x), y: mmToSvgUnits(p.y) }
}

function scalePolygon(points: Point[]): Point[] {
  return points.map(scalePoint)
}

function sanitizeRoomType(type: unknown): RoomType {
  return typeof type === 'string' && VALID_ROOM_TYPES.has(type as RoomType)
    ? (type as RoomType)
    : 'other'
}

function sanitizeFixtureType(type: unknown): FixtureType {
  return typeof type === 'string' && VALID_FIXTURE_TYPES.has(type as FixtureType)
    ? (type as FixtureType)
    : 'sink'
}

function sanitizeRoom(room: Room, index: number, useMm: boolean): Room | null {
  const polygon = toPolygon(room.polygon)
  if (polygon.length < 3) return null

  const preparedPolygon = useMm ? prepareMmPolygon(polygon) : polygon
  const scaledPolygon = useMm ? scalePolygon(preparedPolygon) : preparedPolygon
  const type = sanitizeRoomType(room.type)

  return {
    ...room,
    id: room.id || `room-${index}`,
    name: room.name || `部屋${index + 1}`,
    type,
    polygon: scaledPolygon,
    ...(isAreaJoHiddenByType(type) ? { showAreaJo: false as const } : {}),
  }
}

function sanitizeWall(wall: Wall, index: number, useMm: boolean): Wall | null {
  const start = toPoint(wall.start)
  const end = toPoint(wall.end)
  if (!start || !end) return null

  if (useMm) {
    const refined = refineWallMm(start, end)
    return {
      ...wall,
      id: wall.id || `wall-${index}`,
      start: scalePoint(refined.start),
      end: scalePoint(refined.end),
    }
  }

  return {
    ...wall,
    id: wall.id || `wall-${index}`,
    start,
    end,
  }
}

function sanitizeDoorKind(value: unknown): Door['kind'] | undefined {
  return isValidDoorKind(value) ? value : undefined
}

/** position 欠落時、start/end や wall 上の線分から復元する */
function resolveDoorPosition(door: Door & Record<string, unknown>): {
  position: Point
  widthMm: number
  angle: number
} | null {
  const position = toPoint(door.position)
  if (position) {
    return {
      position,
      widthMm: toNumber(door.width, 800),
      angle: toNumber(door.angle, 0),
    }
  }

  const start = toPoint(door.start)
  const end = toPoint(door.end)
  if (start && end) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const len = Math.hypot(dx, dy)
    if (len < 1) return null
    return {
      position: start,
      widthMm: toNumber(door.width, len),
      angle: toNumber(door.angle, (Math.atan2(dy, dx) * 180) / Math.PI),
    }
  }
  return null
}

function sanitizeDoor(door: Door, index: number, useMm: boolean): Door | null {
  const resolved = resolveDoorPosition(door as Door & Record<string, unknown>)
  if (!resolved) return null
  const swing = door.swing === -1 ? -1 : 1
  const kind = sanitizeDoorKind(door.kind)
  const widthMm = snapMm(resolved.widthMm > 0 ? resolved.widthMm : 800)
  return {
    ...door,
    id: door.id || `door-${index}`,
    position: useMm ? scalePoint(prepareMmPoint(resolved.position)) : resolved.position,
    width: useMm ? mmToSvgUnits(widthMm) : toNumber(door.width, mmToSvgUnits(800)),
    angle: resolved.angle,
    swing,
    ...(kind && kind !== 'swing' ? { kind } : {}),
  }
}

function sanitizeWindow(win: Window, index: number, useMm: boolean): Window | null {
  let start = toPoint(win.start)
  let end = toPoint(win.end)

  // position + width + angle 形式にも対応
  if ((!start || !end) && win && typeof win === 'object') {
    const raw = win as Window & { position?: unknown; width?: unknown; angle?: unknown }
    const position = toPoint(raw.position)
    if (position) {
      const widthMm = toNumber(raw.width, 1200)
      const angleRad = (toNumber(raw.angle, 0) * Math.PI) / 180
      const half = widthMm / 2
      start = {
        x: position.x - Math.cos(angleRad) * half,
        y: position.y - Math.sin(angleRad) * half,
      }
      end = {
        x: position.x + Math.cos(angleRad) * half,
        y: position.y + Math.sin(angleRad) * half,
      }
    }
  }

  if (!start || !end) return null
  if (Math.hypot(end.x - start.x, end.y - start.y) < 1) return null

  const kind = isValidWindowKind(win.kind) ? win.kind : undefined

  return {
    ...win,
    id: win.id || `window-${index}`,
    start: useMm ? scalePoint(prepareMmPoint(start)) : start,
    end: useMm ? scalePoint(prepareMmPoint(end)) : end,
    ...(kind && kind !== 'sliding' ? { kind } : {}),
  }
}

function sanitizeFixture(fixture: Fixture, index: number, useMm: boolean): Fixture | null {
  const position = toPoint(fixture.position)
  if (!position) return null
  const widthMm = toNumber(fixture.width, 600)
  const heightMm = toNumber(fixture.height, 400)
  return {
    ...fixture,
    id: fixture.id || `fixture-${index}`,
    type: sanitizeFixtureType(fixture.type),
    position: useMm ? scalePoint(position) : position,
    width: useMm ? mmToSvgUnits(snapMm(widthMm)) : widthMm,
    height: useMm ? mmToSvgUnits(snapMm(heightMm)) : heightMm,
    angle: fixture.angle != null ? toNumber(fixture.angle, 0) : undefined,
  }
}

const STAIR_LAYOUTS: StairLayout[] = ['straight', 'turn-right', 'turn-left']
const STAIR_ORIENTATIONS: StairOrientation[] = ['up', 'down', 'left', 'right']

function sanitizeStairLayout(value: unknown): StairLayout | undefined {
  return STAIR_LAYOUTS.includes(value as StairLayout) ? (value as StairLayout) : undefined
}

function sanitizeStairOrientation(value: unknown): StairOrientation | undefined {
  return STAIR_ORIENTATIONS.includes(value as StairOrientation) ? (value as StairOrientation) : undefined
}

function sanitizeStair(stair: Stair, index: number, useMm: boolean): Stair | null {
  const polygon = toPolygon(stair.polygon)
  if (polygon.length < 3) return null
  const layout = sanitizeStairLayout(stair.layout)
  const orientation = sanitizeStairOrientation(stair.orientation)
  const widthMm =
    typeof stair.widthMm === 'number' && stair.widthMm > 0
      ? snapMm(stair.widthMm)
      : STAIR_DEFAULT_WIDTH_MM
  const preparedPolygon = useMm ? prepareMmPolygon(polygon) : polygon
  const scaledPolygon = useMm ? scalePolygon(preparedPolygon) : preparedPolygon
  const base: Stair = {
    ...stair,
    id: stair.id || `stair-${index}`,
    name: stair.name ?? '階段',
    direction: stair.direction === 'down' ? 'down' : 'up',
    widthMm,
    ...(layout ? { layout } : {}),
    ...(orientation ? { orientation } : {}),
    polygon: scaledPolygon,
  }
  // 幅は 910mm（または明示指定）に揃える。生じた隙間は closeCoverageGaps で埋める
  return withStairWidth(base, widthMm)
}

function sanitizeFloor(floor: Floor, index: number, useMm: boolean): Floor {
  const rooms = (floor.rooms ?? [])
    .map((room, i) => sanitizeRoom(room as Room, i, useMm))
    .filter((room): room is Room => room != null)

  const draft = syncFloorWalls({
    id: floor.id ?? `floor-${index}`,
    name: floor.name ?? `${index + 1}F`,
    label: floor.label ?? `${index + 1}階`,
    rooms,
    walls: (floor.walls ?? [])
      .map((wall, i) => sanitizeWall(wall as Wall, i, useMm))
      .filter((wall): wall is Wall => wall != null),
    doors: (floor.doors ?? [])
      .map((door, i) => sanitizeDoor(door as Door, i, useMm))
      .filter((door): door is Door => door != null),
    windows: (floor.windows ?? [])
      .map((win, i) => sanitizeWindow(win as Window, i, useMm))
      .filter((win): win is Window => win != null),
    fixtures: (floor.fixtures ?? [])
      .map((fixture, i) => sanitizeFixture(fixture as Fixture, i, useMm))
      .filter((fixture): fixture is Fixture => fixture != null),
    stairs: (floor.stairs ?? [])
      .map((stair, i) => sanitizeStair(stair as Stair, i, useMm))
      .filter((stair): stair is Stair => stair != null),
  })

  return closeCoverageGaps(draft)
}

export function normalizeFloorPlan(plan: FloorPlan): FloorPlan {
  const draft: FloorPlan = {
    title: plan.title || '間取図',
    scaleMm: plan.scaleMm ?? 100,
    floors: (plan.floors ?? []).map((floor, i) => ({
      ...floor,
      rooms: floor.rooms ?? [],
      walls: floor.walls ?? [],
      doors: floor.doors ?? [],
      windows: floor.windows ?? [],
      fixtures: floor.fixtures ?? [],
      stairs: floor.stairs ?? [],
      id: floor.id ?? `floor-${i}`,
      name: floor.name ?? `${i + 1}F`,
      label: floor.label ?? `${i + 1}階`,
    })),
  }

  const useMm = planUsesMmCoordinates(draft)
  const floors = draft.floors.map((floor, i) => sanitizeFloor(floor, i, useMm))

  if (!floors.some((floor) => floor.rooms.length > 0)) {
    throw new Error('AIの応答に有効な部屋データが含まれていませんでした。別の画像で再試行してください。')
  }

  return {
    title: draft.title,
    scaleMm: draft.scaleMm,
    floors,
  }
}
