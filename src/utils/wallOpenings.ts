import type { Door, Point, Wall, Window } from '../types/floorPlan'
import { WALL } from '../renderer/styles'

const EPS = 0.08
const OPENING_PAD = 0.15

export type WallSegment = { start: Point; end: Point }

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** 点が壁線分上にあるときのパラメータ t（0〜1）。離れていれば null */
export function projectPointOnWall(wall: Wall, point: Point, tolerance: number): number | null {
  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-8) return null
  const t = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lenSq
  if (t < -0.02 || t > 1.02) return null
  const proj = { x: wall.start.x + t * dx, y: wall.start.y + t * dy }
  if (Math.hypot(point.x - proj.x, point.y - proj.y) > tolerance) return null
  return Math.max(0, Math.min(1, t))
}

function doorEndpoints(door: Door): { a: Point; b: Point } {
  const rad = (door.angle * Math.PI) / 180
  return {
    a: door.position,
    b: {
      x: door.position.x + door.width * Math.cos(rad),
      y: door.position.y + door.width * Math.sin(rad),
    },
  }
}

export type OpeningInterval = {
  t0: number
  t1: number
  kind: 'door' | 'window'
  id: string
}

/** 壁上の扉・窓開口を t 区間として収集 */
export function collectWallOpenings(
  wall: Wall,
  doors: Door[],
  windows: Window[],
  tolerance = 12
): OpeningInterval[] {
  const intervals: OpeningInterval[] = []
  const wallLen = dist(wall.start, wall.end)
  if (wallLen < EPS) return intervals

  for (const door of doors) {
    if ((door.kind ?? 'swing') === 'opening') {
      // 開口も壁を切る
    }
    const { a, b } = doorEndpoints(door)
    const ta = projectPointOnWall(wall, a, tolerance)
    const tb = projectPointOnWall(wall, b, tolerance)
    if (ta == null && tb == null) continue
    let t0: number
    let t1: number
    if (ta != null && tb != null) {
      t0 = Math.min(ta, tb)
      t1 = Math.max(ta, tb)
    } else if (ta != null) {
      const along = door.width / wallLen
      t0 = Math.min(ta, ta + along)
      t1 = Math.max(ta, ta + along)
    } else {
      const along = door.width / wallLen
      t0 = Math.min(tb!, tb! - along)
      t1 = Math.max(tb!, tb! - along)
    }
    t0 = Math.max(0, t0 - OPENING_PAD / wallLen)
    t1 = Math.min(1, t1 + OPENING_PAD / wallLen)
    if (t1 - t0 > 0.01) intervals.push({ t0, t1, kind: 'door', id: door.id })
  }

  for (const win of windows) {
    const ta = projectPointOnWall(wall, win.start, tolerance)
    const tb = projectPointOnWall(wall, win.end, tolerance)
    if (ta == null || tb == null) continue
    const t0 = Math.max(0, Math.min(ta, tb) - OPENING_PAD / wallLen)
    const t1 = Math.min(1, Math.max(ta, tb) + OPENING_PAD / wallLen)
    if (t1 - t0 > 0.01) intervals.push({ t0, t1, kind: 'window', id: win.id })
  }

  return intervals
}

function mergeIntervals(intervals: OpeningInterval[]): OpeningInterval[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.t0 - b.t0)
  const merged: OpeningInterval[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const cur = sorted[i]
    if (cur.t0 <= last.t1 + 0.002) {
      last.t1 = Math.max(last.t1, cur.t1)
    } else {
      merged.push({ ...cur })
    }
  }
  return merged
}

/** 開口を除いた壁の実描画セグメント */
export function wallSolidSegments(
  wall: Wall,
  doors: Door[],
  windows: Window[]
): WallSegment[] {
  const openings = mergeIntervals(collectWallOpenings(wall, doors, windows))
  if (openings.length === 0) return [{ start: wall.start, end: wall.end }]

  const segments: WallSegment[] = []
  let cursor = 0
  for (const op of openings) {
    if (op.t0 - cursor > 0.008) {
      segments.push({
        start: lerp(wall.start, wall.end, cursor),
        end: lerp(wall.start, wall.end, op.t0),
      })
    }
    cursor = op.t1
  }
  if (1 - cursor > 0.008) {
    segments.push({
      start: lerp(wall.start, wall.end, cursor),
      end: wall.end,
    })
  }
  return segments
}

export function wallThickness(wall: Wall): number {
  return wall.exterior ? WALL.exteriorWidth : WALL.interiorWidth
}
