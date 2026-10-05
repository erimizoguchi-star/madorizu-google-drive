// 物件情報管理システム（広告シートの「間取り図を作る」）から開かれたときに URL で渡される物件情報。
//   ?property=物件ID&name=表示名

export interface PropertyLink {
  propertyId: string
  /** 画面に出す物件の名前 */
  name: string
}

export function propertyLinkFromUrl(search: string = window.location.search): PropertyLink | null {
  const params = new URLSearchParams(search)
  const propertyId = (params.get('property') ?? '').trim().slice(0, 80)
  const name = (params.get('name') ?? '').trim().slice(0, 120)
  if (!propertyId && !name) return null
  return { propertyId, name: name || propertyId }
}

/** ダウンロードするファイル名に使えるよう、使えない文字を置き換える */
export function fileSafeName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}
