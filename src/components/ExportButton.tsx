import { useState } from 'react'
import {
  exportFloorPlanJpeg,
  exportFloorPlanPdf,
  exportFloorPlanPng,
  exportFloorPlanSvg,
  renderFloorPlanJpegBlob,
} from '../utils/exportFloorPlan'
import { sendImageToPropertySystem } from '../utils/propertyLink'

interface ExportButtonProps {
  targetId: string
  filename?: string
  /**
   * 出力直前に呼ばれる。編集中の選択を解除するために使う。
   * 解除しないと、選択ハイライトや編集ハンドルがそのまま画像に写り込む。
   */
  onBeforeExport?: () => void
  /**
   * 物件情報管理システムから開かれたときの送り先。指定があると「物件情報管理システムへ送る」ボタンを出す。
   * 送ると、その物件の広告シート（間取り図の枠）に直接入る。
   */
  sendTo?: { uploadUrl: string; propertyName: string }
}

/** React の再描画（選択解除の反映）を待ってから出力する */
function afterRepaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export function ExportButton({ targetId, filename = 'madorizu', onBeforeExport, sendTo }: ExportButtonProps) {
  const [sendState, setSendState] = useState<{ busy: boolean; ok?: boolean; message?: string }>({ busy: false })

  const run = async (exporter: () => void | Promise<void>) => {
    onBeforeExport?.()
    await afterRepaint()
    await exporter()
  }

  const send = async () => {
    if (!sendTo || sendState.busy) return
    setSendState({ busy: true })
    onBeforeExport?.()
    await afterRepaint()
    const blob = await renderFloorPlanJpegBlob(targetId)
    if (!blob) {
      setSendState({ busy: false, ok: false, message: '間取図の画像を作れませんでした。' })
      return
    }
    const result = await sendImageToPropertySystem(sendTo.uploadUrl, blob, `${filename}.jpg`)
    setSendState({ busy: false, ...result })
  }

  return (
    <div className="export-buttons">
      <button
        type="button"
        onClick={() => void run(() => exportFloorPlanSvg(targetId, filename))}
        className="btn btn-secondary"
      >
        SVG
      </button>
      <button
        type="button"
        onClick={() => void run(() => exportFloorPlanPng(targetId, filename))}
        className="btn btn-secondary"
      >
        PNG
      </button>
      <button
        type="button"
        onClick={() => void run(() => exportFloorPlanJpeg(targetId, filename))}
        className="btn btn-secondary"
      >
        JPG
      </button>
      <button
        type="button"
        onClick={() => void run(() => exportFloorPlanPdf(targetId, filename))}
        className="btn btn-primary"
      >
        PDF
      </button>
      {sendTo && (
        <div className="export-send">
          <button type="button" onClick={() => void send()} disabled={sendState.busy} className="btn btn-primary">
            {sendState.busy ? '送信中…' : sendState.ok ? '物件へもう一度送る' : '物件へ送る'}
          </button>
          <p className={`export-send__note${sendState.message ? (sendState.ok ? ' is-ok' : ' is-error') : ''}`}>
            {sendState.message ?? `「${sendTo.propertyName}」の広告シートの「間取り図」の枠に直接入ります。`}
          </p>
        </div>
      )}
    </div>
  )
}
