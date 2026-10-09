import type { FloorPlan, Point } from '../types/floorPlan'
import { syncFloorWalls } from './ensureExteriorWalls'
import { findRoom } from './floorPlanEdit'
import { moveStairEdge } from './resizeStair'
import { subtractOrthogonal, unionOrthogonal } from './roomOverlap'

/**
 * 部屋の範囲を、図面の上で四角を描いて決める（着色したい範囲を、そのまま部屋の形にする）。
 * - set: 描いた四角を部屋の範囲にする
 * - add: 今の範囲に四角を足す（L 字の部屋など）
 * - cut: 今の範囲から四角を削る
 */
export type RoomRangeMode = 'set' | 'add' | 'cut'

/** 四角の最小の大きさ（図面の単位。10 = 100mm）。うっかりクリックしただけのときは何もしない */
const MIN_RECT = 10

/** 座標を 5mm 刻みにそろえる */
const round = (v: number) => Math.round(v * 2) / 2

export function rectFromCorners(a: Point, b: Point): Point[] {
  const x1 = round(Math.min(a.x, b.x))
  const x2 = round(Math.max(a.x, b.x))
  const y1 = round(Math.min(a.y, b.y))
  const y2 = round(Math.max(a.y, b.y))
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ]
}

function withRoomPolygon(plan: FloorPlan, ref: { floorId: string; roomId: string }, polygon: Point[]): FloorPlan {
  const found = findRoom(plan, ref)
  if (!found) return plan
  return {
    ...plan,
    floors: plan.floors.map((floor, fi) =>
      fi !== found.floorIndex
        ? floor
        : syncFloorWalls({
            ...floor,
            rooms: floor.rooms.map((r, ri) => (ri === found.roomIndex ? { ...r, polygon: polygon.map((p) => ({ x: round(p.x), y: round(p.y) })) } : r)),
          })
    ),
  }
}

/** 描いた四角で部屋の範囲を変える。できないときは、そのわけを返す */
export function applyRoomRange(
  plan: FloorPlan,
  ref: { floorId: string; roomId: string },
  a: Point,
  b: Point,
  mode: RoomRangeMode
): { plan: FloorPlan } | { error: string } {
  const found = findRoom(plan, ref)
  if (!found) return { error: '部屋が見つかりません' }
  const rect = rectFromCorners(a, b)
  if (rect[1].x - rect[0].x < MIN_RECT || rect[2].y - rect[1].y < MIN_RECT) {
    return { error: '四角が小さすぎます。図面の上をドラッグして描いてください' }
  }
  const current = found.room.polygon

  if (mode === 'set') return { plan: withRoomPolygon(plan, ref, rect) }

  if (mode === 'add') {
    // 重なっていても接しているだけでもよい。離れた所に描くと、1つの形にできない
    const union = unionOrthogonal(current, rect)
    if (!union) {
      return { error: '足す四角は、今の部屋の範囲に重なるか接するように描いてください' }
    }
    return { plan: withRoomPolygon(plan, ref, union) }
  }

  const cut = subtractOrthogonal(current, rect)
  if (cut === current) return { error: '削る四角が、部屋の範囲に重なっていません' }
  if (!cut) return { error: 'その削り方だと部屋が2つに分かれるか、穴があきます。端から削るように描いてください' }
  return { plan: withRoomPolygon(plan, ref, cut) }
}

/**
 * 長方形でない部屋（L 字など）の辺をドラッグして動かす。start はドラッグ開始時の形。
 * 動かした辺だけが動き、隣の辺が伸び縮みする（細くなりすぎたり裏返ったりしない）
 */
export function moveRoomPolygonEdge(
  plan: FloorPlan,
  ref: { floorId: string; roomId: string },
  start: Point[],
  edgeIndex: number,
  value: number
): FloorPlan {
  return withRoomPolygon(plan, ref, moveStairEdge(start, edgeIndex, round(value)))
}
