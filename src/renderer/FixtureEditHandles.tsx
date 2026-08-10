import { useRef } from 'react'
import type { Fixture, Point } from '../types/floorPlan'
import type { FixtureCorner } from '../utils/floorPlanDrag'
import { SELECTION } from './styles'
import { attachSvgPointerDrag, canvasToFloor, clientToSvg } from './svgCoords'

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

/** 原点まわりに回す */
function rotateVector(v: Point, angleDeg: number): Point {
  if (!angleDeg) return v
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: v.x * Math.cos(rad) - v.y * Math.sin(rad),
    y: v.x * Math.sin(rad) + v.y * Math.cos(rad),
  }
}

export function FixtureEditHandles({
  fixture,
  floorOffset,
  onMove,
  onResize,
}: FixtureEditHandlesProps) {
  const { position, width, height, angle = 0 } = fixture
  // 回転の中心はキャンバス座標。ポインタも同じ座標系で回転を戻してから
  // フロア座標へ直す（座標系を混ぜるとカーソルと設備がずれる）。
  const cx = position.x + width / 2
  const cy = position.y + height / 2

  const latest = useRef(fixture)
  latest.current = fixture

  const toFloorPoint = (canvasPos: Point, center: Point, angleDeg: number): Point =>
    canvasToFloor(unrotate(canvasPos, center.x, center.y, angleDeg), floorOffset)

  const startDrag = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return

    // 掴んだ点が指の下から動かないようにする。
    // 回転していると「左上＋ずれ」では合わないので、
    //   新しい左上 = カーソル − 半径ベクトル − 回転させた(掴み位置 − 半径ベクトル)
    // として求める（回転は中心まわりに掛かるため）。
    const half = { x: width / 2, y: height / 2 }
    const grabbed = clientToSvg(svg, e.clientX, e.clientY)
    if (!grabbed) return
    const grabUnrotated = unrotate(grabbed, cx, cy, angle)
    const grabOffset = { x: grabUnrotated.x - position.x, y: grabUnrotated.y - position.y }
    const arm = rotateVector({ x: grabOffset.x - half.x, y: grabOffset.y - half.y }, angle)

    attachSvgPointerDrag(e, svg, (canvasPos) => {
      const cursorFloor = canvasToFloor(canvasPos, floorOffset)
      onMove({
        x: cursorFloor.x - half.x - arm.x,
        y: cursorFloor.y - half.y - arm.y,
      })
    })
  }

  const startResize = (e: React.PointerEvent<SVGRectElement>, corner: FixtureCorner) => {
    if (!onResize) return
    e.stopPropagation()
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return

    attachSvgPointerDrag(e, svg, (canvasPos) => {
      // 大きさを変えると中心も動くので、その時点の設備から中心を取り直す
      const f = latest.current
      const center = { x: f.position.x + f.width / 2, y: f.position.y + f.height / 2 }
      onResize(corner, toFloorPoint(canvasPos, center, f.angle ?? 0))
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
