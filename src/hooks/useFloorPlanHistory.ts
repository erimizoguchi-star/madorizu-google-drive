import { useCallback, useRef, useState } from 'react'
import type { FloorPlan } from '../types/floorPlan'

const MAX_HISTORY = 50
/** ドラッグ中の連続更新を1操作にまとめる間隔 */
const COALESCE_MS = 450

type HistoryState = {
  past: FloorPlan[]
  present: FloorPlan | null
  future: FloorPlan[]
  /** reset のたびに増える。新しい図面を読み込んだことを表示側が知るための番号 */
  generation: number
}

function clonePlan(plan: FloorPlan): FloorPlan {
  return structuredClone(plan)
}

export function useFloorPlanHistory() {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: null,
    future: [],
    generation: 0,
  })
  const lastCommitAt = useRef(0)

  const reset = useCallback((plan: FloorPlan | null) => {
    lastCommitAt.current = 0
    setHistory((h) => ({ past: [], present: plan, future: [], generation: h.generation + 1 }))
  }, [])

  /**
   * 間取図を更新する。
   * coalesce: true のとき、短時間の連続更新（ドラッグなど）は履歴を1段にまとめる。
   */
  const commit = useCallback(
    (
      updater: FloorPlan | ((prev: FloorPlan) => FloorPlan),
      options?: { coalesce?: boolean }
    ) => {
      setHistory((h) => {
        if (!h.present) {
          if (typeof updater === 'function') return h
          // 空の状態から図面が入るのも「新しい図面の読み込み」として扱う
          return { past: [], present: updater, future: [], generation: h.generation + 1 }
        }

        const next = typeof updater === 'function' ? updater(h.present) : updater
        if (next === h.present) return h

        const now = Date.now()
        const coalesce = options?.coalesce === true
        const withinWindow = now - lastCommitAt.current < COALESCE_MS

        if (coalesce && withinWindow && h.past.length > 0) {
          return { ...h, present: next, future: [] }
        }

        lastCommitAt.current = now
        return {
          ...h,
          past: [...h.past, clonePlan(h.present)].slice(-MAX_HISTORY),
          present: next,
          future: [],
        }
      })
    },
    []
  )

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.present || h.past.length === 0) return h
      const previous = h.past[h.past.length - 1]
      lastCommitAt.current = 0
      return {
        ...h,
        past: h.past.slice(0, -1),
        present: previous,
        future: [clonePlan(h.present), ...h.future].slice(0, MAX_HISTORY),
      }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory((h) => {
      if (!h.present || h.future.length === 0) return h
      const next = h.future[0]
      lastCommitAt.current = 0
      return {
        ...h,
        past: [...h.past, clonePlan(h.present)].slice(-MAX_HISTORY),
        present: next,
        future: h.future.slice(1),
      }
    })
  }, [])

  return {
    floorPlan: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    /** 新しい図面を読み込むたびに変わる番号（表示の倍率合わせに使う） */
    planGeneration: history.generation,
    reset,
    commit,
    undo,
    redo,
  }
}
