import {
  exportFloorPlanJpeg,
  exportFloorPlanPdf,
  exportFloorPlanPng,
  exportFloorPlanSvg,
} from '../utils/exportFloorPlan'

interface ExportButtonProps {
  targetId: string
  filename?: string
}

export function ExportButton({ targetId, filename = 'madorizu' }: ExportButtonProps) {
  return (
    <div className="export-buttons">
      <button type="button" onClick={() => exportFloorPlanSvg(targetId, filename)} className="btn btn-secondary">
        SVG
      </button>
      <button
        type="button"
        onClick={() => void exportFloorPlanPng(targetId, filename)}
        className="btn btn-secondary"
      >
        PNG
      </button>
      <button
        type="button"
        onClick={() => void exportFloorPlanJpeg(targetId, filename)}
        className="btn btn-secondary"
      >
        JPG
      </button>
      <button
        type="button"
        onClick={() => void exportFloorPlanPdf(targetId, filename)}
        className="btn btn-primary"
      >
        PDF
      </button>
    </div>
  )
}
