import { LABEL } from '../../renderer/styles'
import type { FloorPlan } from '../../types/floorPlan'
import {
  deleteTextLabel,
  findTextLabel,
  type SelectedElementRef,
  type SelectOptions,
  updateTextLabel,
} from '../../utils/floorPlanEdit'

interface TextPanelProps {
  floorPlan: FloorPlan
  selected: Extract<SelectedElementRef, { kind: 'text' }>
  onSelect: (ref: SelectedElementRef | null, options?: SelectOptions) => void
  onChange: (updater: (prev: FloorPlan) => FloorPlan) => void
}

export function TextPanel({ floorPlan, selected, onSelect, onChange }: TextPanelProps) {
  const current = findTextLabel(floorPlan, selected)

  const handleField = (patch: Parameters<typeof updateTextLabel>[2]) => {
    onChange((prev) => updateTextLabel(prev, selected, patch))
  }

  const handleDelete = () => {
    if (!current) return
    if (!confirm('この文字を削除しますか？')) return
    onChange((prev) => deleteTextLabel(prev, selected))
    onSelect(null)
  }

  if (!current) return null

  return (
    <div className="room-editor-form">
      <h4>文字の詳細</h4>
      <p className="editor-offset-hint">図面上でドラッグして移動できます。</p>

      <div className="editor-field">
        <label htmlFor="text-label-content">表示文字</label>
        <input
          id="text-label-content"
          type="text"
          value={current.label.text}
          onChange={(e) => handleField({ text: e.target.value })}
        />
      </div>

      <div className="editor-field">
        <label htmlFor="text-label-font-size">
          フォントサイズ（pt）
          {current.label.fontSize == null && (
            <span className="editor-field-default"> デフォルト {LABEL.defaultFontSize}pt</span>
          )}
        </label>
        <input
          id="text-label-font-size"
          type="number"
          step="1"
          min={LABEL.fontSizeMin}
          max={LABEL.fontSizeMax}
          value={current.label.fontSize ?? LABEL.defaultFontSize}
          onChange={(e) => {
            const val = parseFloat(e.target.value)
            if (Number.isNaN(val)) return
            const clamped = Math.min(LABEL.fontSizeMax, Math.max(LABEL.fontSizeMin, val))
            handleField({
              fontSize: clamped === LABEL.defaultFontSize ? null : clamped,
            })
          }}
        />
      </div>

      <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDelete}>
        この文字を削除
      </button>
    </div>
  )
}
