import {
  defaultFixtureSizeMm,
  FIXTURE_TYPE_OPTIONS,
  fixtureTypeLabel,
  normalizeFixtureAngle,
} from '../../constants/fixtureOptions'
import type { FloorPlan } from '../../types/floorPlan'
import {
  deleteFixture,
  findFixture,
  type SelectedElementRef,
  type SelectOptions,
  updateFixture,
} from '../../utils/floorPlanEdit'
import { svgUnitsToMm } from '../../utils/roomGeometry'

interface FixturePanelProps {
  floorPlan: FloorPlan
  selected: Extract<SelectedElementRef, { kind: 'fixture' }>
  onSelect: (ref: SelectedElementRef | null, options?: SelectOptions) => void
  onChange: (updater: (prev: FloorPlan) => FloorPlan) => void
}

export function FixturePanel({ floorPlan, selected, onSelect, onChange }: FixturePanelProps) {
  const applyPlan = onChange

  const currentFixture = findFixture(floorPlan, selected)

  const handleDeleteFixture = () => {
    if (!currentFixture) return
    if (!confirm('この設備を削除しますか？')) return
    applyPlan((prev) => deleteFixture(prev, selected))
    onSelect(null)
  }

  if (!currentFixture) return null

  return (
        <div className="room-editor-form">
          <h4>設備の詳細</h4>
          <div className="editor-field">
            <label htmlFor="fixture-type">種類</label>
            <select
              id="fixture-type"
              value={currentFixture.fixture.type}
              onChange={(e) =>
                applyPlan((prev) =>
                  updateFixture(prev, selected, {
                    type: e.target.value as (typeof FIXTURE_TYPE_OPTIONS)[number]['value'],
                  })
                )
              }
            >
              {FIXTURE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <p className="editor-field-hint">{fixtureTypeLabel(currentFixture.fixture.type)}</p>

          <div className="editor-field-row">
            <div className="editor-field">
              <label htmlFor="fixture-width">幅（mm）</label>
              <input
                id="fixture-width"
                type="number"
                step={10}
                min={100}
                max={6000}
                value={Math.round(svgUnitsToMm(currentFixture.fixture.width))}
                onChange={(e) => {
                  const widthMm = parseInt(e.target.value, 10)
                  if (Number.isNaN(widthMm) || widthMm <= 0) return
                  applyPlan((prev) => updateFixture(prev, selected, { widthMm }))
                }}
              />
            </div>
            <div className="editor-field">
              <label htmlFor="fixture-height">奥行き（mm）</label>
              <input
                id="fixture-height"
                type="number"
                step={10}
                min={100}
                max={6000}
                value={Math.round(svgUnitsToMm(currentFixture.fixture.height))}
                onChange={(e) => {
                  const heightMm = parseInt(e.target.value, 10)
                  if (Number.isNaN(heightMm) || heightMm <= 0) return
                  applyPlan((prev) => updateFixture(prev, selected, { heightMm }))
                }}
              />
            </div>
          </div>
          <p className="editor-field-hint">
            図面の上下方向が「奥行き」です。標準は{' '}
            {defaultFixtureSizeMm(currentFixture.fixture.type).widthMm} ×{' '}
            {defaultFixtureSizeMm(currentFixture.fixture.type).heightMm} mm。
          </p>

          <div className="editor-field">
            <label htmlFor="fixture-angle">向き（回転）</label>
            <select
              id="fixture-angle"
              value={normalizeFixtureAngle(currentFixture.fixture.angle)}
              onChange={(e) =>
                applyPlan((prev) =>
                  updateFixture(prev, selected, { angle: Number(e.target.value) })
                )
              }
            >
              <option value={0}>0°（そのまま）</option>
              <option value={90}>90°（右へ）</option>
              <option value={180}>180°（上下反転）</option>
              <option value={270}>270°（左へ）</option>
            </select>
          </div>
          <div className="editor-nudge-row">
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() =>
                applyPlan((prev) =>
                  updateFixture(prev, selected, {
                    angle: (normalizeFixtureAngle(currentFixture.fixture.angle) + 270) % 360,
                  })
                )
              }
            >
              ↺ 左に90°
            </button>
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() =>
                applyPlan((prev) =>
                  updateFixture(prev, selected, {
                    angle: (normalizeFixtureAngle(currentFixture.fixture.angle) + 90) % 360,
                  })
                )
              }
            >
              ↻ 右に90°
            </button>
          </div>
          <button
            type="button"
            className="btn editor-nudge-btn"
            onClick={() => {
              const size = defaultFixtureSizeMm(currentFixture.fixture.type)
              applyPlan((prev) =>
                updateFixture(prev, selected, {
                  widthMm: size.widthMm,
                  heightMm: size.heightMm,
                })
              )
            }}
          >
            標準サイズに戻す
          </button>

          <p className="editor-offset-hint">
            枠をドラッグで移動、四隅の■をドラッグで大きさを変更できます（10mm 刻み）。
          </p>
          <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDeleteFixture}>
            この設備を削除
          </button>
        </div>
  )
}
