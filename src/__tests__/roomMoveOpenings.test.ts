import { describe, expect, it } from 'vitest'
import { deleteRoom, moveRoom, moveStair } from '../utils/floorPlanEdit'
import { syncFloorWalls } from '../utils/ensureExteriorWalls'
import { makeFloor, makePlan, makeRoom, rect } from './helpers'

describe('部屋・階段移動時の扉・窓の追従', () => {
  it('隣接して追加した部屋を動かしても、共有壁の扉は持っていかない', () => {
    // 左部屋 0–400、右部屋 400–800。共有壁 x=400 に扉
    let floor = makeFloor({
      rooms: [makeRoom('left', rect(0, 0, 400, 300)), makeRoom('right', rect(400, 0, 800, 300))],
      doors: [
        {
          id: 'shared-door',
          position: { x: 400, y: 100 },
          width: 80,
          angle: 90,
          swing: 1,
        },
      ],
    })
    floor = syncFloorWalls(floor)
    const plan = makePlan(floor)

    const moved = moveRoom(plan, { floorId: '1f', roomId: 'right' }, { x: 100, y: 0 })
    const door = moved.floors[0].doors.find((d) => d.id === 'shared-door')!
    // 右部屋だけ動かしても共有扉は元位置のまま
    expect(door.position.x).toBeCloseTo(400, 5)
    expect(door.position.y).toBeCloseTo(100, 5)
  })

  it('その部屋の外壁だけにある扉は一緒に移動する', () => {
    let floor = makeFloor({
      rooms: [makeRoom('only', rect(0, 0, 400, 300))],
      doors: [
        {
          id: 'outer-door',
          position: { x: 0, y: 100 },
          width: 80,
          angle: 90,
          swing: 1,
        },
      ],
    })
    floor = syncFloorWalls(floor)
    const plan = makePlan(floor)

    const moved = moveRoom(plan, { floorId: '1f', roomId: 'only' }, { x: 50, y: 0 })
    const door = moved.floors[0].doors.find((d) => d.id === 'outer-door')!
    expect(door.position.x).toBeCloseTo(50, 5)
    expect(door.position.y).toBeCloseTo(100, 5)
  })

  it('他室の内側にある設備は持っていかない', () => {
    const floor = makeFloor({
      rooms: [makeRoom('a', rect(0, 0, 200, 200)), makeRoom('b', rect(200, 0, 400, 200))],
      fixtures: [
        {
          id: 'sink-b',
          type: 'sink',
          position: { x: 250, y: 50 },
          width: 40,
          height: 40,
        },
      ],
    })
    const plan = makePlan(floor)
    const translated = moveRoom(plan, { floorId: '1f', roomId: 'a' }, { x: 30, y: 0 })
    const fixture = translated.floors[0].fixtures[0]
    expect(fixture.position.x).toBeCloseTo(250, 5)
  })

  it('部屋を消すとその部屋専用の扉も消えるが、共有壁の扉は残る', () => {
    let floor = makeFloor({
      rooms: [makeRoom('left', rect(0, 0, 400, 300)), makeRoom('right', rect(400, 0, 800, 300))],
      doors: [
        {
          id: 'shared-door',
          position: { x: 400, y: 100 },
          width: 80,
          angle: 90,
          swing: 1,
        },
        {
          id: 'right-outer',
          position: { x: 800, y: 100 },
          width: 80,
          angle: 90,
          swing: 1,
        },
      ],
    })
    floor = syncFloorWalls(floor)
    const plan = makePlan(floor)
    const after = deleteRoom(plan, { floorId: '1f', roomId: 'right' })
    const ids = after.floors[0].doors.map((d) => d.id)
    expect(ids).toContain('shared-door')
    expect(ids).not.toContain('right-outer')
  })

  it('部屋と階段の共有壁の扉は、部屋を動かしても持っていかない', () => {
    let floor = makeFloor({
      rooms: [makeRoom('hall', rect(0, 0, 400, 300))],
      stairs: [
        {
          id: 'stair-1',
          name: 'UP',
          direction: 'up',
          polygon: rect(400, 0, 491, 300),
        },
      ],
      doors: [
        {
          id: 'to-stair',
          position: { x: 400, y: 100 },
          width: 80,
          angle: 90,
          swing: 1,
        },
      ],
    })
    floor = syncFloorWalls(floor)
    const plan = makePlan(floor)
    const moved = moveRoom(plan, { floorId: '1f', roomId: 'hall' }, { x: -50, y: 0 })
    const door = moved.floors[0].doors.find((d) => d.id === 'to-stair')!
    expect(door.position.x).toBeCloseTo(400, 5)
  })

  it('階段を動かしても部屋との共有扉は持っていかない', () => {
    let floor = makeFloor({
      rooms: [makeRoom('hall', rect(0, 0, 400, 300))],
      stairs: [
        {
          id: 'stair-1',
          name: 'UP',
          direction: 'up',
          polygon: rect(400, 0, 491, 300),
        },
      ],
      doors: [
        {
          id: 'to-stair',
          position: { x: 400, y: 100 },
          width: 80,
          angle: 90,
          swing: 1,
        },
      ],
    })
    floor = syncFloorWalls(floor)
    const plan = makePlan(floor)
    const moved = moveStair(plan, { floorId: '1f', stairId: 'stair-1' }, { x: 50, y: 0 })
    const door = moved.floors[0].doors.find((d) => d.id === 'to-stair')!
    expect(door.position.x).toBeCloseTo(400, 5)
    const stair = moved.floors[0].stairs[0]
    expect(stair.polygon[0].x).toBeCloseTo(450, 5)
  })

  it('階段の外壁だけにある扉は階段と一緒に移動する', () => {
    let floor = makeFloor({
      rooms: [makeRoom('hall', rect(0, 0, 400, 300))],
      stairs: [
        {
          id: 'stair-1',
          name: 'UP',
          direction: 'up',
          polygon: rect(400, 0, 491, 300),
        },
      ],
      doors: [
        {
          id: 'stair-outer',
          position: { x: 491, y: 100 },
          width: 80,
          angle: 90,
          swing: 1,
        },
      ],
    })
    floor = syncFloorWalls(floor)
    const plan = makePlan(floor)
    const moved = moveStair(plan, { floorId: '1f', stairId: 'stair-1' }, { x: 40, y: 0 })
    const door = moved.floors[0].doors.find((d) => d.id === 'stair-outer')!
    expect(door.position.x).toBeCloseTo(531, 5)
  })
})
