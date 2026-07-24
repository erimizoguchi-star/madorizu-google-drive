import type { Door, Wall, Window } from '../types/floorPlan'
import { SELECTION, WALL } from './styles'
import { wallSolidSegments, wallThickness } from '../utils/wallOpenings'

const HIT_STROKE_WIDTH = 16

interface WallRendererProps {
  wall: Wall
  doors?: Door[]
  windows?: Window[]
  selected?: boolean
  selectable?: boolean
  onSelect?: (wallId: string) => void
}

export function WallRenderer({
  wall,
  doors = [],
  windows = [],
  selected,
  selectable,
  onSelect,
}: WallRendererProps) {
  const width = wallThickness(wall)
  const color = selected
    ? SELECTION.stroke
    : wall.exterior
      ? WALL.exteriorColor
      : WALL.color
  const canSelect = selectable && onSelect
  const segments = wallSolidSegments(wall, doors, windows)

  return (
    <g
      className={`wall ${selected ? 'wall-selected' : ''} ${canSelect ? 'wall-selectable' : ''} ${wall.exterior ? 'wall-exterior' : 'wall-interior'}`}
      data-wall-id={wall.id}
    >
      {segments.map((seg, i) => (
        <line
          key={i}
          x1={seg.start.x}
          y1={seg.start.y}
          x2={seg.end.x}
          y2={seg.end.y}
          stroke={color}
          strokeWidth={selected ? width + 1.2 : width}
          strokeLinecap="square"
          strokeLinejoin="miter"
          pointerEvents="none"
        />
      ))}
      {canSelect && (
        <line
          className="wall-hit-line"
          x1={wall.start.x}
          y1={wall.start.y}
          x2={wall.end.x}
          y2={wall.end.y}
          stroke="transparent"
          strokeWidth={HIT_STROKE_WIDTH}
          strokeLinecap="round"
          onClick={(e) => {
            e.stopPropagation()
            onSelect(wall.id)
          }}
        />
      )}
    </g>
  )
}
