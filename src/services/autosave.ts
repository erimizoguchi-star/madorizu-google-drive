import type { FloorPlan } from '../types/floorPlan'

/**
 * 編集中の間取図の自動保存（ブラウザの IndexedDB）。
 *
 * 編集中の間取図は画面のメモリにしかなく、再読み込みやタブを閉じると消えていた。
 * 元の平面図の画像（重ね合わせ用）は数 MB になるので、localStorage（約 5MB）ではなく IndexedDB に Blob で持つ。
 * 保存先は使っている PC のブラウザの中だけ（サーバーには送らない）。
 */
/** 元の平面図の画像1枚。同じ画像を複数の階で使うことがあるので、1枚につき1件にまとめる */
export interface AutosaveSource {
  /** この図面を重ねる階 */
  floorIds: string[]
  /** 最後に読み込んだ図面か（画面右の「アップロードした平面図」に出す） */
  latest: boolean
  fileName: string
  blob: Blob
}

export interface AutosaveRecord {
  /** ISO 文字列 */
  savedAt: string
  floorPlan: FloorPlan
  sources: AutosaveSource[]
  overlayFloorId: string | null
}

const DB_NAME = 'madorizu'
const STORE = 'autosave'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** 物件ごとに分けて保存する（別の物件を開いたときに、ほかの物件の間取図が出てこないように） */
export function autosaveKey(propertyId: string | null | undefined): string {
  return propertyId ? `property:${propertyId}` : 'default'
}

export async function saveAutosave(key: string, record: AutosaveRecord): Promise<void> {
  await withStore('readwrite', (store) => store.put(record, key))
}

export async function loadAutosave(key: string): Promise<AutosaveRecord | null> {
  try {
    const record = await withStore<AutosaveRecord | undefined>('readonly', (store) => store.get(key))
    return isAutosaveRecord(record) ? record : null
  } catch {
    return null
  }
}

export async function clearAutosave(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(key))
}

/** 読み込んだものが自動保存の形になっているか（古い形や壊れたものは使わない） */
export function isAutosaveRecord(value: unknown): value is AutosaveRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as Partial<AutosaveRecord>
  return (
    typeof r.savedAt === 'string' &&
    !!r.floorPlan &&
    Array.isArray(r.floorPlan.floors) &&
    r.floorPlan.floors.length > 0 &&
    Array.isArray(r.sources)
  )
}

/** 「1階・2階、10月7日 15:30」のような説明 */
export function describeAutosave(record: AutosaveRecord): string {
  const d = new Date(record.savedAt)
  const when = Number.isNaN(d.getTime())
    ? ''
    : `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const floors = record.floorPlan.floors.map((f) => f.label).join('・')
  return [floors, when].filter(Boolean).join('、')
}
