import { STAIR_LAYOUT_OPTIONS, STAIR_ORIENTATION_OPTIONS } from '../../constants/stairOptions'
import { LABEL } from '../../renderer/styles'
import {
  effectiveStairSteps,
  effectiveStairSteps2,
  getStairBounds,
  isLShapeLayout,
  lStairGeometry,
  resolveStairLayout,
  resolveStairOrientation,
} from '../../renderer/stairGraphics'
import type { FloorPlan, Point, StairLayout, StairOrientation } from '../../types/floorPlan'
import {
  deleteStair,
  findStair,
  STAIR_MAX_STEPS,
  STAIR_MIN_STEPS,
  type SelectedElementRef,
  type SelectOptions,
  updateStair,
} from '../../utils/floorPlanEdit'
import { getStairLengthMm, STAIR_DEFAULT_WIDTH_MM } from '../../utils/resizeStair'
import { mmToSvgUnits, svgUnitsToMm } from '../../utils/roomGeometry'
import { OffsetFields } from './OffsetFields'
import { NumberField } from '../NumberField'

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
  const lShape = isLShapeLayout(currentStair.stair.layout)
  const lGeometry = lShape ? lStairGeometry(currentStair.stair, getStairBounds(currentStair.stair.polygon)) : null

  return (
        <div className="room-editor-form">
          <h4>階段の詳細</h4>

          <div className="editor-field">
            <label htmlFor="stair-width">幅（mm）</label>
            <NumberField
              id="stair-width"
              min={600}
              max={1500}
              step={10}
              value={currentStair.stair.widthMm ?? STAIR_DEFAULT_WIDTH_MM}
              onCommit={(widthMm) => widthMm != null && handleStairField({ widthMm })}
            />
            <p className="editor-field-hint">
              標準幅は {STAIR_DEFAULT_WIDTH_MM}mm です。{lShape ? 'L字・2方向に段では、段の幅（通路の幅）です。' : ''}
            </p>
          </div>

          <div className="editor-field">
            <label htmlFor="stair-length">長さ（mm）</label>
            <NumberField
              id="stair-length"
              min={900}
              max={9000}
              step={50}
              value={getStairLengthMm(currentStair.stair)}
              onCommit={(lengthMm) => lengthMm != null && handleStairField({ lengthMm })}
            />
            <p className="editor-field-hint">
              {lShape ? '曲がる前の長さ（角を含む）です。' : '上り方向の長さです。上り始め側は動きません。'}
            </p>
          </div>

          {lGeometry && (
            <div className="editor-field">
              <label htmlFor="stair-turn-length">曲がったあとの長さ（mm）</label>
              <NumberField
                id="stair-turn-length"
                min={900}
                max={9000}
                step={50}
                value={Math.round(svgUnitsToMm(lGeometry.W))}
                onCommit={(turnLengthMm) => turnLengthMm != null && handleStairField({ turnLengthMm })}
              />
              <p className="editor-field-hint">角を含む長さです。上り始めの側は動きません。</p>
            </div>
          )}

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
            <label htmlFor="stair-steps">段の数</label>
            <NumberField
              id="stair-steps"
              min={STAIR_MIN_STEPS}
              max={STAIR_MAX_STEPS}
              step={1}
              value={effectiveStairSteps(currentStair.stair)}
              onCommit={(steps) => steps != null && handleStairField({ steps })}
            />
            <p className="editor-field-hint">
              {currentStair.stair.steps == null ? '今は自動で決めています。' : ''}
              直線は全体、L字はまっすぐな部分（2方向に段は曲がる前）、U字は片側ごとの段数です（曲がる部分の回り段は含みません）。
            </p>
            {currentStair.stair.steps != null && (
              <button type="button" className="editor-reset-btn" onClick={() => handleStairField({ steps: null })}>
                自動に戻す
              </button>
            )}
          </div>

          {lShape && (
            <div className="editor-field">
              <label htmlFor="stair-steps2">曲がったあとの段の数</label>
              <NumberField
                id="stair-steps2"
                min={STAIR_MIN_STEPS}
                max={STAIR_MAX_STEPS}
                step={1}
                value={effectiveStairSteps2(currentStair.stair)}
                onCommit={(steps2) => steps2 != null && handleStairField({ steps2 })}
              />
              {currentStair.stair.steps2 != null && (
                <button type="button" className="editor-reset-btn" onClick={() => handleStairField({ steps2: null })}>
                  自動に戻す
                </button>
              )}
            </div>
          )}

          {lShape && (
            <div className="editor-field">
              <label htmlFor="stair-corner">角の作り</label>
              <select
                id="stair-corner"
                value={currentStair.stair.corner ?? 'winder'}
                onChange={(e) => handleStairField({ corner: e.target.value as 'winder' | 'landing' })}
              >
                <option value="winder">回り段（扇形の段）</option>
                <option value="landing">踊り場</option>
              </select>
            </div>
          )}

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
            <p className="editor-field-hint">
              上る向きです（L字・U字は最初に上る向き。L字・下で曲がる形は曲がったあとの向き）。
            </p>
          </div>

          <div className="editor-field">
            <span className="editor-offset-label">この階での表記（UP / DN）</span>
            <div className="editor-swing-grid">
              <button
                type="button"
                className={`btn editor-swing-btn ${currentStair.stair.direction !== 'down' ? 'active' : ''}`}
                onClick={() => handleStairField({ direction: 'up' })}
              >
                UP
              </button>
              <button
                type="button"
                className={`btn editor-swing-btn ${currentStair.stair.direction === 'down' ? 'active' : ''}`}
                onClick={() => handleStairField({ direction: 'down' })}
              >
                DN
              </button>
            </div>
            <p className="editor-field-hint">
              1階は UP（上り始めから矢印）、2階は DN（上り終わり側から下りの矢印）にします。上り方向は変わりません。
            </p>
            {currentStair.stair.direction !== 'down' && (
              <label className="editor-checkbox">
                <input
                  type="checkbox"
                  checked={!!currentStair.stair.cutLine}
                  onChange={(e) => handleStairField({ cutLine: e.target.checked })}
                />
                破断線を入れる（先の段は破線、矢印は破断線まで）
              </label>
            )}
            <label className="editor-checkbox">
              <input
                type="checkbox"
                checked={currentStair.stair.showName !== false}
                onChange={(e) => handleStairField({ showName: e.target.checked })}
              />
              UP / DN を表示
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
