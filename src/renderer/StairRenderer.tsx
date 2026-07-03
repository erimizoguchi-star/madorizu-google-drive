import type { Point, Stair } from '../types/floorPlan'
import { STAIR, pointsToPath } from './styles'
import { computeStairLabelLayout } from './roomLabelLayout'
import { RoomLabels } from './RoomLabels'
import type { LabelLineKind } from './roomLabelLayout'

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
  const xs = stair.polygon.map((p) => p.x)
  const ys = stair.polygon.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const isVertical = maxY - minY > maxX - minX
  const label = computeStairLabelLayout(stair)
  const canSelect = selectable && onSelect

  const stepCount = 5
  const stepLines = []
  for (let i = 1; i < stepCount; i++) {
    const t = i / stepCount
    if (isVertical) {
      const y = minY + (maxY - minY) * t
      stepLines.push(
        <line key={i} x1={minX} y1={y} x2={maxX} y2={y} stroke={STAIR.line} strokeWidth={0.5} />
      )
    } else {
      const x = minX + (maxX - minX) * t
      stepLines.push(
        <line key={i} x1={x} y1={minY} x2={x} y2={maxY} stroke={STAIR.line} strokeWidth={0.5} />
      )
    }
  }

  const arrowSize = 7
  const centerX = (minX + maxX) / 2
  const arrowY = stair.direction === 'up' ? minY + 12 : maxY - 12
  const arrowPoints =
    stair.direction === 'up'
      ? `${centerX},${arrowY - arrowSize} ${centerX - 4},${arrowY} ${centerX + 4},${arrowY}`
      : `${centerX},${arrowY + arrowSize} ${centerX - 4},${arrowY} ${centerX + 4},${arrowY}`

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
      {stepLines}
      <polygon points={arrowPoints} fill={STAIR.accent} opacity={0.7} />
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
