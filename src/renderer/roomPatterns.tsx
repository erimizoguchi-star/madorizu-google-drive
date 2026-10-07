import type { ReactElement } from 'react'
import type { Room } from '../types/floorPlan'
import type { RoomFillPattern } from '../types/floorPlan'
import { ATTIC_HATCH, TATAMI, TILE, WOOD_FLOORING } from './styles'
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
        strokeWidth={ATTIC_HATCH.width}
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
      <line key={`v-${x}`} x1={x} y1={minY} x2={x} y2={maxY} stroke={TATAMI.gridColor} strokeWidth={0.55} />
    )
  }
  for (let y = minY + spacing; y < maxY; y += spacing) {
    lines.push(
      <line key={`h-${y}`} x1={minX} y1={y} x2={maxX} y2={y} stroke={TATAMI.gridColor} strokeWidth={0.55} />
    )
  }
  return (
    <g className="room-pattern room-pattern-grid" clipPath={`url(#${clipId})`}>
      {lines}
    </g>
  )
}

function WoodPattern({ polygon, clipId }: { polygon: Room['polygon']; clipId: string }) {
  const { minX, maxX, minY, maxY } = polygonBounds(polygon)
  const { spacing, color, width, opacity, direction } = WOOD_FLOORING
  const elements: ReactElement[] = []

  if (direction === 'horizontal') {
    for (let y = minY + spacing; y < maxY; y += spacing) {
      elements.push(
        <line
          key={`wood-h-${y}`}
          x1={minX}
          y1={y}
          x2={maxX}
          y2={y}
          stroke={color}
          strokeWidth={width}
          opacity={opacity}
        />
      )
    }
  } else {
    for (let x = minX + spacing; x < maxX; x += spacing) {
      elements.push(
        <line
          key={`wood-v-${x}`}
          x1={x}
          y1={minY}
          x2={x}
          y2={maxY}
          stroke={color}
          strokeWidth={width}
          opacity={opacity}
        />
      )
    }
  }

  return (
    <g className="room-pattern room-pattern-wood" clipPath={`url(#${clipId})`}>
      {elements}
    </g>
  )
}

function TilePattern({ room, clipId }: { room: Room; clipId: string }) {
  const { minX, maxX, minY, maxY } = polygonBounds(room.polygon)
  const { spacing, lineWidth } = TILE
  const preset = room.type === 'entrance' ? TILE.entrance : TILE.porch
  const elements: ReactElement[] = []

  for (let x = minX + spacing; x < maxX; x += spacing) {
    elements.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1={minY}
        x2={x}
        y2={maxY}
        stroke={preset.grout}
        strokeWidth={lineWidth}
        opacity={preset.opacity}
      />
    )
  }
  for (let y = minY + spacing; y < maxY; y += spacing) {
    elements.push(
      <line
        key={`h-${y}`}
        x1={minX}
        y1={y}
        x2={maxX}
        y2={y}
        stroke={preset.grout}
        strokeWidth={lineWidth}
        opacity={preset.opacity}
      />
    )
  }

  return (
    <g className="room-pattern room-pattern-tile" clipPath={`url(#${clipId})`}>
      {elements}
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
  // 標準の敷き方が決まらない帖数（13.2帖など）や L字の部屋は、以前は格子になっていた。
  // 畳（910×1820）を横に並べ、1段ごとに半畳ずらして敷き、部屋の形で切り抜く
  if (!layout) return <RunningTatami polygon={polygon} clipId={clipId} />

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

/** 畳を横長に並べ、段ごとに半畳ずらした敷き方（部屋の形で切り抜く） */
function RunningTatami({ polygon, clipId }: { polygon: Room['polygon']; clipId: string }) {
  const { minX, maxX, minY, maxY } = polygonBounds(polygon)
  const width = maxX - minX
  const height = maxY - minY
  // 畳の短辺 91・長辺 182（図面の単位）に近くなるよう、部屋の大きさで割り切る
  const rows = Math.max(1, Math.round(height / 91))
  const cols = Math.max(1, Math.round(width / 182))
  const th = height / rows
  const tw = width / cols
  const lines: ReactElement[] = []
  for (let r = 1; r < rows; r++) {
    const y = minY + th * r
    lines.push(<line key={`h-${r}`} x1={minX} y1={y} x2={maxX} y2={y} stroke={TATAMI.gridColor} strokeWidth={TATAMI.gridWidth} />)
  }
  for (let r = 0; r < rows; r++) {
    const y0 = minY + th * r
    const shift = r % 2 === 1 ? tw / 2 : 0
    for (let x = minX + shift + (shift ? 0 : tw); x < maxX - 0.01; x += tw) {
      lines.push(
        <line key={`v-${r}-${x}`} x1={x} y1={y0} x2={x} y2={y0 + th} stroke={TATAMI.gridColor} strokeWidth={TATAMI.gridWidth} />
      )
    }
  }
  return (
    <g className="room-pattern room-pattern-tatami" clipPath={`url(#${clipId})`}>
      {lines}
    </g>
  )
}

export function RoomPatternOverlay({ room, pattern, clipId }: RoomPatternOverlayProps) {
  if (pattern === 'none') return null
  if (pattern === 'hatch') return <HatchPattern polygon={room.polygon} clipId={clipId} />
  if (pattern === 'grid') return <GridPattern polygon={room.polygon} clipId={clipId} />
  if (pattern === 'wood') return <WoodPattern polygon={room.polygon} clipId={clipId} />
  if (pattern === 'tile') return <TilePattern room={room} clipId={clipId} />
  return <TatamiPattern polygon={room.polygon} areaJo={room.areaJo} clipId={clipId} />
}
