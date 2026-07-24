import type { Door } from '../types/floorPlan'
import { DOOR, SELECTION } from './styles'
import { attachSvgPointerDrag, canvasToFloor } from './svgCoords'

/** 選択・ドラッグ用の当たり判定（見た目より大きめ） */
const HIT_RADIUS = 14
const HIT_STROKE = 18

interface DoorRendererProps {
  door: Door
  selected?: boolean
  editable?: boolean
  floorOffset?: { x: number; y: number }
  onSelect?: (doorId: string) => void
  onMove?: (positionFloor: { x: number; y: number }) => void
}

function swingArc(
  cx: number,
  cy: number,
  radius: number,
  startRad: number,
  swing: 1 | -1,
  stroke: string,
  selected: boolean
) {
  const arcEndAngle = startRad + (swing * Math.PI) / 2
  const arcStartX = cx + radius * Math.cos(startRad)
  const arcStartY = cy + radius * Math.sin(startRad)
  const arcEndX = cx + radius * Math.cos(arcEndAngle)
  const arcEndY = cy + radius * Math.sin(arcEndAngle)
  const sweep = swing === 1 ? 1 : 0
  return (
    <path
      d={`M ${arcStartX} ${arcStartY} A ${radius} ${radius} 0 0 ${sweep} ${arcEndX} ${arcEndY}`}
      fill="none"
      stroke={stroke}
      strokeWidth={selected ? DOOR.arcWidthSelected : DOOR.arcWidth}
      opacity={DOOR.arcOpacity}
      pointerEvents="none"
    />
  )
}

function endTicks(
  x: number,
  y: number,
  nx: number,
  ny: number,
  stroke: string,
  width: number,
  scale = 1
) {
  const t = DOOR.endTick * scale
  return (
    <line
      x1={x + nx * t}
      y1={y + ny * t}
      x2={x - nx * t}
      y2={y - ny * t}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="square"
      pointerEvents="none"
    />
  )
}

export function DoorRenderer({
  door,
  selected,
  editable,
  floorOffset,
  onSelect,
  onMove,
}: DoorRendererProps) {
  const kind = door.kind ?? 'swing'
  const rad = (door.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const x1 = door.position.x
  const y1 = door.position.y
  const x2 = x1 + door.width * cos
  const y2 = y1 + door.width * sin
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const nx = -sin
  const ny = cos
  const half = door.width / 2
  /** 親子戸の親側比率 */
  const parentRatio = 0.62
  const parentEndX = x1 + door.width * parentRatio * cos
  const parentEndY = y1 + door.width * parentRatio * sin

  const canDrag = editable && onMove && floorOffset
  const stroke = selected ? SELECTION.stroke : DOOR.color
  const leafStroke = selected ? DOOR.leafWidthSelected : DOOR.leafWidth
  const detailStroke = DOOR.detailWidth

  const startDrag = (e: React.PointerEvent<SVGElement>) => {
    if (!canDrag) return
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return

    attachSvgPointerDrag(e, svg, (canvasPos) => {
      onMove(canvasToFloor(canvasPos, floorOffset))
    })
  }

  const handlePointerDown = (e: React.PointerEvent<SVGElement>) => {
    e.stopPropagation()
    if (!selected && onSelect) {
      onSelect(door.id)
    }
    if (canDrag && (selected || onSelect)) {
      startDrag(e)
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect?.(door.id)
  }

  return (
    <g
      className={`door ${selected ? 'door-selected' : ''} ${editable ? 'door-editable' : ''} door-${kind}`}
      data-door-id={door.id}
    >
      {/* 壁帯を白で抜いて開口を作る */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#FFFFFF"
        strokeWidth={9}
        strokeLinecap="butt"
        pointerEvents="none"
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={stroke}
        strokeWidth={kind === 'opening' ? leafStroke + 0.3 : leafStroke}
        strokeDasharray={kind === 'opening' ? '5 3' : undefined}
        strokeLinecap="butt"
        pointerEvents="none"
      />

      {kind === 'swing' && swingArc(x1, y1, door.width, rad, door.swing, stroke, !!selected)}

      {kind === 'double_swing' && (
        <>
          <line
            x1={midX + nx * DOOR.endTick * 0.7}
            y1={midY + ny * DOOR.endTick * 0.7}
            x2={midX - nx * DOOR.endTick * 0.7}
            y2={midY - ny * DOOR.endTick * 0.7}
            stroke={stroke}
            strokeWidth={detailStroke}
            pointerEvents="none"
          />
          {swingArc(x1, y1, half, rad, door.swing, stroke, !!selected)}
          {swingArc(x2, y2, half, rad + Math.PI, door.swing, stroke, !!selected)}
        </>
      )}

      {kind === 'parent_child' && (
        <>
          <line
            x1={parentEndX + nx * DOOR.endTick * 0.7}
            y1={parentEndY + ny * DOOR.endTick * 0.7}
            x2={parentEndX - nx * DOOR.endTick * 0.7}
            y2={parentEndY - ny * DOOR.endTick * 0.7}
            stroke={stroke}
            strokeWidth={detailStroke}
            pointerEvents="none"
          />
          {swingArc(x1, y1, door.width * parentRatio, rad, door.swing, stroke, !!selected)}
          {swingArc(
            x2,
            y2,
            door.width * (1 - parentRatio),
            rad + Math.PI,
            door.swing,
            stroke,
            !!selected
          )}
        </>
      )}

      {kind === 'sliding' && (
        <>
          {endTicks(x1, y1, nx, ny, stroke, detailStroke)}
          {endTicks(x2, y2, nx, ny, stroke, detailStroke)}
          <line
            x1={midX - cos * half * 0.28 * door.swing}
            y1={midY - sin * half * 0.28 * door.swing}
            x2={midX + cos * half * 0.4 * door.swing}
            y2={midY + sin * half * 0.4 * door.swing}
            stroke={stroke}
            strokeWidth={detailStroke}
            markerEnd="none"
            pointerEvents="none"
          />
          {/* 引き方向の矢印ヘッド */}
          <line
            x1={midX + cos * half * 0.4 * door.swing}
            y1={midY + sin * half * 0.4 * door.swing}
            x2={
              midX +
              cos * half * 0.4 * door.swing -
              cos * 3 * door.swing -
              nx * 2.5
            }
            y2={
              midY +
              sin * half * 0.4 * door.swing -
              sin * 3 * door.swing -
              ny * 2.5
            }
            stroke={stroke}
            strokeWidth={detailStroke}
            pointerEvents="none"
          />
          <line
            x1={midX + cos * half * 0.4 * door.swing}
            y1={midY + sin * half * 0.4 * door.swing}
            x2={
              midX +
              cos * half * 0.4 * door.swing -
              cos * 3 * door.swing +
              nx * 2.5
            }
            y2={
              midY +
              sin * half * 0.4 * door.swing -
              sin * 3 * door.swing +
              ny * 2.5
            }
            stroke={stroke}
            strokeWidth={detailStroke}
            pointerEvents="none"
          />
        </>
      )}

      {kind === 'double_sliding' && (
        <>
          {endTicks(x1, y1, nx, ny, stroke, detailStroke)}
          {endTicks(x2, y2, nx, ny, stroke, detailStroke)}
          {endTicks(midX, midY, nx, ny, stroke, detailStroke, 0.85)}
          <line
            x1={x1 + half * 0.2 * cos}
            y1={y1 + half * 0.2 * sin}
            x2={x1 + half * 0.55 * cos}
            y2={y1 + half * 0.55 * sin}
            stroke={stroke}
            strokeWidth={detailStroke}
            pointerEvents="none"
          />
          <line
            x1={x2 - half * 0.2 * cos}
            y1={y2 - half * 0.2 * sin}
            x2={x2 - half * 0.55 * cos}
            y2={y2 - half * 0.55 * sin}
            stroke={stroke}
            strokeWidth={detailStroke}
            pointerEvents="none"
          />
        </>
      )}

      {kind === 'pocket' && (
        <>
          {endTicks(x1, y1, nx, ny, stroke, detailStroke)}
          {/* 壁側ポケットを破線で表現 */}
          <line
            x1={x2}
            y1={y2}
            x2={x2 + cos * half * 0.55 * door.swing}
            y2={y2 + sin * half * 0.55 * door.swing}
            stroke={stroke}
            strokeWidth={detailStroke}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
          {endTicks(
            x2 + cos * half * 0.55 * door.swing,
            y2 + sin * half * 0.55 * door.swing,
            nx,
            ny,
            stroke,
            detailStroke,
            0.75
          )}
        </>
      )}

      {kind === 'folding' && (
        <>
          {endTicks(midX, midY, nx, ny, stroke, detailStroke, 0.8)}
          {swingArc(x1, y1, half, rad, door.swing, stroke, !!selected)}
          {swingArc(midX, midY, half * 0.85, rad, door.swing, stroke, !!selected)}
        </>
      )}

      {kind === 'double_folding' && (
        <>
          {endTicks(midX, midY, nx, ny, stroke, detailStroke, 0.8)}
          {swingArc(x1, y1, half * 0.5, rad, door.swing, stroke, !!selected)}
          {swingArc(x1 + half * 0.5 * cos, y1 + half * 0.5 * sin, half * 0.5, rad, door.swing, stroke, !!selected)}
          {swingArc(x2, y2, half * 0.5, rad + Math.PI, door.swing, stroke, !!selected)}
          {swingArc(
            x2 - half * 0.5 * cos,
            y2 - half * 0.5 * sin,
            half * 0.5,
            rad + Math.PI,
            door.swing,
            stroke,
            !!selected
          )}
        </>
      )}

      {kind === 'opening' && (
        <>
          {endTicks(x1, y1, nx, ny, stroke, leafStroke, 1.35)}
          {endTicks(x2, y2, nx, ny, stroke, leafStroke, 1.35)}
        </>
      )}

      {(onSelect || canDrag) && (
        <>
          <line
            className="door-hit-line"
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={selected ? SELECTION.stroke : 'transparent'}
            strokeOpacity={selected ? 0.22 : 0}
            strokeWidth={HIT_STROKE}
            strokeLinecap="round"
            style={{ cursor: canDrag ? 'grab' : onSelect ? 'pointer' : undefined }}
            onClick={onSelect ? handleClick : undefined}
            onPointerDown={handlePointerDown}
          />
          <circle
            className="door-hit"
            cx={midX}
            cy={midY}
            r={selected ? HIT_RADIUS : HIT_RADIUS * 0.75}
            fill={selected ? SELECTION.stroke : DOOR.color}
            fillOpacity={selected ? 0.45 : 0.28}
            stroke={selected ? SELECTION.stroke : DOOR.color}
            strokeWidth={2}
            strokeOpacity={selected ? 1 : 0.75}
            style={{ cursor: canDrag ? 'grab' : onSelect ? 'pointer' : undefined }}
            onClick={onSelect ? handleClick : undefined}
            onPointerDown={handlePointerDown}
          />
        </>
      )}
    </g>
  )
}
