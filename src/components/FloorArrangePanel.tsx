import { useState } from 'react'
import type { Floor, FloorLayout, FloorPlan } from '../types/floorPlan'
import { areaScaleSuggestion, buildingSizeMm, scaleFloorToWidth, scaleFloorUniform } from '../utils/floorArrange'

interface FloorArrangePanelProps {
  floorPlan: FloorPlan
  onChange: (updater: (prev: FloorPlan) => FloorPlan) => void
}

const ALIGN_LABELS: Record<NonNullable<FloorLayout['direction']>, Record<NonNullable<FloorLayout['align']>, string>> = {
  row: { start: '上', center: '中央', end: '下' },
  column: { start: '左', center: '中央', end: '右' },
}

const fmt = (mm: number) => Math.round(mm).toLocaleString()

function mapFloor(plan: FloorPlan, floorId: string, fn: (floor: Floor) => Floor): FloorPlan {
  return { ...plan, floors: plan.floors.map((f) => (f.id === floorId ? fn(f) : f)) }
}

/**
 * 階の大きさと並べ方。編集が終わったあと、各階の縮尺をそろえて並べる。
 * 階ごとに別の図面を解析すると、AI の読み違いで片方の階だけ大きく（小さく）なることがあるので、
 * 図面の帖数か建物の幅で各階を正しい大きさに直す。
 */
export function FloorArrangePanel({ floorPlan, onChange }: FloorArrangePanelProps) {
  const direction = floorPlan.layout?.direction ?? 'row'
  const align = floorPlan.layout?.align ?? 'start'
  const suggestions = floorPlan.floors.map((f) => areaScaleSuggestion(f))
  const anySuggestion = suggestions.some(Boolean)
  const setLayout = (patch: FloorLayout) => onChange((prev) => ({ ...prev, layout: { ...prev.layout, ...patch } }))

  return (
    <div className="floor-arrange">
      <h4>階の大きさと並べ方</h4>
      <ul className="floor-arrange__list">
        {floorPlan.floors.map((floor, i) => {
          const size = buildingSizeMm(floor)
          const suggestion = suggestions[i]
          return (
            <li key={floor.id} className="floor-arrange__floor">
              <div className="floor-arrange__head">
                <strong>{floor.label}</strong>
                {size && (
                  <span className="floor-arrange__size">
                    建物 {fmt(size.widthMm)} × {fmt(size.depthMm)} mm
                  </span>
                )}
              </div>
              {size && (
                <WidthInput
                  key={Math.round(size.widthMm)}
                  widthMm={size.widthMm}
                  onApply={(widthMm) => onChange((prev) => mapFloor(prev, floor.id, (f) => scaleFloorToWidth(f, widthMm)))}
                />
              )}
              {suggestion ? (
                <div className="floor-arrange__suggest">
                  帖数から見ると約 {Math.round(Math.abs(1 / suggestion.scale - 1) * 100)}%
                  {suggestion.scale < 1 ? '大きく' : '小さく'}描かれています
                  <button
                    type="button"
                    className="btn btn-secondary floor-arrange__btn"
                    onClick={() =>
                      onChange((prev) => mapFloor(prev, floor.id, (f) => scaleFloorUniform(f, suggestion.scale)))
                    }
                  >
                    帖数に合わせる
                  </button>
                </div>
              ) : (
                <p className="floor-arrange__ok">✓ 帖数と大きさは合っています（帖数のある部屋が2つ以上のときに判定）</p>
              )}
            </li>
          )
        })}
      </ul>
      {anySuggestion && floorPlan.floors.length > 1 && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            onChange((prev) => ({
              ...prev,
              floors: prev.floors.map((f) => {
                const s = areaScaleSuggestion(f)
                return s ? scaleFloorUniform(f, s.scale) : f
              }),
            }))
          }
        >
          すべての階を帖数に合わせる（縮尺をそろえる）
        </button>
      )}

      {floorPlan.floors.length > 1 && (
        <div className="floor-arrange__layout">
          <div className="floor-arrange__row">
            <span>並べ方</span>
            {(['row', 'column'] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`btn btn-secondary floor-arrange__btn ${direction === d ? 'active' : ''}`}
                onClick={() => setLayout({ direction: d })}
              >
                {d === 'row' ? '横に並べる' : '縦に並べる'}
              </button>
            ))}
          </div>
          <div className="floor-arrange__row">
            <span>そろえる</span>
            {(['start', 'center', 'end'] as const).map((a) => (
              <button
                key={a}
                type="button"
                className={`btn btn-secondary floor-arrange__btn ${align === a ? 'active' : ''}`}
                onClick={() => setLayout({ align: a })}
              >
                {ALIGN_LABELS[direction][a]}
              </button>
            ))}
          </div>
          <p className="floor-arrange__hint">建物の外形でそろえます。出力する画像も、この並びのとおりになります。</p>
        </div>
      )}
    </div>
  )
}

/** 建物の幅（mm）。打ち込んでいる途中で縮まないよう、Enter か欄を離れたときに反映する */
function WidthInput({ widthMm, onApply }: { widthMm: number; onApply: (mm: number) => void }) {
  const [draft, setDraft] = useState(String(Math.round(widthMm)))
  const apply = () => {
    const next = parseInt(draft, 10)
    if (Number.isNaN(next) || next < 1000 || Math.abs(next - widthMm) < 1) {
      setDraft(String(Math.round(widthMm)))
      return
    }
    onApply(next)
  }
  return (
    <label className="floor-arrange__width" title="図面の寸法線で分かる建物の幅を入れると、縦横同じ倍率で直します">
      幅を
      <input
        type="number"
        step={10}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      mm にする
    </label>
  )
}
