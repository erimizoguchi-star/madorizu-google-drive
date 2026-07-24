import { useRef } from 'react'
import type { Point, Window } from '../types/floorPlan'
import { SELECTION } from './styles'
import { attachSvgPointerDrag, canvasToFloor } from './svgCoords'

const HANDLE_R = 6

interface WindowEditHandlesProps {
  window: Window
  floorOffset: Point
  onEndpointMove: (endpoint: 'start' | 'end', positionFloor: Point) => void
  onWindowMove: (start: Point, end: Point) => void
}

export function WindowEditHandles({
  window: win,
  floorOffset,
  onEndpointMove,
  onWindowMove,
}: WindowEditHandlesProps) {
  const originRef = useRef<{ pointerFloor: Point; window: Window } | null>(null)

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

    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const local = pt.matrixTransform(ctm.inverse())
    const pointerFloor = canvasToFloor({ x: local.x, y: local.y }, floorOffset)
    originRef.current = {
      pointerFloor,
      window: {
        ...win,
        start: { ...win.start },
        end: { ...win.end },
      },
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
        onWindowMove(
          {
            x: origin.window.start.x + delta.x,
            y: origin.window.start.y + delta.y,
          },
          {
            x: origin.window.end.x + delta.x,
            y: origin.window.end.y + delta.y,
          }
        )
      },
      () => {
        originRef.current = null
      }
    )
  }

  const midX = (win.start.x + win.end.x) / 2
  const midY = (win.start.y + win.end.y) / 2

  return (
    <g className="window-edit-handles" data-no-pan>
      <line
        x1={win.start.x}
        y1={win.start.y}
        x2={win.end.x}
        y2={win.end.y}
        stroke={SELECTION.stroke}
        strokeWidth={6}
        strokeOpacity={0.3}
        pointerEvents="none"
      />
      <circle
        className="edit-handle"
        cx={win.start.x}
        cy={win.start.y}
        r={HANDLE_R}
        fill={SELECTION.stroke}
        stroke="#fff"
        strokeWidth={1.5}
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => startDragEndpoint('start', e)}
      />
      <circle
        className="edit-handle"
        cx={win.end.x}
        cy={win.end.y}
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
