import type { Point } from '../../types/floorPlan'

/** ラベル位置の X/Y 入力（部屋・階段のパネルで共用） */
function parseOffsetInput(value: string): number | null {
  if (value.trim() === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function OffsetFields({
  label,
  offset,
  onChange,
  onReset,
}: {
  label: string
  offset?: Point
  onChange: (offset: Point) => void
  onReset: () => void
}) {
  const x = offset?.x ?? 0
  const y = offset?.y ?? 0
  return (
    <div className="editor-offset-group">
      <span className="editor-offset-label">{label}</span>
      <div className="editor-offset-inputs">
        <label>
          X
          <input
            type="number"
            step="1"
            value={x}
            onChange={(e) => {
              const nx = parseOffsetInput(e.target.value)
              if (nx === null) return
              onChange({ x: nx, y })
            }}
          />
        </label>
        <label>
          Y
          <input
            type="number"
            step="1"
            value={y}
            onChange={(e) => {
              const ny = parseOffsetInput(e.target.value)
              if (ny === null) return
              onChange({ x, y: ny })
            }}
          />
        </label>
        {(x !== 0 || y !== 0) && (
          <button type="button" className="editor-reset-btn" onClick={onReset}>
            リセット
          </button>
        )}
      </div>
    </div>
  )
}
