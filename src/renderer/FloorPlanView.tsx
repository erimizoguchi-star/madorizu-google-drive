import type { FloorPlan } from '../types/floorPlan'
import type { Point } from '../types/floorPlan'
import { ZoomableView } from '../components/ZoomableView'
import type { SelectedElementRef, SelectOptions } from '../utils/floorPlanEdit'
import type { RectEdge } from '../utils/roomGeometry'
import type { LabelLineKind } from './roomLabelLayout'
import { FloorCanvas } from './FloorCanvas'

interface FloorPlanViewProps {
  floorPlan: FloorPlan
  id?: string
  editable?: boolean
  selected?: SelectedElementRef | null
  mergeRoomIds?: { floorId: string; roomIds: string[] } | null
  onSelect?: (ref: SelectedElementRef, options?: SelectOptions) => void
  onLabelOffsetChange?: (ref: SelectedElementRef, kind: LabelLineKind, offset: Point) => void
  onRoomResize?: (
    ref: SelectedElementRef & { kind: 'room' },
    edge: RectEdge,
    positionFloorSvg: number
  ) => void
}

export function FloorPlanView({
  floorPlan,
  id = 'madorizu-export',
  editable,
  selected,
  mergeRoomIds,
  onSelect,
  onLabelOffsetChange,
  onRoomResize,
}: FloorPlanViewProps) {
  return (
    <div className="floor-plan-view" id={id}>
      <h2 className="floor-plan-title">{floorPlan.title}</h2>
      {onSelect && (
        <p className="edit-mode-hint">
          部屋・階段をクリックして選択。矩形の部屋は辺ドラッグでサイズ調整（部屋と辺の壁が連動）。Ctrl+クリックで複数選択→合成
        </p>
      )}
      <ZoomableView editInteractive={!!onSelect} className="floor-plan-zoom">
        <div className="floors-container">
          {floorPlan.floors.map((floor) => (
            <FloorCanvas
              key={floor.id}
              floor={floor}
              editable={editable}
              mergeRoomIds={
                mergeRoomIds?.floorId === floor.id ? mergeRoomIds.roomIds : undefined
              }
              selectedRoomId={
                selected?.kind === 'room' && selected.floorId === floor.id ? selected.roomId : null
              }
              selectedStairId={
                selected?.kind === 'stair' && selected.floorId === floor.id ? selected.stairId : null
              }
              onRoomSelect={
                onSelect
                  ? (roomId, additive) =>
                      onSelect({ kind: 'room', floorId: floor.id, roomId }, { additive })
                  : undefined
              }
              onStairSelect={
                onSelect ? (stairId) => onSelect({ kind: 'stair', floorId: floor.id, stairId }) : undefined
              }
              onRoomLabelOffsetChange={
                onLabelOffsetChange
                  ? (roomId, kind, offset) =>
                      onLabelOffsetChange({ kind: 'room', floorId: floor.id, roomId }, kind, offset)
                  : undefined
              }
              onStairLabelOffsetChange={
                onLabelOffsetChange
                  ? (stairId, kind, offset) =>
                      onLabelOffsetChange({ kind: 'stair', floorId: floor.id, stairId }, kind, offset)
                  : undefined
              }
              onRoomResize={
                onRoomResize && editable
                  ? (roomId, edge, positionFloorSvg) =>
                      onRoomResize({ kind: 'room', floorId: floor.id, roomId }, edge, positionFloorSvg)
                  : undefined
              }
            />
          ))}
        </div>
      </ZoomableView>
    </div>
  )
}
