import type { FloorPlan } from '../types/floorPlan'
import type { Point } from '../types/floorPlan'
import { ZoomableView } from '../components/ZoomableView'
import type { SelectedElementRef, SelectOptions } from '../utils/floorPlanEdit'
import {
  fixtureTypeFromPlaceKind,
  isFixturePlaceKind,
  type PlaceKind,
} from '../utils/floorPlanAdd'
import { fixtureTypeLabel } from '../constants/fixtureOptions'
import type { RectEdge } from '../utils/roomGeometry'
import type { LabelLineKind } from './roomLabelLayout'
import { FloorCanvas } from './FloorCanvas'

interface FloorPlanViewProps {
  floorPlan: FloorPlan
  id?: string
  editable?: boolean
  selected?: SelectedElementRef | null
  mergeRoomIds?: { floorId: string; roomIds: string[] } | null
  placeKind?: PlaceKind | null
  wallDraftStart?: Point | null
  onSelect?: (ref: SelectedElementRef, options?: SelectOptions) => void
  onLabelOffsetChange?: (ref: SelectedElementRef, kind: LabelLineKind, offset: Point) => void
  onRoomResize?: (
    ref: SelectedElementRef & { kind: 'room' },
    edge: RectEdge,
    positionFloorSvg: number
  ) => void
  onRoomMove?: (ref: SelectedElementRef & { kind: 'room' }, polygon: Point[]) => void
  onWallEndpointMove?: (
    ref: SelectedElementRef & { kind: 'wall' },
    endpoint: 'start' | 'end',
    position: Point
  ) => void
  onWallMove?: (ref: SelectedElementRef & { kind: 'wall' }, start: Point, end: Point) => void
  onDoorMove?: (ref: SelectedElementRef & { kind: 'door' }, position: Point) => void
  onWindowEndpointMove?: (
    ref: SelectedElementRef & { kind: 'window' },
    endpoint: 'start' | 'end',
    position: Point
  ) => void
  onWindowMove?: (ref: SelectedElementRef & { kind: 'window' }, start: Point, end: Point) => void
  onFixtureMove?: (ref: SelectedElementRef & { kind: 'fixture' }, position: Point) => void
  onPlaceClick?: (floorId: string, position: Point) => void
}

const BASE_PLACE_HINTS: Record<Exclude<PlaceKind, `fixture:${string}`>, string> = {
  room: '間取図上をクリックして部屋を配置（配置後ドラッグで移動できます）',
  door: '壁付近をクリックして扉を追加（続けて追加できます・Escで終了）',
  window: '壁付近をクリックして窓を追加（続けて追加できます・Escで終了）',
  opening: '壁付近をクリックして開口部を追加（続けて追加できます・Escで終了）',
  wall: '始点→終点の順にクリックして壁を追加',
}

function placeHint(kind: PlaceKind): string {
  if (isFixturePlaceKind(kind)) {
    return `間取図上をクリックして「${fixtureTypeLabel(fixtureTypeFromPlaceKind(kind))}」を配置（続けて追加可・Escで終了）`
  }
  return BASE_PLACE_HINTS[kind]
}

export function FloorPlanView({
  floorPlan,
  id = 'madorizu-export',
  editable,
  selected,
  mergeRoomIds,
  placeKind,
  onSelect,
  onLabelOffsetChange,
  onRoomResize,
  onRoomMove,
  onWallEndpointMove,
  onWallMove,
  onDoorMove,
  onWindowEndpointMove,
  onWindowMove,
  onFixtureMove,
  onPlaceClick,
}: FloorPlanViewProps) {
  const placing = !!placeKind && !!onPlaceClick

  return (
    <div className="floor-plan-view" id={id}>
      <h2 className="floor-plan-title">{floorPlan.title}</h2>
      {placing ? (
        <p className="edit-mode-hint place-mode-hint">{placeHint(placeKind)}</p>
      ) : (
        onSelect && (
          <p className="edit-mode-hint">
            部屋・壁・扉・窓・設備をクリックして選択。部屋はドラッグで移動、辺ハンドルでサイズ変更。追加は左パネルから。
          </p>
        )
      )}

      <ZoomableView editInteractive={!!onSelect || placing} className="floor-plan-zoom">
        <div className="floors-container">
          {floorPlan.floors.map((floor) => (
            <FloorCanvas
              key={floor.id}
              floor={floor}
              editable={editable && !placing}
              mergeRoomIds={
                mergeRoomIds?.floorId === floor.id ? mergeRoomIds.roomIds : undefined
              }
              selectedRoomId={
                selected?.kind === 'room' && selected.floorId === floor.id ? selected.roomId : null
              }
              selectedStairId={
                selected?.kind === 'stair' && selected.floorId === floor.id ? selected.stairId : null
              }
              selectedWallId={
                selected?.kind === 'wall' && selected.floorId === floor.id ? selected.wallId : null
              }
              selectedDoorId={
                selected?.kind === 'door' && selected.floorId === floor.id ? selected.doorId : null
              }
              selectedWindowId={
                selected?.kind === 'window' && selected.floorId === floor.id
                  ? selected.windowId
                  : null
              }
              selectedFixtureId={
                selected?.kind === 'fixture' && selected.floorId === floor.id
                  ? selected.fixtureId
                  : null
              }
              placeMode={placing}
              onPlaceClick={
                placing ? (pos) => onPlaceClick?.(floor.id, pos) : undefined
              }
              onRoomSelect={
                !placing && onSelect
                  ? (roomId, additive) =>
                      onSelect({ kind: 'room', floorId: floor.id, roomId }, { additive })
                  : undefined
              }
              onStairSelect={
                !placing && onSelect
                  ? (stairId) => onSelect({ kind: 'stair', floorId: floor.id, stairId })
                  : undefined
              }
              onWallSelect={
                !placing && onSelect
                  ? (wallId) => onSelect({ kind: 'wall', floorId: floor.id, wallId })
                  : undefined
              }
              onDoorSelect={
                !placing && onSelect
                  ? (doorId) => onSelect({ kind: 'door', floorId: floor.id, doorId })
                  : undefined
              }
              onWindowSelect={
                !placing && onSelect
                  ? (windowId) => onSelect({ kind: 'window', floorId: floor.id, windowId })
                  : undefined
              }
              onFixtureSelect={
                !placing && onSelect
                  ? (fixtureId) => onSelect({ kind: 'fixture', floorId: floor.id, fixtureId })
                  : undefined
              }
              onRoomLabelOffsetChange={
                !placing && onLabelOffsetChange
                  ? (roomId, kind, offset) =>
                      onLabelOffsetChange({ kind: 'room', floorId: floor.id, roomId }, kind, offset)
                  : undefined
              }
              onStairLabelOffsetChange={
                !placing && onLabelOffsetChange
                  ? (stairId, kind, offset) =>
                      onLabelOffsetChange(
                        { kind: 'stair', floorId: floor.id, stairId },
                        kind,
                        offset
                      )
                  : undefined
              }
              onRoomResize={
                onRoomResize && editable && !placing
                  ? (roomId, edge, positionFloorSvg) =>
                      onRoomResize(
                        { kind: 'room', floorId: floor.id, roomId },
                        edge,
                        positionFloorSvg
                      )
                  : undefined
              }
              onRoomMove={
                onRoomMove && editable && !placing
                  ? (roomId, polygon) =>
                      onRoomMove({ kind: 'room', floorId: floor.id, roomId }, polygon)
                  : undefined
              }
              onWallEndpointMove={
                onWallEndpointMove && editable && !placing
                  ? (wallId, endpoint, position) =>
                      onWallEndpointMove(
                        { kind: 'wall', floorId: floor.id, wallId },
                        endpoint,
                        position
                      )
                  : undefined
              }
              onWallMove={
                onWallMove && editable && !placing
                  ? (wallId, start, end) =>
                      onWallMove({ kind: 'wall', floorId: floor.id, wallId }, start, end)
                  : undefined
              }
              onDoorMove={
                onDoorMove && editable && !placing
                  ? (doorId, position) =>
                      onDoorMove({ kind: 'door', floorId: floor.id, doorId }, position)
                  : undefined
              }
              onWindowEndpointMove={
                onWindowEndpointMove && editable && !placing
                  ? (windowId, endpoint, position) =>
                      onWindowEndpointMove(
                        { kind: 'window', floorId: floor.id, windowId },
                        endpoint,
                        position
                      )
                  : undefined
              }
              onWindowMove={
                onWindowMove && editable && !placing
                  ? (windowId, start, end) =>
                      onWindowMove({ kind: 'window', floorId: floor.id, windowId }, start, end)
                  : undefined
              }
              onFixtureMove={
                onFixtureMove && editable && !placing
                  ? (fixtureId, position) =>
                      onFixtureMove({ kind: 'fixture', floorId: floor.id, fixtureId }, position)
                  : undefined
              }
            />
          ))}
        </div>
      </ZoomableView>
    </div>
  )
}
