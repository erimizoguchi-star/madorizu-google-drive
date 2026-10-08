/**
 * 間取図1枚の編集にかかった時間の記録。「10分で終える」に近づいているかを数字で見るために使う。
 *
 * 数えるのは、実際に操作している時間（クリック・キー・ドラッグ）。操作と操作の間が2分以上あいたら、
 * その間は数えない（席を外した・別の仕事をしていた時間を含めないため）。
 * AI の読み取りを待つ時間は別に持つ。
 */

export interface EditStats {
  /** 間取図1枚ごとの ID（同じ間取図を送り直したときは、記録を上書きする） */
  sessionId: string
  /** 編集を始めた日時（ISO 文字列） */
  startedAt: string
  /** 操作していた時間の合計（ミリ秒） */
  activeMs: number
  /** AI の読み取りを待った時間の合計（ミリ秒）。サンプル表示や続きから編集では 0 */
  analysisMs: number
}

/** これより長く操作がなければ、その間は数えない */
export const IDLE_MS = 2 * 60 * 1000

export function newEditStats(analysisMs = 0, now = new Date()): EditStats {
  const random = Math.random().toString(36).slice(2, 8)
  return { sessionId: `${now.getTime().toString(36)}-${random}`, startedAt: now.toISOString(), activeMs: 0, analysisMs }
}

/**
 * 操作があったときに呼ぶ。前の操作から IDLE_MS 未満なら、その間を操作していた時間に足す。
 * lastAt は前の操作の時刻（ミリ秒）。初めての操作は null
 */
export function addActivity(activeMs: number, lastAt: number | null, now: number, idleMs = IDLE_MS): number {
  if (lastAt == null) return activeMs
  const gap = now - lastAt
  return gap > 0 && gap < idleMs ? activeMs + gap : activeMs
}

/** 保存したもの・受け取ったものが編集時間の形になっているか */
export function isEditStats(value: unknown): value is EditStats {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<EditStats>
  return (
    typeof v.sessionId === 'string' &&
    typeof v.startedAt === 'string' &&
    typeof v.activeMs === 'number' &&
    Number.isFinite(v.activeMs) &&
    typeof v.analysisMs === 'number'
  )
}

/** 「6分12秒」「45秒」「1時間3分」 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}時間${m}分`
  if (m > 0) return `${m}分${String(s).padStart(2, '0')}秒`
  return `${s}秒`
}

/** 仕上げた（物件へ送った・出力した）間取図1枚の記録 */
export interface EditRecord {
  sessionId: string
  /** 仕上げた日時（ISO 文字列） */
  finishedAt: string
  title: string
  propertyName?: string
  floors: number
  activeMs: number
  analysisMs: number
}

const HISTORY_KEY = 'madorizu-edit-history'
const HISTORY_MAX = 50
/** 目標の時間 */
export const GOAL_MS = 10 * 60 * 1000

/** この PC のブラウザに残した記録（新しい順）。読めなければ空 */
export function loadEditHistory(): EditRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((r): r is EditRecord => !!r && typeof r.sessionId === 'string') : []
  } catch {
    return []
  }
}

/** 記録を足す。同じ間取図（sessionId）の記録はいちばん新しいものに置き換える */
export function upsertEditRecord(history: EditRecord[], record: EditRecord): EditRecord[] {
  return [record, ...history.filter((r) => r.sessionId !== record.sessionId)].slice(0, HISTORY_MAX)
}

export function saveEditRecord(record: EditRecord): EditRecord[] {
  const next = upsertEditRecord(loadEditHistory(), record)
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // 保存できなくても編集は続けられる
  }
  return next
}

/** 最近の記録のまとめ（編集時間の中央値と、10分以内に終えた件数） */
export function summarizeEditHistory(records: EditRecord[], recent = 10) {
  const list = records.slice(0, recent)
  const sorted = list.map((r) => r.activeMs).sort((a, b) => a - b)
  const mid = sorted.length / 2
  const medianMs =
    sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2
  return { count: list.length, medianMs, withinGoal: list.filter((r) => r.activeMs <= GOAL_MS).length }
}
