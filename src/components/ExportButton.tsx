import {
  exportFloorPlanJpeg,
  exportFloorPlanPdf,
  exportFloorPlanPng,
  exportFloorPlanSvg,
} from '../utils/exportFloorPlan'

interface ExportButtonProps {
  targetId: string
  filename?: string
  /**
   * 出力直前に呼ばれる。編集中の選択を解除するために使う。
   * 解除しないと、選択ハイライトや編集ハンドルがそのまま画像に写り込む。
   */
  onBeforeExport?: () => void
}

/** React の再描画（選択解除の反映）を待ってから出力する */
function afterRepaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

export function ExportButton({ targetId, filename = 'madorizu', onBeforeExport }: ExportButtonProps) {
  const run = async (exporter: () => void | Promise<void>) => {
    onBeforeExport?.()
    await afterRepaint()
    await exporter()
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
    </div>
  )
}
