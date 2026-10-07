import { useState } from 'react'
import type { Floor, Point } from '../types/floorPlan'
import { collectGridLines, type GridAxis } from '../utils/gridLines'
import { svgUnitsToMm } from '../utils/roomGeometry'
import { attachSvgPointerDrag, canvasToFloor, clientToSvg } from './svgCoords'

/** 吸い付いた先。image = 元の平面図の壁の線、line = 間取図のほかの通り */
export type GridSnapKind = 'image' | 'line' | null

export type GridLineDragHandler = (
  axis: GridAxis,
  from: number,
  to: number,
  phase: 'start' | 'move' | 'end'
) => { value: number; snap: GridSnapKind } | null

interface GridLinesLayerProps {
  floor: Floor
  floorOffset: Point
  width: number
  height: number
  onDrag: GridLineDragHandler
}

const COLORS = {
  idle: '#C08A3E',
  image: '#2E8B57',
  line: '#3A6EA5',
}

/**
 * 「線を合わせる」の操作レイヤー。通り（同じ線上に並ぶ部屋の辺）を1本ずつ表示し、
 * どこを掴んでもその通りをまとめて動かせる。掴み幅や文字の大きさは拡大率によらず画面上で一定（CSS の --zoom）。
 */
export function GridLinesLayer({ floor, floorOffset, width, height, onDrag }: GridLinesLayerProps) {
  const [drag, setDrag] = useState<{ axis: GridAxis; from: number; value: number; snap: GridSnapKind } | null>(
    null
  )
  const lines = collectGridLines(floor)

  const startDrag = (axis: GridAxis, from: number, e: React.PointerEvent<SVGElement>) => {
    if (e.button !== 0) return
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    const startCanvas = clientToSvg(svg, e.clientX, e.clientY)
    if (!startCanvas) return
    const startFloor = canvasToFloor(startCanvas, floorOffset)
    const grabOffset = (axis === 'x' ? startFloor.x : startFloor.y) - from
    onDrag(axis, from, from, 'start')
    setDrag({ axis, from, value: from, snap: null })

    attachSvgPointerDrag(
      e,
      svg,
      (canvasPos) => {
        const p = canvasToFloor(canvasPos, floorOffset)
        const raw = (axis === 'x' ? p.x : p.y) - grabOffset
        const result = onDrag(axis, from, raw, 'move')
        if (result) setDrag({ axis, from, value: result.value, snap: result.snap })
      },
      () => {
        onDrag(axis, from, from, 'end')
        setDrag(null)
      }
    )
  }

  // ドラッグ中の線と、その両隣の通りまでの寸法
  const neighbors = drag
    ? (() => {
        const others = lines
          .filter((l) => l.axis === drag.axis)
          .map((l) => l.value)
          .filter((v) => Math.abs(v - drag.value) > 0.5 && Math.abs(v - drag.from) > 0.5)
        return {
          prev: others.filter((v) => v < drag.value).pop(),
          next: others.find((v) => v > drag.value),
        }
      })()
    : null

  const ox = floorOffset.x
  const oy = floorOffset.y

  return (
    <g className="grid-lines-layer" data-no-pan>
      {lines.map((line) => {
        const active = drag && drag.axis === line.axis && Math.abs(line.value - drag.value) < 0.6
        const color = active ? COLORS[drag.snap ?? 'idle'] : COLORS.idle
        const v = line.value + (line.axis === 'x' ? ox : oy)
        const full =
          line.axis === 'x'
            ? { x1: v, y1: 0, x2: v, y2: height }
            : { x1: 0, y1: v, x2: width, y2: v }
        return (
          <g key={`${line.axis}-${line.value}`} className={`grid-line ${active ? 'grid-line-active' : ''}`}>
            {/* 通りの延長（どこを掴んでも動かせることを示す） */}
            <line {...full} className="grid-line-guide" stroke={color} />
            {/* 実際に部屋の辺がある範囲 */}
            {line.spans.map(([a, b]) => {
              const seg =
                line.axis === 'x'
                  ? { x1: v, y1: a + oy, x2: v, y2: b + oy }
                  : { x1: a + ox, y1: v, x2: b + ox, y2: v }
              return <line key={`${a}-${b}`} {...seg} className="grid-line-body" stroke={color} />
            })}
            <line
              {...full}
              className="grid-line-hit"
              data-no-pan
              style={{ cursor: line.axis === 'x' ? 'ew-resize' : 'ns-resize' }}
              onPointerDown={(e) => startDrag(line.axis, line.value, e)}
            />
            {/* 端の取っ手 */}
            {(line.axis === 'x'
              ? [
                  { cx: v, cy: 12 },
                  { cx: v, cy: height - 12 },
                ]
              : [
                  { cx: 12, cy: v },
                  { cx: width - 12, cy: v },
                ]
            ).map((pos, i) => (
              <circle
                key={i}
                {...pos}
                className="grid-line-grip"
                fill={color}
                data-no-pan
                style={{ cursor: line.axis === 'x' ? 'ew-resize' : 'ns-resize' }}
                onPointerDown={(e) => startDrag(line.axis, line.value, e)}
              />
            ))}
          </g>
        )
      })}

      {drag && neighbors && (
        <g className="grid-line-dims" pointerEvents="none">
          {[neighbors.prev, neighbors.next].map((other, i) => {
            if (other == null) return null
            const mid = (other + drag.value) / 2
            const mm = Math.round(svgUnitsToMm(Math.abs(drag.value - other)))
            const pos =
              drag.axis === 'x' ? { x: mid + ox, y: oy / 2 + 6 } : { x: ox / 2 + 6, y: mid + oy }
            return (
              <text key={i} {...pos} className="grid-line-dim" textAnchor="middle" dominantBaseline="middle">
                {mm.toLocaleString()}
              </text>
            )
          })}
        </g>
      )}
    </g>
  )
}
