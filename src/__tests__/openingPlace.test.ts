import { describe, expect, it } from 'vitest'
import {
  addDoorAt,
  addDoorOnWall,
  findNearestSnapTarget,
} from '../utils/floorPlanAdd'
import { makePlan, makeRoom, rect } from './helpers'

describe('opening placement', () => {
  it('snaps opening to nearest wall near click', () => {
    const room = makeRoom('r1', rect(0, 0, 400, 300))
    const plan = makePlan({
      rooms: [room],
      walls: [
        { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, exterior: true },
        { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, exterior: true },
      ],
    })
    const r = addDoorAt(plan, '1f', { x: 200, y: 5 }, { kind: 'opening' })
    expect('error' in r).toBe(false)
    if ('error' in r) return
    const door = r.floorPlan.floors[0].doors[0]
    expect(door.position.y).toBeCloseTo(0, 0)
    expect(door.position.x).toBeGreaterThan(100)
    expect(door.position.x).toBeLessThan(300)
  })

  it('does not snap to far wall when clicking near local wall', () => {
    const room = makeRoom('r1', rect(0, 0, 400, 300))
    const plan = makePlan({
      rooms: [room],
      walls: [
        { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, exterior: true },
        { id: 'far', start: { x: 10000, y: 10000 }, end: { x: 11000, y: 10000 }, exterior: true },
      ],
    })
    const r = addDoorAt(plan, '1f', { x: 200, y: 2 }, { kind: 'opening' })
    if ('error' in r) throw new Error(r.error)
    const door = r.floorPlan.floors[0].doors[0]
    expect(door.position.x).toBeLessThan(500)
    expect(door.position.y).toBeLessThan(50)
  })

  it('places on preferred wall even when another wall is closer', () => {
    const room = makeRoom('r1', rect(0, 0, 400, 300))
    const plan = makePlan({
      rooms: [room],
      walls: [
        { id: 'near', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, exterior: true },
        { id: 'target', start: { x: 0, y: 300 }, end: { x: 400, y: 300 }, exterior: true },
      ],
    })
    // 上辺の近くをクリックしても、指定壁（下辺）へ載せる
    const r = addDoorAt(plan, '1f', { x: 200, y: 10 }, {
      kind: 'opening',
      preferredWallId: 'target',
    })
    if ('error' in r) throw new Error(r.error)
    const door = r.floorPlan.floors[0].doors[0]
    expect(door.position.y).toBeCloseTo(300, 0)
  })

  it('addDoorOnWall places at wall midpoint', () => {
    const plan = makePlan({
      rooms: [makeRoom('r1', rect(0, 0, 400, 300))],
      walls: [{ id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, exterior: true }],
    })
    const r = addDoorOnWall(plan, '1f', 'w1', { kind: 'opening' })
    if ('error' in r) throw new Error(r.error)
    const door = r.floorPlan.floors[0].doors[0]
    expect(door.position.y).toBeCloseTo(0, 0)
    expect(door.position.x + door.width / 2).toBeCloseTo(200, 0)
  })

  it('returns error when click is far from any wall/edge', () => {
    const plan = makePlan({
      rooms: [makeRoom('r1', rect(0, 0, 100, 100))],
      walls: [{ id: 'w1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, exterior: true }],
    })
    const r = addDoorAt(plan, '1f', { x: 5000, y: 5000 }, { kind: 'opening' })
    expect('error' in r).toBe(true)
  })

  it('prefers walls over slightly closer room edges', () => {
    const plan = makePlan({
      rooms: [makeRoom('r1', rect(0, 0, 400, 300))],
      walls: [{ id: 'w1', start: { x: 0, y: 10 }, end: { x: 400, y: 10 }, exterior: true }],
    })
    const snap = findNearestSnapTarget(plan.floors[0], { x: 200, y: 0 })
    expect(snap?.wall?.id).toBe('w1')
  })
})
