import type { RectEdge, AxisAlignedRect } from '../utils/roomGeometry'
import { SELECTION } from './styles'
import { useZoom } from '../components/zoomContext'
import { attachSvgPointerDrag } from './svgCoords'

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

  // ほかの取っ手と同じく attachSvgPointerDrag を使う。ドラッグ中は図面の描画範囲が固定される。
  // 固定しないと、辺を建物の外へ広げたときに範囲が変わって図面の中身がずれ、辺がカーソルから離れる →
  // そのずれがまた範囲を変える、という悪循環で辺が暴れ、図面がどこかへ行ってしまっていた
  const startDrag = (edge: RectEdge, e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    attachSvgPointerDrag(e, svg, (pos) => {
      const floorCoord = edge === 'east' || edge === 'west' ? pos.x - floorOffset.x : pos.y - floorOffset.y
      onResize(edge, floorCoord)
    })
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
