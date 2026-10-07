import { useEffect, useRef, useState } from 'react'
import type { FloorPlan } from '../types/floorPlan'
import { saveAutosave, type AutosaveSource } from '../services/autosave'

type Source = { url: string; fileName: string }

/** 編集が止まってから保存するまでの時間 */
const SAVE_DELAY_MS = 1500

interface UseAutosaveParams {
  key: string
  floorPlan: FloorPlan | null
  floorSources: Record<string, Source>
  sourcePreview: Source | null
  overlayFloorId: string | null
  /** false の間は保存しない（前回の保存を「続きから編集」するか決める前に上書きしないため） */
  enabled: boolean
}

/**
 * 編集中の間取図と、階ごとの元の平面図を自動で保存する。
 * 画像は表示用の URL（blob: / data:）から取り出して Blob で保存する。同じ画像は一度だけ取り出す。
 */
export function useAutosave({ key, floorPlan, floorSources, sourcePreview, overlayFloorId, enabled }: UseAutosaveParams) {
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [failed, setFailed] = useState(false)
  const blobCache = useRef(new Map<string, Blob>())

  useEffect(() => {
    if (!enabled || !floorPlan) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const blobOf = async (url: string) => {
          const cached = blobCache.current.get(url)
          if (cached) return cached
          const blob = await (await fetch(url)).blob()
          blobCache.current.set(url, blob)
          return blob
        }
        // 画像ごとに、使う階をまとめる（今の間取図にない階は外す）
        const floorIds = new Set(floorPlan.floors.map((f) => f.id))
        const byUrl = new Map<string, { fileName: string; floorIds: string[]; latest: boolean }>()
        for (const [floorId, src] of Object.entries(floorSources)) {
          if (!floorIds.has(floorId)) continue
          const entry = byUrl.get(src.url) ?? { fileName: src.fileName, floorIds: [], latest: false }
          entry.floorIds.push(floorId)
          byUrl.set(src.url, entry)
        }
        if (sourcePreview) {
          const entry = byUrl.get(sourcePreview.url) ?? { fileName: sourcePreview.fileName, floorIds: [], latest: false }
          entry.latest = true
          byUrl.set(sourcePreview.url, entry)
        }
        const sources: AutosaveSource[] = []
        for (const [url, entry] of byUrl) {
          try {
            sources.push({ ...entry, blob: await blobOf(url) })
          } catch {
            // 画像が読めなくても、間取図そのものは保存する
          }
        }
        if (cancelled) return
        await saveAutosave(key, { savedAt: new Date().toISOString(), floorPlan, sources, overlayFloorId })
        if (cancelled) return
        setSavedAt(new Date())
        setFailed(false)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }, SAVE_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [key, floorPlan, floorSources, sourcePreview, overlayFloorId, enabled])

  return { savedAt, failed }
}
