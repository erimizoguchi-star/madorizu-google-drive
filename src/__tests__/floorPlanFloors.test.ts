import { describe, expect, it } from 'vitest'
import {
  appendFloors,
  floorNumberOf,
  moveFloor,
  removeFloor,
  renameFloor,
} from '../utils/floorPlanFloors'
import type { FloorPlan } from '../types/floorPlan'
import { makeFloor, makePlan, makeRoom, rect } from './helpers'

function planWith(floor: Parameters<typeof makeFloor>[0]): FloorPlan {
  return makePlan({ rooms: [makeRoom('room-1', rect(0, 0, 100, 100))], ...floor })
}

function ok(result: ReturnType<typeof appendFloors>) {
  if ('error' in result) throw new Error(result.error)
  return result
}

describe('階の追加', () => {
  it('1階ずつ解析した図面（どちらも「1階」）を足すと、2階として後ろに並ぶ', () => {
    const { floorPlan, addedFloorIds } = ok(appendFloors(planWith({}), planWith({})))
    expect(floorPlan.floors.map((f) => f.label)).toEqual(['1階', '2階'])
    expect(floorPlan.floors.map((f) => f.name)).toEqual(['1F', '2F'])
    // 階の id は重ならない（選択・編集が階の id で区別しているため）
    expect(new Set(floorPlan.floors.map((f) => f.id)).size).toBe(2)
    expect(addedFloorIds).toEqual([floorPlan.floors[1].id])
  })

  it('3枚目は3階になる', () => {
    const two = ok(appendFloors(planWith({}), planWith({}))).floorPlan
    const three = ok(appendFloors(two, planWith({}))).floorPlan
    expect(three.floors.map((f) => f.label)).toEqual(['1階', '2階', '3階'])
    expect(new Set(three.floors.map((f) => f.id)).size).toBe(3)
  })

  it('図面から「2F」と読めていれば、その名前のまま加える', () => {
    const added = planWith({ id: 'floor-0', name: '2F', label: '2F' })
    const { floorPlan } = ok(appendFloors(planWith({}), added))
    expect(floorPlan.floors[1].label).toBe('2F')
  })

  it('部屋などの中身はそのまま引き継ぐ', () => {
    const added = planWith({ rooms: [makeRoom('room-1', rect(0, 0, 300, 200))] })
    const { floorPlan } = ok(appendFloors(planWith({}), added))
    expect(floorPlan.floors[1].rooms[0].polygon).toEqual(rect(0, 0, 300, 200))
    // 元の階は変わらない
    expect(floorPlan.floors[0].rooms[0].polygon).toEqual(rect(0, 0, 100, 100))
  })

  it('縮尺の単位が違う図面は追加しない', () => {
    const result = appendFloors(planWith({}), { ...planWith({}), scaleMm: 50 })
    expect('error' in result).toBe(true)
  })
})

describe('階の名前・並び・削除', () => {
  const two = ok(appendFloors(planWith({}), planWith({}))).floorPlan
  const [first, second] = two.floors

  it('階の数字を読む（全角も）', () => {
    expect(floorNumberOf({ label: '２階', name: '' })).toBe(2)
    expect(floorNumberOf({ label: '1F', name: '' })).toBe(1)
    expect(floorNumberOf({ label: 'ロフト', name: '' })).toBeNull()
  })

  it('名前を変える', () => {
    const renamed = renameFloor(two, second.id, '2F')
    expect(renamed.floors[1].label).toBe('2F')
    expect(renamed.floors[1].name).toBe('2F')
  })

  it('並べ替える。端からははみ出さない', () => {
    expect(moveFloor(two, second.id, -1).floors.map((f) => f.id)).toEqual([second.id, first.id])
    expect(moveFloor(two, first.id, -1)).toBe(two)
    expect(moveFloor(two, second.id, 1)).toBe(two)
  })

  it('削除する。最後の1階は消さない', () => {
    const one = removeFloor(two, first.id)
    expect(one.floors.map((f) => f.id)).toEqual([second.id])
    expect(removeFloor(one, second.id)).toBe(one)
  })
})
