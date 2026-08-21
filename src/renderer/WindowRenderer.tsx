import type { Window, WindowKind } from '../types/floorPlan'
import { normalizeWindowKind } from '../constants/windowOptions'
import { SELECTION, WINDOW, WALL } from './styles'

const HIT_STROKE = 16
/** 壁帯より少し広い白抜き幅 */
const WALL_PUNCH = Math.max(WALL.exteriorWidth, WALL.interiorWidth) + 2

interface WindowRendererProps {
  window: Window
  selected?: boolean
  selectable?: boolean
  onSelect?: (windowId: string) => void
}

function endTicks(
  x: number,
  y: number,
  nx: number,
  ny: number,
  color: string,
  width: number,
  scale = 1
) {
  const t = WINDOW.endTick * scale
  return (
    <line
      x1={x + nx * t}
      y1={y + ny * t}
      x2={x - nx * t}
      y2={y - ny * t}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="square"
      pointerEvents="none"
    />
  )
}

function along(
  x: number,
  y: number,
  ux: number,
  uy: number,
  t: number,
  nx = 0,
  ny = 0,
  o = 0
) {
  return { x: x + ux * t + nx * o, y: y + uy * t + ny * o }
}

/**
 * 参考チャート準拠の窓記号
 * （引き違い戸 / 片引き戸 / 引き込み戸 / 折れ戸 / 片開き戸 / 両開き戸）
 */
export function WindowRenderer({ window: win, selected, selectable, onSelect }: WindowRendererProps) {
  const kind: WindowKind = normalizeWindowKind(win.kind)
  const dx = win.end.x - win.start.x
  const dy = win.end.y - win.start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return null

  const ux = dx / len
  const uy = dy / len
  const side = win.outward === -1 ? -1 : 1
  const nx = -uy * side
  const ny = ux * side
  const sweep = side > 0 ? 1 : 0
  const color = selected ? SELECTION.stroke : WINDOW.color
  const lineW = selected ? WINDOW.lineWidthSelected : Math.max(WINDOW.lineWidth, 1.6)
  const detailW = Math.max(WINDOW.detailWidth, 1.35)

  const { x: x1, y: y1 } = win.start
  const { x: x2, y: y2 } = win.end
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const half = len / 2
  /** 引き違いの2枚をずらす量（チャートの平行線） */
  const leafGap = Math.min(2.8, Math.max(1.8, len * 0.04))

  const symbol = (() => {
    switch (kind) {
      case 'sliding': {
        // 引き違い戸: 上下にずらした2本が中央で重なり、交点に＋
        const a0 = along(x1, y1, ux, uy, len * 0.04, nx, ny, leafGap)
        const a1 = along(x1, y1, ux, uy, half + len * 0.1, nx, ny, leafGap)
        const b0 = along(x1, y1, ux, uy, half - len * 0.1, nx, ny, -leafGap)
        const b1 = along(x1, y1, ux, uy, len * 0.96, nx, ny, -leafGap)
        return (
          <>
            <line x1={a0.x} y1={a0.y} x2={a1.x} y2={a1.y} stroke={color} strokeWidth={lineW} pointerEvents="none" />
            <line x1={b0.x} y1={b0.y} x2={b1.x} y2={b1.y} stroke={color} strokeWidth={lineW} pointerEvents="none" />
            {endTicks(midX, midY, nx, ny, color, detailW, 1.15)}
            <line
              x1={midX - ux * 2.2}
              y1={midY - uy * 2.2}
              x2={midX + ux * 2.2}
              y2={midY + uy * 2.2}
              stroke={color}
              strokeWidth={detailW}
              pointerEvents="none"
            />
          </>
        )
      }
      case 'single_sliding': {
        // 片引き戸: 実線の障子＋手前に破線の待避位置
        const leafEnd = along(x1, y1, ux, uy, len * 0.7)
        const park0 = along(x1, y1, ux, uy, len * 0.5, nx, ny, leafGap * 1.2)
        const park1 = along(x1, y1, ux, uy, len * 0.96, nx, ny, leafGap * 1.2)
        return (
          <>
            <line x1={x1} y1={y1} x2={leafEnd.x} y2={leafEnd.y} stroke={color} strokeWidth={lineW} pointerEvents="none" />
            <line
              x1={park0.x}
              y1={park0.y}
              x2={park1.x}
              y2={park1.y}
              stroke={color}
              strokeWidth={detailW}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
            {endTicks(x1, y1, nx, ny, color, detailW, 1.1)}
          </>
        )
      }
      case 'pocket': {
        // 引き込み戸: 実線＋壁側のポケット枠（中は破線）
        const pocketDepth = Math.min(len * 0.42, 16)
        const pocketW = Math.min(Math.max(len * 0.18, 5), 9)
        const leafEnd = along(x1, y1, ux, uy, len - pocketDepth * 0.2)
        const inner = along(x2, y2, ux, uy, -pocketDepth)
        const c0 = along(inner.x, inner.y, 0, 0, 0, nx, ny, pocketW / 2)
        const c1 = along(x2, y2, 0, 0, 0, nx, ny, pocketW / 2)
        const c2 = along(x2, y2, 0, 0, 0, nx, ny, -pocketW / 2)
        const c3 = along(inner.x, inner.y, 0, 0, 0, nx, ny, -pocketW / 2)
        const dash0 = along(inner.x, inner.y, ux, uy, pocketDepth * 0.18)
        const dash1 = along(inner.x, inner.y, ux, uy, pocketDepth * 0.82)
        return (
          <>
            <line x1={x1} y1={y1} x2={leafEnd.x} y2={leafEnd.y} stroke={color} strokeWidth={lineW} pointerEvents="none" />
            <polygon
              points={`${c0.x},${c0.y} ${c1.x},${c1.y} ${c2.x},${c2.y} ${c3.x},${c3.y}`}
              fill="#FFFFFF"
              stroke={color}
              strokeWidth={detailW}
              pointerEvents="none"
            />
            <line
              x1={dash0.x}
              y1={dash0.y}
              x2={dash1.x}
              y2={dash1.y}
              stroke={color}
              strokeWidth={detailW}
              strokeDasharray="3.5 2.5"
              pointerEvents="none"
            />
            {endTicks(x1, y1, nx, ny, color, detailW, 1.1)}
          </>
        )
      }
      case 'folding': {
        // 折れ戸: 開口内に2つの山形（V）
        const peak = Math.min(len * 0.32, 14)
        const q1 = along(x1, y1, ux, uy, half * 0.45)
        const q2 = along(x1, y1, ux, uy, half * 1.55)
        const p1 = along(q1.x, q1.y, 0, 0, 0, nx, ny, peak)
        const p2 = along(q2.x, q2.y, 0, 0, 0, nx, ny, peak)
        return (
          <>
            <polyline
              points={`${x1},${y1} ${p1.x},${p1.y} ${midX},${midY}`}
              fill="none"
              stroke={color}
              strokeWidth={lineW}
              strokeLinejoin="miter"
              pointerEvents="none"
            />
            <polyline
              points={`${x2},${y2} ${p2.x},${p2.y} ${midX},${midY}`}
              fill="none"
              stroke={color}
              strokeWidth={lineW}
              strokeLinejoin="miter"
              pointerEvents="none"
            />
            {endTicks(midX, midY, nx, ny, color, detailW, 1.1)}
          </>
        )
      }
      case 'casement': {
        // 片開き戸: 丁番側の戸先線＋1/4円弧
        const tip = along(x2, y2, 0, 0, 0, nx, ny, Math.min(half * 0.2, 4))
        return (
          <>
            {endTicks(x2, y2, nx, ny, color, lineW, 1.35)}
            <path
              d={`M ${x1} ${y1} A ${len} ${len} 0 0 ${sweep} ${tip.x} ${tip.y}`}
              fill="none"
              stroke={color}
              strokeWidth={detailW}
              pointerEvents="none"
            />
          </>
        )
      }
      case 'double_casement': {
        // 両開き戸: 左右の戸先＋中央で接する2弧
        const leftTip = along(x1, y1, 0, 0, 0, nx, ny, Math.min(half * 0.2, 4))
        const rightTip = along(x2, y2, 0, 0, 0, nx, ny, Math.min(half * 0.2, 4))
        const meet = along(midX, midY, 0, 0, 0, nx, ny, Math.min(half * 0.08, 2))
        return (
          <>
            {endTicks(x1, y1, nx, ny, color, lineW, 1.25)}
            {endTicks(x2, y2, nx, ny, color, lineW, 1.25)}
            <path
              d={`M ${meet.x} ${meet.y} A ${half} ${half} 0 0 ${1 - sweep} ${leftTip.x} ${leftTip.y}`}
              fill="none"
              stroke={color}
              strokeWidth={detailW}
              pointerEvents="none"
            />
            <path
              d={`M ${meet.x} ${meet.y} A ${half} ${half} 0 0 ${sweep} ${rightTip.x} ${rightTip.y}`}
              fill="none"
              stroke={color}
              strokeWidth={detailW}
              pointerEvents="none"
            />
          </>
        )
      }
      default:
        return null
    }
  })()

  return (
    <g
      className={`window ${selected ? 'window-selected' : ''} ${selectable ? 'window-selectable' : ''} window-${kind}`}
      data-window-id={win.id}
      data-window-kind={kind}
    >
      {/* 壁帯を白く抜いて開口にする */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#FFFFFF"
        strokeWidth={WALL_PUNCH}
        strokeLinecap="butt"
        pointerEvents="none"
      />
      {symbol}
      {selectable && onSelect && (
        <line
          className="window-hit-line"
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="transparent"
          strokeWidth={HIT_STROKE}
          strokeLinecap="round"
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(win.id)
          }}
        />
      )}
    </g>
  )
}
