import { useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import type { Fixture, Floor } from '../types/floorPlan'
import type { Point } from '../types/floorPlan'
import type { LabelLineKind } from './roomLabelLayout'
import { CANVAS } from './styles'
import { DoorRenderer } from './DoorRenderer'
import { doorPaintExtentPoints } from './doorPaintBounds'
import { FLOOR_CANVAS_PADDING, getFloorBounds } from './floorCanvasGeometry'
import { FixtureRenderer } from './FixtureRenderer'
import { NorthArrow } from './NorthArrow'
import { RoomLabels } from './RoomLabels'
import { computeRoomLabelLayout, computeStairLabelLayout } from './roomLabelLayout'
import { RoomRenderer } from './RoomRenderer'
import { RoomResizeHandles } from './RoomResizeHandles'
import { StairRenderer } from './StairRenderer'
import { WallRenderer } from './WallRenderer'
import { WindowRenderer } from './WindowRenderer'
import { TextLabelRenderer } from './TextLabelRenderer'
import { WallEditHandles } from './WallEditHandles'
import { WindowEditHandles } from './WindowEditHandles'
import { FixtureEditHandles } from './FixtureEditHandles'
import { GridLinesLayer, type GridLineDragHandler } from './GridLinesLayer'
import { SelectionToolbarAnchor } from './SelectionToolbarAnchor'
import type { FixtureCorner } from '../utils/floorPlanDrag'
import { parseAxisAlignedRect, type RectEdge } from '../utils/roomGeometry'
import { clientToSvg, canvasToFloor, isSvgDragging, subscribeSvgDrag } from './svgCoords'
import { useZoom } from '../components/zoomContext'
import { EDGE_SNAP_MAX, otherEdgeValues, snapPolygonToEdges, snapToNearest } from '../utils/alignWalls'

/** 部屋の辺がほかの部屋の辺へ吸い付く距離（画面上の px） */
const EDGE_SNAP_PX = 8

interface FloorCanvasProps {
  floor: Floor
  padding?: number
  editable?: boolean
  mergeRoomIds?: string[]
  selectedRoomId?: string | null
  selectedStairId?: string | null
  selectedWallId?: string | null
  selectedDoorId?: string | null
  selectedWindowId?: string | null
  selectedFixtureId?: string | null
  selectedTextId?: string | null
  onRoomSelect?: (roomId: string, additive?: boolean) => void
  onStairSelect?: (stairId: string) => void
  onStairMove?: (stairId: string, polygonFloor: Point[]) => void
  onWallSelect?: (wallId: string) => void
  onDoorSelect?: (doorId: string) => void
  onWindowSelect?: (windowId: string) => void
  onFixtureSelect?: (fixtureId: string) => void
  onTextSelect?: (textId: string) => void
  onRoomLabelOffsetChange?: (roomId: string, kind: LabelLineKind, offset: Point) => void
  onStairLabelOffsetChange?: (stairId: string, kind: LabelLineKind, offset: Point) => void
  onRoomResize?: (roomId: string, edge: RectEdge, positionFloorSvg: number) => void
  onRoomMove?: (roomId: string, polygonFloor: Point[]) => void
  onWallEndpointMove?: (wallId: string, endpoint: 'start' | 'end', positionFloor: Point) => void
  onWallMove?: (wallId: string, start: Point, end: Point) => void
  onDoorMove?: (doorId: string, position: Point) => void
  onWindowEndpointMove?: (windowId: string, endpoint: 'start' | 'end', position: Point) => void
  onWindowMove?: (windowId: string, start: Point, end: Point) => void
  onFixtureMove?: (fixtureId: string, position: Point) => void
  onFixtureResize?: (fixtureId: string, corner: FixtureCorner, position: Point, start: Fixture) => void
  onTextMove?: (textId: string, position: Point) => void
  /** 追加配置モード時のクリック（floor 座標） */
  placeMode?: boolean
  /** 壁追加モードで1点目をクリックした位置（floor 座標） */
  wallDraftStart?: Point | null
  onPlaceClick?: (positionFloor: Point) => void
  /** 「線を合わせる」のとき、通りをドラッグしたとき */
  onGridLineDrag?: GridLineDragHandler
  /** 選んだ部屋・扉・窓の上に出すメニュー（この階の要素が選ばれているときだけ渡される） */
  selectionToolbar?: ReactNode
  /** 部屋（または部屋名）をダブルクリックしたとき。名前をすぐ打ち込めるようにする */
  onRoomDoubleClick?: (roomId: string) => void
  /** 階を並べるときの位置合わせ（建物の外形をそろえるための余白） */
  wrapperStyle?: CSSProperties
}

export function FloorCanvas({
  floor,
  padding = FLOOR_CANVAS_PADDING,
  editable,
  mergeRoomIds,
  selectedRoomId,
  selectedStairId,
  selectedWallId,
  selectedDoorId,
  selectedWindowId,
  selectedFixtureId,
  selectedTextId,
  onRoomSelect,
  onStairSelect,
  onStairMove,
  onWallSelect,
  onDoorSelect,
  onWindowSelect,
  onFixtureSelect,
  onTextSelect,
  onRoomLabelOffsetChange,
  onStairLabelOffsetChange,
  onRoomResize,
  onRoomMove,
  onWallEndpointMove,
  onWallMove,
  onDoorMove,
  onWindowEndpointMove,
  onWindowMove,
  onFixtureMove,
  onFixtureResize,
  onTextMove,
  placeMode,
  wallDraftStart,
  onPlaceClick,
  onGridLineDrag,
  selectionToolbar,
  onRoomDoubleClick,
  wrapperStyle,
}: FloorCanvasProps) {
  // ドラッグ中に描画範囲が変わると図面が伸縮し、掴んだ要素がカーソルから離れてしまう。
  // ドラッグしている間は範囲を固定し、離した時点で新しい範囲に合わせ直す。
  const dragging = useSyncExternalStore(subscribeSvgDrag, isSvgDragging, () => false)
  const liveBounds = getFloorBounds(floor)
  // dragging が false→true に変わった瞬間の範囲を memo に固定する。
  // ドラッグ中は floor が変わっても再計算されないのが狙いなので、floor は依存に入れない
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const boundsAtDragStart = useMemo(() => getFloorBounds(floor), [dragging])
  const bounds = dragging ? boundsAtDragStart : liveBounds

  const width = bounds.maxX - bounds.minX + padding * 2
  const height = bounds.maxY - bounds.minY + padding * 2
  const offsetX = -bounds.minX + padding
  const offsetY = -bounds.minY + padding

  const transform = (x: number, y: number) => ({ x: x + offsetX, y: y + offsetY })

  // 部屋の辺を動かすとき、ほかの部屋の辺の近くでは吸い付かせる。
  // 数 cm のすき間・重なりができると、両方の部屋の辺に壁ができて2重（太い壁）に見えるため
  const zoom = useZoom()
  const edgeSnap = Math.min(EDGE_SNAP_MAX, EDGE_SNAP_PX / zoom)

  const selectedRoom =
    selectedRoomId != null ? floor.rooms.find((r) => r.id === selectedRoomId) : undefined
  const selectedRoomRect =
    selectedRoom && editable && onRoomResize
      ? parseAxisAlignedRect(selectedRoom.polygon)
      : null
  const selectedRoomRectCanvas = selectedRoomRect
    ? {
        minX: selectedRoomRect.minX + offsetX,
        minY: selectedRoomRect.minY + offsetY,
        maxX: selectedRoomRect.maxX + offsetX,
        maxY: selectedRoomRect.maxY + offsetY,
      }
    : null

  const transformedFloor: Floor = {
    ...floor,
    rooms: floor.rooms.map((r) => ({
      ...r,
      polygon: r.polygon.map((p) => transform(p.x, p.y)),
    })),
    walls: floor.walls.map((w) => ({
      ...w,
      start: transform(w.start.x, w.start.y),
      end: transform(w.end.x, w.end.y),
    })),
    doors: floor.doors.map((d) => ({
      ...d,
      position: transform(d.position.x, d.position.y),
    })),
    windows: floor.windows.map((w) => ({
      ...w,
      start: transform(w.start.x, w.start.y),
      end: transform(w.end.x, w.end.y),
    })),
    fixtures: floor.fixtures.map((f) => ({
      ...f,
      position: transform(f.position.x, f.position.y),
    })),
    stairs: floor.stairs.map((s) => ({
      ...s,
      polygon: s.polygon.map((p) => transform(p.x, p.y)),
    })),
    texts: (floor.texts ?? []).map((t) => ({
      ...t,
      position: transform(t.position.x, t.position.y),
    })),
  }

  const floorOffset = { x: offsetX, y: offsetY }
  // 建物（部屋の範囲）の右下。出力で階名をここに添える
  const roomPoints = transformedFloor.rooms.flatMap((r) => r.polygon)
  const buildingCorner =
    roomPoints.length > 0
      ? `${Math.max(...roomPoints.map((p) => p.x))},${Math.max(...roomPoints.map((p) => p.y))}`
      : undefined
  const selectedWall =
    selectedWallId != null ? transformedFloor.walls.find((w) => w.id === selectedWallId) : undefined
  const selectedWindow =
    selectedWindowId != null ? transformedFloor.windows.find((w) => w.id === selectedWindowId) : undefined
  const selectedFixture =
    selectedFixtureId != null
      ? transformedFloor.fixtures.find((f) => f.id === selectedFixtureId)
      : undefined

  // その場メニューを置く位置（選んだ部屋・扉・窓の上端の中央）
  const toolbarPoints: Point[] = !selectionToolbar
    ? []
    : selectedRoomId != null
      ? (transformedFloor.rooms.find((r) => r.id === selectedRoomId)?.polygon ?? [])
      : selectedStairId != null
        ? (transformedFloor.stairs.find((s) => s.id === selectedStairId)?.polygon ?? [])
        : selectedDoorId != null
      ? (() => {
          const door = transformedFloor.doors.find((d) => d.id === selectedDoorId)
          return door ? doorPaintExtentPoints(door) : []
        })()
      : selectedWindow
        ? [selectedWindow.start, selectedWindow.end]
        : []
  const toolbarAnchor =
    toolbarPoints.length > 0
      ? {
          x: (Math.min(...toolbarPoints.map((p) => p.x)) + Math.max(...toolbarPoints.map((p) => p.x))) / 2,
          y: Math.min(...toolbarPoints.map((p) => p.y)),
        }
      : null

  return (
    <div className="floor-canvas-wrapper" style={wrapperStyle}>
      <div className="floor-label">{floor.label}</div>
      <div className="floor-canvas-stage">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          // 実寸（1単位=1px）で描く。width を省くと SVG 既定の 300px 幅になって図面が小さく出るうえ、
          // 階ごとに縮尺が揃わない。画面上の拡大縮小は ZoomableView が受け持つ。
          width={width}
          height={height}
          // 出力（PNG / PDF など）で、階が複数あるとき各階の下に階名を描くために使う
          data-floor-label={floor.label}
          data-building-corner={buildingCorner}
          // 建物（部屋の範囲）の左上・右下。平面図の位置合わせ（3点合わせなど）に使う。
          // 見た目の範囲（getBBox）は床模様の切り抜き前の線まで含んで建物より広くなるので、座標から求める
          data-building-box={
            roomPoints.length > 0
              ? [
                  Math.min(...roomPoints.map((p) => p.x)),
                  Math.min(...roomPoints.map((p) => p.y)),
                  Math.max(...roomPoints.map((p) => p.x)),
                  Math.max(...roomPoints.map((p) => p.y)),
                ].join(',')
              : undefined
          }
          // 間取図の座標 (0,0) が SVG のどこに来るか。描画範囲が変わると動くので、重ねた平面図を追従させるのに使う
          data-origin={`${offsetX},${offsetY}`}
          data-floor-id={floor.id}
          onDoubleClick={
            onRoomDoubleClick
              ? (e) => {
                  const hit = (e.target as Element).closest('[data-room-id], [data-label-room-id]')
                  const roomId = hit?.getAttribute('data-room-id') ?? hit?.getAttribute('data-label-room-id')
                  if (roomId) onRoomDoubleClick(roomId)
                }
              : undefined
          }
          className={`floor-canvas ${editable ? 'floor-canvas-editable' : ''} ${onRoomSelect ? 'floor-canvas-selectable' : ''} ${placeMode ? 'floor-canvas-placing' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill={CANVAS.background}
          />
          <g className="rooms-layer">
            {transformedFloor.rooms.map((room) => (
              <RoomRenderer
                key={room.id}
                room={room}
                clipScope={floor.id}
                floorOffset={floorOffset}
                selectable={!!onRoomSelect}
                editable={editable}
                renderLabels={false}
                selected={selectedRoomId === room.id}
                mergeSelected={mergeRoomIds?.includes(room.id) ?? false}
                onSelect={onRoomSelect}
                onMove={
                  onRoomMove && editable
                    ? (roomId, polygonFloor) =>
                        onRoomMove(roomId, snapPolygonToEdges(polygonFloor, floor, roomId, edgeSnap))
                    : undefined
                }
              />
            ))}
          </g>
          <g className="stairs-layer">
            {transformedFloor.stairs.map((stair) => (
              <StairRenderer
                key={stair.id}
                stair={stair}
                clipScope={floor.id}
                selectable={!!onStairSelect}
                editable={editable}
                renderLabels={false}
                selected={selectedStairId === stair.id}
                floorOffset={floorOffset}
                onSelect={onStairSelect}
                onMove={onStairMove ? (id, polygon) => onStairMove(id, polygon) : undefined}
              />
            ))}
          </g>
          <g className="fixtures-layer">
            {transformedFloor.fixtures.map((fixture) => (
              <g key={fixture.id} data-fixture-id={fixture.id}>
                <FixtureRenderer fixture={fixture} />
                {onFixtureSelect && (
                  <rect
                    x={fixture.position.x}
                    y={fixture.position.y}
                    width={fixture.width}
                    height={fixture.height}
                    // 記号が回転しているときはクリック判定も一緒に回す
                    transform={
                      fixture.angle
                        ? `rotate(${fixture.angle} ${fixture.position.x + fixture.width / 2} ${
                            fixture.position.y + fixture.height / 2
                          })`
                        : undefined
                    }
                    fill="transparent"
                    className="fixture-hit"
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onFixtureSelect(fixture.id)
                    }}
                  />
                )}
              </g>
            ))}
          </g>
          <g className="walls-layer">
            {transformedFloor.walls.map((wall) => (
              <WallRenderer
                key={wall.id}
                wall={wall}
                doors={transformedFloor.doors}
                windows={transformedFloor.windows}
                selectable={!!onWallSelect}
                selected={selectedWallId === wall.id}
                onSelect={onWallSelect}
              />
            ))}
          </g>
          <g className="windows-layer">
            {transformedFloor.windows.map((win) => (
              <WindowRenderer
                key={win.id}
                window={win}
                selected={selectedWindowId === win.id}
                selectable={!!onWindowSelect}
                onSelect={onWindowSelect}
              />
            ))}
          </g>
          <g className="doors-layer">
            {transformedFloor.doors.map((door) => (
              <DoorRenderer
                key={door.id}
                door={door}
                selected={selectedDoorId === door.id}
                editable={editable}
                floorOffset={floorOffset}
                onSelect={onDoorSelect}
                onMove={onDoorMove ? (pos) => onDoorMove(door.id, pos) : undefined}
              />
            ))}
          </g>
          <g className="labels-layer">
            {transformedFloor.rooms.map((room) => {
              const label = computeRoomLabelLayout(room)
              if (!label) return null
              return (
                <g key={`label-${room.id}`} data-label-room-id={room.id}>
                  <RoomLabels
                    layout={label}
                    editable={editable}
                    selected={selectedRoomId === room.id}
                    offsets={{
                      name: room.nameLabelOffset,
                      area: room.areaLabelOffset,
                      note: room.noteLabelOffset,
                    }}
                    onSelect={() => onRoomSelect?.(room.id, false)}
                    onLabelOffsetChange={
                      onRoomLabelOffsetChange
                        ? (kind, offset) => onRoomLabelOffsetChange(room.id, kind, offset)
                        : undefined
                    }
                  />
                </g>
              )
            })}
            {transformedFloor.stairs.map((stair) => {
              const label = computeStairLabelLayout(stair)
              if (!label) return null
              return (
                <RoomLabels
                  key={`label-${stair.id}`}
                  layout={label}
                  editable={editable}
                  selected={selectedStairId === stair.id}
                  offsets={{ name: stair.nameLabelOffset }}
                  draggableKinds={['name']}
                  onSelect={() => onStairSelect?.(stair.id)}
                  onLabelOffsetChange={
                    onStairLabelOffsetChange
                      ? (kind, offset) => onStairLabelOffsetChange(stair.id, kind, offset)
                      : undefined
                  }
                />
              )
            })}
            {(transformedFloor.texts ?? []).map((textLabel) => (
              <TextLabelRenderer
                key={textLabel.id}
                label={textLabel}
                selected={selectedTextId === textLabel.id}
                editable={editable}
                floorOffset={floorOffset}
                onSelect={onTextSelect}
                onMove={onTextMove ? (pos) => onTextMove(textLabel.id, pos) : undefined}
              />
            ))}
          </g>
          {selectedRoomRectCanvas && onRoomResize && selectedRoomId && (
            <g className="resize-handles-layer">
              <RoomResizeHandles
                rect={selectedRoomRectCanvas}
                floorOffset={floorOffset}
                onResize={(edge, positionFloorSvg) => {
                  const axis = edge === 'east' || edge === 'west' ? 'x' : 'y'
                  const others = otherEdgeValues(floor, axis, selectedRoomId)
                  onRoomResize(selectedRoomId, edge, snapToNearest(positionFloorSvg, others, edgeSnap))
                }}
              />
            </g>
          )}
          {editable && selectedWall && onWallEndpointMove && onWallMove && (
            <g className="edit-handles-layer">
              <WallEditHandles
                wall={selectedWall}
                floorOffset={floorOffset}
                onEndpointMove={(endpoint, pos) => onWallEndpointMove(selectedWall.id, endpoint, pos)}
                onWallMove={(start, end) => onWallMove(selectedWall.id, start, end)}
              />
            </g>
          )}
          {editable && selectedWindow && onWindowEndpointMove && onWindowMove && (
            <g className="edit-handles-layer">
              <WindowEditHandles
                window={selectedWindow}
                floorOffset={floorOffset}
                onEndpointMove={(endpoint, pos) => onWindowEndpointMove(selectedWindow.id, endpoint, pos)}
                onWindowMove={(start, end) => onWindowMove(selectedWindow.id, start, end)}
              />
            </g>
          )}
          {editable && selectedFixture && onFixtureMove && (
            <g className="edit-handles-layer">
              <FixtureEditHandles
                fixture={selectedFixture}
                floorOffset={floorOffset}
                onMove={(pos) => onFixtureMove(selectedFixture.id, pos)}
                onResize={
                  onFixtureResize
                    ? (corner, pos, start) => onFixtureResize(selectedFixture.id, corner, pos, start)
                    : undefined
                }
              />
            </g>
          )}
          {placeMode && onPlaceClick && (
            <rect
              className="place-overlay"
              data-no-pan=""
              x={0}
              y={0}
              width={width}
              height={height}
              fill="transparent"
              style={{ cursor: 'crosshair', pointerEvents: 'all' }}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                const svg = e.currentTarget.ownerSVGElement
                if (!svg) return
                const canvas = clientToSvg(svg, e.clientX, e.clientY)
                if (!canvas) return
                e.stopPropagation()
                e.preventDefault()
                onPlaceClick(canvasToFloor(canvas, floorOffset))
              }}
            />
          )}
          {placeMode && wallDraftStart && (
            // 壁追加の1点目。ここに印が出ないと、クリックが効いたか分からない
            <g className="wall-draft-marker" pointerEvents="none">
              <circle
                cx={wallDraftStart.x + offsetX}
                cy={wallDraftStart.y + offsetY}
                r={7}
                fill="none"
                stroke="#C08A3E"
                strokeWidth={2}
              />
              <circle
                cx={wallDraftStart.x + offsetX}
                cy={wallDraftStart.y + offsetY}
                r={2.2}
                fill="#C08A3E"
              />
            </g>
          )}
          {onGridLineDrag && (
            <GridLinesLayer
              floor={floor}
              floorOffset={floorOffset}
              width={width}
              height={height}
              onDrag={onGridLineDrag}
            />
          )}
          <NorthArrow x={width - 28} y={32} size={26} />
        </svg>
        {toolbarAnchor && selectionToolbar && (
          <SelectionToolbarAnchor x={toolbarAnchor.x} y={toolbarAnchor.y}>
            {selectionToolbar}
          </SelectionToolbarAnchor>
        )}
      </div>
    </div>
  )
}
