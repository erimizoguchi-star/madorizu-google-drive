import type { Fixture, Point } from '../types/floorPlan'
import { SELECTION } from './styles'
import { attachSvgPointerDrag, canvasToFloor } from './svgCoords'

interface FixtureEditHandlesProps {
  fixture: Fixture
  floorOffset: Point
  onMove: (positionFloor: Point) => void
}

export function FixtureEditHandles({ fixture, floorOffset, onMove }: FixtureEditHandlesProps) {
  const { position, width, height } = fixture

  const startDrag = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return

    attachSvgPointerDrag(e, svg, (canvasPos) => {
      const floor = canvasToFloor(canvasPos, floorOffset)
      onMove({ x: floor.x, y: floor.y })
    })
  }

  return (
    <g className="fixture-edit-handles" data-no-pan>
      <rect
        x={position.x}
        y={position.y}
        width={width}
        height={height}
        fill={SELECTION.stroke}
        fillOpacity={0.15}
        stroke={SELECTION.stroke}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        style={{ cursor: 'move' }}
        onPointerDown={startDrag}
      />
    </g>
  )
}
