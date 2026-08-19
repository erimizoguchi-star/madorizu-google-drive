import { WINDOW_KIND_OPTIONS, windowKindLabel } from '../../constants/windowOptions'
import type { FloorPlan, WindowKind } from '../../types/floorPlan'
import {
  deleteWindow,
  findWindow,
  type SelectedElementRef,
  type SelectOptions,
  updateWindow,
} from '../../utils/floorPlanEdit'
import { hasWindowDirection } from '../../utils/windowOrientation'

interface WindowPanelProps {
  floorPlan: FloorPlan
  selected: Extract<SelectedElementRef, { kind: 'window' }>
  onSelect: (ref: SelectedElementRef | null, options?: SelectOptions) => void
  onChange: (updater: (prev: FloorPlan) => FloorPlan) => void
}

export function WindowPanel({ floorPlan, selected, onSelect, onChange }: WindowPanelProps) {
  const applyPlan = onChange

  const currentWindow = findWindow(floorPlan, selected)

  const handleWindowField = (patch: Parameters<typeof updateWindow>[2]) => {
    applyPlan((prev) => updateWindow(prev, selected, patch))
  }

  const handleDeleteWindow = () => {
    if (!currentWindow) return
    if (!confirm('この窓を削除しますか？')) return
    applyPlan((prev) => deleteWindow(prev, selected))
    onSelect(null)
  }

  if (!currentWindow) return null

  return (
        <div className="room-editor-form">
          <h4>窓の詳細</h4>
          <p className="editor-offset-hint">
            両端の●で幅を調整、中央の○で平行移動できます。種類を変えると図上の記号が変わります。
          </p>
          <div className="editor-field">
            <label htmlFor="window-kind">種類</label>
            <select
              id="window-kind"
              value={currentWindow.window.kind ?? 'sliding'}
              onChange={(e) => handleWindowField({ kind: e.target.value as WindowKind })}
            >
              {WINDOW_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="editor-field-hint">
              {
                WINDOW_KIND_OPTIONS.find((o) => o.value === (currentWindow.window.kind ?? 'sliding'))
                  ?.hint
              }
            </p>
          </div>

          {hasWindowDirection(currentWindow.window.kind) && (
            <div className="editor-field">
              <span className="editor-offset-label">開く向き</span>
              <div className="editor-nudge-row">
                <button
                  type="button"
                  className="btn editor-nudge-btn"
                  onClick={() =>
                    handleWindowField({
                      outward: currentWindow.window.outward === -1 ? 1 : -1,
                    })
                  }
                >
                  ⇄ 反対側に開く
                </button>
              </div>
              <p className="editor-field-hint">
                生成時は建物の外側へ開くよう自動で向けています。
                室内側を向いてしまったときはこのボタンで反転してください。
              </p>
            </div>
          )}

          <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDeleteWindow}>
            この{windowKindLabel(currentWindow.window.kind)}を削除
          </button>
        </div>
  )
}
