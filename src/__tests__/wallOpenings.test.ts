import { describe, expect, it } from 'vitest'
import type { Door, Wall } from '../types/floorPlan'
import { collectWallOpenings, wallSolidSegments } from '../utils/wallOpenings'

const hWall = (id: string, x1: number, x2: number, y: number): Wall => ({
  id,
  start: { x: x1, y },
  end: { x: x2, y },
  exterior: true,
})

const vWall = (id: string, x: number, y1: number, y2: number): Wall => ({
  id,
  start: { x, y: y1 },
  end: { x, y: y2 },
  exterior: true,
})

describe('壁開口の切り取り', () => {
  it('水平な扉は水平壁だけを切る', () => {
    const bottom = hWall('bottom', 0, 400, 300)
    const left = vWall('left', 0, 0, 300)
    const door: Door = {
      id: 'd1',
      position: { x: 150, y: 300 },
      width: 80,
      angle: 0,
      swing: 1,
      kind: 'double_swing',
    }
    const bottomOps = collectWallOpenings(bottom, [door], [])
    const leftOps = collectWallOpenings(left, [door], [])
    expect(bottomOps).toHaveLength(1)
    expect(leftOps).toHaveLength(0)
  })

  it('角の扉が隣接する無関係な壁を切らない', () => {
    // 物入の左下角付近に水平扉（以前は左縦壁も切れていた）
    const bottom = hWall('bottom', 0, 200, 100)
    const left = vWall('left', 0, 0, 100)
    const door: Door = {
      id: 'd1',
      position: { x: 0, y: 100 },
      width: 80,
      angle: 0,
      swing: 1,
    }
    expect(collectWallOpenings(bottom, [door], [])).toHaveLength(1)
    expect(collectWallOpenings(left, [door], [])).toHaveLength(0)

    const leftSegs = wallSolidSegments(left, [door], [])
    expect(leftSegs).toHaveLength(1)
    expect(leftSegs[0].start).toEqual(left.start)
    expect(leftSegs[0].end).toEqual(left.end)
  })

  it('向きが壁と合わない扉では壁を切らない', () => {
    const wall = hWall('w', 0, 400, 0)
    const door: Door = {
      id: 'd1',
      position: { x: 100, y: 0 },
      width: 80,
      angle: 90, // 垂直向き → 水平壁とは不一致
      swing: 1,
    }
    expect(collectWallOpenings(wall, [door], [])).toHaveLength(0)
  })
})
