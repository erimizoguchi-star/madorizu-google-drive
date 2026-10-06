import { useRef } from 'react'
import type { RectEdge, AxisAlignedRect } from '../utils/roomGeometry'
import { SELECTION } from './styles'
import { useZoom } from '../components/zoomContext'
import { clientToSvg } from './svgCoords'

/** 取っ手の大きさ（画面上の px）。縮小表示でも掴めるよう、拡大率で割って図面の単位にする */
const HANDLE_LENGTH_PX = 28
const HANDLE_THICKNESS_PX = 9

interface RoomResizeHandlesProps {
  rect: AxisAlignedRect
  /** キャンバス座標 → フロア座標へのオフセット */
  floorOffset: { x: number; y: number }
  onResize: (edge: RectEdge, positionFloorSvg: number) => void
}

export function RoomResizeHandles({ rect, floorOffset, onResize }: RoomResizeHandlesProps) {
  const dragRef = useRef<{
    edge: RectEdge
    pointerId: number
    svg: SVGSVGElement
  } | null>(null)
  const zoom = useZoom()
  const HANDLE_LENGTH = HANDLE_LENGTH_PX / zoom
  const HANDLE_THICKNESS = HANDLE_THICKNESS_PX / zoom

  const { minX, minY, maxX, maxY } = rect
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2

  const handles: Array<{
    edge: RectEdge
    x: number
    y: number
    w: number
    h: number
    cursor: string
  }> = [
    {
      edge: 'north',
      x: midX - HANDLE_LENGTH / 2,
      y: minY - HANDLE_THICKNESS / 2,
      w: HANDLE_LENGTH,
      h: HANDLE_THICKNESS,
      cursor: 'ns-resize',
    },
    {
      edge: 'south',
      x: midX - HANDLE_LENGTH / 2,
      y: maxY - HANDLE_THICKNESS / 2,
      w: HANDLE_LENGTH,
      h: HANDLE_THICKNESS,
      cursor: 'ns-resize',
    },
    {
      edge: 'west',
      x: minX - HANDLE_THICKNESS / 2,
      y: midY - HANDLE_LENGTH / 2,
      w: HANDLE_THICKNESS,
      h: HANDLE_LENGTH,
      cursor: 'ew-resize',
    },
    {
      edge: 'east',
      x: maxX - HANDLE_THICKNESS / 2,
      y: midY - HANDLE_LENGTH / 2,
      w: HANDLE_THICKNESS,
      h: HANDLE_LENGTH,
      cursor: 'ew-resize',
    },
  ]

  const startDrag = (edge: RectEdge, e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return

    e.stopPropagation()
    e.preventDefault()

    dragRef.current = { edge, pointerId: e.pointerId, svg }

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || ev.pointerId !== drag.pointerId) return

      const pos = clientToSvg(drag.svg, ev.clientX, ev.clientY)
      if (!pos) return

      const floorCoord =
        drag.edge === 'east' || drag.edge === 'west'
          ? pos.x - floorOffset.x
          : pos.y - floorOffset.y

      onResize(drag.edge, floorCoord)
    }

    const onUp = (ev: PointerEvent) => {
      if (dragRef.current?.pointerId !== ev.pointerId) return
      dragRef.current = null
      document.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('pointerup', onUp, true)
      document.removeEventListener('pointercancel', onUp, true)
    }

    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('pointerup', onUp, true)
    document.addEventListener('pointercancel', onUp, true)
  }

  return (
    <g className="room-resize-handles" data-no-pan>
      {handles.map((handle) => (
        <rect
          key={handle.edge}
          className="room-resize-handle"
          data-no-pan
          x={handle.x}
          y={handle.y}
          width={handle.w}
          height={handle.h}
          rx={2 / zoom}
          fill={SELECTION.stroke}
          stroke="#fff"
          strokeWidth={1 / zoom}
          style={{ cursor: handle.cursor }}
          onPointerDown={(e) => startDrag(handle.edge, e)}
        />
      ))}
    </g>
  )
}
