import type { Point, Room } from '../types/floorPlan'
import { SELECTION, pointsToPath } from './styles'
import { computeRoomLabelLayout } from './roomLabelLayout'
import type { LabelLineKind } from './roomLabelLayout'
import { resolveRoomFillColor, resolveRoomFillPattern } from './roomFill'
import { RoomPatternOverlay } from './roomPatterns'
import { RoomLabels } from './RoomLabels'

interface RoomRendererProps {
  room: Room
  selected?: boolean
  mergeSelected?: boolean
  selectable?: boolean
  editable?: boolean
  renderLabels?: boolean
  onSelect?: (roomId: string, additive: boolean) => void
  onLabelOffsetChange?: (kind: LabelLineKind, offset: Point) => void
}

export function RoomRenderer({
  room,
  selected,
  mergeSelected,
  selectable,
  editable,
  renderLabels = true,
  onSelect,
  onLabelOffsetChange,
}: RoomRendererProps) {
  const fillColor = resolveRoomFillColor(room)
  const fillPattern = resolveRoomFillPattern(room)
  const path = pointsToPath(room.polygon)
  const clipId = `room-clip-${room.id}`
  const label = computeRoomLabelLayout(room)
  const canSelect = selectable && onSelect

  return (
    <g
      className={`room ${selected ? 'room-selected' : ''} ${mergeSelected ? 'room-merge-selected' : ''} ${canSelect ? 'room-selectable' : ''}`}
      data-room-id={room.id}
      onClick={
        canSelect
          ? (e) => {
              e.stopPropagation()
              onSelect(room.id, e.ctrlKey || e.metaKey)
            }
          : undefined
      }
      style={canSelect ? { cursor: 'pointer' } : undefined}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={path} />
        </clipPath>
      </defs>
      <path
        d={path}
        fill={fillColor}
        stroke={selected ? SELECTION.stroke : 'none'}
        strokeWidth={selected ? SELECTION.strokeWidth : 0}
        pointerEvents={canSelect ? 'all' : undefined}
      />
      <RoomPatternOverlay room={room} pattern={fillPattern} clipId={clipId} />
      {renderLabels && label && (
        <RoomLabels
          layout={label}
          editable={editable}
          selected={selected}
          offsets={{
            name: room.nameLabelOffset,
            area: room.areaLabelOffset,
            note: room.noteLabelOffset,
          }}
          onSelect={() => onSelect?.(room.id, false)}
          onLabelOffsetChange={onLabelOffsetChange}
        />
      )}
    </g>
  )
}
