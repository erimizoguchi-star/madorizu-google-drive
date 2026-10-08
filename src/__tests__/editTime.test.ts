import { describe, expect, it } from 'vitest'
import {
  addActivity,
  formatDuration,
  IDLE_MS,
  isEditStats,
  newEditStats,
  summarizeEditHistory,
  upsertEditRecord,
  type EditRecord,
} from '../services/editTime'
import { buildEditData, parseEditDataStats } from '../utils/propertyLink'
import { makePlan } from './helpers'

const record = (id: string, minutes: number): EditRecord => ({
  sessionId: id,
  finishedAt: '2026-10-08T06:00:00.000Z',
  title: '2階建て住宅',
  floors: 2,
  activeMs: minutes * 60_000,
  analysisMs: 90_000,
})

describe('編集時間', () => {
  it('操作と操作の間だけを数え、2分以上あいた間は数えない', () => {
    let ms = 0
    let last: number | null = null
    for (const t of [0, 10_000, 40_000, 40_000 + IDLE_MS + 1, 40_000 + IDLE_MS + 1 + 5_000]) {
      ms = addActivity(ms, last, t)
      last = t
    }
    // 0→10秒、10→40秒、（2分以上あいた間は数えない）、そのあと 5秒
    expect(ms).toBe(45_000)
  })

  it('分と秒で表す', () => {
    expect(formatDuration(45_000)).toBe('45秒')
    expect(formatDuration(372_000)).toBe('6分12秒')
    expect(formatDuration(3_780_000)).toBe('1時間3分')
  })

  it('同じ間取図を送り直すと記録を上書きし、新しい順に並べる', () => {
    const history = upsertEditRecord(upsertEditRecord([], record('a', 12)), record('b', 8))
    const again = upsertEditRecord(history, record('a', 9))
    expect(again.map((r) => r.sessionId)).toEqual(['a', 'b'])
    expect(again[0].activeMs).toBe(9 * 60_000)
  })

  it('最近の記録の中央値と、10分以内に終えた件数を出す', () => {
    const summary = summarizeEditHistory([record('a', 6), record('b', 12), record('c', 9), record('d', 15)])
    expect(summary).toEqual({ count: 4, medianMs: 10.5 * 60_000, withinGoal: 2 })
  })

  it('物件へ送る編集データに編集時間を載せ、続きから編集したときに受け取れる', async () => {
    const stats = { ...newEditStats(60_000), activeMs: 300_000 }
    const json = JSON.parse(await buildEditData(makePlan({}), stats).text())
    expect(parseEditDataStats(json)).toEqual(stats)
    expect(parseEditDataStats({ format: 'madorizu-edit' })).toBeNull()
    expect(isEditStats({ sessionId: 'x' })).toBe(false)
  })
})
