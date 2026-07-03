import type { Floor } from '../types/floorPlan'
import type { Point } from '../types/floorPlan'
import type { LabelLineKind } from './roomLabelLayout'
import { CANVAS } from './styles'
import { DoorRenderer } from './DoorRenderer'
import { FixtureRenderer } from './FixtureRenderer'
import { RoomLabels } from './RoomLabels'
import { computeRoomLabelLayout, computeStairLabelLayout } from './roomLabelLayout'
import { RoomRenderer } from './RoomRenderer'
import { RoomResizeHandles } from './RoomResizeHandles'
import { StairRenderer } from './StairRenderer'
import { WallRenderer } from './WallRenderer'
import { WindowRenderer } from './WindowRenderer'
import { parseAxisAlignedRect, type RectEdge } from '../utils/roomGeometry'

interface FloorCanvasProps {
  floor: Floor
  padding?: number
  editable?: boolean
  mergeRoomIds?: string[]
  selectedRoomId?: string | null
  selectedStairId?: string | null
  onRoomSelect?: (roomId: string, additive?: boolean) => void
  onStairSelect?: (stairId: string) => void
  onRoomLabelOffsetChange?: (roomId: string, kind: LabelLineKind, offset: Point) => void
  onStairLabelOffsetChange?: (stairId: string, kind: LabelLineKind, offset: Point) => void
  onRoomResize?: (roomId: string, edge: RectEdge, positionFloorSvg: number) => void
}

function getBounds(floor: Floor) {
  const allPoints = floor.rooms.flatMap((r) => r.polygon)
  const xs = allPoints.map((p) => p.x)
  const ys = allPoints.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

export function FloorCanvas({
  floor,
  padding = 20,
  editable,
  mergeRoomIds,
  selectedRoomId,
  selectedStairId,
  onRoomSelect,
  onStairSelect,
  onRoomLabelOffsetChange,
  onStairLabelOffsetChange,
  onRoomResize,
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

  return (
    <div className="floor-canvas-wrapper">
      <div className="floor-label">{floor.label}</div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`floor-canvas ${editable ? 'floor-canvas-editable' : ''} ${onRoomSelect ? 'floor-canvas-selectable' : ''}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x={0} y={0} width={width} height={height} fill={CANVAS.background} />
        <g className="rooms-layer">
          {transformedFloor.rooms.map((room) => (
            <RoomRenderer
              key={room.id}
              room={room}
              selectable={!!onRoomSelect}
              editable={editable}
              renderLabels={false}
              selected={selectedRoomId === room.id}
              mergeSelected={mergeRoomIds?.includes(room.id) ?? false}
              onSelect={onRoomSelect}
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
            <FixtureRenderer key={fixture.id} fixture={fixture} />
          ))}
        </g>
        <g className="walls-layer">
          {transformedFloor.walls.map((wall) => (
            <WallRenderer key={wall.id} wall={wall} />
          ))}
        </g>
        <g className="doors-layer">
          {transformedFloor.doors.map((door) => (
            <DoorRenderer key={door.id} door={door} />
          ))}
        </g>
        <g className="windows-layer">
          {transformedFloor.windows.map((win) => (
            <WindowRenderer key={win.id} window={win} />
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
              floorOffset={{ x: offsetX, y: offsetY }}
              onResize={(edge, positionFloorSvg) => onRoomResize(selectedRoomId, edge, positionFloorSvg)}
            />
          </g>
        )}
      </svg>
    </div>
  )
}
