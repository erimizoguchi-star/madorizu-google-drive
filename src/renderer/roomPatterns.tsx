import type { Room } from '../types/floorPlan'
import type { RoomFillPattern } from '../types/floorPlan'
import { ATTIC_HATCH, TATAMI } from './styles'
import { computeTatamiLayout, tatamiGridLines } from './tatamiLayout'

interface RoomPatternOverlayProps {
  room: Room
  pattern: RoomFillPattern
  clipId: string
}

function polygonBounds(polygon: Room['polygon']) {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function HatchPattern({ polygon, clipId }: { polygon: Room['polygon']; clipId: string }) {
  const { minX, maxX, minY, maxY } = polygonBounds(polygon)
  const spacing = ATTIC_HATCH.spacing
  const lines = []
  for (let d = minX - maxY; d < maxX - minY; d += spacing) {
    lines.push(
      <line
        key={d}
        x1={d + minY}
        y1={minY}
        x2={d + maxY}
        y2={maxY}
        stroke={ATTIC_HATCH.color}
        strokeWidth={0.5}
      />
    )
  }
  return (
    <g className="room-pattern room-pattern-hatch" clipPath={`url(#${clipId})`}>
      {lines}
    </g>
  )
}

function GridPattern({ polygon, clipId }: { polygon: Room['polygon']; clipId: string }) {
  const { minX, maxX, minY, maxY } = polygonBounds(polygon)
  const spacing = 12
  const lines = []
  for (let x = minX + spacing; x < maxX; x += spacing) {
    lines.push(
      <line key={`v-${x}`} x1={x} y1={minY} x2={x} y2={maxY} stroke={TATAMI.gridColor} strokeWidth={0.4} />
    )
  }
  for (let y = minY + spacing; y < maxY; y += spacing) {
    lines.push(
      <line key={`h-${y}`} x1={minX} y1={y} x2={maxX} y2={y} stroke={TATAMI.gridColor} strokeWidth={0.4} />
    )
  }
  return (
    <g className="room-pattern room-pattern-grid" clipPath={`url(#${clipId})`}>
      {lines}
    </g>
  )
}

function TatamiPattern({
  polygon,
  areaJo,
  clipId,
}: {
  polygon: Room['polygon']
  areaJo?: number
  clipId: string
}) {
  const layout = computeTatamiLayout(polygon, areaJo)
  if (!layout) return <GridPattern polygon={polygon} clipId={clipId} />

  const lines = tatamiGridLines(layout)
  return (
    <g className="room-pattern room-pattern-tatami" clipPath={`url(#${clipId})`}>
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={TATAMI.gridColor}
          strokeWidth={TATAMI.gridWidth}
        />
      ))}
    </g>
  )
}

export function RoomPatternOverlay({ room, pattern, clipId }: RoomPatternOverlayProps) {
  if (pattern === 'none') return null
  if (pattern === 'hatch') return <HatchPattern polygon={room.polygon} clipId={clipId} />
  if (pattern === 'grid') return <GridPattern polygon={room.polygon} clipId={clipId} />
  return <TatamiPattern polygon={room.polygon} areaJo={room.areaJo} clipId={clipId} />
}
