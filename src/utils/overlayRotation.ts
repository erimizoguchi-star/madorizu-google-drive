import type { Point } from '../types/floorPlan'

/**
 * 重ねた平面図の回転。
 * 横向きの図面は 90° ずつ回し、スキャンで少し傾いた図面は「傾き」で細かく直す。
 * 角度は1つの値（度、時計回りが正）で持ち、90° の倍数の「向き」とその残りの「傾き」に分けて見せる。
 */

/** 角度を -180 より大きく 180 以下にそろえる */
export function normalizeAngle(deg: number): number {
  let a = deg % 360
  if (a > 180) a -= 360
  if (a <= -180) a += 360
  // -0 を 0 にする
  return a + 0
}

/** 角度を 90° の倍数の「向き」と、残りの「傾き」（-45〜45°）に分ける */
export function splitRotation(deg: number): { quarter: number; tilt: number } {
  const a = normalizeAngle(deg)
  const quarter = normalizeAngle(Math.round(a / 90) * 90)
  return { quarter, tilt: Math.round((a - Math.round(a / 90) * 90) * 1000) / 1000 }
}

/** 回した画像を囲む、軸にそろった枠の大きさ（CSS で回した要素の getBoundingClientRect と同じ） */
export function rotatedBoxSize(width: number, height: number, deg: number): { width: number; height: number } {
  const r = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  return { width: width * c + height * s, height: width * s + height * c }
}

const rotate = (v: Point, rad: number): Point => ({
  x: v.x * Math.cos(rad) - v.y * Math.sin(rad),
  y: v.x * Math.sin(rad) + v.y * Math.cos(rad),
})

export interface ThreePointInput {
  /** 重ねた平面図の上でクリックした、建物の左上・右上・右下（画面座標） */
  clicks: [Point, Point, Point]
  /** 間取図の建物の左上と右下（画面座標）。間取図は回っていないので、右上は (p2.x, p1.y) */
  plan: { p1: Point; p2: Point }
  /** 平面図の画像の中心（画面座標）。回転と拡大はここを中心に掛かる */
  center: Point
}

export interface ThreePointResult {
  /** 平面図を今からさらに回す角度（度） */
  rotateDeg: number
  /** 平面図を今から何倍にするか（縦横比は保つ） */
  scale: number
  /** 平面図の中心を画面上で動かす量（px） */
  move: Point
  /**
   * 間取図の建物を平面図の建物にぴったり合わせるための横・縦の倍率。
   * AI が寸法を読み違えて、間取図と平面図の縦横比が違うときに 1 からずれる
   */
  planStretch: { sx: number; sy: number }
}

/** 2点がこれより近いと、角度や倍率が大きく狂うので合わせない（画面上の px） */
const MIN_CLICK_SPAN = 8

/**
 * 平面図の建物の左上・右上・右下を、間取図の建物の角に重ねるための回転・倍率・移動を求める。
 *
 * 傾きは「左上 → 右上」（建物の上の辺）の向きから求める。対角線の向きで求めると、
 * 間取図と平面図の縦横比が違うとき（AI の読み違い）に、その差まで傾きとして拾ってしまう。
 * 倍率は上の辺と右の辺の長さの比の平均（縦横比は保つ）。位置は左上の角を合わせる
 * （縦横比を合わせるときは、間取図を建物の左上を基準に伸び縮みさせるので、そこで食い違わない）。
 */
export function solveThreePointAlignment({ clicks, plan, center }: ThreePointInput): ThreePointResult | null {
  const [c1, c2, c3] = clicks
  const top = { x: c2.x - c1.x, y: c2.y - c1.y }
  const right = { x: c3.x - c2.x, y: c3.y - c2.y }
  const topLen = Math.hypot(top.x, top.y)
  const rightLen = Math.hypot(right.x, right.y)
  const planW = plan.p2.x - plan.p1.x
  const planH = plan.p2.y - plan.p1.y
  if (topLen < MIN_CLICK_SPAN || rightLen < MIN_CLICK_SPAN || planW < 1 || planH < 1) return null

  const rad = -Math.atan2(top.y, top.x)
  const kx = planW / topLen
  const ky = planH / rightLen
  const k = (kx + ky) / 2
  if (!(k > 0) || !Number.isFinite(k)) return null

  // 中心まわりに回して k 倍したとき、左上の角が来る位置を間取図の左上に重ねる
  const moved = rotate({ x: c1.x - center.x, y: c1.y - center.y }, rad)
  const move = {
    x: plan.p1.x - (center.x + moved.x * k),
    y: plan.p1.y - (center.y + moved.y * k),
  }
  return {
    rotateDeg: (rad * 180) / Math.PI,
    scale: k,
    move,
    planStretch: { sx: k / kx, sy: k / ky },
  }
}
