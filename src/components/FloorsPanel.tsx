import type { FloorPlan } from '../types/floorPlan'
import { moveFloor, removeFloor, renameFloor } from '../utils/floorPlanFloors'

interface FloorsPanelProps {
  floorPlan: FloorPlan
  /** coalesce: true は名前の入力中など、連続した変更を1回の操作にまとめる */
  onChange: (next: FloorPlan, options?: { coalesce?: boolean }) => void
  /** 階を削除したとき。選択中の部屋などが消えた階を指さないように解除する */
  onFloorRemoved: () => void
}

/** 間取図にある階の一覧。名前の変更・並べ替え・削除ができる */
export function FloorsPanel({ floorPlan, onChange, onFloorRemoved }: FloorsPanelProps) {
  const { floors } = floorPlan
  return (
    <div className="floors-panel">
      <h4>階</h4>
      <ul className="floors-panel__list">
        {floors.map((floor, i) => (
          <li key={floor.id} className="floors-panel__item">
            <input
              type="text"
              value={floor.label}
              aria-label={`${i + 1}番目の階の名前`}
              onChange={(e) => onChange(renameFloor(floorPlan, floor.id, e.target.value), { coalesce: true })}
            />
            <button
              type="button"
              className="btn btn-secondary floors-panel__btn"
              disabled={i === 0}
              title="左へ"
              aria-label={`${floor.label}を左へ`}
              onClick={() => onChange(moveFloor(floorPlan, floor.id, -1))}
            >
              ◀
            </button>
            <button
              type="button"
              className="btn btn-secondary floors-panel__btn"
              disabled={i === floors.length - 1}
              title="右へ"
              aria-label={`${floor.label}を右へ`}
              onClick={() => onChange(moveFloor(floorPlan, floor.id, 1))}
            >
              ▶
            </button>
            {floors.length > 1 && (
              <button
                type="button"
                className="btn btn-secondary floors-panel__btn"
                title="この階を削除"
                aria-label={`${floor.label}を削除`}
                onClick={() => {
                  if (!window.confirm(`「${floor.label}」を間取図から削除しますか？（編集中の「一手戻る」で戻せます）`)) return
                  onChange(removeFloor(floorPlan, floor.id))
                  onFloorRemoved()
                }}
              >
                削除
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="floors-panel__hint">
        {floors.length > 1
          ? '左から順に並べて1枚にします。名前は間取図の各階の上に出ます。'
          : '別の階の図面は、上で選んで「今の間取図に階として追加」を押すと横に並びます。'}
      </p>
    </div>
  )
}
