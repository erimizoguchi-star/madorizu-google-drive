import type { FloorPlan } from '../types/floorPlan'

/**
 * 編集中の間取図をブラウザ（localStorage）に保存する。
 * サーバーを持たないアプリなので、保存先は使っている PC のブラウザ内だけ。
 * 別の PC や別のブラウザには引き継がれない（そちらは JSON 保存を使う）。
 */
export interface SavedPlan {
  id: string
  name: string
  /** ISO 文字列 */
  updatedAt: string
  floorPlan: FloorPlan
}

const STORAGE_KEY = 'madorizu:saved-plans'

function readAll(): SavedPlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is SavedPlan =>
        !!p && typeof p.id === 'string' && typeof p.name === 'string' && !!p.floorPlan
    )
  } catch {
    return []
  }
}

function writeAll(plans: SavedPlan[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans))
  } catch {
    // 容量超過など。呼び出し側でユーザーに知らせる
    throw new Error(
      'ブラウザへの保存に失敗しました（容量不足の可能性）。不要な保存データを削除するか、JSON保存を使ってください。'
    )
  }
}

/** 新しい順に並べて返す */
export function listSavedPlans(): SavedPlan[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function findSavedPlan(id: string): SavedPlan | null {
  return readAll().find((p) => p.id === id) ?? null
}

/** id を渡すと上書き、渡さなければ新規保存 */
export function savePlan(name: string, floorPlan: FloorPlan, id?: string): SavedPlan {
  const plans = readAll()
  const entry: SavedPlan = {
    id: id ?? `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || '無題の間取図',
    updatedAt: new Date().toISOString(),
    floorPlan,
  }

  const index = plans.findIndex((p) => p.id === entry.id)
  if (index >= 0) plans[index] = entry
  else plans.push(entry)

  writeAll(plans)
  return entry
}

export function deleteSavedPlan(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id))
}

export function formatSavedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
