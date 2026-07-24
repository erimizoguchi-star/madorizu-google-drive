import type { Point, Stair } from '../types/floorPlan'
import { STAIR, pointsToPath } from './styles'
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
  onSelect?: (stairId: string) => void
  onLabelOffsetChange?: (kind: LabelLineKind, offset: Point) => void
}

export function StairRenderer({
  stair,
  selected,
  selectable,
  editable,
  renderLabels = true,
  onSelect,
  onLabelOffsetChange,
}: StairRendererProps) {
  const path = pointsToPath(stair.polygon)
  const clipId = `stair-clip-${stair.id}`
  const { stepLines, arrowPath } = computeStairGraphics(stair)
  const label = computeStairLabelLayout(stair)
  const canSelect = selectable && onSelect
  const tip = arrowPath?.points[arrowPath.points.length - 1]
  const startR = 2.2

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
      style={canSelect ? { cursor: 'pointer' } : undefined}
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
