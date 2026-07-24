import type { Point, Stair, StairLayout, StairOrientation } from '../types/floorPlan'

export interface StairBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface StairGraphicLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface StairArrowPath {
  /** 始点の○ */
  start: Point
  /** 動線の折れ線（始点→終点） */
  points: Point[]
  /** 矢印先端の向き（度: 右=0, 下=90） */
  tipAngleDeg: number
}

export interface StairGraphics {
  stepLines: StairGraphicLine[]
  /** 直線階段の簡易三角（互換用） */
  arrowPoints: string
  arrowPath: StairArrowPath | null
}

export function getStairBounds(polygon: Point[]): StairBounds {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

export function inferStairOrientation(bounds: StairBounds): StairOrientation {
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  return h >= w ? 'up' : 'right'
}

export function resolveStairLayout(stair: Stair): StairLayout {
  return stair.layout ?? 'straight'
}

export function resolveStairOrientation(stair: Stair, bounds: StairBounds): StairOrientation {
  if (stair.orientation) return stair.orientation
  if (stair.direction === 'down') {
    const base = inferStairOrientation(bounds)
    if (base === 'up') return 'down'
    if (base === 'down') return 'up'
    if (base === 'left') return 'right'
    return 'left'
  }
  return inferStairOrientation(bounds)
}

function horizontalSteps(
  bounds: StairBounds,
  yFrom: number,
  yTo: number,
  count: number
): StairGraphicLine[] {
  const lines: StairGraphicLine[] = []
  for (let i = 1; i < count; i++) {
    const t = i / count
    const y = yFrom + (yTo - yFrom) * t
    lines.push({ x1: bounds.minX, y1: y, x2: bounds.maxX, y2: y })
  }
  return lines
}

function verticalSteps(
  bounds: StairBounds,
  xFrom: number,
  xTo: number,
  count: number
): StairGraphicLine[] {
  const lines: StairGraphicLine[] = []
  for (let i = 1; i < count; i++) {
    const t = i / count
    const x = xFrom + (xTo - xFrom) * t
    lines.push({ x1: x, y1: bounds.minY, x2: x, y2: bounds.maxY })
  }
  return lines
}

function straightSteps(bounds: StairBounds, orientation: StairOrientation, count: number): StairGraphicLine[] {
  if (orientation === 'up' || orientation === 'down') {
    return horizontalSteps(bounds, bounds.minY, bounds.maxY, count)
  }
  return verticalSteps(bounds, bounds.minX, bounds.maxX, count)
}

function straightStepsInBounds(bounds: StairBounds, vertical: boolean, count: number): StairGraphicLine[] {
  if (vertical) {
    return verticalSteps(bounds, bounds.minX, bounds.maxX, count)
  }
  return horizontalSteps(bounds, bounds.minY, bounds.maxY, count)
}

function polar(origin: Point, angleDeg: number, radius: number): Point {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: origin.x + Math.cos(rad) * radius,
    y: origin.y + Math.sin(rad) * radius,
  }
}

function normalizeAngle(deg: number): number {
  let a = deg % 360
  if (a <= -180) a += 360
  if (a > 180) a -= 360
  return a
}

function lerpAngle(a0: number, a1: number, t: number): number {
  const d = normalizeAngle(a1 - a0)
  return a0 + d * t
}

/** 内角から扇状に2本 → 回り段3分割（参考間取図） */
function winderSteps(
  inner: Point,
  startAngleDeg: number,
  endAngleDeg: number,
  radius: number
): StairGraphicLine[] {
  const a1 = lerpAngle(startAngleDeg, endAngleDeg, 1 / 3)
  const a2 = lerpAngle(startAngleDeg, endAngleDeg, 2 / 3)
  const p1 = polar(inner, a1, radius)
  const p2 = polar(inner, a2, radius)
  return [
    { x1: inner.x, y1: inner.y, x2: p1.x, y2: p1.y },
    { x1: inner.x, y1: inner.y, x2: p2.x, y2: p2.y },
  ]
}

function turnSizeFor(bounds: StairBounds, orientation: StairOrientation): number {
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  const cross = orientation === 'up' || orientation === 'down' ? w : h
  const run = orientation === 'up' || orientation === 'down' ? h : w
  return Math.min(cross, Math.max(cross * 0.55, run * 0.45))
}

interface TurnZone {
  turn: StairBounds
  straight: StairBounds
  inner: Point
  straightVertical: boolean
  approach: StairOrientation
  winderStartDeg: number
  winderEndDeg: number
  radius: number
}

/**
 * 右回り = 上りながら右へ（時計回り）→ 内角は進行方向の左側
 * 左回り = 上りながら左へ（反時計）→ 内角は進行方向の右側
 * （参考画像: 上向き右回りは左下内角から扇状の回り段）
 */
function getTurnZone(
  bounds: StairBounds,
  layout: 'turn-right' | 'turn-left',
  orientation: StairOrientation
): TurnZone {
  const size = turnSizeFor(bounds, orientation)
  const right = layout === 'turn-right'

  if (orientation === 'up') {
    const turn: StairBounds = {
      minX: bounds.minX,
      maxX: bounds.maxX,
      minY: bounds.minY,
      maxY: bounds.minY + size,
    }
    const straight: StairBounds = { ...bounds, minY: turn.maxY }
    const inner = right ? { x: bounds.minX, y: turn.maxY } : { x: bounds.maxX, y: turn.maxY }
    return {
      turn,
      straight,
      inner,
      straightVertical: false,
      approach: 'up',
      winderStartDeg: -90,
      winderEndDeg: right ? 0 : 180,
      radius: Math.hypot(bounds.maxX - bounds.minX, size) * 1.08,
    }
  }

  if (orientation === 'down') {
    const turn: StairBounds = {
      minX: bounds.minX,
      maxX: bounds.maxX,
      minY: bounds.maxY - size,
      maxY: bounds.maxY,
    }
    const straight: StairBounds = { ...bounds, maxY: turn.minY }
    const inner = right ? { x: bounds.maxX, y: turn.minY } : { x: bounds.minX, y: turn.minY }
    return {
      turn,
      straight,
      inner,
      straightVertical: false,
      approach: 'down',
      winderStartDeg: 90,
      winderEndDeg: right ? 0 : 180,
      radius: Math.hypot(bounds.maxX - bounds.minX, size) * 1.08,
    }
  }

  if (orientation === 'right') {
    const turn: StairBounds = {
      minX: bounds.maxX - size,
      maxX: bounds.maxX,
      minY: bounds.minY,
      maxY: bounds.maxY,
    }
    const straight: StairBounds = { ...bounds, maxX: turn.minX }
    // 右へ進み右回り → 下へ。内角は進行の左 = 上側
    const inner = right ? { x: turn.minX, y: bounds.minY } : { x: turn.minX, y: bounds.maxY }
    return {
      turn,
      straight,
      inner,
      straightVertical: true,
      approach: 'right',
      winderStartDeg: 0,
      winderEndDeg: right ? 90 : -90,
      radius: Math.hypot(size, bounds.maxY - bounds.minY) * 1.08,
    }
  }

  const turn: StairBounds = {
    minX: bounds.minX,
    maxX: bounds.minX + size,
    minY: bounds.minY,
    maxY: bounds.maxY,
  }
  const straight: StairBounds = { ...bounds, minX: turn.maxX }
  const inner = right ? { x: turn.maxX, y: bounds.maxY } : { x: turn.maxX, y: bounds.minY }
  return {
    turn,
    straight,
    inner,
    straightVertical: true,
    approach: 'left',
    winderStartDeg: 180,
    winderEndDeg: right ? 90 : -90,
    radius: Math.hypot(size, bounds.maxY - bounds.minY) * 1.08,
  }
}

function turnSteps(
  bounds: StairBounds,
  layout: 'turn-right' | 'turn-left',
  orientation: StairOrientation,
  count: number
): StairGraphicLine[] {
  const zone = getTurnZone(bounds, layout, orientation)
  const straightLen = zone.straightVertical
    ? zone.straight.maxX - zone.straight.minX
    : zone.straight.maxY - zone.straight.minY
  const turnLen = zone.straightVertical
    ? zone.turn.maxX - zone.turn.minX
    : zone.turn.maxY - zone.turn.minY
  const total = Math.max(straightLen + turnLen, 1)
  const straightCount = Math.max(4, Math.round(count * (straightLen / total)))

  const boundary: StairGraphicLine =
    orientation === 'up'
      ? { x1: bounds.minX, y1: zone.turn.maxY, x2: bounds.maxX, y2: zone.turn.maxY }
      : orientation === 'down'
        ? { x1: bounds.minX, y1: zone.turn.minY, x2: bounds.maxX, y2: zone.turn.minY }
        : orientation === 'right'
          ? { x1: zone.turn.minX, y1: bounds.minY, x2: zone.turn.minX, y2: bounds.maxY }
          : { x1: zone.turn.maxX, y1: bounds.minY, x2: zone.turn.maxX, y2: bounds.maxY }

  const straight = straightStepsInBounds(zone.straight, zone.straightVertical, straightCount)
  const winder = winderSteps(zone.inner, zone.winderStartDeg, zone.winderEndDeg, zone.radius)
  return [...straight, boundary, ...winder]
}

function arrowAt(bounds: StairBounds, orientation: StairOrientation): string {
  const size = 7
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2

  switch (orientation) {
    case 'up': {
      const y = bounds.maxY - 12
      return `${cx},${y - size} ${cx - 4},${y} ${cx + 4},${y}`
    }
    case 'down': {
      const y = bounds.minY + 12
      return `${cx},${y + size} ${cx - 4},${y} ${cx + 4},${y}`
    }
    case 'left': {
      const x = bounds.maxX - 12
      return `${x - size},${cy} ${x},${cy - 4} ${x},${cy + 4}`
    }
    case 'right': {
      const x = bounds.minX + 12
      return `${x + size},${cy} ${x},${cy - 4} ${x},${cy + 4}`
    }
  }
}

function insetAlong(bounds: StairBounds, orientation: StairOrientation, inset: number): Point {
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  switch (orientation) {
    case 'up':
      return { x: cx, y: bounds.maxY - inset }
    case 'down':
      return { x: cx, y: bounds.minY + inset }
    case 'left':
      return { x: bounds.maxX - inset, y: cy }
    case 'right':
      return { x: bounds.minX + inset, y: cy }
  }
}

function exitPoint(
  turn: StairBounds,
  layout: 'turn-right' | 'turn-left',
  approach: StairOrientation,
  inset: number
): { point: Point; angleDeg: number } {
  const cx = (turn.minX + turn.maxX) / 2
  const cy = (turn.minY + turn.maxY) / 2
  const right = layout === 'turn-right'

  if (approach === 'up') {
    return right
      ? { point: { x: turn.maxX - inset, y: cy }, angleDeg: 0 }
      : { point: { x: turn.minX + inset, y: cy }, angleDeg: 180 }
  }
  if (approach === 'down') {
    return right
      ? { point: { x: turn.minX + inset, y: cy }, angleDeg: 180 }
      : { point: { x: turn.maxX - inset, y: cy }, angleDeg: 0 }
  }
  if (approach === 'right') {
    return right
      ? { point: { x: cx, y: turn.maxY - inset }, angleDeg: 90 }
      : { point: { x: cx, y: turn.minY + inset }, angleDeg: -90 }
  }
  return right
    ? { point: { x: cx, y: turn.minY + inset }, angleDeg: -90 }
    : { point: { x: cx, y: turn.maxY - inset }, angleDeg: 90 }
}

function buildTurnArrowPath(
  bounds: StairBounds,
  layout: 'turn-right' | 'turn-left',
  orientation: StairOrientation
): StairArrowPath {
  const zone = getTurnZone(bounds, layout, orientation)
  const inset = Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.12
  const start = insetAlong(zone.straight, orientation, inset)
  const gate =
    orientation === 'up'
      ? { x: (bounds.minX + bounds.maxX) / 2, y: zone.turn.maxY }
      : orientation === 'down'
        ? { x: (bounds.minX + bounds.maxX) / 2, y: zone.turn.minY }
        : orientation === 'right'
          ? { x: zone.turn.minX, y: (bounds.minY + bounds.maxY) / 2 }
          : { x: zone.turn.maxX, y: (bounds.minY + bounds.maxY) / 2 }

  const { point: end, angleDeg } = exitPoint(zone.turn, layout, orientation, inset)
  const midAngle = lerpAngle(zone.winderStartDeg, zone.winderEndDeg, 0.55)
  const midR = Math.min(zone.turn.maxX - zone.turn.minX, zone.turn.maxY - zone.turn.minY) * 0.45
  const bend = polar(zone.inner, midAngle, midR)

  return {
    start,
    points: [start, gate, bend, end],
    tipAngleDeg: angleDeg,
  }
}

function buildStraightArrowPath(bounds: StairBounds, orientation: StairOrientation): StairArrowPath {
  const inset = Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.14
  const start = insetAlong(bounds, orientation, inset)
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  let end: Point
  let tipAngleDeg: number
  switch (orientation) {
    case 'up':
      end = { x: cx, y: bounds.minY + inset }
      tipAngleDeg = -90
      break
    case 'down':
      end = { x: cx, y: bounds.maxY - inset }
      tipAngleDeg = 90
      break
    case 'left':
      end = { x: bounds.minX + inset, y: cy }
      tipAngleDeg = 180
      break
    case 'right':
      end = { x: bounds.maxX - inset, y: cy }
      tipAngleDeg = 0
      break
  }
  return { start, points: [start, end], tipAngleDeg }
}

export function computeStairGraphics(stair: Stair, stepCount = 7): StairGraphics {
  const bounds = getStairBounds(stair.polygon)
  const layout = resolveStairLayout(stair)
  const orientation = resolveStairOrientation(stair, bounds)

  const stepLines =
    layout === 'straight'
      ? straightSteps(bounds, orientation, stepCount)
      : turnSteps(bounds, layout, orientation, stepCount)

  const arrowPath =
    layout === 'straight'
      ? buildStraightArrowPath(bounds, orientation)
      : buildTurnArrowPath(bounds, layout, orientation)

  return {
    stepLines,
    arrowPoints: arrowAt(bounds, orientation),
    arrowPath,
  }
}

/** 矢印ヘッドの三角形 */
export function arrowHeadPoints(tip: Point, angleDeg: number, size = 5.5): string {
  const rad = (angleDeg * Math.PI) / 180
  const back = { x: tip.x - Math.cos(rad) * size, y: tip.y - Math.sin(rad) * size }
  const left = {
    x: back.x + Math.cos(rad + Math.PI / 2) * size * 0.55,
    y: back.y + Math.sin(rad + Math.PI / 2) * size * 0.55,
  }
  const right = {
    x: back.x + Math.cos(rad - Math.PI / 2) * size * 0.55,
    y: back.y + Math.sin(rad - Math.PI / 2) * size * 0.55,
  }
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`
}

export function arrowPathToSvgD(points: Point[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}
