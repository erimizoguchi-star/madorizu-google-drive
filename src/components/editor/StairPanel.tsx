import { STAIR_LAYOUT_OPTIONS, STAIR_ORIENTATION_OPTIONS } from '../../constants/stairOptions'
import { LABEL } from '../../renderer/styles'
import {
  getStairBounds,
  resolveStairLayout,
  resolveStairOrientation,
} from '../../renderer/stairGraphics'
import type { FloorPlan, Point, StairLayout, StairOrientation } from '../../types/floorPlan'
import {
  deleteStair,
  findStair,
  type SelectedElementRef,
  type SelectOptions,
  updateStair,
} from '../../utils/floorPlanEdit'
import { getStairLengthMm, STAIR_DEFAULT_WIDTH_MM } from '../../utils/resizeStair'
import { mmToSvgUnits } from '../../utils/roomGeometry'
import { OffsetFields } from './OffsetFields'

interface StairPanelProps {
  floorPlan: FloorPlan
  selected: Extract<SelectedElementRef, { kind: 'stair' }>
  onSelect: (ref: SelectedElementRef | null, options?: SelectOptions) => void
  onChange: (updater: (prev: FloorPlan) => FloorPlan) => void
}

export function StairPanel({ floorPlan, selected, onSelect, onChange }: StairPanelProps) {
  const applyPlan = onChange

  const currentStair = findStair(floorPlan, selected)

  const handleStairField = (patch: Parameters<typeof updateStair>[2]) => {
    applyPlan((prev) => updateStair(prev, selected, patch))
  }

  const handleDeleteStair = () => {
    if (!currentStair) return
    if (!confirm('この階段を削除しますか？')) return
    applyPlan((prev) => deleteStair(prev, selected))
    onSelect(null)
  }

  const handleStairOffset = (offset: Point) => {
    handleStairField({
      nameLabelOffset: offset.x === 0 && offset.y === 0 ? null : offset,
    })
  }

  if (!currentStair) return null

  return (
        <div className="room-editor-form">
          <h4>階段の詳細</h4>

          <div className="editor-field">
            <label htmlFor="stair-width">幅（mm）</label>
            <input
              id="stair-width"
              type="number"
              min={600}
              max={1500}
              step={10}
              value={currentStair.stair.widthMm ?? STAIR_DEFAULT_WIDTH_MM}
              onChange={(e) => {
                const widthMm = Number(e.target.value)
                if (!Number.isFinite(widthMm) || widthMm <= 0) return
                handleStairField({ widthMm })
              }}
            />
            <p className="editor-field-hint">標準幅は {STAIR_DEFAULT_WIDTH_MM}mm です。</p>
          </div>

          <div className="editor-field">
            <label htmlFor="stair-length">長さ（mm）</label>
            <input
              id="stair-length"
              type="number"
              min={900}
              max={9000}
              step={50}
              value={getStairLengthMm(currentStair.stair)}
              onChange={(e) => {
                const lengthMm = Number(e.target.value)
                if (!Number.isFinite(lengthMm) || lengthMm <= 0) return
                handleStairField({ lengthMm })
              }}
            />
            <p className="editor-field-hint">上り方向の長さです。上り始め側は動きません。</p>
          </div>

          <div className="editor-nudge-row">
            <span className="editor-offset-label">位置（50mm）</span>
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() => handleStairField({ moveBy: { x: 0, y: -mmToSvgUnits(50) } })}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() => handleStairField({ moveBy: { x: -mmToSvgUnits(50), y: 0 } })}
            >
              ←
            </button>
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() => handleStairField({ moveBy: { x: mmToSvgUnits(50), y: 0 } })}
            >
              →
            </button>
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() => handleStairField({ moveBy: { x: 0, y: mmToSvgUnits(50) } })}
            >
              ↓
            </button>
          </div>
          <p className="editor-offset-hint">図面上で階段をドラッグしても移動できます。</p>

          <div className="editor-field">
            <label htmlFor="stair-layout">段の形状</label>
            <select
              id="stair-layout"
              value={resolveStairLayout(currentStair.stair)}
              onChange={(e) => handleStairField({ layout: e.target.value as StairLayout })}
            >
              {STAIR_LAYOUT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="editor-field">
            <label htmlFor="stair-orientation">上り方向</label>
            <select
              id="stair-orientation"
              value={
                currentStair.stair.orientation ??
                resolveStairOrientation(currentStair.stair, getStairBounds(currentStair.stair.polygon))
              }
              onChange={(e) => handleStairField({ orientation: e.target.value as StairOrientation })}
            >
              {STAIR_ORIENTATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="editor-field-hint">矢印と段差線の向きを変更します。</p>
          </div>

          <div className="editor-field">
            <span className="editor-offset-label">表示文字（UP / DOWN）</span>
            <div className="editor-swing-grid">
              <button
                type="button"
                className={`btn editor-swing-btn ${currentStair.stair.direction !== 'down' ? 'active' : ''}`}
                onClick={() => handleStairField({ direction: 'up', name: 'UP' })}
              >
                UP
              </button>
              <button
                type="button"
                className={`btn editor-swing-btn ${currentStair.stair.direction === 'down' ? 'active' : ''}`}
                onClick={() => handleStairField({ direction: 'down', name: 'DOWN' })}
              >
                DOWN
              </button>
            </div>
            <p className="editor-field-hint">
              間取図上の表記です。1階は通常 UP、2階は通常 DOWN にします。
            </p>
            <label className="editor-checkbox">
              <input
                type="checkbox"
                checked={currentStair.stair.showName !== false}
                onChange={(e) => handleStairField({ showName: e.target.checked })}
              />
              UP / DOWN を表示
            </label>
          </div>

          <div className="editor-field">
            <label htmlFor="stair-font-size">
              フォントサイズ（pt）
              {currentStair.stair.labelFontSize == null && (
                <span className="editor-field-default"> デフォルト {LABEL.defaultFontSize}pt</span>
              )}
            </label>
            <input
              id="stair-font-size"
              type="number"
              step="1"
              min={LABEL.fontSizeMin}
              max={LABEL.fontSizeMax}
              value={currentStair.stair.labelFontSize ?? LABEL.defaultFontSize}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                if (Number.isNaN(val)) return
                const clamped = Math.min(LABEL.fontSizeMax, Math.max(LABEL.fontSizeMin, val))
                if (clamped === LABEL.defaultFontSize) {
                  handleStairField({ labelFontSize: null })
                } else {
                  handleStairField({ labelFontSize: clamped })
                }
              }}
            />
          </div>

          <p className="editor-fixed-hint">階段は帖数を表示しません。</p>

          <div className="editor-field">
            <span className="editor-offset-heading">表示位置の調整</span>
            <p className="editor-offset-hint">数値入力または間取図上でラベルをドラッグ</p>
            <OffsetFields
              label="UP/DOWN"
              offset={currentStair.stair.nameLabelOffset}
              onChange={handleStairOffset}
              onReset={() => handleStairOffset({ x: 0, y: 0 })}
            />
          </div>

          <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDeleteStair}>
            この階段を削除
          </button>
        </div>
  )
}
