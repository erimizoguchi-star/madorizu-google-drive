import { describe, expect, it } from 'vitest'
import { cycleDoorOrientation, updateDoor } from '../utils/floorPlanEdit'
import { moveDoor } from '../utils/floorPlanDrag'
import { syncFloorWalls } from '../utils/ensureExteriorWalls'
import { makeFloor, makeRoom, rect } from './helpers'
import type { Door, FloorPlan } from '../types/floorPlan'

/** 扉の形を「丁番の位置」と「開く側（壁のどちら側に弧が出るか）」で表す */
function shape(door: Door) {
  const rad = (door.angle * Math.PI) / 180
  // 戸の進む向きに対して swing=1 は左（反時計回り）。画面座標（y 下向き）での左側の法線
  const side = { x: Math.sin(rad) * door.swing, y: -Math.cos(rad) * door.swing }
  return {
    hinge: { x: Math.round(door.position.x), y: Math.round(door.position.y) },
    opensTo: side.x > 0.5 ? 'east' : side.x < -0.5 ? 'west' : side.y > 0.5 ? 'south' : 'north',
  }
}

describe('扉の向きを順に切り替える', () => {
  it('4回押すと、丁番2か所 × 開く側2通りをすべて通って元に戻る', () => {
    const floor = syncFloorWalls(
      makeFloor({
        rooms: [makeRoom('left', rect(0, 0, 400, 300)), makeRoom('right', rect(400, 0, 800, 300))],
        doors: [{ id: 'd', position: { x: 400, y: 100 }, width: 80, angle: 90, swing: 1 }],
      })
    )
    let plan: FloorPlan = { title: 't', floors: [floor] }
    const ref = { floorId: floor.id, doorId: 'd' }
    const seen = [shape(plan.floors[0].doors[0])]
    for (let i = 0; i < 4; i++) {
      plan = cycleDoorOrientation(plan, ref)
      seen.push(shape(plan.floors[0].doors[0]))
    }
    const keys = seen.slice(0, 4).map((s) => `${s.hinge.x},${s.hinge.y}:${s.opensTo}`)
    expect(new Set(keys).size).toBe(4)
    expect(seen[4]).toEqual(seen[0])
    // 丁番は開口の両端（y=100 と y=180）のどちらか、開く側は左右の部屋のどちらか
    expect(new Set(seen.map((s) => s.hinge.y))).toEqual(new Set([100, 180]))
    expect(new Set(seen.map((s) => s.opensTo))).toEqual(new Set(['east', 'west']))
  })

  it('丁番を反対側へ移した扉は、ドラッグで動かしても丁番の側が戻らない', () => {
    const floor = syncFloorWalls(
      makeFloor({
        rooms: [makeRoom('left', rect(0, 0, 400, 300)), makeRoom('right', rect(400, 0, 800, 300))],
        doors: [{ id: 'd', position: { x: 400, y: 100 }, width: 80, angle: 90, swing: 1 }],
      })
    )
    const ref = { floorId: floor.id, doorId: 'd' }
    let plan: FloorPlan = { title: 't', floors: [floor] }
    plan = updateDoor(plan, ref, { flipHinge: true })
    const flipped = plan.floors[0].doors[0]
    // 丁番は開口の下の端（y=180）へ移り、戸は上向き（270°）
    expect(flipped.position).toEqual({ x: 400, y: 180 })
    expect(flipped.angle).toBe(270)

    // 壁に沿って 50 下へドラッグ（丁番の位置を指で掴んだ想定）
    plan = moveDoor(plan, ref, { x: 400, y: 230 })
    const moved = plan.floors[0].doors[0]
    expect(moved.angle).toBe(270)
    expect(moved.swing).toBe(flipped.swing)
  })
})
