import type { Floor } from '../types/floorPlan'
import type { Point } from '../types/floorPlan'
import type { LabelLineKind } from './roomLabelLayout'
import { CANVAS } from './styles'
import { DoorRenderer } from './DoorRenderer'
import { FixtureRenderer } from './FixtureRenderer'
import { NorthArrow } from './NorthArrow'
import { RoomLabels } from './RoomLabels'
import { computeRoomLabelLayout, computeStairLabelLayout } from './roomLabelLayout'
import { RoomRenderer } from './RoomRenderer'
import { RoomResizeHandles } from './RoomResizeHandles'
import { StairRenderer } from './StairRenderer'
import { WallRenderer } from './WallRenderer'
import { WindowRenderer } from './WindowRenderer'
import { WallEditHandles } from './WallEditHandles'
import { WindowEditHandles } from './WindowEditHandles'
import { FixtureEditHandles } from './FixtureEditHandles'
import { parseAxisAlignedRect, type RectEdge } from '../utils/roomGeometry'
import { clientToSvg, canvasToFloor } from './svgCoords'

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
  onRoomSelect?: (roomId: string, additive?: boolean) => void
  onStairSelect?: (stairId: string) => void
  onWallSelect?: (wallId: string) => void
  onDoorSelect?: (doorId: string) => void
  onWindowSelect?: (windowId: string) => void
  onFixtureSelect?: (fixtureId: string) => void
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
  /** 追加配置モード時のクリック（floor 座標） */
  placeMode?: boolean
  onPlaceClick?: (positionFloor: Point) => void
}

function getBounds(floor: Floor) {
  const allPoints = [
    ...floor.rooms.flatMap((r) => r.polygon ?? []),
    ...floor.walls.flatMap((w) => [w.start, w.end]),
    ...floor.doors.map((d) => d.position),
    ...floor.windows.flatMap((w) => [w.start, w.end]),
    ...floor.fixtures.flatMap((f) => [
      f.position,
      { x: f.position.x + f.width, y: f.position.y + f.height },
    ]),
    ...floor.stairs.flatMap((s) => s.polygon ?? []),
  ].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))

  if (allPoints.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 }
  }

  const xs = allPoints.map((p) => p.x)
  const ys = allPoints.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX - minX < 1) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 }
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY - minY < 1) {
    return { minX, minY: 0, maxX, maxY: 100 }
  }

  return { minX, minY, maxX, maxY }
}

export function FloorCanvas({
  floor,
  padding = 36,
  editable,
  mergeRoomIds,
  selectedRoomId,
  selectedStairId,
  selectedWallId,
  selectedDoorId,
  selectedWindowId,
  selectedFixtureId,
  onRoomSelect,
  onStairSelect,
  onWallSelect,
  onDoorSelect,
  onWindowSelect,
  onFixtureSelect,
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
  placeMode,
  onPlaceClick,
}: FloorCanvasProps) {
  const bounds = getBounds(floor)
  const width = bounds.maxX - bounds.minX + padding * 2
  const height = bounds.maxY - bounds.minY + padding * 2
  const offsetX = -bounds.minX + padding
  const offsetY = -bounds.minY + padding

  const transform = (x: number, y: number) => ({ x: x + offsetX, y: y + offsetY })

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
  }

  const floorOffset = { x: offsetX, y: offsetY }
  const selectedWall =
    selectedWallId != null ? transformedFloor.walls.find((w) => w.id === selectedWallId) : undefined
  const selectedWindow =
    selectedWindowId != null ? transformedFloor.windows.find((w) => w.id === selectedWindowId) : undefined
  const selectedFixture =
    selectedFixtureId != null
      ? transformedFloor.fixtures.find((f) => f.id === selectedFixtureId)
      : undefined

  return (
    <div className="floor-canvas-wrapper">
      <div className="floor-label">{floor.label}</div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
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
              floorOffset={floorOffset}
              selectable={!!onRoomSelect}
              editable={editable}
              renderLabels={false}
              selected={selectedRoomId === room.id}
              mergeSelected={mergeRoomIds?.includes(room.id) ?? false}
              onSelect={onRoomSelect}
              onMove={
                onRoomMove && editable
                  ? (roomId, polygonFloor) => onRoomMove(roomId, polygonFloor)
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
              selectable={!!onStairSelect}
              editable={editable}
              renderLabels={false}
              selected={selectedStairId === stair.id}
              onSelect={onStairSelect}
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
              <RoomLabels
                key={`label-${room.id}`}
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
        </g>
        {selectedRoomRectCanvas && onRoomResize && selectedRoomId && (
          <g className="resize-handles-layer">
            <RoomResizeHandles
              rect={selectedRoomRectCanvas}
              floorOffset={floorOffset}
              onResize={(edge, positionFloorSvg) => onRoomResize(selectedRoomId, edge, positionFloorSvg)}
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
        <NorthArrow x={width - 28} y={32} size={26} />
      </svg>
    </div>
  )
}
