import { useRef } from 'react'
import type { Point, Stair } from '../types/floorPlan'
import { STAIR, pointsToPath } from './styles'
import { attachSvgPointerDrag, canvasToFloor, clientToSvg } from './svgCoords'
import { computeStairLabelLayout } from './roomLabelLayout'
import { RoomLabels } from './RoomLabels'
import type { LabelLineKind } from './roomLabelLayout'
import {
  arrowHeadPoints,
  arrowPathToSvgD,
  computeStairGraphics,
} from './stairGraphics'

interface StairRendererProps {
  stair: Stair
  selected?: boolean
  selectable?: boolean
  editable?: boolean
  renderLabels?: boolean
  floorOffset?: Point
  onSelect?: (stairId: string) => void
  /** 平行移動後のポリゴン（floor 座標）— 部屋と同じ */
  onMove?: (stairId: string, polygonFloor: Point[]) => void
  onLabelOffsetChange?: (kind: LabelLineKind, offset: Point) => void
}

export function StairRenderer({
  stair,
  selected,
  selectable,
  editable,
  renderLabels = true,
  floorOffset = { x: 0, y: 0 },
  onSelect,
  onMove,
  onLabelOffsetChange,
}: StairRendererProps) {
  const path = pointsToPath(stair.polygon)
  const clipId = `stair-clip-${stair.id}`
  const { stepLines, arrowPath } = computeStairGraphics(stair)
  const label = computeStairLabelLayout(stair)
  const canSelect = selectable && onSelect
  const canDrag = editable && !!onMove
  const originRef = useRef<{
    pointerFloor: Point
    polygonFloor: Point[]
  } | null>(null)
  const tip = arrowPath?.points[arrowPath.points.length - 1]
  const startR = 2.2

  const toFloorPolygon = (canvasPolygon: Point[]) =>
    canvasPolygon.map((p) => ({
      x: p.x - floorOffset.x,
      y: p.y - floorOffset.y,
    }))

  const startDrag = (e: React.PointerEvent<SVGElement>) => {
    if (!canDrag || !onMove) return
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    const canvasPos = clientToSvg(svg, e.clientX, e.clientY)
    if (!canvasPos) return

    originRef.current = {
      pointerFloor: canvasToFloor(canvasPos, floorOffset),
      polygonFloor: toFloorPolygon(stair.polygon),
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
        onMove(
          stair.id,
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

  return (
    <g
      className={`stair ${selected ? 'stair-selected' : ''} ${canSelect ? 'stair-selectable' : ''}`}
      data-stair-id={stair.id}
      data-no-pan={canDrag ? '' : undefined}
      onClick={
        canSelect
          ? (e) => {
              e.stopPropagation()
              onSelect(stair.id)
            }
          : undefined
      }
      onPointerDown={canDrag ? startDrag : undefined}
      style={canDrag ? { cursor: 'move' } : canSelect ? { cursor: 'pointer' } : undefined}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={path} />
        </clipPath>
      </defs>
      <path
        d={path}
        fill={STAIR.fill}
        stroke="none"
        pointerEvents={canSelect || canDrag ? 'all' : undefined}
      />
      <g className="stair-steps" clipPath={`url(#${clipId})`}>
        {stepLines.map((line, i) => (
          <line
            key={i}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={STAIR.line}
            strokeWidth={0.65}
          />
        ))}
      </g>
      {arrowPath && tip && (
        <g className="stair-arrow" clipPath={`url(#${clipId})`}>
          <circle
            cx={arrowPath.start.x}
            cy={arrowPath.start.y}
            r={startR}
            fill="none"
            stroke={STAIR.line}
            strokeWidth={0.7}
          />
          <path
            d={arrowPathToSvgD(arrowPath.points)}
            fill="none"
            stroke={STAIR.line}
            strokeWidth={0.7}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon points={arrowHeadPoints(tip, arrowPath.tipAngleDeg)} fill={STAIR.line} />
        </g>
      )}
      {renderLabels && label && (
        <RoomLabels
          layout={label}
          editable={editable}
          selected={selected}
          offsets={{ name: stair.nameLabelOffset }}
          draggableKinds={['name']}
          onSelect={() => onSelect?.(stair.id)}
          onLabelOffsetChange={onLabelOffsetChange}
        />
      )}
    </g>
  )
}
