import type { Wall } from '../types/floorPlan'
import { WALL } from './styles'

interface WallRendererProps {
  wall: Wall
}

export function WallRenderer({ wall }: WallRendererProps) {
  const width = wall.exterior ? WALL.exteriorWidth : WALL.interiorWidth
  return (
    <line
      x1={wall.start.x}
      y1={wall.start.y}
      x2={wall.end.x}
      y2={wall.end.y}
      stroke={WALL.color}
      strokeWidth={width}
      strokeLinecap="square"
    />
  )
}
