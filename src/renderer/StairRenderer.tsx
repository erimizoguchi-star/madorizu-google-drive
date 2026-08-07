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
  onMove?: (delta: Point) => void
  onLabelOffsetChange?: (kind: LabelLineKind, offset: Point) => void
}

export function StairRenderer({
  stair,
  selected,
  selectable,
  editable,
  renderLabels = true,
  floorOffset,
  onSelect,
  onMove,
  onLabelOffsetChange,
}: StairRendererProps) {
  const path = pointsToPath(stair.polygon)
  const clipId = `stair-clip-${stair.id}`
  const { stepLines, arrowPath } = computeStairGraphics(stair)
  const label = computeStairLabelLayout(stair)
  const canSelect = selectable && onSelect
  const canDrag = editable && !!onMove && !!floorOffset
  const originRef = useRef<Point | null>(null)
  const tip = arrowPath?.points[arrowPath.points.length - 1]
  const startR = 2.2

  const startDrag = (e: React.PointerEvent<SVGElement>) => {
    if (!canDrag || !onMove || !floorOffset) return
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    const from = clientToSvg(svg, e.clientX, e.clientY)
    if (!from) return
    originRef.current = canvasToFloor(from, floorOffset)

    attachSvgPointerDrag(
      e,
      svg,
      (canvasPos) => {
        const origin = originRef.current
        if (!origin) return
        const now = canvasToFloor(canvasPos, floorOffset)
        onMove({ x: now.x - origin.x, y: now.y - origin.y })
        originRef.current = now
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
      <path d={path} fill={STAIR.fill} stroke="none" pointerEvents={canSelect ? 'all' : undefined} />
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
          <polygon
            points={arrowHeadPoints(tip, arrowPath.tipAngleDeg)}
            fill={STAIR.line}
          />
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
