import { describe, expect, it } from 'vitest'
import { buildEditData, parseEditData } from '../utils/propertyLink'
import { makePlan, makeRoom, rect } from './helpers'

describe('物件へ送る編集データ', () => {
  it('送った間取図を、そのまま開き直せる', async () => {
    const plan = makePlan({ rooms: [makeRoom('LD', rect(0, 0, 546, 364), { areaJo: 12 })] })
    const json = JSON.parse(await buildEditData(plan).text())
    expect(json.format).toBe('madorizu-edit')
    expect(parseEditData(json)).toEqual(plan)
  })

  it('形の違うデータや階のない間取図は開かない', () => {
    expect(parseEditData(null)).toBeNull()
    expect(parseEditData({ floors: [] })).toBeNull()
    expect(parseEditData({ format: 'madorizu-edit', version: 1, floorPlan: { title: 'x', floors: [] } })).toBeNull()
  })
})
