import { DOOR_KIND_OPTIONS, DOOR_KINDS_WITH_SWING } from '../constants/doorOptions'
import { WINDOW_KIND_OPTIONS, normalizeWindowKind } from '../constants/windowOptions'
import type { DoorKind, FloorPlan, WindowKind } from '../types/floorPlan'
import {
  cycleDoorOrientation,
  findDoor,
  findWindow,
  updateDoor,
  updateWindow,
  type SelectedElementRef,
} from '../utils/floorPlanEdit'
import { svgUnitsToMm } from '../utils/roomGeometry'
import { hasWindowDirection } from '../utils/windowOrientation'

interface SelectionToolbarProps {
  floorPlan: FloorPlan
  selected: SelectedElementRef
  onChange: (updater: (prev: FloorPlan) => FloorPlan) => void
  onDelete: () => void
}

/**
 * 選んだ扉・窓のすぐ上に出す小さなメニュー。よく使う「種類・向き・幅・削除」だけを、
 * 左のパネルまで行かずにその場で変えられる。細かい設定は左のパネルに残す。
 */
export function SelectionToolbar({ floorPlan, selected, onChange, onDelete }: SelectionToolbarProps) {
  if (selected.kind === 'door') {
    const found = findDoor(floorPlan, selected)
    if (!found) return null
    const { door } = found
    const kind = door.kind ?? 'swing'
    return (
      <div className="selection-toolbar" data-no-pan>
        <select
          aria-label="扉の種類"
          value={kind}
          onChange={(e) => onChange((prev) => updateDoor(prev, selected, { kind: e.target.value as DoorKind }))}
        >
          {DOOR_KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {DOOR_KINDS_WITH_SWING.has(kind) && (
          <button
            type="button"
            className="selection-toolbar__btn"
            title="押すたびに、開く向き（吊元と開く側の4通り）が順に変わります（R キー）"
            onClick={() => onChange((prev) => cycleDoorOrientation(prev, selected))}
          >
            ↻ 向き
          </button>
        )}
        <WidthField
          valueMm={Math.round(svgUnitsToMm(door.width))}
          max={3000}
          onChange={(widthMm) => onChange((prev) => updateDoor(prev, selected, { widthMm }))}
        />
        <button type="button" className="selection-toolbar__btn is-danger" title="削除（Delete キー）" onClick={onDelete}>
          削除
        </button>
      </div>
    )
  }

  if (selected.kind === 'window') {
    const found = findWindow(floorPlan, selected)
    if (!found) return null
    const win = found.window
    const widthMm = Math.round(svgUnitsToMm(Math.hypot(win.end.x - win.start.x, win.end.y - win.start.y)))
    return (
      <div className="selection-toolbar" data-no-pan>
        <select
          aria-label="窓の種類"
          value={normalizeWindowKind(win.kind)}
          onChange={(e) =>
            onChange((prev) => updateWindow(prev, selected, { kind: e.target.value as WindowKind }))
          }
        >
          {WINDOW_KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {hasWindowDirection(win.kind) && (
          <button
            type="button"
            className="selection-toolbar__btn"
            title="開く向きを反対にします（R キー）"
            onClick={() =>
              onChange((prev) => updateWindow(prev, selected, { outward: win.outward === -1 ? 1 : -1 }))
            }
          >
            ⇄ 向き
          </button>
        )}
        <WidthField
          valueMm={widthMm}
          max={6000}
          onChange={(next) => onChange((prev) => updateWindow(prev, selected, { widthMm: next }))}
        />
        <button type="button" className="selection-toolbar__btn is-danger" title="削除（Delete キー）" onClick={onDelete}>
          削除
        </button>
      </div>
    )
  }

  return null
}

function WidthField({ valueMm, max, onChange }: { valueMm: number; max: number; onChange: (mm: number) => void }) {
  return (
    <label className="selection-toolbar__width">
      幅
      <input
        type="number"
        step={50}
        min={300}
        max={max}
        value={valueMm}
        onChange={(e) => {
          const next = parseInt(e.target.value, 10)
          if (!Number.isNaN(next)) onChange(next)
        }}
      />
      mm
    </label>
  )
}
