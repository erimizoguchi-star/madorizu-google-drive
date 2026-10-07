import type { Fixture, Floor, FloorPlan, Point, Wall, Window } from '../types/floorPlan'
import { snapDoorOntoNearestWall, snapWindowOntoNearestWall } from './floorPlanAdd'
import { mmToSvgUnits, snapSvgToMmGrid, svgUnitsToMm } from './roomGeometry'

const EPS = 0.05

function snapPoint(p: Point): Point {
  return { x: snapSvgToMmGrid(p.x), y: snapSvgToMmGrid(p.y) }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

function isHorizontalWall(wall: Wall): boolean {
  return Math.abs(wall.start.y - wall.end.y) < EPS
}

function isVerticalWall(wall: Wall): boolean {
  return Math.abs(wall.start.x - wall.end.x) < EPS
}

function constrainWallEndpoint(wall: Wall, endpoint: 'start' | 'end', position: Point): Point {
  const snapped = snapPoint(position)
  if (isHorizontalWall(wall)) {
    return endpoint === 'start'
      ? { x: round(snapped.x), y: round(wall.start.y) }
      : { x: round(snapped.x), y: round(wall.end.y) }
  }
  if (isVerticalWall(wall)) {
    return endpoint === 'start'
      ? { x: round(wall.start.x), y: round(snapped.y) }
      : { x: round(wall.end.x), y: round(snapped.y) }
  }
  return { x: round(snapped.x), y: round(snapped.y) }
}

function constrainWallTranslate(wall: Wall, delta: Point): Point {
  if (isHorizontalWall(wall)) {
    return { x: 0, y: snapSvgToMmGrid(delta.y) }
  }
  if (isVerticalWall(wall)) {
    return { x: snapSvgToMmGrid(delta.x), y: 0 }
  }
  return snapPoint(delta)
}

/** 壁セグメント上の頂点を平行移動する（外壁修正で部屋形状を追従） */
function nudgeVerticesOnWall(polygon: Point[], wall: Wall, dx: number, dy: number): Point[] {
  const wx1 = Math.min(wall.start.x, wall.end.x)
  const wx2 = Math.max(wall.start.x, wall.end.x)
  const wy1 = Math.min(wall.start.y, wall.end.y)
  const wy2 = Math.max(wall.start.y, wall.end.y)
  const horizontal = isHorizontalWall(wall)
  const vertical = isVerticalWall(wall)

  return polygon.map((p) => {
    if (horizontal) {
      if (Math.abs(p.y - wall.start.y) > EPS) return p
      if (p.x < wx1 - EPS || p.x > wx2 + EPS) return p
      return { x: round(p.x + dx), y: round(p.y + dy) }
    }
    if (vertical) {
      if (Math.abs(p.x - wall.start.x) > EPS) return p
      if (p.y < wy1 - EPS || p.y > wy2 + EPS) return p
      return { x: round(p.x + dx), y: round(p.y + dy) }
    }
    return p
  })
}

function nudgePointOnWall(point: Point, wall: Wall, dx: number, dy: number): Point {
  const [moved] = nudgeVerticesOnWall([point], wall, dx, dy)
  return moved
}

function applyWallTranslateToFloor(floor: Floor, wall: Wall, dx: number, dy: number): Floor {
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return floor
  return {
    ...floor,
    rooms: floor.rooms.map((room) => ({
      ...room,
      polygon: nudgeVerticesOnWall(room.polygon, wall, dx, dy),
    })),
    stairs: floor.stairs.map((stair) => ({
      ...stair,
      polygon: nudgeVerticesOnWall(stair.polygon, wall, dx, dy),
    })),
    doors: floor.doors.map((door) => ({
      ...door,
      position: nudgePointOnWall(door.position, wall, dx, dy),
    })),
    windows: floor.windows.map((win) => ({
      ...win,
      start: nudgePointOnWall(win.start, wall, dx, dy),
      end: nudgePointOnWall(win.end, wall, dx, dy),
    })),
    walls: floor.walls.map((w) => {
      if (w.id === wall.id) {
        return {
          ...w,
          start: { x: round(w.start.x + dx), y: round(w.start.y + dy) },
          end: { x: round(w.end.x + dx), y: round(w.end.y + dy) },
        }
      }
      const moveIfMatches = (p: Point) => nudgePointOnWall(p, wall, dx, dy)
      return {
        ...w,
        start: moveIfMatches(w.start),
        end: moveIfMatches(w.end),
      }
    }),
  }
}

export function moveWallEndpointOnFloor(
  floor: Floor,
  wallId: string,
  endpoint: 'start' | 'end',
  position: Point
): Floor {
  return {
    ...floor,
    walls: floor.walls.map((wall) => {
      if (wall.id !== wallId) return wall
      const next = constrainWallEndpoint(wall, endpoint, position)
      // 手動調整した壁は、部屋の編集で作り直されないよう印を付ける
      if (endpoint === 'start') return { ...wall, start: next, manual: true }
      return { ...wall, end: next, manual: true }
    }),
  }
}

export function setWallEndpointsOnFloor(
  floor: Floor,
  wallId: string,
  start: Point,
  end: Point
): Floor {
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return floor

  const snappedStart = snapPoint(start)
  const snappedEnd = snapPoint(end)
  const dx = snappedStart.x - wall.start.x
  const dy = snappedStart.y - wall.start.y
  const sameSpan =
    Math.abs(snappedEnd.x - snappedStart.x - (wall.end.x - wall.start.x)) < EPS &&
    Math.abs(snappedEnd.y - snappedStart.y - (wall.end.y - wall.start.y)) < EPS

  if (sameSpan && (Math.abs(dx) > EPS || Math.abs(dy) > EPS)) {
    const constrained = constrainWallTranslate(wall, { x: dx, y: dy })
    return applyWallTranslateToFloor(floor, wall, constrained.x, constrained.y)
  }

  return {
    ...floor,
    walls: floor.walls.map((w) =>
      w.id === wallId
        ? {
            ...w,
            start: { x: round(snappedStart.x), y: round(snappedStart.y) },
            end: { x: round(snappedEnd.x), y: round(snappedEnd.y) },
            manual: true,
          }
        : w
    ),
  }
}

export function setWindowEndpointsOnFloor(
  floor: Floor,
  windowId: string,
  start: Point,
  end: Point
): Floor {
  return {
    ...floor,
    windows: floor.windows.map((win) => {
      if (win.id !== windowId) return win
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
      const draft = { ...win, start, end }
      return snapWindowOntoNearestWall(floor, draft, mid) ?? {
        ...win,
        start: snapPoint(start),
        end: snapPoint(end),
      }
    }),
  }
}

export function translateWallOnFloor(floor: Floor, wallId: string, delta: Point): Floor {
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return floor
  const d = constrainWallTranslate(wall, delta)
  return applyWallTranslateToFloor(floor, wall, d.x, d.y)
}

export function moveDoorOnFloor(floor: Floor, doorId: string, position: Point): Floor {
  return {
    ...floor,
    doors: floor.doors.map((door) => {
      if (door.id !== doorId) return door
      // ポインタを開口中央付近として壁へ吸着（壁から外れない）
      const rad = (door.angle * Math.PI) / 180
      const centerHint = {
        x: position.x + Math.cos(rad) * (door.width / 2),
        y: position.y + Math.sin(rad) * (door.width / 2),
      }
      const seated = snapDoorOntoNearestWall(floor, door, centerHint)
      return seated ?? door
    }),
  }
}

export function moveWindowEndpointOnFloor(
  floor: Floor,
  windowId: string,
  endpoint: 'start' | 'end',
  position: Point
): Floor {
  return {
    ...floor,
    windows: floor.windows.map((win) => {
      if (win.id !== windowId) return win
      const other = endpoint === 'start' ? win.end : win.start
      const len = Math.max(
        Math.hypot(position.x - other.x, position.y - other.y),
        mmToSvgUnits(300)
      )
      const mid = {
        x: (position.x + other.x) / 2,
        y: (position.y + other.y) / 2,
      }
      const half = len / 2
      const draft: Window = {
        ...win,
        start: { x: mid.x - half, y: mid.y },
        end: { x: mid.x + half, y: mid.y },
      }
      return snapWindowOntoNearestWall(floor, draft, mid) ?? win
    }),
  }
}

export function translateWindowOnFloor(floor: Floor, windowId: string, delta: Point): Floor {
  return {
    ...floor,
    windows: floor.windows.map((win) => {
      if (win.id !== windowId) return win
      const mid = {
        x: (win.start.x + win.end.x) / 2 + delta.x,
        y: (win.start.y + win.end.y) / 2 + delta.y,
      }
      return snapWindowOntoNearestWall(floor, win, mid) ?? win
    }),
  }
}

export function moveFixtureOnFloor(floor: Floor, fixtureId: string, position: Point): Floor {
  const snapped = snapPoint(position)
  return {
    ...floor,
    fixtures: floor.fixtures.map((fixture) =>
      fixture.id === fixtureId
        ? { ...fixture, position: { x: round(snapped.x), y: round(snapped.y) } }
        : fixture
    ),
  }
}

export function moveTextOnFloor(floor: Floor, textId: string, position: Point): Floor {
  const snapped = snapPoint(position)
  return {
    ...floor,
    texts: (floor.texts ?? []).map((label) =>
      label.id === textId
        ? { ...label, position: { x: round(snapped.x), y: round(snapped.y) } }
        : label
    ),
  }
}

type FloorRef = { floorId: string }

function updateFloor(
  floorPlan: FloorPlan,
  ref: FloorRef,
  updater: (floor: Floor) => Floor
): FloorPlan {
  const floorIndex = floorPlan.floors.findIndex((f) => f.id === ref.floorId)
  if (floorIndex < 0) return floorPlan
  return {
    ...floorPlan,
    floors: floorPlan.floors.map((floor, fi) => (fi === floorIndex ? updater(floor) : floor)),
  }
}

export function moveWallEndpoint(
  floorPlan: FloorPlan,
  ref: FloorRef & { wallId: string },
  endpoint: 'start' | 'end',
  position: Point
): FloorPlan {
  return updateFloor(floorPlan, ref, (floor) =>
    moveWallEndpointOnFloor(floor, ref.wallId, endpoint, position)
  )
}

export function setWallEndpoints(
  floorPlan: FloorPlan,
  ref: FloorRef & { wallId: string },
  start: Point,
  end: Point
): FloorPlan {
  return updateFloor(floorPlan, ref, (floor) =>
    setWallEndpointsOnFloor(floor, ref.wallId, start, end)
  )
}

export function translateWall(
  floorPlan: FloorPlan,
  ref: FloorRef & { wallId: string },
  delta: Point
): FloorPlan {
  return updateFloor(floorPlan, ref, (floor) => translateWallOnFloor(floor, ref.wallId, delta))
}

export function moveDoor(
  floorPlan: FloorPlan,
  ref: FloorRef & { doorId: string },
  position: Point
): FloorPlan {
  return updateFloor(floorPlan, ref, (floor) => moveDoorOnFloor(floor, ref.doorId, position))
}

export function moveWindowEndpoint(
  floorPlan: FloorPlan,
  ref: FloorRef & { windowId: string },
  endpoint: 'start' | 'end',
  position: Point
): FloorPlan {
  return updateFloor(floorPlan, ref, (floor) =>
    moveWindowEndpointOnFloor(floor, ref.windowId, endpoint, position)
  )
}

export function setWindowEndpoints(
  floorPlan: FloorPlan,
  ref: FloorRef & { windowId: string },
  start: Point,
  end: Point
): FloorPlan {
  return updateFloor(floorPlan, ref, (floor) =>
    setWindowEndpointsOnFloor(floor, ref.windowId, start, end)
  )
}

export function translateWindow(
  floorPlan: FloorPlan,
  ref: FloorRef & { windowId: string },
  delta: Point
): FloorPlan {
  return updateFloor(floorPlan, ref, (floor) => translateWindowOnFloor(floor, ref.windowId, delta))
}

export function moveFixture(
  floorPlan: FloorPlan,
  ref: FloorRef & { fixtureId: string },
  position: Point
): FloorPlan {
  return updateFloor(floorPlan, ref, (floor) => moveFixtureOnFloor(floor, ref.fixtureId, position))
}

export function moveTextLabel(
  floorPlan: FloorPlan,
  ref: FloorRef & { textId: string },
  position: Point
): FloorPlan {
  return updateFloor(floorPlan, ref, (floor) => moveTextOnFloor(floor, ref.textId, position))
}

/** 設備の四隅。ドラッグした角の対角は動かさない */
export type FixtureCorner = 'nw' | 'ne' | 'se' | 'sw'

/** 設備は部屋より小さいので、50mm ではなく 10mm 刻みで調整する */
function snapFixtureValue(v: number): number {
  const mm = svgUnitsToMm(v)
  return mmToSvgUnits(Math.round(mm / FIXTURE_SNAP_MM) * FIXTURE_SNAP_MM)
}

const FIXTURE_SNAP_MM = 10
const FIXTURE_MIN_SIZE_SVG = mmToSvgUnits(100)

/** 設備の大きさの上限（車でも 5m 程度。数値の暴走で画面の外まで広がらないように） */
const FIXTURE_MAX_SIZE_SVG = mmToSvgUnits(10000)

/**
 * 設備の角をドラッグして大きさを変える。
 *
 * start（ドラッグを始めた時点の設備）を基準に、掴んだ角の反対側の角を画面上で固定し、
 * カーソルとの間を新しい大きさにする。毎回 start から計算するので、回転していても誤差が積み重ならない。
 * （以前は「今の設備の中心」でカーソルの回転を戻していたため、回転した設備では大きさが変わるたびに中心が動き、
 *  その誤差が増幅して幅が数億 mm まで膨らんでいた）
 *
 * cursorFloor はカーソルの位置（間取図の座標。回転は戻さない）。start を省くと今の設備を基準にする。
 */
export function resizeFixtureCorner(
  floorPlan: FloorPlan,
  ref: FloorRef & { fixtureId: string },
  corner: FixtureCorner,
  cursorFloor: Point,
  start?: Fixture
): FloorPlan {
  return updateFloor(floorPlan, ref, (floor) => ({
    ...floor,
    fixtures: floor.fixtures.map((fixture) => {
      if (fixture.id !== ref.fixtureId) return fixture
      const base = start ?? fixture
      const rad = ((base.angle ?? 0) * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const rotate = (v: Point): Point => ({ x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos })
      const unrotate = (v: Point): Point => ({ x: v.x * cos + v.y * sin, y: -v.x * sin + v.y * cos })

      // 掴んだ角の向き（設備自身の向きで見て、右・下なら +1）
      const sx = corner === 'ne' || corner === 'se' ? 1 : -1
      const sy = corner === 'se' || corner === 'sw' ? 1 : -1
      const center = { x: base.position.x + base.width / 2, y: base.position.y + base.height / 2 }
      // 反対側の角（ここは動かさない）
      const opposite = rotate({ x: (-sx * base.width) / 2, y: (-sy * base.height) / 2 })
      const anchor = { x: center.x + opposite.x, y: center.y + opposite.y }
      // 固定した角からカーソルまでを、設備自身の向きで測る
      const local = unrotate({ x: cursorFloor.x - anchor.x, y: cursorFloor.y - anchor.y })
      const clampSize = (v: number) =>
        Math.min(FIXTURE_MAX_SIZE_SVG, Math.max(FIXTURE_MIN_SIZE_SVG, snapFixtureValue(v)))
      const width = clampSize(sx * local.x)
      const height = clampSize(sy * local.y)

      // 新しい中心 = 固定した角 + 回転させた（大きさの半分）。描画は中心まわりに回転するので位置は中心から戻す
      const half = rotate({ x: (sx * width) / 2, y: (sy * height) / 2 })
      const nextCenter = { x: anchor.x + half.x, y: anchor.y + half.y }
      return {
        ...fixture,
        position: { x: round(nextCenter.x - width / 2), y: round(nextCenter.y - height / 2) },
        width: round(width),
        height: round(height),
      }
    }),
  }))
}
