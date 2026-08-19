import { describe, expect, it } from 'vitest'
import { syncFloorWalls } from '../utils/ensureExteriorWalls'
import { deleteWall, moveRoom } from '../utils/floorPlanEdit'
import { addWallSegment } from '../utils/floorPlanAdd'
import { makeFloor, makePlan, makeRoom, rect } from './helpers'

/**
 * 壁の自動生成まわりを守るテスト。
 * 壁は部屋の形から作り直されるため、次の2つが壊れやすい:
 * - 手動で追加した壁が作り直しで消える（2026-08-06 修正）
 * - 削除した壁が部屋を動かすと復活する（2026-08-06 修正）
 */

const twoRooms = () => [
  makeRoom('r1', rect(0, 0, 400, 300)),
  makeRoom('r2', rect(400, 0, 800, 300)),
]

describe('壁の自動生成（syncFloorWalls）', () => {
  it('隣接する2部屋の境界に内壁が1本生成される', () => {
    const floor = syncFloorWalls(makeFloor({ rooms: twoRooms() }))
    const interior = floor.walls.filter((w) => !w.exterior)
    expect(interior).toHaveLength(1)
    expect(interior[0].start.x).toBe(400)
    expect(interior[0].end.x).toBe(400)
  })

  it('建物の外周に外壁が生成される', () => {
    const floor = syncFloorWalls(makeFloor({ rooms: twoRooms() }))
    const exterior = floor.walls.filter((w) => w.exterior)
    // 800x300 の外周: 上下は1本ずつに結合され、左右で計4本以上
    expect(exterior.length).toBeGreaterThanOrEqual(4)
    const top = exterior.find(
      (w) => w.start.y === 0 && w.end.y === 0 && Math.abs(w.end.x - w.start.x) === 800
    )
    expect(top).toBeDefined()
  })

  it('手動で追加した壁は、部屋を動かしても消えない', () => {
    let plan = makePlan({ rooms: twoRooms() })
    plan = { ...plan, floors: [syncFloorWalls(plan.floors[0])] }

    const added = addWallSegment(plan, '1f', { x: 100, y: 100 }, { x: 300, y: 100 })
    expect('floorPlan' in added).toBe(true)
    if ('error' in added) throw new Error(added.error)

    // 部屋の編集 → 壁の作り直しをシミュレート
    const moved = moveRoom(added.floorPlan, { floorId: '1f', roomId: 'r1' }, { x: 0, y: 50 })
    const manual = moved.floors[0].walls.find((w) => w.id === added.wallId)
    expect(manual).toBeDefined()
    expect(manual?.manual).toBe(true)
  })
})

describe('壁の削除の記録（hiddenWalls）', () => {
  it('自動生成の内壁を削除すると「部屋の組」で記録される', () => {
    const floor = syncFloorWalls(makeFloor({ rooms: twoRooms() }))
    const interior = floor.walls.find((w) => !w.exterior)!
    const plan = makePlan({ ...floor })

    const after = deleteWall(plan, { floorId: '1f', wallId: interior.id })
    expect(after.floors[0].hiddenWalls).toEqual([{ pair: 'r1|r2' }])
    expect(after.floors[0].walls.find((w) => w.id === interior.id)).toBeUndefined()
  })

  it('削除した内壁は、部屋を動かしても復活しない', () => {
    const floor = syncFloorWalls(makeFloor({ rooms: twoRooms() }))
    const interior = floor.walls.find((w) => !w.exterior)!
    let plan = makePlan({ ...floor })
    plan = deleteWall(plan, { floorId: '1f', wallId: interior.id })

    // 部屋を上下に動かす → syncFloorWalls が走って壁が作り直される
    const moved = moveRoom(plan, { floorId: '1f', roomId: 'r2' }, { x: 0, y: 50 })
    const boundary = moved.floors[0].walls.find(
      (w) => !w.exterior && Math.abs(w.start.x - 400) < 1 && Math.abs(w.end.x - 400) < 1
    )
    expect(boundary).toBeUndefined()
  })

  it('手動で追加した壁の削除は記録しない（消して終わり）', () => {
    let plan = makePlan({ rooms: twoRooms() })
    plan = { ...plan, floors: [syncFloorWalls(plan.floors[0])] }
    const added = addWallSegment(plan, '1f', { x: 100, y: 100 }, { x: 300, y: 100 })
    if ('error' in added) throw new Error(added.error)

    const after = deleteWall(added.floorPlan, { floorId: '1f', wallId: added.wallId })
    expect(after.floors[0].hiddenWalls ?? []).toHaveLength(0)
  })
})
