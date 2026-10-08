import type { Point } from '../types/floorPlan'
import { SELECTION } from './styles'
import { useZoom } from '../components/zoomContext'
import { attachSvgPointerDrag } from './svgCoords'
import { isHorizontalStairEdge } from '../utils/resizeStair'

/** 取っ手の大きさ（画面上の px）。縮小表示でも掴めるよう、拡大率で割って図面の単位にする */
const HANDLE_LENGTH_PX = 24
const HANDLE_THICKNESS_PX = 9

interface StairResizeHandlesProps {
  /** 階段の輪郭（キャンバス座標） */
  polygon: Point[]
  /** キャンバス座標 → フロア座標へのオフセット */
  floorOffset: { x: number; y: number }
  /**
   * 辺を動かす。edgeIndex は輪郭の何番目の辺か、value は動かした先（横の辺なら y、縦の辺なら x。フロア座標）、
   * start はドラッグを始めたときの輪郭（フロア座標）
   */
  onResize: (edgeIndex: number, value: number, start: Point[]) => void
}

/**
 * 選んだ階段の辺ごとの取っ手。ドラッグでその辺だけを動かし、大きさを変える。
 * L字・2方向に段は内側の2辺にも取っ手が出るので、段の幅も変えられる。
 */
export function StairResizeHandles({ polygon, floorOffset, onResize }: StairResizeHandlesProps) {
  const zoom = useZoom()
  const length = HANDLE_LENGTH_PX / zoom
  const thickness = HANDLE_THICKNESS_PX / zoom

  const startDrag = (index: number, e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    const horizontal = isHorizontalStairEdge(polygon, index)
    const start = polygon.map((p) => ({ x: p.x - floorOffset.x, y: p.y - floorOffset.y }))
    attachSvgPointerDrag(e, svg, (pos) => {
      onResize(index, horizontal ? pos.y - floorOffset.y : pos.x - floorOffset.x, start)
    })
  }

  return (
    <g className="stair-resize-handles" data-no-pan>
      {polygon.map((a, i) => {
        const b = polygon[(i + 1) % polygon.length]
        const horizontal = isHorizontalStairEdge(polygon, i)
        const span = Math.hypot(b.x - a.x, b.y - a.y)
        // 短すぎる辺には出さない（取っ手が重なって掴み分けられないため）
        if (span < length * 0.8) return null
        const cx = (a.x + b.x) / 2
        const cy = (a.y + b.y) / 2
        const w = horizontal ? Math.min(length, span * 0.6) : thickness
        const h = horizontal ? thickness : Math.min(length, span * 0.6)
        return (
          <rect
            key={i}
            className="stair-resize-handle"
            data-no-pan
            x={cx - w / 2}
            y={cy - h / 2}
            width={w}
            height={h}
            rx={2 / zoom}
            fill={SELECTION.stroke}
            stroke="#fff"
            strokeWidth={1 / zoom}
            style={{ cursor: horizontal ? 'ns-resize' : 'ew-resize' }}
            onPointerDown={(e) => startDrag(i, e)}
          />
        )
      })}
    </g>
  )
}
