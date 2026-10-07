import { WINDOW_KIND_OPTIONS, normalizeWindowKind, windowKindLabel } from '../../constants/windowOptions'
import type { FloorPlan, WindowKind } from '../../types/floorPlan'
import {
  deleteWindow,
  findWindow,
  type SelectedElementRef,
  type SelectOptions,
  updateWindow,
  cycleWindowOrientation,
} from '../../utils/floorPlanEdit'
import { hasFourWayDirection, hasWindowDirection } from '../../utils/windowOrientation'
import { svgUnitsToMm } from '../../utils/roomGeometry'
import { NumberField } from '../NumberField'

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

  const win = currentWindow.window
  const widthMm = Math.round(
    svgUnitsToMm(Math.hypot(win.end.x - win.start.x, win.end.y - win.start.y))
  )

  return (
        <div className="room-editor-form">
          <h4>窓の詳細</h4>
          <p className="editor-offset-hint">
            壁に沿って移動します。両端の●または下の幅入力で寸法を変えられます。
          </p>
          <div className="editor-field">
            <label htmlFor="window-kind">種類</label>
            <select
              id="window-kind"
              value={normalizeWindowKind(currentWindow.window.kind)}
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
                WINDOW_KIND_OPTIONS.find(
                  (o) => o.value === normalizeWindowKind(currentWindow.window.kind)
                )?.hint
              }
            </p>
          </div>
          <div className="editor-field">
            <label htmlFor="window-width">幅（mm）</label>
            <NumberField
              id="window-width"
              step={50}
              min={300}
              max={6000}
              value={widthMm}
              onCommit={(next) => next != null && handleWindowField({ widthMm: next })}
            />
          </div>

          {hasWindowDirection(currentWindow.window.kind) && (
            <div className="editor-field">
              <span className="editor-offset-label">開く向き</span>
              <div className="editor-nudge-row">
                <button
                  type="button"
                  className="btn editor-nudge-btn"
                  onClick={() => applyPlan((prev) => cycleWindowOrientation(prev, selected))}
                >
                  {hasFourWayDirection(currentWindow.window.kind) ? '↻ 向きを変える' : '⇄ 反対側に開く'}
                </button>
              </div>
              <p className="editor-field-hint">
                {hasFourWayDirection(currentWindow.window.kind)
                  ? '押すたびに、軸のある端（左右）と開く側（内外）の4通りが順に変わります。'
                  : '生成時は建物の外側へ開くよう自動で向けています。室内側を向いてしまったときはこのボタンで反転してください。'}
              </p>
            </div>
          )}

          <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDeleteWindow}>
            この{windowKindLabel(currentWindow.window.kind)}を削除
          </button>
        </div>
  )
}
