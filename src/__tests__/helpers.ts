import type { Floor, FloorPlan, Point, Room } from '../types/floorPlan'

/**
 * テスト用のデータ生成ヘルパー。
 * 座標は特記ない限りアプリ内部単位（1単位 = 10mm）。
 */

export function rect(x1: number, y1: number, x2: number, y2: number): Point[] {
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ]
}

export function makeRoom(id: string, polygon: Point[], extra: Partial<Room> = {}): Room {
  return { id, name: id, type: 'western', polygon, ...extra }
}

export function makeFloor(extra: Partial<Floor> = {}): Floor {
  return {
    id: '1f',
    name: '1F',
    label: '1階',
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
    fixtures: [],
    stairs: [],
    ...extra,
  }
}

export function makePlan(floor: Partial<Floor>, extra: Partial<FloorPlan> = {}): FloorPlan {
  return {
    title: 'テスト',
    floors: [makeFloor(floor)],
    ...extra,
  }
}

/** ポリゴンの外接矩形 { x1, y1, x2, y2 } */
export function bbox(polygon: Point[]): { x1: number; y1: number; x2: number; y2: number } {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
}
