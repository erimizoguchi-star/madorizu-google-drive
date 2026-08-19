import {
  DOOR_KIND_OPTIONS,
  DOOR_KINDS_WITH_SWING,
  DOOR_SWING_OPTIONS,
  doorKindLabel,
} from '../../constants/doorOptions'
import type { DoorKind, FloorPlan } from '../../types/floorPlan'
import {
  deleteDoor,
  findDoor,
  type SelectedElementRef,
  type SelectOptions,
  updateDoor,
} from '../../utils/floorPlanEdit'
import { svgUnitsToMm } from '../../utils/roomGeometry'

interface DoorPanelProps {
  floorPlan: FloorPlan
  selected: Extract<SelectedElementRef, { kind: 'door' }>
  onSelect: (ref: SelectedElementRef | null, options?: SelectOptions) => void
  onChange: (updater: (prev: FloorPlan) => FloorPlan) => void
}

export function DoorPanel({ floorPlan, selected, onSelect, onChange }: DoorPanelProps) {
  const applyPlan = onChange

  const currentDoor = findDoor(floorPlan, selected)

  const handleDoorField = (patch: Parameters<typeof updateDoor>[2]) => {
    applyPlan((prev) => updateDoor(prev, selected, patch))
  }

  const handleDeleteDoor = () => {
    if (!currentDoor) return
    if (!confirm('この扉を削除しますか？')) return
    applyPlan((prev) => deleteDoor(prev, selected))
    onSelect(null)
  }

  if (!currentDoor) return null

  return (
        <div className="room-editor-form">
          <h4>
            {(currentDoor.door.kind ?? 'swing') === 'opening' ? '開口部の詳細' : '扉の詳細'}
          </h4>
          <p className="editor-offset-hint">
            ドラッグで移動。種類・開き方向を変えると図上の記号がすぐ変わります。
          </p>
          <div className="editor-field">
            <label htmlFor="door-kind">種類</label>
            <select
              id="door-kind"
              value={currentDoor.door.kind ?? 'swing'}
              onChange={(e) => handleDoorField({ kind: e.target.value as DoorKind })}
            >
              {DOOR_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="editor-field-hint">
              {DOOR_KIND_OPTIONS.find((o) => o.value === (currentDoor.door.kind ?? 'swing'))?.hint}
            </p>
          </div>
          <div className="editor-field">
            <label htmlFor="door-width">幅（mm）</label>
            <input
              id="door-width"
              type="number"
              step={50}
              min={300}
              max={3000}
              value={Math.round(svgUnitsToMm(currentDoor.door.width))}
              onChange={(e) => {
                const widthMm = parseInt(e.target.value, 10)
                if (Number.isNaN(widthMm)) return
                handleDoorField({ widthMm })
              }}
            />
          </div>
          <div className="editor-field">
            <label htmlFor="door-angle">戸の向き（壁沿い）</label>
            <select
              id="door-angle"
              value={((((Math.round(currentDoor.door.angle / 90) % 4) + 4) % 4) * 90)}
              onChange={(e) => handleDoorField({ angle: Number(e.target.value) })}
            >
              <option value={0}>右方向（0°）</option>
              <option value={90}>下方向（90°）</option>
              <option value={180}>左方向（180°）</option>
              <option value={270}>上方向（270°）</option>
            </select>
            <p className="editor-field-hint">閉じたときの戸が壁に沿って伸びる向きです。</p>
          </div>
          {DOOR_KINDS_WITH_SWING.has(currentDoor.door.kind ?? 'swing') && (
            <div className="editor-field">
              <span className="editor-offset-label">開閉の向き</span>
              <div className="editor-swing-grid">
                {DOOR_SWING_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`btn editor-swing-btn ${currentDoor.door.swing === opt.value ? 'active' : ''}`}
                    onClick={() => handleDoorField({ swing: opt.value })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="editor-field-hint">
                {DOOR_SWING_OPTIONS.find((o) => o.value === currentDoor.door.swing)?.hint}
              </p>
              <button
                type="button"
                className="btn btn-secondary editor-flip-hinge-btn"
                onClick={() => handleDoorField({ flipHinge: true })}
              >
                丁番の位置を反対側へ
              </button>
              <p className="editor-field-hint">開き始点（丁番）を開口の反対端に移します。</p>
            </div>
          )}
          <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDeleteDoor}>
            この{doorKindLabel(currentDoor.door.kind)}を削除
          </button>
        </div>
  )
}
