import type { Fixture, Point } from '../types/floorPlan'
import type { FixtureCorner } from '../utils/floorPlanDrag'
import { SELECTION } from './styles'
import { attachSvgPointerDrag, canvasToFloor } from './svgCoords'

/** 100% 表示だと画面上 5px 程度にしかならないため、掴める大きさにしておく */
const CORNER_SIZE = 12

interface FixtureEditHandlesProps {
  fixture: Fixture
  floorOffset: Point
  onMove: (positionFloor: Point) => void
  onResize?: (corner: FixtureCorner, positionFloor: Point) => void
}

/** 回転している設備の上でドラッグしたとき、回転前の座標系に戻す */
function unrotate(p: Point, cx: number, cy: number, angleDeg: number): Point {
  if (!angleDeg) return p
  const rad = (-angleDeg * Math.PI) / 180
  const dx = p.x - cx
  const dy = p.y - cy
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  }
}

export function FixtureEditHandles({
  fixture,
  floorOffset,
  onMove,
  onResize,
}: FixtureEditHandlesProps) {
  const { position, width, height, angle = 0 } = fixture
  const cx = position.x + width / 2
  const cy = position.y + height / 2

  const startDrag = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return

    attachSvgPointerDrag(e, svg, (canvasPos) => {
      const floor = canvasToFloor(canvasPos, floorOffset)
      onMove(unrotate(floor, cx, cy, angle))
    })
  }

  const startResize = (e: React.PointerEvent<SVGRectElement>, corner: FixtureCorner) => {
    if (!onResize) return
    e.stopPropagation()
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return

    attachSvgPointerDrag(e, svg, (canvasPos) => {
      const floor = canvasToFloor(canvasPos, floorOffset)
      onResize(corner, unrotate(floor, cx, cy, angle))
    })
  }

  const corners: { corner: FixtureCorner; x: number; y: number; cursor: string }[] = [
    { corner: 'nw', x: position.x, y: position.y, cursor: 'nwse-resize' },
    { corner: 'ne', x: position.x + width, y: position.y, cursor: 'nesw-resize' },
    { corner: 'se', x: position.x + width, y: position.y + height, cursor: 'nwse-resize' },
    { corner: 'sw', x: position.x, y: position.y + height, cursor: 'nesw-resize' },
  ]

  return (
    <g
      className="fixture-edit-handles"
      data-no-pan
      transform={angle ? `rotate(${angle} ${cx} ${cy})` : undefined}
    >
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
      {onResize &&
        corners.map(({ corner, x, y, cursor }) => (
          <rect
            key={corner}
            x={x - CORNER_SIZE / 2}
            y={y - CORNER_SIZE / 2}
            width={CORNER_SIZE}
            height={CORNER_SIZE}
            fill="#FFFFFF"
            stroke={SELECTION.stroke}
            strokeWidth={1.5}
            style={{ cursor }}
            onPointerDown={(e) => startResize(e, corner)}
          />
        ))}
    </g>
  )
}
