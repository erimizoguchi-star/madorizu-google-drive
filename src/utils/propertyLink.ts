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

/** 送り先（受付票）をアドレスバーから消す。URL を人に渡したときに紛れ込ませないため */
export function removeUploadFromAddressBar() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('upload')) return
  url.searchParams.delete('upload')
  window.history.replaceState(null, '', url)
}

/** 仕上がった画像を物件情報管理システムへ送る。成功・失敗を、画面に出せる文で返す */
export async function sendImageToPropertySystem(
  uploadUrl: string,
  image: Blob,
  fileName: string
): Promise<{ ok: boolean; message: string }> {
  const form = new FormData()
  form.append('file', new File([image], fileName, { type: image.type || 'image/jpeg' }))
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
        message: `「${data.propertyName ?? '物件'}」の「${data.slot ?? '間取り図'}」の枠へ送りました。広告シートに戻ると表示されます。`,
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
