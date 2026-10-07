import type { Floor, FloorPlan, Point } from '../types/floorPlan'
import { syncFloorWalls } from './ensureExteriorWalls'

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

/** 階の階段を長方形にそろえる。変えたときだけ壁を作り直す */
export function rectifyFloorStairs(floor: Floor): Floor {
  if (floor.stairs.every((s) => isStairRect(s.polygon))) return floor
  return syncFloorWalls({
    ...floor,
    stairs: floor.stairs.map((s) => (isStairRect(s.polygon) ? s : { ...s, polygon: stairRect(s.polygon) })),
  })
}

export function rectifyPlanStairs(plan: FloorPlan): FloorPlan {
  const floors = plan.floors.map(rectifyFloorStairs)
  return floors.every((f, i) => f === plan.floors[i]) ? plan : { ...plan, floors }
}
