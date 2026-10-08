import type { FloorPlan } from '../types/floorPlan'

// 物件情報管理システム（広告シートの「間取り図を作る」）から開かれたときに URL で渡される物件情報。
//   ?property=物件ID&name=表示名&upload=送り先
// upload は、仕上がった画像を広告シートの「間取り図」の枠へ直接送るための送り先（期限つきの受付票を含む）。

export interface PropertyLink {
  propertyId: string
  /** 画面に出す物件の名前 */
  name: string
  /** 仕上がった画像の送り先。無ければ「送る」ボタンは出さない */
  uploadUrl: string | null
}

/** 画像を送ってよい相手（物件情報管理システム）。それ以外の送り先は無視する */
const UPLOAD_HOSTS = ['property-signage.vercel.app']

function parseUploadUrl(raw: string | null): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    const local = url.hostname === 'localhost' && import.meta.env.DEV
    if (url.protocol !== 'https:' && !local) return null
    if (!UPLOAD_HOSTS.includes(url.hostname) && !local) return null
    if (!url.pathname.startsWith('/api/integrations/assets')) return null
    return url.toString()
  } catch {
    return null
  }
}

export function propertyLinkFromUrl(search: string = window.location.search): PropertyLink | null {
  const params = new URLSearchParams(search)
  const propertyId = (params.get('property') ?? '').trim().slice(0, 80)
  const name = (params.get('name') ?? '').trim().slice(0, 120)
  if (!propertyId && !name) return null
  return { propertyId, name: name || propertyId, uploadUrl: parseUploadUrl(params.get('upload')) }
}

/** 物件情報管理システムにある、この物件の図面（資料シートの建物図面や、間取り図の枠に入れた図面の写真） */
export interface PropertySource {
  id: string
  name: string
  /** どこにある資料か（例: 資料シートの建物図面） */
  label: string
  kind: 'image' | 'pdf'
  /** この間取り図ツールから送った画像で、編集データが付いている（続きから編集できる） */
  editData?: boolean
}

/** この物件の図面の一覧を取得する。取得できなければ空 */
export async function fetchPropertySources(uploadUrl: string): Promise<PropertySource[]> {
  try {
    const response = await fetch(uploadUrl)
    if (!response.ok) return []
    const data = (await response.json()) as { sources?: PropertySource[] }
    return Array.isArray(data.sources) ? data.sources : []
  } catch {
    return []
  }
}

/** 図面を1つ読み込み、アップロードしたファイルと同じ形（File）にする */
export async function fetchPropertySourceFile(uploadUrl: string, source: PropertySource): Promise<File> {
  const url = new URL(uploadUrl)
  url.searchParams.set('file', source.id)
  const response = await fetch(url)
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? `図面を読み込めませんでした（${response.status}）`)
  }
  const blob = await response.blob()
  const isPdf = blob.type === 'application/pdf'
  const base = source.name.replace(/\.[^.]+$/, '') || '図面'
  return new File([blob], `${base}${isPdf ? '.pdf' : '.jpg'}`, { type: isPdf ? 'application/pdf' : 'image/jpeg' })
}

/** 送り先（受付票）をアドレスバーから消す。URL を人に渡したときに紛れ込ませないため */
export function removeUploadFromAddressBar() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('upload')) return
  url.searchParams.delete('upload')
  window.history.replaceState(null, '', url)
}

/** 物件へ画像と一緒に送る編集データの形。別の PC で開き直したときに、そのまま編集を続けられる */
interface EditData {
  format: 'madorizu-edit'
  version: 1
  savedAt: string
  floorPlan: FloorPlan
}

export function buildEditData(floorPlan: FloorPlan): Blob {
  const data: EditData = { format: 'madorizu-edit', version: 1, savedAt: new Date().toISOString(), floorPlan }
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

/** 物件から受け取った編集データを間取図に戻す。形が違う・階がないものは null */
export function parseEditData(json: unknown): FloorPlan | null {
  if (!json || typeof json !== 'object') return null
  const data = json as Partial<EditData>
  if (data.format !== 'madorizu-edit' || !data.floorPlan) return null
  const floors = (data.floorPlan as Partial<FloorPlan>).floors
  if (!Array.isArray(floors) || floors.length === 0) return null
  return data.floorPlan
}

/** 物件の間取り図の枠にある画像に付いた編集データを読み込む */
export async function fetchPropertyEditData(uploadUrl: string, source: PropertySource): Promise<FloorPlan> {
  const url = new URL(uploadUrl)
  url.searchParams.set('file', source.id)
  url.searchParams.set('data', '1')
  const response = await fetch(url)
  const json = (await response.json().catch(() => null)) as unknown
  if (!response.ok) {
    const error = (json as { error?: string } | null)?.error
    throw new Error(error ?? `編集データを読み込めませんでした（${response.status}）`)
  }
  const plan = parseEditData(json)
  if (!plan) throw new Error('編集データの形が正しくありません')
  return plan
}

/**
 * 仕上がった画像を物件情報管理システムへ送る。成功・失敗を、画面に出せる文で返す。
 * editData を付けると、編集データも一緒に保存され、別の PC からでも続きを編集できる
 */
export async function sendImageToPropertySystem(
  uploadUrl: string,
  image: Blob,
  fileName: string,
  editData?: Blob
): Promise<{ ok: boolean; message: string }> {
  const form = new FormData()
  form.append('file', new File([image], fileName, { type: image.type || 'image/jpeg' }))
  if (editData) form.append('data', new File([editData], fileName.replace(/\.[^.]+$/, '') + '.json', { type: 'application/json' }))
  try {
    const response = await fetch(uploadUrl, { method: 'POST', body: form })
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean
      error?: string
      propertyName?: string
      slot?: string
    } | null
    if (response.ok && data?.ok) {
      return {
        ok: true,
        message: `「${data.propertyName ?? '物件'}」の「${data.slot ?? '間取り図'}」の枠へ送りました。広告シートに戻ると表示されます。${
          editData ? '編集データも保存したので、あとで別のPCからでも続きを編集できます。' : ''
        }`,
      }
    }
    return { ok: false, message: data?.error ?? `送信に失敗しました（${response.status}）。` }
  } catch {
    return { ok: false, message: '送信に失敗しました。通信の状態を確認して、もう一度お試しください。' }
  }
}

/** ダウンロードするファイル名に使えるよう、使えない文字を置き換える */
export function fileSafeName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}
