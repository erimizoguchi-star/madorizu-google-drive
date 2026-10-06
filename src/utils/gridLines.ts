import type { Door, Floor, Point, Window } from '../types/floorPlan'
import { syncFloorWalls } from './ensureExteriorWalls'
import { mmToSvgUnits, MIN_ROOM_SIZE_MM } from './roomGeometry'

/**
 * 壁の通り（同じ線上に並ぶ部屋・階段の辺）をまとめて動かす。
 *
 * 部屋の辺を1つずつ動かすと隣の部屋が付いてこず、元の平面図に合わせるのに手間が倍かかる。
 * 日本の住宅は壁の通りがそろっているので、通りを1本の線として動かせば、
 * その線に接する部屋・階段・扉・窓がまとめて追従し、すき間も重なりも出ない。
 *
 * axis: 'x' は縦の線（x = value）、'y' は横の線（y = value）。
 */
export type GridAxis = 'x' | 'y'

export interface GridLine {
  axis: GridAxis
  value: number
  /** 線が実際にある範囲（線に沿った方向の座標）。重なりはまとめ済み */
  spans: Array<[number, number]>
}

/** 同じ通りとみなす座標の差（1単位 = 10mm なので 5mm） */
const SAME_LINE_EPS = 0.5
const EPS = 0.05

const along = (axis: GridAxis, p: Point) => (axis === 'x' ? p.y : p.x)
const across = (axis: GridAxis, p: Point) => (axis === 'x' ? p.x : p.y)

function mergeSpans(spans: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1]
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b)
    else merged.push([a, b])
  }
  return merged
}

/** 部屋・階段の辺から、縦横の通りを集める（座標の小さい順） */
export function collectGridLines(floor: Floor): GridLine[] {
  const polygons = [...floor.rooms.map((r) => r.polygon), ...floor.stairs.map((s) => s.polygon)]
  const lines: GridLine[] = []

  for (const axis of ['x', 'y'] as const) {
    const found: GridLine[] = []
    for (const polygon of polygons) {
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]
        const b = polygon[(i + 1) % polygon.length]
        // 縦の線（axis x）は x が同じで y が変わる辺
        if (Math.abs(across(axis, a) - across(axis, b)) > EPS) continue
        const s0 = Math.min(along(axis, a), along(axis, b))
        const s1 = Math.max(along(axis, a), along(axis, b))
        if (s1 - s0 < EPS) continue
        const value = across(axis, a)
        const line = found.find((l) => Math.abs(l.value - value) < SAME_LINE_EPS)
        if (line) line.spans.push([s0, s1])
        else found.push({ axis, value, spans: [[s0, s1]] })
      }
    }
    for (const line of found) line.spans = mergeSpans(line.spans)
    lines.push(...found.sort((a, b) => a.value - b.value))
  }
  return lines
}

/**
 * 通りを動かせる範囲。線に接する部屋・階段がつぶれたり裏返ったりしないよう、
 * それぞれの反対側の辺から最小寸法（300mm）以上離す。
 */
export function gridLineLimits(floor: Floor, axis: GridAxis, from: number): { min: number; max: number } {
  const minSize = mmToSvgUnits(MIN_ROOM_SIZE_MM)
  let min = -Infinity
  let max = Infinity
  const polygons = [...floor.rooms.map((r) => r.polygon), ...floor.stairs.map((s) => s.polygon)]
  for (const polygon of polygons) {
    const coords = polygon.map((p) => across(axis, p))
    if (!coords.some((c) => Math.abs(c - from) < SAME_LINE_EPS)) continue
    for (const c of coords) {
      if (c < from - SAME_LINE_EPS) min = Math.max(min, c + minSize)
      else if (c > from + SAME_LINE_EPS) max = Math.min(max, c - minSize)
    }
  }
  return { min, max }
}

function onLine(axis: GridAxis, from: number, p: Point): boolean {
  return Math.abs(across(axis, p) - from) < SAME_LINE_EPS
}

function moveCoord(axis: GridAxis, from: number, to: number, p: Point): Point {
  if (!onLine(axis, from, p)) return p
  return axis === 'x' ? { x: to, y: p.y } : { x: p.x, y: to }
}

/** 扉が線に沿った壁（縦の線なら縦の壁）に付いているか */
function doorAlongLine(axis: GridAxis, door: Door): boolean {
  const a = ((door.angle % 180) + 180) % 180
  const vertical = Math.abs(a - 90) < 1
  return axis === 'x' ? vertical : !vertical
}

function windowAlongLine(axis: GridAxis, from: number, win: Window): boolean {
  return onLine(axis, from, win.start) && onLine(axis, from, win.end)
}

/**
 * 通り（axis, from）を to へ動かす。動かせる範囲を超える指定は範囲内に収める。
 * 線上にある部屋・階段の頂点、線に沿った扉・窓、手動の壁と消した壁の端を動かし、壁を作り直す。
 */
export function moveGridLine(floor: Floor, axis: GridAxis, from: number, to: number): Floor {
  const { min, max } = gridLineLimits(floor, axis, from)
  if (min > max) return floor
  const target = Math.round(Math.min(max, Math.max(min, to)) * 10) / 10
  if (Math.abs(target - from) < EPS) return floor

  const move = (p: Point) => moveCoord(axis, from, target, p)

  return syncFloorWalls({
    ...floor,
    rooms: floor.rooms.map((room) => ({ ...room, polygon: room.polygon.map(move) })),
    stairs: floor.stairs.map((stair) => ({ ...stair, polygon: stair.polygon.map(move) })),
    doors: floor.doors.map((door) =>
      doorAlongLine(axis, door) ? { ...door, position: move(door.position) } : door
    ),
    windows: floor.windows.map((win) =>
      windowAlongLine(axis, from, win) ? { ...win, start: move(win.start), end: move(win.end) } : win
    ),
    // 手動の壁は作り直されないので、端が線上にあれば一緒に動かす
    walls: floor.walls.map((wall) =>
      wall.manual ? { ...wall, start: move(wall.start), end: move(wall.end) } : wall
    ),
    // 消した外壁は座標で覚えているので、動かさないと消したはずの壁が復活する
    hiddenWalls: floor.hiddenWalls?.map((hidden) =>
      hidden.start && hidden.end ? { ...hidden, start: move(hidden.start), end: move(hidden.end) } : hidden
    ),
  })
}

/**
 * 階全体を、origin を基準に横 sx 倍・縦 sy 倍する（元の平面図と縦横比が違うときに一度で合わせる）。
 * 設備の記号（浴槽・便器など）は実物の大きさなので、位置だけ動かして大きさは変えない。
 */
export function scaleFloor(floor: Floor, origin: Point, sx: number, sy: number): Floor {
  const r = (v: number) => Math.round(v * 2) / 2
  const sp = (p: Point): Point => ({ x: r(origin.x + (p.x - origin.x) * sx), y: r(origin.y + (p.y - origin.y) * sy) })
  return syncFloorWalls({
    ...floor,
    rooms: floor.rooms.map((room) => ({ ...room, polygon: room.polygon.map(sp) })),
    stairs: floor.stairs.map((stair) => ({ ...stair, polygon: stair.polygon.map(sp) })),
    walls: floor.walls.map((wall) => ({ ...wall, start: sp(wall.start), end: sp(wall.end) })),
    hiddenWalls: floor.hiddenWalls?.map((hidden) =>
      hidden.start && hidden.end ? { ...hidden, start: sp(hidden.start), end: sp(hidden.end) } : hidden
    ),
    doors: floor.doors.map((door) => {
      const a = ((door.angle % 180) + 180) % 180
      const vertical = Math.abs(a - 90) < 1
      return { ...door, position: sp(door.position), width: r(door.width * (vertical ? sy : sx)) }
    }),
    windows: floor.windows.map((win) => ({ ...win, start: sp(win.start), end: sp(win.end) })),
    fixtures: floor.fixtures.map((fixture) => {
      const center = sp({ x: fixture.position.x + fixture.width / 2, y: fixture.position.y + fixture.height / 2 })
      return { ...fixture, position: { x: r(center.x - fixture.width / 2), y: r(center.y - fixture.height / 2) } }
    }),
    texts: floor.texts?.map((t) => ({ ...t, position: sp(t.position) })),
  })
}
