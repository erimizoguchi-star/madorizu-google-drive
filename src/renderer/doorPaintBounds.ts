import type { Door, Point } from '../types/floorPlan'
import { DOOR } from './styles'

/** DoorRenderer の親子戸比率と揃える */
const PARENT_RATIO = 0.62

/** 線幅・選択ヒット分の余裕 */
const STROKE_PAD = Math.max(DOOR.leafWidthSelected, DOOR.arcWidthSelected) + 2

/**
 * ドア記号の描画範囲に含まれる点（開口端・開いた戸先・弧のサンプルなど）。
 * FloorCanvas の viewBox 計算で、壁外に張り出す弧・戸先が切れないようにする。
 */
export function doorPaintExtentPoints(door: Door): Point[] {
  const kind = door.kind ?? 'swing'
  const rad = (door.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const nx = -sin
  const ny = cos
  const x1 = door.position.x
  const y1 = door.position.y
  const x2 = x1 + door.width * cos
  const y2 = y1 + door.width * sin
  const half = door.width / 2
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const swingDir = door.swing

  const points: Point[] = [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ]

  const push = (x: number, y: number) => {
    points.push({ x, y })
  }

  const openTip = (hx: number, hy: number, leafLen: number) => {
    push(hx + nx * swingDir * leafLen, hy + ny * swingDir * leafLen)
  }

  /** 1/4円弧をサンプルして AABB に載せる */
  const sampleArc = (cx: number, cy: number, radius: number, startRad: number, swing: 1 | -1) => {
    for (let i = 0; i <= 4; i++) {
      const a = startRad + ((swing * Math.PI) / 2) * (i / 4)
      push(cx + radius * Math.cos(a), cy + radius * Math.sin(a))
    }
  }

  const padAround = (x: number, y: number, r: number) => {
    push(x - r, y)
    push(x + r, y)
    push(x, y - r)
    push(x, y + r)
  }

  switch (kind) {
    case 'swing':
      openTip(x1, y1, door.width)
      sampleArc(x1, y1, door.width, rad, swingDir)
      break
    case 'double_swing': {
      const rightSwing = (swingDir === 1 ? -1 : 1) as 1 | -1
      openTip(x1, y1, half)
      openTip(x2, y2, half)
      sampleArc(x1, y1, half, rad, swingDir)
      sampleArc(x2, y2, half, rad + Math.PI, rightSwing)
      break
    }
    case 'parent_child': {
      const parentLen = door.width * PARENT_RATIO
      const childLen = door.width * (1 - PARENT_RATIO)
      openTip(x1, y1, parentLen)
      openTip(x2, y2, childLen)
      sampleArc(x1, y1, parentLen, rad, swingDir)
      sampleArc(x2, y2, childLen, rad + Math.PI, swingDir)
      break
    }
    case 'folding': {
      const peak = Math.min(door.width * 0.36, 14)
      openTip(x1 + half * 0.5 * cos, y1 + half * 0.5 * sin, peak)
      openTip(x1 + half * 1.5 * cos, y1 + half * 1.5 * sin, peak)
      padAround(midX, midY, DOOR.endTick)
      break
    }
    case 'double_folding': {
      const peak = Math.min(door.width * 0.22, 10)
      for (const t of [0.25, 0.75, 1.25, 1.75]) {
        openTip(x1 + half * t * cos, y1 + half * t * sin, peak)
      }
      padAround(midX, midY, DOOR.endTick)
      break
    }
    case 'sliding':
      padAround(x1, y1, DOOR.endTick)
      push(x2 + nx * door.width * 0.04, y2 + ny * door.width * 0.04)
      push(x2 - nx * door.width * 0.04, y2 - ny * door.width * 0.04)
      break
    case 'double_sliding':
      padAround(midX, midY, DOOR.endTick)
      break
    case 'pocket': {
      const pocketLen = door.width * 0.32
      const pocketW = Math.min(door.width * 0.12, 6)
      const ox = x2 - cos * pocketLen
      const oy = y2 - sin * pocketLen
      push(ox + nx * pocketW, oy + ny * pocketW)
      push(ox - nx * pocketW, oy - ny * pocketW)
      push(x2 + nx * pocketW, y2 + ny * pocketW)
      push(x2 - nx * pocketW, y2 - ny * pocketW)
      padAround(x1, y1, DOOR.endTick)
      break
    }
    case 'opening':
      padAround(x1, y1, DOOR.endTick * 1.35)
      padAround(x2, y2, DOOR.endTick * 1.35)
      break
    default:
      break
  }

  // 線幅ぶん外側に少し広げる
  if (STROKE_PAD > 0 && points.length > 0) {
    let minX = points[0].x
    let maxX = points[0].x
    let minY = points[0].y
    let maxY = points[0].y
    for (const p of points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    push(minX - STROKE_PAD, minY - STROKE_PAD)
    push(maxX + STROKE_PAD, maxY + STROKE_PAD)
  }

  return points
}
