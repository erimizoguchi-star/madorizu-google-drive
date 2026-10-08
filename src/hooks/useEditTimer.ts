import { useCallback, useEffect, useRef, useState } from 'react'
import { addActivity, IDLE_MS, newEditStats, type EditStats } from '../services/editTime'

/**
 * 編集にかかった時間を数える。active の間、画面の操作（クリック・キー・ドラッグ・ホイール）を見て、
 * 操作と操作の間が IDLE_MS 未満なら、その間を操作していた時間として足す。
 * 表示は1秒ごとに更新する（操作が止まっている間は更新しない）。
 */
export function useEditTimer(active: boolean) {
  const statsRef = useRef<EditStats | null>(null)
  const lastRef = useRef<number | null>(null)
  const [activeMs, setActiveMs] = useState(0)

  /** 新しい間取図で数え始める。続きから編集するときは、保存してあった記録から続ける */
  const start = useCallback((stats?: EditStats | null) => {
    statsRef.current = stats ?? newEditStats()
    lastRef.current = null
    setActiveMs(statsRef.current.activeMs)
  }, [])

  /** AI の読み取りを待った時間を足す（階を足したとき） */
  const addAnalysis = useCallback((ms: number) => {
    if (statsRef.current) statsRef.current = { ...statsRef.current, analysisMs: statsRef.current.analysisMs + ms }
  }, [])

  /** 今の記録（保存・送信に使う） */
  const snapshot = useCallback((): EditStats | null => (statsRef.current ? { ...statsRef.current } : null), [])

  useEffect(() => {
    if (!active) {
      lastRef.current = null
      return
    }
    const onActivity = () => {
      const stats = statsRef.current
      if (!stats) return
      const now = Date.now()
      stats.activeMs = addActivity(stats.activeMs, lastRef.current, now)
      lastRef.current = now
    }
    const events = ['pointerdown', 'pointerup', 'keydown', 'wheel'] as const
    for (const type of events) window.addEventListener(type, onActivity, { capture: true, passive: true })
    const timer = window.setInterval(() => {
      const stats = statsRef.current
      const last = lastRef.current
      if (!stats || last == null || Date.now() - last >= IDLE_MS) return
      // 最後の操作からの経過も含めて表示する（数えるのは次の操作のとき）
      setActiveMs(stats.activeMs + (Date.now() - last))
    }, 1000)
    return () => {
      for (const type of events) window.removeEventListener(type, onActivity, { capture: true })
      window.clearInterval(timer)
    }
  }, [active])

  return { activeMs, start, addAnalysis, snapshot }
}
