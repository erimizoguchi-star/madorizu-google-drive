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
  /** 破断線より先の段（破線で描く） */
  dashed?: boolean
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
  /** UP / DN の文字を置く位置（矢印の始点の横） */
  labelPoint: Point
  /** 破断線（1階の描き方）。入れないときは null */
  breakLine: Point[] | null
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

/**
 * 上り方向。未設定なら形から推定する。
 * DN（2階）でも上り方向は変えない（以前はここで反転していたが、今は矢印のほうを下り向きに描く）
 */
export function resolveStairOrientation(stair: Stair, bounds: StairBounds): StairOrientation {
  if (stair.orientation) return stair.orientation
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

/** 踏面の目安（図面の単位。910mm を4段に割った 227.5mm） */
const TREAD = 22.75

/** 矢印を逆向きにたどる（2階の DN に使う） */
function reverseArrow(path: StairArrowPath): StairArrowPath {
  const points = [...path.points].reverse()
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  return { start: points[0], points, tipAngleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
}

/**
 * 上る向きを基準にした座標（s = 上る向きの距離、t = 上る向きの右側への距離）を、図面の座標へ直す。
 * どの向きの階段でも同じ書き方で形を作れるようにする
 */
function runFrame(bounds: StairBounds, orientation: StairOrientation) {
  const { minX, maxX, minY, maxY } = bounds
  const w = maxX - minX
  const h = maxY - minY
  switch (orientation) {
    case 'up':
      return { L: h, W: w, at: (s: number, t: number): Point => ({ x: minX + t, y: maxY - s }) }
    case 'down':
      return { L: h, W: w, at: (s: number, t: number): Point => ({ x: maxX - t, y: minY + s }) }
    case 'right':
      return { L: w, W: h, at: (s: number, t: number): Point => ({ x: minX + s, y: minY + t }) }
    case 'left':
      return { L: w, W: h, at: (s: number, t: number): Point => ({ x: maxX - s, y: maxY - t }) }
  }
}

/**
 * L字。上る向きの直線部分と、曲がる部分（回り段）を、上る向きを基準にした座標で作る。
 * - atEnd = true: 上り終わりの側で曲がる（直線を上ってから曲がって出る）
 * - atEnd = false: 上り始めの側で曲がる（横から入って曲がってから直線を上る）
 * 右回り＝上りながら右へ曲がる。回り段は、曲がる内側の角（手すりの柱の位置）から扇状に 3 段に分ける
 */
function lTurnGraphics(bounds: StairBounds, orientation: StairOrientation, right: boolean, atEnd: boolean) {
  const frame = runFrame(bounds, orientation)
  const { L, W } = frame
  // 左回りは右回りを左右に映したもの
  const at = (s: number, t: number) => frame.at(s, right ? t : W - t)
  const D = Math.min(W, L * 0.45)
  const line = (a: Point, b: Point): StairGraphicLine => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  const stepLines: StairGraphicLine[] = []

  // 直線部分の段
  const runFrom = atEnd ? 0 : D
  const runTo = atEnd ? L - D : L
  const count = Math.max(2, Math.round((runTo - runFrom) / TREAD))
  for (let k = 1; k < count; k++) {
    const sk = runFrom + ((runTo - runFrom) * k) / count
    stepLines.push(line(at(sk, 0), at(sk, W)))
  }
  // 直線部分と曲がる部分の境
  const edgeS = atEnd ? L - D : D
  stepLines.push(line(at(edgeS, 0), at(edgeS, W)))

  // 回り段: 内側の角から、外側の辺へ 30° と 60° の線
  const inner = { s: edgeS, t: W }
  // 内側の角から見た2つの辺の向き（上で曲がる: 外へ -t と 上へ +s、下で曲がる: 下へ -s と 外へ -t）
  const dirA = atEnd ? { s: 0, t: -1 } : { s: -1, t: 0 }
  const dirB = atEnd ? { s: 1, t: 0 } : { s: 0, t: -1 }
  const sLimit = atEnd ? L : 0
  for (const deg of [30, 60]) {
    const a = (deg * Math.PI) / 180
    const ds = dirA.s * Math.cos(a) + dirB.s * Math.sin(a)
    const dt = dirA.t * Math.cos(a) + dirB.t * Math.sin(a)
    const kS = ds !== 0 ? (sLimit - inner.s) / ds : Infinity
    const kT = dt !== 0 ? (0 - inner.t) / dt : Infinity
    const k = Math.min(...[kS, kT].filter((v) => v > 0))
    stepLines.push(line(at(inner.s, inner.t), at(inner.s + ds * k, inner.t + dt * k)))
  }

  // 矢印（通路の中央を通る）
  const inset = Math.min(W, L) * 0.18
  const points = atEnd
    ? [at(inset, W / 2), at(L - D / 2, W / 2), at(L - D / 2, W - inset)]
    : [at(D / 2, W - inset), at(D / 2, W / 2), at(L - inset, W / 2)]
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  const arrowPath: StairArrowPath = {
    start: points[0],
    points,
    tipAngleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  }
  return { stepLines, arrowPath }
}

/**
 * U字（折り返し）。幅を2本の通路に分け、1本目を上って突き当たりの回り段で折り返し、2本目を戻る。
 * 右回り＝上りながら右へ折り返す（1本目が左、2本目が右）
 */
function uTurnGraphics(bounds: StairBounds, orientation: StairOrientation, right: boolean) {
  const { L, W, at } = runFrame(bounds, orientation)
  const lane = W / 2
  const turnDepth = Math.min(lane, L * 0.4)
  const run = L - turnDepth
  const lane1 = right ? [0, lane] : [lane, W]
  const lane2 = right ? [lane, W] : [0, lane]
  const count = Math.max(3, Math.round(run / TREAD))
  const line = (a: Point, b: Point): StairGraphicLine => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })

  const stepLines: StairGraphicLine[] = []
  for (const [t0, t1] of [lane1, lane2]) {
    for (let k = 1; k < count; k++) {
      const sk = (run * k) / count
      stepLines.push(line(at(sk, t0), at(sk, t1)))
    }
  }
  // 2本の通路の境（手すり壁）と、回り段の境
  stepLines.push(line(at(0, lane), at(run, lane)))
  stepLines.push(line(at(run, 0), at(run, W)))
  // 突き当たりの回り段（通路の境の端から扇状に）
  const inner = at(run, lane)
  for (const target of [at(L - turnDepth * 0.45, 0), at(L, W * 0.22), at(L, W * 0.78), at(L - turnDepth * 0.45, W)]) {
    stepLines.push(line(inner, target))
  }

  const c1 = (lane1[0] + lane1[1]) / 2
  const c2 = (lane2[0] + lane2[1]) / 2
  const inset = Math.min(lane, run) * 0.3
  const points = [at(inset, c1), at(run, c1), at(L - turnDepth * 0.5, lane), at(run, c2), at(inset, c2)]
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  const arrowPath: StairArrowPath = {
    start: points[0],
    points,
    tipAngleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  }
  return { stepLines, arrowPath, laneWidth: lane }
}

/** 折れ線に沿った長さ */
function polylineLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  return total
}

/** 折れ線上で、始点から distance だけ進んだ点と、そこでの進む向き（単位ベクトル） */
function pointAlong(points: Point[], distance: number): { point: Point; dir: Point; index: number } {
  let left = distance
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const dir = len > 0 ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : { x: 1, y: 0 }
    if (left <= len || i === points.length - 1) {
      const t = len > 0 ? Math.min(1, left / len) : 0
      return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dir, index: i }
    }
    left -= len
  }
  return { point: points[0], dir: { x: 1, y: 0 }, index: 1 }
}

/** 点を折れ線へ投影したときの、始点からの長さ */
function distanceAlong(points: Point[], p: Point): number {
  let best = Infinity
  let bestAlong = 0
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const q = { x: a.x + dx * t, y: a.y + dy * t }
    const d = Math.hypot(p.x - q.x, p.y - q.y)
    if (d < best) {
      best = d
      bestAlong = walked + Math.sqrt(len2) * t
    }
    walked += Math.sqrt(len2)
  }
  return bestAlong
}

/** 破断線を入れる位置（矢印に沿った長さの割合） */
const CUT_AT = 0.55

export function computeStairGraphics(stair: Stair, stepCount = 7): StairGraphics {
  const bounds = getStairBounds(stair.polygon)
  const layout = resolveStairLayout(stair)
  const orientation = resolveStairOrientation(stair, bounds)
  const crossWidth =
    orientation === 'up' || orientation === 'down' ? bounds.maxX - bounds.minX : bounds.maxY - bounds.minY

  let stepLines: StairGraphicLine[]
  let ascent: StairArrowPath
  let laneWidth = crossWidth
  if (layout === 'straight') {
    stepLines = straightSteps(bounds, orientation, stepCount)
    ascent = buildStraightArrowPath(bounds, orientation)
  } else if (layout !== 'u-right' && layout !== 'u-left') {
    // L字（上で曲がる・下で曲がる）。以前の作りは下向き・左向きに上る階段で曲がる側と回り段の向きが食い違っていた
    const right = layout === 'turn-right' || layout === 'turn-right-start'
    const atEnd = layout === 'turn-right' || layout === 'turn-left'
    const l = lTurnGraphics(bounds, orientation, right, atEnd)
    stepLines = l.stepLines
    ascent = l.arrowPath
  } else {
    const u = uTurnGraphics(bounds, orientation, layout === 'u-right')
    stepLines = u.stepLines
    ascent = u.arrowPath
    laneWidth = u.laneWidth
  }

  // DN（2階）は上り終わり側から下りの向きに描く
  const down = stair.direction === 'down'
  let arrowPath = down ? reverseArrow(ascent) : ascent

  // 破断線（1階の描き方）: 矢印に沿って 55% の位置で切り、先の段は破線、矢印は破断線まで
  let breakLine: Point[] | null = null
  if (stair.cutLine && !down) {
    const total = polylineLength(arrowPath.points)
    const cut = total * CUT_AT
    const { point, dir, index } = pointAlong(arrowPath.points, cut)
    const n = { x: -dir.y, y: dir.x }
    const half = laneWidth * 0.6
    const zig = Math.min(4, laneWidth * 0.08)
    // 少し斜めの線に、中央でジグザグを入れる（はみ出した分は階段の形で切り抜かれる）
    breakLine = [
      { x: point.x - n.x * half - dir.x * half * 0.15, y: point.y - n.y * half - dir.y * half * 0.15 },
      { x: point.x - n.x * zig + dir.x * zig, y: point.y - n.y * zig + dir.y * zig },
      { x: point.x + n.x * zig - dir.x * zig, y: point.y + n.y * zig - dir.y * zig },
      { x: point.x + n.x * half + dir.x * half * 0.15, y: point.y + n.y * half + dir.y * half * 0.15 },
    ]
    stepLines = stepLines.map((line) => {
      const mid = { x: (line.x1 + line.x2) / 2, y: (line.y1 + line.y2) / 2 }
      return distanceAlong(arrowPath.points, mid) > cut ? { ...line, dashed: true } : line
    })
    const gap = Math.min(3, cut * 0.1)
    const tip = { x: point.x - dir.x * gap, y: point.y - dir.y * gap }
    arrowPath = {
      start: arrowPath.start,
      points: [...arrowPath.points.slice(0, index), tip],
      tipAngleDeg: (Math.atan2(dir.y, dir.x) * 180) / Math.PI,
    }
  }

  // UP / DN は矢印の始点の横（進む向きの右側、U字・L字は曲がる側の反対）に置く
  const first = arrowPath.points[1] ?? arrowPath.points[0]
  const len = Math.hypot(first.x - arrowPath.start.x, first.y - arrowPath.start.y) || 1
  const d = { x: (first.x - arrowPath.start.x) / len, y: (first.y - arrowPath.start.y) / len }
  const turnsRight = layout === 'turn-right' || layout === 'turn-right-start' || layout === 'u-right'
  const side = layout === 'straight' ? 1 : turnsRight !== down ? -1 : 1
  const off = Math.min(Math.max(laneWidth * 0.28, 10), 30)
  const labelPoint = {
    x: arrowPath.start.x + -d.y * off * side + d.x * 6,
    y: arrowPath.start.y + d.x * off * side + d.y * 6,
  }

  return {
    stepLines,
    arrowPoints: arrowAt(bounds, orientation),
    arrowPath,
    labelPoint,
    breakLine,
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
