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

  // 開き系・折れ戸は開口を横切る直線を描かない（チャート準拠）
  const drawThroughLeaf =
    kind === 'opening' ||
    kind === 'sliding' ||
    kind === 'double_sliding' ||
    kind === 'pocket'

  const swingDir = door.swing
  const openLeaf = (hx: number, hy: number, leafLen: number) => ({
    x: hx + nx * swingDir * leafLen,
    y: hy + ny * swingDir * leafLen,
  })

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
      {drawThroughLeaf && (
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
      )}

      {kind === 'swing' && (
        <>
          {/* 片開き戸: 開いた戸（壁に垂直）＋1/4円弧 */}
          {(() => {
            const tip = openLeaf(x1, y1, door.width)
            return (
              <line
                x1={x1}
                y1={y1}
                x2={tip.x}
                y2={tip.y}
                stroke={stroke}
                strokeWidth={leafStroke}
                strokeLinecap="butt"
                pointerEvents="none"
              />
            )
          })()}
          {swingArc(x1, y1, door.width, rad, door.swing, stroke, !!selected)}
        </>
      )}

      {kind === 'double_swing' && (
        <>
          {/* 両開き戸（観音開き）: 左右の戸が同じ側へ開き、弧が中央で接する */}
          {(() => {
            const tipL = openLeaf(x1, y1, half)
            const tipR = openLeaf(x2, y2, half)
            // 右扉は壁方向が逆なので、同じ開閉側にするため swing を反転
            const rightSwing = (swingDir === 1 ? -1 : 1) as 1 | -1
            return (
              <>
                <line
                  x1={x1}
                  y1={y1}
                  x2={tipL.x}
                  y2={tipL.y}
                  stroke={stroke}
                  strokeWidth={leafStroke}
                  pointerEvents="none"
                />
                <line
                  x1={x2}
                  y1={y2}
                  x2={tipR.x}
                  y2={tipR.y}
                  stroke={stroke}
                  strokeWidth={leafStroke}
                  pointerEvents="none"
                />
                {swingArc(x1, y1, half, rad, swingDir, stroke, !!selected)}
                {swingArc(x2, y2, half, rad + Math.PI, rightSwing, stroke, !!selected)}
              </>
            )
          })()}
        </>
      )}

      {kind === 'parent_child' && (
        <>
          {(() => {
            const tipL = openLeaf(x1, y1, door.width * parentRatio)
            const tipR = openLeaf(x2, y2, door.width * (1 - parentRatio))
            return (
              <>
                <line
                  x1={x1}
                  y1={y1}
                  x2={tipL.x}
                  y2={tipL.y}
                  stroke={stroke}
                  strokeWidth={leafStroke}
                  pointerEvents="none"
                />
                <line
                  x1={x2}
                  y1={y2}
                  x2={tipR.x}
                  y2={tipR.y}
                  stroke={stroke}
                  strokeWidth={leafStroke}
                  pointerEvents="none"
                />
              </>
            )
          })()}
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
          {/* 片引き戸: 実線＋破線の待避 */}
          {endTicks(x1, y1, nx, ny, stroke, detailStroke)}
          <line
            x1={x1}
            y1={y1}
            x2={x1 + door.width * 0.72 * cos}
            y2={y1 + door.width * 0.72 * sin}
            stroke={stroke}
            strokeWidth={leafStroke}
            pointerEvents="none"
          />
          <line
            x1={x1 + door.width * 0.55 * cos + nx * door.width * 0.04}
            y1={y1 + door.width * 0.55 * sin + ny * door.width * 0.04}
            x2={x2 + nx * door.width * 0.04}
            y2={y2 + ny * door.width * 0.04}
            stroke={stroke}
            strokeWidth={detailStroke}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        </>
      )}

      {kind === 'double_sliding' && (
        <>
          {/* 引き違い戸: 2枚が中央で重なり＋縦線 */}
          <line
            x1={x1 + door.width * 0.06 * cos}
            y1={y1 + door.width * 0.06 * sin}
            x2={x1 + door.width * 0.58 * cos}
            y2={y1 + door.width * 0.58 * sin}
            stroke={stroke}
            strokeWidth={leafStroke}
            pointerEvents="none"
          />
          <line
            x1={x1 + door.width * 0.42 * cos}
            y1={y1 + door.width * 0.42 * sin}
            x2={x1 + door.width * 0.94 * cos}
            y2={y1 + door.width * 0.94 * sin}
            stroke={stroke}
            strokeWidth={leafStroke}
            pointerEvents="none"
          />
          {endTicks(midX, midY, nx, ny, stroke, detailStroke, 0.9)}
        </>
      )}

      {kind === 'pocket' && (
        <>
          {/* 引き込み戸: 実線＋ポケット枠（破線） */}
          {endTicks(x1, y1, nx, ny, stroke, detailStroke)}
          <line
            x1={x1}
            y1={y1}
            x2={x1 + door.width * 0.7 * cos}
            y2={y1 + door.width * 0.7 * sin}
            stroke={stroke}
            strokeWidth={leafStroke}
            pointerEvents="none"
          />
          {(() => {
            const pocketLen = door.width * 0.32
            const pocketW = Math.min(door.width * 0.12, 6)
            const ox = x2 - cos * pocketLen
            const oy = y2 - sin * pocketLen
            const pts = [
              `${ox + nx * pocketW},${oy + ny * pocketW}`,
              `${x2 + nx * pocketW},${y2 + ny * pocketW}`,
              `${x2 - nx * pocketW},${y2 - ny * pocketW}`,
              `${ox - nx * pocketW},${oy - ny * pocketW}`,
            ].join(' ')
            return (
              <>
                <polygon
                  points={pts}
                  fill="#FFFFFF"
                  stroke={stroke}
                  strokeWidth={detailStroke}
                  pointerEvents="none"
                />
                <line
                  x1={ox + cos * pocketLen * 0.15}
                  y1={oy + sin * pocketLen * 0.15}
                  x2={ox + cos * pocketLen * 0.85}
                  y2={oy + sin * pocketLen * 0.85}
                  stroke={stroke}
                  strokeWidth={detailStroke}
                  strokeDasharray="3.5 2.5"
                  pointerEvents="none"
                />
              </>
            )
          })()}
        </>
      )}

      {kind === 'folding' && (
        <>
          {/* 折れ戸: 2つの山形（V）が中央で接続（開口を横切る線は無し） */}
          {(() => {
            const peak = Math.min(door.width * 0.36, 14)
            const q1x = x1 + half * 0.5 * cos
            const q1y = y1 + half * 0.5 * sin
            const q2x = x1 + half * 1.5 * cos
            const q2y = y1 + half * 1.5 * sin
            const p1x = q1x + nx * peak * swingDir
            const p1y = q1y + ny * peak * swingDir
            const p2x = q2x + nx * peak * swingDir
            const p2y = q2y + ny * peak * swingDir
            return (
              <>
                <polyline
                  points={`${x1},${y1} ${p1x},${p1y} ${midX},${midY}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={leafStroke}
                  strokeLinejoin="miter"
                  pointerEvents="none"
                />
                <polyline
                  points={`${x2},${y2} ${p2x},${p2y} ${midX},${midY}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={leafStroke}
                  strokeLinejoin="miter"
                  pointerEvents="none"
                />
                {endTicks(midX, midY, nx, ny, stroke, detailStroke, 1.0)}
              </>
            )
          })()}
        </>
      )}

      {kind === 'double_folding' && (
        <>
          {(() => {
            const peak = Math.min(door.width * 0.22, 10)
            const q1x = x1 + half * 0.25 * cos
            const q1y = y1 + half * 0.25 * sin
            const q2x = x1 + half * 0.75 * cos
            const q2y = y1 + half * 0.75 * sin
            const q3x = x1 + half * 1.25 * cos
            const q3y = y1 + half * 1.25 * sin
            const q4x = x1 + half * 1.75 * cos
            const q4y = y1 + half * 1.75 * sin
            return (
              <>
                <polyline
                  points={`${x1},${y1} ${q1x + nx * peak * swingDir},${q1y + ny * peak * swingDir} ${midX - half * 0.5 * cos},${midY - half * 0.5 * sin}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={leafStroke}
                  pointerEvents="none"
                />
                <polyline
                  points={`${midX - half * 0.5 * cos},${midY - half * 0.5 * sin} ${q2x + nx * peak * swingDir},${q2y + ny * peak * swingDir} ${midX},${midY}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={leafStroke}
                  pointerEvents="none"
                />
                <polyline
                  points={`${midX},${midY} ${q3x + nx * peak * swingDir},${q3y + ny * peak * swingDir} ${midX + half * 0.5 * cos},${midY + half * 0.5 * sin}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={leafStroke}
                  pointerEvents="none"
                />
                <polyline
                  points={`${midX + half * 0.5 * cos},${midY + half * 0.5 * sin} ${q4x + nx * peak * swingDir},${q4y + ny * peak * swingDir} ${x2},${y2}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={leafStroke}
                  pointerEvents="none"
                />
                {endTicks(midX, midY, nx, ny, stroke, detailStroke, 0.85)}
              </>
            )
          })()}
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
