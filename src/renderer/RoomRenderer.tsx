import { useRef } from 'react'
import type { Point, Room } from '../types/floorPlan'
import { SELECTION } from './styles'
import { filletedPolygonPath } from '../utils/cornerFillet'
import { computeRoomLabelLayout } from './roomLabelLayout'
import type { LabelLineKind } from './roomLabelLayout'
import { resolveRoomFillColor, resolveRoomFillPattern } from './roomFill'
import { RoomPatternOverlay } from './roomPatterns'
import { RoomLabels } from './RoomLabels'
import { attachSvgPointerDrag, canvasToFloor, clientToSvg } from './svgCoords'

interface RoomRendererProps {
  room: Room
  /** canvas → floor 変換用（ドラッグ移動時） */
  floorOffset?: Point
  selected?: boolean
  mergeSelected?: boolean
  selectable?: boolean
  editable?: boolean
  renderLabels?: boolean
  onSelect?: (roomId: string, additive: boolean) => void
  onLabelOffsetChange?: (kind: LabelLineKind, offset: Point) => void
  /** 平行移動後のポリゴン（floor 座標） */
  onMove?: (roomId: string, polygonFloor: Point[]) => void
}

export function RoomRenderer({
  room,
  floorOffset = { x: 0, y: 0 },
  selected,
  mergeSelected,
  selectable,
  editable,
  renderLabels = true,
  onSelect,
  onLabelOffsetChange,
  onMove,
}: RoomRendererProps) {
  const fillColor = resolveRoomFillColor(room)
  const fillPattern = resolveRoomFillPattern(room)
  const path = filletedPolygonPath(room.polygon, room.cornerRadiiMm)
  const clipId = `room-clip-${room.id}`
  const label = computeRoomLabelLayout(room)
  const canSelect = selectable && onSelect
  const canDrag = editable && !!onMove
  const originRef = useRef<{
    pointerFloor: Point
    polygonFloor: Point[]
  } | null>(null)

  const toFloorPolygon = (canvasPolygon: Point[]) =>
    canvasPolygon.map((p) => ({
      x: p.x - floorOffset.x,
      y: p.y - floorOffset.y,
    }))

  const startDrag = (e: React.PointerEvent<SVGElement>) => {
    if (!canDrag) return
    if (e.ctrlKey || e.metaKey) return
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return

    // 移動中と同じ clientToSvg を使う（CTM だと拡大・パン時に基点がずれる）
    const canvasPos = clientToSvg(svg, e.clientX, e.clientY)
    if (!canvasPos) return

    originRef.current = {
      pointerFloor: canvasToFloor(canvasPos, floorOffset),
      polygonFloor: toFloorPolygon(room.polygon),
    }

    attachSvgPointerDrag(
      e,
      svg,
      (pos) => {
        const origin = originRef.current
        if (!origin) return
        const currentFloor = canvasToFloor(pos, floorOffset)
        const dx = currentFloor.x - origin.pointerFloor.x
        const dy = currentFloor.y - origin.pointerFloor.y
        onMove!(
          room.id,
          origin.polygonFloor.map((p) => ({
            x: p.x + dx,
            y: p.y + dy,
          }))
        )
      },
      () => {
        originRef.current = null
      }
    )
  }

  const handlePointerDown = (e: React.PointerEvent<SVGElement>) => {
    if (!canSelect && !canDrag) return
    e.stopPropagation()

    const additive = e.ctrlKey || e.metaKey
    if (!selected && onSelect) {
      onSelect(room.id, additive)
    } else if (additive && onSelect) {
      onSelect(room.id, true)
      return
    }

    if (canDrag && !additive) {
      startDrag(e)
    }
  }

  return (
    <g
      className={`room ${selected ? 'room-selected' : ''} ${mergeSelected ? 'room-merge-selected' : ''} ${canSelect ? 'room-selectable' : ''} ${canDrag ? 'room-draggable' : ''}`}
      data-room-id={room.id}
      data-no-pan={canDrag ? '' : undefined}
      onPointerDown={canSelect || canDrag ? handlePointerDown : undefined}
      onClick={
        canSelect
          ? (e) => {
              e.stopPropagation()
              // ドラッグ後の click でも選択状態を維持（additive のみここでも処理）
              if (e.ctrlKey || e.metaKey) onSelect(room.id, true)
            }
          : undefined
      }
      style={canDrag ? { cursor: 'grab' } : canSelect ? { cursor: 'pointer' } : undefined}
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
        pointerEvents={canSelect || canDrag ? 'all' : undefined}
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
