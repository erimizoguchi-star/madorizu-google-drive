import { describe, expect, it } from 'vitest'
import { syncFloorWalls } from '../utils/ensureExteriorWalls'
import { alignFloorWalls, findWallMisalignments, snapPolygonToEdges, snapToNearest, otherEdgeValues } from '../utils/alignWalls'
import type { Floor } from '../types/floorPlan'
import { bbox, makeFloor, makeRoom, rect } from './helpers'

const wallsOf = (floor: Floor) =>
  syncFloorWalls(floor).walls.map((w) => ({
    exterior: !!w.exterior,
    x1: Math.min(w.start.x, w.end.x),
    y1: Math.min(w.start.y, w.end.y),
    x2: Math.max(w.start.x, w.end.x),
    y2: Math.max(w.start.y, w.end.y),
  }))

describe('部屋の境目の壁', () => {
  it('1つの辺に2部屋が接していても、境目は内壁（細い壁）になる', () => {
    // LD の右辺に、洋室と洗面所が上下に並んで接している
    const floor = makeFloor({
      rooms: [
        makeRoom('LD', rect(0, 0, 100, 100)),
        makeRoom('洋室', rect(100, 0, 200, 50)),
        makeRoom('洗面', rect(100, 50, 200, 100)),
      ],
    })
    const onBorder = wallsOf(floor).filter((w) => w.x1 === 100 && w.x2 === 100)
    expect(onBorder).toHaveLength(2)
    expect(onBorder.every((w) => !w.exterior)).toBe(true)
    // 外壁は建物の外周だけ
    expect(wallsOf(floor).filter((w) => w.exterior && w.x1 > 0 && w.x1 < 200 && w.x1 === w.x2)).toHaveLength(0)
  })
})

describe('数 cm ずれた壁をそろえる', () => {
  it('隣の部屋との 20mm のすき間を見つけ、1本の内壁にする', () => {
    const floor = makeFloor({
      rooms: [makeRoom('A', rect(0, 0, 100, 100)), makeRoom('B', rect(102, 0, 200, 100))],
    })
    const found = findWallMisalignments(floor)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ axis: 'x', a: 100, b: 102, kind: 'gap' })

    const aligned = alignFloorWalls(floor)
    expect(findWallMisalignments(aligned)).toHaveLength(0)
    const a = bbox(aligned.rooms[0].polygon)
    const b = bbox(aligned.rooms[1].polygon)
    expect(a.x2).toBe(b.x1)
    const border = wallsOf(aligned).filter((w) => w.x1 === a.x2 && w.x2 === a.x2)
    expect(border).toHaveLength(1)
    expect(border[0].exterior).toBe(false)
  })

  it('20mm 重なった部屋も、重なりとして見つけてそろえる', () => {
    const floor = makeFloor({
      rooms: [makeRoom('A', rect(0, 0, 100, 100)), makeRoom('B', rect(98, 0, 200, 100))],
    })
    expect(findWallMisalignments(floor)[0]).toMatchObject({ kind: 'overlap', a: 98, b: 100 })
    expect(findWallMisalignments(alignFloorWalls(floor))).toHaveLength(0)
  })

  it('並んだ部屋の外壁の段差もそろえる。ほかの部屋もそろっている長い線のほうに合わせる', () => {
    // A と C の上辺は y=0、B だけ y=2（20mm 下がっている）
    const floor = makeFloor({
      rooms: [
        makeRoom('A', rect(0, 0, 100, 100)),
        makeRoom('B', rect(100, 2, 200, 100)),
        makeRoom('C', rect(200, 0, 300, 100)),
      ],
    })
    expect(findWallMisalignments(floor).some((m) => m.kind === 'step' && m.axis === 'y')).toBe(true)
    const aligned = alignFloorWalls(floor)
    expect(bbox(aligned.rooms[1].polygon).y1).toBe(0)
    expect(bbox(aligned.rooms[0].polygon).y1).toBe(0)
  })

  it('壁に付いた扉も一緒に動く', () => {
    const floor = makeFloor({
      rooms: [makeRoom('A', rect(0, 0, 100, 100)), makeRoom('B', rect(102, 0, 300, 100))],
      doors: [{ id: 'd1', position: { x: 102, y: 50 }, width: 80, angle: 90, swing: 1 }],
    })
    const aligned = alignFloorWalls(floor)
    const x = bbox(aligned.rooms[0].polygon).x2
    expect(aligned.doors[0].position.x).toBe(x)
  })

  it('10cm より離れた壁や、すでにそろっている壁はそのまま', () => {
    const floor = makeFloor({
      rooms: [makeRoom('A', rect(0, 0, 100, 100)), makeRoom('B', rect(115, 0, 200, 100))],
    })
    expect(findWallMisalignments(floor)).toHaveLength(0)
    const tidy = makeFloor({
      rooms: [makeRoom('A', rect(0, 0, 100, 100)), makeRoom('B', rect(100, 0, 200, 100))],
    })
    expect(findWallMisalignments(tidy)).toHaveLength(0)
    expect(alignFloorWalls(tidy)).toBe(tidy)
  })
})

describe('ドラッグ中の吸い付き', () => {
  const floor = makeFloor({
    rooms: [makeRoom('A', rect(0, 0, 100, 100)), makeRoom('B', rect(103, 0, 200, 100))],
  })

  it('辺を動かすと、近くにあるほかの部屋の辺に吸い付く', () => {
    const others = otherEdgeValues(floor, 'x', 'A')
    expect(snapToNearest(103.5, others, 8)).toBe(103)
    expect(snapToNearest(120, others, 8)).toBe(120)
  })

  it('部屋を動かすと、辺がほかの部屋の辺にぴったり重なるようずれる', () => {
    const moved = snapPolygonToEdges(rect(-2, 1, 98, 101), floor, 'A', 8)
    // 右辺 98 → B の左辺 103 は 5 離れているので吸い付き、上辺 1 → 0 に吸い付く
    expect(bbox(moved)).toEqual({ x1: 3, y1: 0, x2: 103, y2: 100 })
  })
})
