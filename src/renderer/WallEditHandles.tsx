import { useRef } from 'react'
import type { Point, Wall } from '../types/floorPlan'
import { SELECTION } from './styles'
import { attachSvgPointerDrag, canvasToFloor, clientToSvg } from './svgCoords'

const HANDLE_R = 6

interface WallEditHandlesProps {
  wall: Wall
  floorOffset: Point
  onEndpointMove: (endpoint: 'start' | 'end', positionFloor: Point) => void
  onWallMove: (start: Point, end: Point) => void
}

export function WallEditHandles({
  wall,
  floorOffset,
  onEndpointMove,
  onWallMove,
}: WallEditHandlesProps) {
  const originRef = useRef<{ pointerFloor: Point; wall: Wall } | null>(null)

  const startDragEndpoint = (endpoint: 'start' | 'end', e: React.PointerEvent<SVGCircleElement>) => {
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return

    attachSvgPointerDrag(e, svg, (canvasPos) => {
      onEndpointMove(endpoint, canvasToFloor(canvasPos, floorOffset))
    })
  }

  const startDragBody = (e: React.PointerEvent<SVGCircleElement>) => {
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return

    const local = clientToSvg(svg, e.clientX, e.clientY)
    if (!local) return
    const pointerFloor = canvasToFloor(local, floorOffset)
    originRef.current = {
      pointerFloor,
      wall: { ...wall, start: { ...wall.start }, end: { ...wall.end } },
    }

    attachSvgPointerDrag(
      e,
      svg,
      (pos) => {
        const origin = originRef.current
        if (!origin) return
        const currentFloor = canvasToFloor(pos, floorOffset)
        const delta = {
          x: currentFloor.x - origin.pointerFloor.x,
          y: currentFloor.y - origin.pointerFloor.y,
        }
        onWallMove(
          {
            x: origin.wall.start.x + delta.x,
            y: origin.wall.start.y + delta.y,
          },
          {
            x: origin.wall.end.x + delta.x,
            y: origin.wall.end.y + delta.y,
          }
        )
      },
      () => {
        originRef.current = null
      }
    )
  }

  const midX = (wall.start.x + wall.end.x) / 2
  const midY = (wall.start.y + wall.end.y) / 2

  return (
    <g className="wall-edit-handles" data-no-pan>
      <line
        x1={wall.start.x}
        y1={wall.start.y}
        x2={wall.end.x}
        y2={wall.end.y}
        stroke={SELECTION.stroke}
        strokeWidth={8}
        strokeOpacity={0.25}
        pointerEvents="none"
      />
      <circle
        className="edit-handle"
        cx={wall.start.x}
        cy={wall.start.y}
        r={HANDLE_R}
        fill={SELECTION.stroke}
        stroke="#fff"
        strokeWidth={1.5}
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => startDragEndpoint('start', e)}
      />
      <circle
        className="edit-handle"
        cx={wall.end.x}
        cy={wall.end.y}
        r={HANDLE_R}
        fill={SELECTION.stroke}
        stroke="#fff"
        strokeWidth={1.5}
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => startDragEndpoint('end', e)}
      />
      <circle
        className="edit-handle edit-handle-mid"
        cx={midX}
        cy={midY}
        r={HANDLE_R + 1}
        fill="#fff"
        stroke={SELECTION.stroke}
        strokeWidth={2}
        style={{ cursor: 'move' }}
        onPointerDown={startDragBody}
      />
    </g>
  )
}
