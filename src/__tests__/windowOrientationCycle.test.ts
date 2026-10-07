import { describe, expect, it } from 'vitest'
import { cycleWindowOrientation } from '../utils/floorPlanEdit'
import type { FloorPlan, Window } from '../types/floorPlan'
import { makePlan } from './helpers'

/** 窓の形を「start の位置（縦すべり出しの軸の端）」と「開く側（画面の上下）」で表す */
function shape(w: Window) {
  const dx = w.end.x - w.start.x
  // 横向きの窓: start→end が右向きなら、右側（outward=1）は画面の下
  const side = (w.outward === -1 ? -1 : 1) * Math.sign(dx)
  return `${w.start.x}:${side > 0 ? '下' : '上'}`
}

function cycle(kind: Window['kind'], times: number) {
  let plan: FloorPlan = makePlan({ windows: [{ id: 'w', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, kind, outward: 1 }] })
  const seen = [shape(plan.floors[0].windows[0])]
  for (let i = 0; i < times; i++) {
    plan = cycleWindowOrientation(plan, { floorId: '1f', windowId: 'w' })
    seen.push(shape(plan.floors[0].windows[0]))
  }
  return seen
}

describe('窓の向きを順に切り替える', () => {
  it('縦すべり出し窓は、軸のある端（左右）×開く側（内外）の4通りを回って元に戻る', () => {
    const seen = cycle('slide_out', 4)
    expect(new Set(seen.slice(0, 4)).size).toBe(4)
    expect(seen[4]).toBe(seen[0])
  })

  it('片開き窓も4通り', () => {
    expect(new Set(cycle('casement', 4).slice(0, 4)).size).toBe(4)
  })

  it('左右対称の窓（横すべり出し・両開き）は内外の2通り', () => {
    const seen = cycle('awning', 2)
    expect(seen[0]).not.toBe(seen[1])
    expect(seen[2]).toBe(seen[0])
  })
})
