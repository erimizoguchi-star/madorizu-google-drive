import { describe, expect, it } from 'vitest'
import { autosaveKey, describeAutosave, isAutosaveRecord } from '../services/autosave'
import { makeFloor, makePlan } from './helpers'

describe('自動保存', () => {
  it('物件ごとに保存先を分ける', () => {
    expect(autosaveKey('ABC123')).toBe('property:ABC123')
    expect(autosaveKey(null)).toBe('default')
  })

  it('階と保存した日時で説明する', () => {
    const plan = { ...makePlan({}), floors: [makeFloor({}), makeFloor({ id: '2f', label: '2階' })] }
    const text = describeAutosave({
      savedAt: new Date(2026, 9, 7, 15, 3).toISOString(),
      floorPlan: plan,
      sources: [],
      overlayFloorId: null,
    })
    expect(text).toBe('1階・2階、10月7日 15:03')
  })

  it('壊れたもの・階のない間取図は使わない', () => {
    expect(isAutosaveRecord(null)).toBe(false)
    expect(isAutosaveRecord({ savedAt: 'x', floorPlan: { floors: [] }, sources: [] })).toBe(false)
    expect(isAutosaveRecord({ savedAt: 'x', floorPlan: makePlan({}), sources: [] })).toBe(true)
  })
})
