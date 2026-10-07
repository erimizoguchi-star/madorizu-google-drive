import { describe, expect, it } from 'vitest'
import { isStairRect, rectifyFloorStairs, stairRect } from '../utils/stairShape'
import { moveGridLine } from '../utils/gridLines'
import { makeFloor, makeRoom, rect } from './helpers'

describe('階段の輪郭を長方形にそろえる', () => {
  it('角が重なって三角形になった輪郭は、外接する長方形に戻す', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 80, y: 90 },
      { x: 0, y: 90 },
    ]
    expect(isStairRect(triangle)).toBe(false)
    expect(stairRect(triangle)).toEqual(rect(0, 0, 80, 90))
  })

  it('点の順番がねじれた輪郭（蝶ネクタイ形）も長方形として扱わない', () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 0, y: 90 },
      { x: 300, y: 90 },
    ]
    expect(isStairRect(bowtie)).toBe(false)
    expect(isStairRect(rect(0, 0, 300, 90))).toBe(true)
  })

  it('階をそろえると階段は長方形になり、長方形の階はそのまま', () => {
    const floor = makeFloor({
      rooms: [makeRoom('a', rect(0, 0, 400, 300))],
      stairs: [{ id: 's', polygon: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 80, y: 90 }, { x: 0, y: 90 }], direction: 'up' }],
    })
    const fixed = rectifyFloorStairs(floor)
    expect(fixed.stairs[0].polygon).toEqual(rect(0, 0, 80, 90))
    expect(rectifyFloorStairs(fixed)).toBe(fixed)
  })

  it('線を合わせても、角の座標がわずかにずれた階段が三角形にならない', () => {
    // 右の辺の上端 x=300、下端 x=300.8（AI の読み取りのずれ）
    const floor = makeFloor({
      rooms: [makeRoom('a', rect(0, 0, 300, 300))],
      stairs: [{ id: 's', polygon: [{ x: 100, y: 0 }, { x: 300, y: 0 }, { x: 300.8, y: 90 }, { x: 100, y: 90 }], direction: 'up' }],
    })
    const moved = moveGridLine(floor, 'x', 300, 280)
    expect(isStairRect(moved.stairs[0].polygon)).toBe(true)
  })
})
