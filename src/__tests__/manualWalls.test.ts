import { describe, expect, it } from 'vitest'
import { syncFloorWalls } from '../utils/ensureExteriorWalls'
import { moveWallEndpointOnFloor } from '../utils/floorPlanDrag'
import { moveRoom } from '../utils/floorPlanEdit'
import { resizeRoomEdgeOnFloor } from '../utils/resizeRoom'
import { moveGridLine } from '../utils/gridLines'
import type { Floor } from '../types/floorPlan'
import { makeFloor, makeRoom, rect } from './helpers'

/** 横の線 y 上にある壁（[始点x, 終点x] を小さい順に） */
const wallsAtY = (floor: Floor, y: number) =>
  floor.walls
    .filter((w) => Math.abs(w.start.y - y) < 0.6 && Math.abs(w.end.y - y) < 0.6)
    .map((w) => [Math.min(w.start.x, w.end.x), Math.max(w.start.x, w.end.x)])

/** 下の部屋 c の下端（y=500）の外壁を、右端 800 → 750 に手で短くした階 */
function shortenedBottom(): Floor {
  const base = syncFloorWalls(
    makeFloor({
      rooms: [
        makeRoom('a', rect(0, 0, 400, 300)),
        makeRoom('b', rect(400, 0, 800, 300)),
        makeRoom('c', rect(0, 300, 800, 500)),
      ],
    })
  )
  const bottom = base.walls.find((w) => w.exterior && w.start.y === 500 && w.end.y === 500)!
  const endpoint = bottom.end.x > bottom.start.x ? 'end' : 'start'
  return moveWallEndpointOnFloor(base, bottom.id, endpoint, { x: 750, y: 500 })
}

describe('手で直した壁（壁が増えないこと）', () => {
  it('手で短くした外壁の横に、元の長さの外壁を作り直さない', () => {
    const floor = syncFloorWalls(shortenedBottom())
    expect(wallsAtY(floor, 500)).toEqual([[0, 750]])
  })

  it('部屋を動かすと、その部屋だけの辺にある手で直した壁も一緒に動き、元の位置に残らない', () => {
    const floor = shortenedBottom()
    const moved = moveRoom({ title: 't', floors: [floor] }, { floorId: floor.id, roomId: 'c' }, { x: 0, y: 50 })
      .floors[0]
    expect(wallsAtY(moved, 500)).toEqual([])
    expect(wallsAtY(moved, 550)).toEqual([[0, 750]])
  })

  it('部屋の大きさを変えても、線を合わせても、壁は1本のまま', () => {
    const floor = shortenedBottom()
    const resized = resizeRoomEdgeOnFloor(floor, 'c', 'south', 550) as Floor
    expect(wallsAtY(resized, 500)).toEqual([])
    expect(wallsAtY(resized, 550)).toHaveLength(1)

    const lined = moveGridLine(floor, 'y', 500, 550)
    expect(wallsAtY(lined, 500)).toEqual([])
    expect(wallsAtY(lined, 550)).toEqual([[0, 750]])
  })
})
