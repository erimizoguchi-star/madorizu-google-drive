import type { FloorPlan } from '../../types/floorPlan'
import {
  deleteWall,
  findWall,
  type SelectedElementRef,
  type SelectOptions,
} from '../../utils/floorPlanEdit'
import { addDoorOnWall, addWindowOnWall } from '../../utils/floorPlanAdd'

interface WallPanelProps {
  floorPlan: FloorPlan
  selected: Extract<SelectedElementRef, { kind: 'wall' }>
  onSelect: (ref: SelectedElementRef | null, options?: SelectOptions) => void
  onChange: (updater: (prev: FloorPlan) => FloorPlan) => void
  onError?: (message: string | null) => void
}

export function WallPanel({ floorPlan, selected, onSelect, onChange, onError }: WallPanelProps) {
  const applyPlan = onChange

  const currentWall = findWall(floorPlan, selected)

  const handleDeleteWall = () => {
    if (!currentWall) return
    const label = currentWall.wall.exterior ? '外壁' : '内壁'
    if (!confirm(`${label}（${currentWall.wall.id}）を削除しますか？`)) return
    applyPlan((prev) => deleteWall(prev, selected))
    onSelect(null)
  }

  const placeOnThisWall = (kind: 'door' | 'window' | 'opening') => {
    const { floorId, wallId } = selected
    const result =
      kind === 'window'
        ? addWindowOnWall(floorPlan, floorId, wallId)
        : addDoorOnWall(floorPlan, floorId, wallId, {
            kind: kind === 'opening' ? 'opening' : 'swing',
          })
    if ('error' in result) {
      onError?.(result.error)
      return
    }
    onError?.(null)
    applyPlan(() => result.floorPlan)
    if ('doorId' in result) {
      onSelect({ kind: 'door', floorId, doorId: result.doorId })
    } else {
      onSelect({ kind: 'window', floorId, windowId: result.windowId })
    }
  }

  if (!currentWall) return null

  return (
        <div className="room-editor-form">
          <h4>壁の詳細</h4>
          <p className="editor-field-hint">
            {currentWall.wall.exterior ? '外壁（建物の輪郭）' : '内壁'}
          </p>
          <p className="editor-offset-hint">
            端点（●）で長さ変更、中央（○）で平行移動。外壁を動かすと接している部屋の形状も追従します。
          </p>
          <p className="editor-field-hint">
            壁は部屋の形から自動生成されますが、<strong>手動で追加・調整した壁は作り直されず残ります</strong>。
            自動生成の壁は、部屋を移動・変形・合成すると引き直されます。
          </p>
          <div className="editor-field">
            <span className="editor-field-label">この壁に追加</span>
            <div className="editor-add-row">
              <button type="button" className="btn btn-secondary editor-add-btn" onClick={() => placeOnThisWall('door')}>
                扉
              </button>
              <button type="button" className="btn btn-secondary editor-add-btn" onClick={() => placeOnThisWall('window')}>
                窓
              </button>
              <button type="button" className="btn btn-secondary editor-add-btn" onClick={() => placeOnThisWall('opening')}>
                開口
              </button>
            </div>
            <p className="editor-field-hint">壁の中央に配置されます。位置はあとからドラッグで調整できます。</p>
          </div>
          <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDeleteWall}>
            この壁を削除
          </button>
        </div>
  )
}
