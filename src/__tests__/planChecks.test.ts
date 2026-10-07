import { describe, expect, it } from 'vitest'
import { findPlanIssues } from '../utils/planChecks'
import { syncFloorWalls } from '../utils/ensureExteriorWalls'
import type { Floor } from '../types/floorPlan'
import { makeFloor, makeRoom, rect } from './helpers'

function plan(floor: Partial<Floor>) {
  return { title: 't', floors: [syncFloorWalls(makeFloor(floor))] }
}

// 1単位 = 10mm。400×300 = 4m×3m = 12㎡ ≒ 7.4帖
const base = [makeRoom('a', rect(0, 0, 400, 300)), makeRoom('b', rect(400, 0, 800, 300))]

describe('確認が必要なところを探す', () => {
  it('問題がなければ何も出さない', () => {
    const issues = findPlanIssues(
      plan({
        rooms: base,
        doors: [{ id: 'd', position: { x: 400, y: 100 }, width: 80, angle: 90, swing: 1 }],
        windows: [{ id: 'w', start: { x: 100, y: 0 }, end: { x: 250, y: 0 } }],
      })
    )
    expect(issues).toEqual([])
  })

  it('壁から離れた扉・窓を見つける', () => {
    const issues = findPlanIssues(
      plan({
        rooms: base,
        doors: [{ id: 'd', position: { x: 200, y: 100 }, width: 80, angle: 90, swing: 1 }],
        windows: [{ id: 'w', start: { x: 100, y: 150 }, end: { x: 250, y: 150 } }],
      })
    )
    expect(issues.map((i) => i.kind)).toEqual(['door-off-wall', 'window-off-wall'])
    expect(issues[0].ref).toEqual({ kind: 'door', floorId: '1f', doorId: 'd' })
  })

  it('重なっている部屋を見つける（小さな重なりは知らせない）', () => {
    // b を 50 単位（500mm）左へ食い込ませる → 0.5m × 3m = 1.5㎡
    const overlapped = findPlanIssues(
      plan({ rooms: [makeRoom('a', rect(0, 0, 400, 300)), makeRoom('b', rect(350, 0, 800, 300))] })
    )
    const overlap = overlapped.find((i) => i.kind === 'room-overlap')!
    expect(overlap.message).toContain('約 1.5㎡')

    // 5 単位（50mm）の食い込みは 0.15㎡ なので知らせない
    const slight = findPlanIssues(
      plan({ rooms: [makeRoom('a', rect(0, 0, 400, 300)), makeRoom('b', rect(395, 0, 800, 300))] })
    )
    expect(slight.some((i) => i.kind === 'room-overlap')).toBe(false)
  })

  it('図面の帖数と部屋の大きさが合わない部屋を見つける', () => {
    const issues = findPlanIssues(
      plan({
        rooms: [
          // 12㎡ ≒ 7.4帖 なのに 6帖と書かれている → 知らせる
          makeRoom('a', rect(0, 0, 400, 300), { areaJo: 6 }),
          // 12㎡ ≒ 7.4帖 で 7.5帖 → 合っている
          makeRoom('b', rect(400, 0, 800, 300), { areaJo: 7.5 }),
          // 廊下は帖数を出さないので調べない
          makeRoom('c', rect(0, 300, 800, 400), { areaJo: 1, type: 'hallway' }),
        ],
      })
    )
    const mismatches = issues.filter((i) => i.kind === 'area-mismatch')
    expect(mismatches.map((i) => i.ref)).toEqual([{ kind: 'room', floorId: '1f', roomId: 'a' }])
    expect(mismatches[0].message).toContain('約 7.4帖')
  })
})

describe('壁の確認', () => {
  it('同じ線上で重なっている壁と、部屋の境目にない壁を見つける', () => {
    const floor = syncFloorWalls(makeFloor({ rooms: base }))
    const issues = findPlanIssues({
      title: 't',
      floors: [
        {
          ...floor,
          walls: [
            ...floor.walls,
            // 上の外壁に重なる手で直した壁
            { id: 'dup', start: { x: 0, y: 0 }, end: { x: 300, y: 0 }, manual: true },
            // 部屋の中に取り残された壁
            { id: 'stray', start: { x: 50, y: 150 }, end: { x: 350, y: 150 }, manual: true },
          ],
        },
      ],
    })
    const dup = issues.find((i) => i.kind === 'wall-duplicate')!
    expect(dup.ref).toEqual({ kind: 'wall', floorId: '1f', wallId: 'dup' })
    expect(dup.message).toContain('約 3000mm')
    expect(issues.filter((i) => i.kind === 'wall-stray').map((i) => i.ref)).toEqual([
      { kind: 'wall', floorId: '1f', wallId: 'stray' },
    ])
  })
})
