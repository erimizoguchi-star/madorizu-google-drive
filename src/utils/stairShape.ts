import type { Floor, FloorPlan, Point, Stair } from '../types/floorPlan'
import { syncFloorWalls } from './ensureExteriorWalls'
import { getStairBounds, isLShapeLayout, lStairGeometry } from '../renderer/stairGraphics'

/**
 * 階段の輪郭は長方形にそろえる。
 * 段・矢印・回り段はすべて長方形の範囲の中に描く作りなので、輪郭がゆがむ（角が重なって三角形になる、
 * 点の順番がねじれる など）と、切り抜きで三角形に見えたり、範囲の外に UP が出たりする。
 */
export function stairRect(polygon: Point[]): Point[] {
  if (polygon.length === 0) return polygon
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
}

const EPS = 0.05

/** 輪郭が、外接する長方形とまったく同じ4点か */
export function isStairRect(polygon: Point[]): boolean {
  if (polygon.length !== 4) return false
  const rect = stairRect(polygon)
  return rect.every((r) => polygon.some((p) => Math.abs(p.x - r.x) < EPS && Math.abs(p.y - r.y) < EPS)) &&
    polygon.every((p, i) => {
      // 隣り合う点は縦か横に並ぶ（ねじれた順番を除く）
      const q = polygon[(i + 1) % polygon.length]
      return Math.abs(p.x - q.x) < EPS || Math.abs(p.y - q.y) < EPS
    })
}

/**
 * 階段のあるべき輪郭。ふつうは外接する長方形、L字・2方向に段は L 字。
 * fromPolygon = false のときは、L 字の幅を今の輪郭ではなく階段の幅から決め直す（形や向きを変えたとき）
 */
export function stairOutline(stair: Stair, fromPolygon = true): Point[] {
  if (stair.polygon.length === 0) return stair.polygon
  if (isLShapeLayout(stair.layout)) return lStairGeometry(stair, getStairBounds(stair.polygon), fromPolygon).outline
  return stairRect(stair.polygon)
}

function samePolygon(a: Point[], b: Point[]): boolean {
  return (
    a.length === b.length &&
    b.every((q) => a.some((p) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS)) &&
    a.every((p, i) => {
      // 隣り合う点は縦か横に並ぶ（ねじれた順番を除く）
      const q = a[(i + 1) % a.length]
      return Math.abs(p.x - q.x) < EPS || Math.abs(p.y - q.y) < EPS
    })
  )
}

/** 階の階段を、あるべき輪郭（長方形・L 字）にそろえる。変えたときだけ壁を作り直す */
export function rectifyFloorStairs(floor: Floor): Floor {
  const outlines = floor.stairs.map((s) => stairOutline(s))
  if (floor.stairs.every((s, i) => samePolygon(s.polygon, outlines[i]))) return floor
  return syncFloorWalls({
    ...floor,
    stairs: floor.stairs.map((s, i) => (samePolygon(s.polygon, outlines[i]) ? s : { ...s, polygon: outlines[i] })),
  })
}

export function rectifyPlanStairs(plan: FloorPlan): FloorPlan {
  const floors = plan.floors.map(rectifyFloorStairs)
  return floors.every((f, i) => f === plan.floors[i]) ? plan : { ...plan, floors }
}
