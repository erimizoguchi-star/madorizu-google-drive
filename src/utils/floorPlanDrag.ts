import type { Floor, FloorPlan, Point, Wall } from '../types/floorPlan'
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
    windows: floor.windows.map((win) =>
      win.id === windowId ? { ...win, start: { ...start }, end: { ...end } } : win
    ),
  }
}

export function translateWallOnFloor(floor: Floor, wallId: string, delta: Point): Floor {
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return floor
  const d = constrainWallTranslate(wall, delta)
  return applyWallTranslateToFloor(floor, wall, d.x, d.y)
}

export function moveDoorOnFloor(floor: Floor, doorId: string, position: Point): Floor {
  const snapped = snapPoint(position)
  return {
    ...floor,
    doors: floor.doors.map((door) =>
      door.id === doorId ? { ...door, position: { x: round(snapped.x), y: round(snapped.y) } } : door
    ),
  }
}

export function moveWindowEndpointOnFloor(
  floor: Floor,
  windowId: string,
  endpoint: 'start' | 'end',
  position: Point
): Floor {
  const snapped = snapPoint(position)
  return {
    ...floor,
    windows: floor.windows.map((win) => {
      if (win.id !== windowId) return win
      const next = { x: round(snapped.x), y: round(snapped.y) }
      if (endpoint === 'start') return { ...win, start: next }
      return { ...win, end: next }
    }),
  }
}

export function translateWindowOnFloor(floor: Floor, windowId: string, delta: Point): Floor {
  const d = snapPoint(delta)
  return {
    ...floor,
    windows: floor.windows.map((win) => {
      if (win.id !== windowId) return win
      return {
        ...win,
        start: { x: round(win.start.x + d.x), y: round(win.start.y + d.y) },
        end: { x: round(win.end.x + d.x), y: round(win.end.y + d.y) },
      }
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

/** 設備の四隅。ドラッグした角の対角は動かさない */
export type FixtureCorner = 'nw' | 'ne' | 'se' | 'sw'

/** 設備は部屋より小さいので、50mm ではなく 10mm 刻みで調整する */
function snapFixtureValue(v: number): number {
  const mm = svgUnitsToMm(v)
  return mmToSvgUnits(Math.round(mm / FIXTURE_SNAP_MM) * FIXTURE_SNAP_MM)
}

const FIXTURE_SNAP_MM = 10
const FIXTURE_MIN_SIZE_SVG = mmToSvgUnits(100)

export function resizeFixtureCorner(
  floorPlan: FloorPlan,
  ref: FloorRef & { fixtureId: string },
  corner: FixtureCorner,
  positionFloor: Point
): FloorPlan {
  return updateFloor(floorPlan, ref, (floor) => ({
    ...floor,
    fixtures: floor.fixtures.map((fixture) => {
      if (fixture.id !== ref.fixtureId) return fixture

      const left = fixture.position.x
      const top = fixture.position.y
      const right = left + fixture.width
      const bottom = top + fixture.height

      // ドラッグしていない側の辺は固定したまま、掴んだ角だけを動かす
      const anchorX = corner === 'nw' || corner === 'sw' ? right : left
      const anchorY = corner === 'nw' || corner === 'ne' ? bottom : top
      const movedX = snapFixtureValue(positionFloor.x)
      const movedY = snapFixtureValue(positionFloor.y)

      const minX = Math.min(anchorX, movedX)
      const maxX = Math.max(anchorX, movedX)
      const minY = Math.min(anchorY, movedY)
      const maxY = Math.max(anchorY, movedY)

      const width = Math.max(FIXTURE_MIN_SIZE_SVG, maxX - minX)
      const height = Math.max(FIXTURE_MIN_SIZE_SVG, maxY - minY)

      // 最小サイズに張り付いたときも、固定側の辺は動かさない
      const x = movedX < anchorX ? anchorX - width : anchorX
      const y = movedY < anchorY ? anchorY - height : anchorY

      return {
        ...fixture,
        position: { x: round(x), y: round(y) },
        width: round(width),
        height: round(height),
      }
    }),
  }))
}
