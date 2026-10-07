import { describe, expect, it } from 'vitest'
import { collectGridLines, gridLineLimits, moveGridLine, scaleFloor } from '../utils/gridLines'
import { syncFloorWalls } from '../utils/ensureExteriorWalls'
import { bbox, makeFloor, makeRoom, rect } from './helpers'

// 左の部屋 0–400、右の部屋 400–800（共有の通り x=400）。下に横長の部屋 0–800 × 300–500
function threeRooms() {
  return syncFloorWalls(
    makeFloor({
      rooms: [
        makeRoom('left', rect(0, 0, 400, 300)),
        makeRoom('right', rect(400, 0, 800, 300)),
        makeRoom('bottom', rect(0, 300, 800, 500)),
      ],
      doors: [
        // 共有の通り x=400 の扉（縦の壁）
        { id: 'd-shared', position: { x: 400, y: 100 }, width: 80, angle: 90, swing: 1 },
        // 横の壁 y=300 の扉。x=400 の通りを動かしても動かない
        { id: 'd-other', position: { x: 400, y: 300 }, width: 80, angle: 0, swing: 1 },
      ],
      windows: [{ id: 'w-east', start: { x: 800, y: 50 }, end: { x: 800, y: 200 } }],
    })
  )
}

describe('通りを集める', () => {
  it('縦横の通りを座標順に集め、線のある範囲をまとめる', () => {
    const lines = collectGridLines(threeRooms())
    const xs = lines.filter((l) => l.axis === 'x')
    const ys = lines.filter((l) => l.axis === 'y')
    expect(xs.map((l) => l.value)).toEqual([0, 400, 800])
    expect(ys.map((l) => l.value)).toEqual([0, 300, 500])
    // x=0 は上の部屋と下の部屋の辺がつながって 0–500 の1本
    expect(xs[0].spans).toEqual([[0, 500]])
    // x=400 は上の2部屋の間だけ
    expect(xs[1].spans).toEqual([[0, 300]])
  })
})

describe('通りを動かす', () => {
  it('共有の通りを動かすと、両側の部屋が一緒に伸び縮みしてすき間ができない', () => {
    const moved = moveGridLine(threeRooms(), 'x', 400, 450)
    const left = bbox(moved.rooms.find((r) => r.id === 'left')!.polygon)
    const right = bbox(moved.rooms.find((r) => r.id === 'right')!.polygon)
    expect(left.x2).toBe(450)
    expect(right.x1).toBe(450)
    // 下の部屋は x=400 に頂点がないので変わらない
    expect(bbox(moved.rooms.find((r) => r.id === 'bottom')!.polygon)).toEqual({ x1: 0, y1: 300, x2: 800, y2: 500 })
  })

  it('線に沿った扉・窓は付いてくる。直交する壁の扉は動かない', () => {
    const moved = moveGridLine(threeRooms(), 'x', 400, 450)
    expect(moved.doors.find((d) => d.id === 'd-shared')!.position).toEqual({ x: 450, y: 100 })
    expect(moved.doors.find((d) => d.id === 'd-other')!.position).toEqual({ x: 400, y: 300 })

    const east = moveGridLine(threeRooms(), 'x', 800, 900)
    const win = east.windows.find((w) => w.id === 'w-east')!
    expect([win.start.x, win.end.x]).toEqual([900, 900])
  })

  it('外周の通りを動かすと、その辺に接する部屋がまとめて広がる', () => {
    const moved = moveGridLine(threeRooms(), 'x', 800, 900)
    expect(bbox(moved.rooms.find((r) => r.id === 'right')!.polygon).x2).toBe(900)
    expect(bbox(moved.rooms.find((r) => r.id === 'bottom')!.polygon).x2).toBe(900)
    // 外壁も作り直されて新しい位置にある
    expect(moved.walls.some((w) => w.exterior && w.start.x === 900 && w.end.x === 900)).toBe(true)
    expect(moved.walls.some((w) => w.start.x === 800 && w.end.x === 800)).toBe(false)
  })

  it('部屋がつぶれる位置までは動かさない（最小 300mm を残す）', () => {
    const floor = threeRooms()
    // x=400 の通りは、左の部屋（0）と右の部屋（800）から 30 単位ずつ内側まで
    expect(gridLineLimits(floor, 'x', 400)).toEqual({ min: 30, max: 770 })
    const moved = moveGridLine(floor, 'x', 400, 1000)
    expect(bbox(moved.rooms.find((r) => r.id === 'right')!.polygon).x1).toBe(770)
  })

  it('同じ位置なら何もしない', () => {
    const floor = threeRooms()
    expect(moveGridLine(floor, 'y', 300, 300)).toBe(floor)
  })

  it('消した外壁は一緒に動き、通りを動かしても復活しない', () => {
    const floor = threeRooms()
    const east = floor.walls.find((w) => w.exterior && w.start.x === 800 && w.end.x === 800)!
    const hidden = syncFloorWalls({
      ...floor,
      walls: floor.walls.filter((w) => w.id !== east.id),
      hiddenWalls: [{ start: east.start, end: east.end }],
    })
    const moved = moveGridLine(hidden, 'x', 800, 900)
    expect(moved.walls.some((w) => w.start.x === 900 && w.end.x === 900)).toBe(false)
  })
})

describe('階全体の縦横を合わせる', () => {
  it('基準点から横・縦を別々の倍率で伸ばす。部屋と扉・窓が一緒に伸び、設備の大きさは変えない', () => {
    const floor = {
      ...threeRooms(),
      fixtures: [{ id: 'f1', type: 'bathtub' as const, position: { x: 100, y: 100 }, width: 80, height: 60 }],
    }
    const scaled = scaleFloor(floor, { x: 0, y: 0 }, 1.1, 1)
    expect(bbox(scaled.rooms.find((r) => r.id === 'right')!.polygon)).toEqual({ x1: 440, y1: 0, x2: 880, y2: 300 })
    // 縦の壁の扉は x だけ伸び、幅（縦方向）は変わらない
    const door = scaled.doors.find((d) => d.id === 'd-shared')!
    expect(door.position).toEqual({ x: 440, y: 100 })
    expect(door.width).toBe(80)
    // 横の壁の扉は幅も横に伸びる
    expect(scaled.doors.find((d) => d.id === 'd-other')!.width).toBe(88)
    // 設備は中心だけ動く（中心 140 → 154）
    const fixture = scaled.fixtures[0]
    expect([fixture.width, fixture.height]).toEqual([80, 60])
    expect(fixture.position.x + fixture.width / 2).toBe(154)
    expect(scaled.walls.some((w) => w.exterior && w.start.x === 880 && w.end.x === 880)).toBe(true)
  })
})
