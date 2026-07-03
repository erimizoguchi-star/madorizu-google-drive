import type { FloorPlan } from '../types/floorPlan'
import { validateFloorPlanJson } from '../services/analyzeFloorPlan'

interface JsonDataButtonsProps {
  floorPlan: FloorPlan
  onImport: (floorPlan: FloorPlan) => void
}

export function JsonDataButtons({ floorPlan, onImport }: JsonDataButtonsProps) {
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(floorPlan, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'madorizu.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportJson = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = validateFloorPlanJson(JSON.parse(reader.result as string))
          onImport(parsed)
        } catch {
          alert('JSONファイルの読み込みに失敗しました')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="data-share-section">
      <h4>データの共有</h4>
      <p className="data-share-hint">編集内容をそのまま渡すときは JSON を使います</p>
      <div className="export-buttons">
        <button type="button" className="btn btn-secondary" onClick={handleExportJson}>
          JSON保存
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleImportJson}>
          JSON読込
        </button>
      </div>
    </div>
  )
}
