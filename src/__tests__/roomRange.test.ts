import { describe, expect, it } from 'vitest'
import { applyRoomRange, moveRoomPolygonEdge } from '../utils/roomRange'
import { polygonArea } from '../renderer/styles'
import { bbox, makePlan, makeRoom, rect } from './helpers'

const ref = { floorId: '1f', roomId: 'wic' }
const plan = () => makePlan({ rooms: [makeRoom('wic', rect(0, 0, 200, 100)), makeRoom('hall', rect(0, 100, 200, 300))] })
const room = (p: ReturnType<typeof plan>) => p.floors[0].rooms[0]

describe('部屋の範囲を四角で描く', () => {
  it('描いた四角を部屋の範囲にする（5mm 刻み）', () => {
    const result = applyRoomRange(plan(), ref, { x: 10.2, y: 5 }, { x: 180, y: 95.3 }, 'set')
    if ('error' in result) throw new Error(result.error)
    expect(bbox(room(result.plan).polygon)).toEqual({ x1: 10, y1: 5, x2: 180, y2: 95.5 })
  })

  it('今の範囲に接する四角を足すと L 字になる。離れた所には足せない', () => {
    const result = applyRoomRange(plan(), ref, { x: 200, y: 0 }, { x: 300, y: 50 }, 'add')
    if ('error' in result) throw new Error(result.error)
    expect(room(result.plan).polygon).toHaveLength(6)
    expect(polygonArea(room(result.plan).polygon)).toBe(200 * 100 + 100 * 50)
    expect(applyRoomRange(plan(), ref, { x: 400, y: 0 }, { x: 500, y: 50 }, 'add')).toHaveProperty('error')
  })

  it('角から四角を削ると L 字になる。真ん中を削る・重ならない所はできない', () => {
    const result = applyRoomRange(plan(), ref, { x: 150, y: 50 }, { x: 260, y: 120 }, 'cut')
    if ('error' in result) throw new Error(result.error)
    expect(polygonArea(room(result.plan).polygon)).toBe(200 * 100 - 50 * 50)
    expect(applyRoomRange(plan(), ref, { x: 50, y: 20 }, { x: 100, y: 80 }, 'cut')).toHaveProperty('error')
    expect(applyRoomRange(plan(), ref, { x: 300, y: 0 }, { x: 400, y: 50 }, 'cut')).toHaveProperty('error')
  })

  it('うっかりクリックしただけ（小さすぎる四角）では変えない', () => {
    expect(applyRoomRange(plan(), ref, { x: 10, y: 10 }, { x: 12, y: 11 }, 'set')).toHaveProperty('error')
  })

  it('L 字の部屋も、辺をドラッグして動かせる', () => {
    const added = applyRoomRange(plan(), ref, { x: 200, y: 0 }, { x: 300, y: 50 }, 'add')
    if ('error' in added) throw new Error(added.error)
    const poly = room(added.plan).polygon
    // 右端の縦の辺（x = 300）を x = 320 へ
    const i = poly.findIndex((p, k) => p.x === 300 && poly[(k + 1) % poly.length].x === 300)
    const moved = moveRoomPolygonEdge(added.plan, ref, poly, i, 320)
    expect(bbox(room(moved).polygon).x2).toBe(320)
    expect(room(moved).polygon).toHaveLength(6)
  })
})

describe('四角を足す（重なっているとき）', () => {
  it('今の範囲に一部重なる四角を足しても、正しい L 字になる', () => {
    const result = applyRoomRange(plan(), ref, { x: 180, y: 0 }, { x: 300, y: 50 }, 'add')
    if ('error' in result) throw new Error(result.error)
    expect(room(result.plan).polygon).toHaveLength(6)
    expect(polygonArea(room(result.plan).polygon)).toBe(200 * 100 + 100 * 50)
  })
})
