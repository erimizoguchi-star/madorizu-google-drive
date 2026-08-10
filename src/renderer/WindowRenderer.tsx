import type { Window, WindowKind } from '../types/floorPlan'
import { SELECTION, WINDOW } from './styles'

const HIT_STROKE = 14

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

/** 参考間取図風：壁開口内の二重線＋種類別記号 */
export function WindowRenderer({ window: win, selected, selectable, onSelect }: WindowRendererProps) {
  const kind: WindowKind = win.kind ?? 'sliding'
  const dx = win.end.x - win.start.x
  const dy = win.end.y - win.start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return null

  const ux = dx / len
  const uy = dy / len
  // すべり出し窓・開き窓は、開く向き（outward）の側へ記号を出す
  const side = win.outward === -1 ? -1 : 1
  const nx = -uy * side
  const ny = ux * side
  const sweep = side > 0 ? 1 : 0
  const gap =
    kind === 'floor' ? WINDOW.gap * 0.85 : kind === 'high' ? WINDOW.gap * 0.65 : WINDOW.gap / 2
  const color = selected ? SELECTION.stroke : WINDOW.color
  const lineW = selected ? WINDOW.lineWidthSelected : WINDOW.lineWidth
  const detailW = WINDOW.detailWidth

  const midX = (win.start.x + win.end.x) / 2
  const midY = (win.start.y + win.end.y) / 2

  const l1s = { x: win.start.x + nx * gap, y: win.start.y + ny * gap }
  const l1e = { x: win.end.x + nx * gap, y: win.end.y + ny * gap }
  const l2s = { x: win.start.x - nx * gap, y: win.start.y - ny * gap }
  const l2e = { x: win.end.x - nx * gap, y: win.end.y - ny * gap }

  return (
    <g
      className={`window ${selected ? 'window-selected' : ''} ${selectable ? 'window-selectable' : ''} window-${kind}`}
      data-window-id={win.id}
    >
      {/* 開口を白で抜く（壁帯の上に載せる） */}
      <line
        x1={win.start.x}
        y1={win.start.y}
        x2={win.end.x}
        y2={win.end.y}
        stroke="#FFFFFF"
        strokeWidth={Math.max(WALL_PUNCH, gap * 2 + 3)}
        strokeLinecap="butt"
        pointerEvents="none"
      />

      <line x1={l1s.x} y1={l1s.y} x2={l1e.x} y2={l1e.y} stroke={color} strokeWidth={lineW} pointerEvents="none" />
      <line x1={l2s.x} y1={l2s.y} x2={l2e.x} y2={l2e.y} stroke={color} strokeWidth={lineW} pointerEvents="none" />
      {endTicks(win.start.x, win.start.y, nx, ny, color, detailW)}
      {endTicks(win.end.x, win.end.y, nx, ny, color, detailW)}

      {kind === 'sliding' && endTicks(midX, midY, nx, ny, color, detailW, 0.75)}

      {kind === 'fixed' && (
        <>
          <line x1={l1s.x} y1={l1s.y} x2={l2e.x} y2={l2e.y} stroke={color} strokeWidth={detailW * 0.8} pointerEvents="none" />
          <line x1={l2s.x} y1={l2s.y} x2={l1e.x} y2={l1e.y} stroke={color} strokeWidth={detailW * 0.8} pointerEvents="none" />
        </>
      )}

      {kind === 'casement' && (
        <path
          d={`M ${win.start.x} ${win.start.y} A ${len} ${len} 0 0 ${sweep} ${midX + nx * len * 0.32} ${midY + ny * len * 0.32}`}
          fill="none"
          stroke={color}
          strokeWidth={detailW}
          opacity={0.85}
          pointerEvents="none"
        />
      )}

      {kind === 'double_casement' && (
        <>
          <path
            d={`M ${win.start.x} ${win.start.y} A ${len / 2} ${len / 2} 0 0 ${sweep} ${midX + nx * len * 0.25} ${midY + ny * len * 0.25}`}
            fill="none"
            stroke={color}
            strokeWidth={detailW}
            pointerEvents="none"
          />
          <path
            d={`M ${win.end.x} ${win.end.y} A ${len / 2} ${len / 2} 0 0 ${1 - sweep} ${midX + nx * len * 0.25} ${midY + ny * len * 0.25}`}
            fill="none"
            stroke={color}
            strokeWidth={detailW}
            pointerEvents="none"
          />
          {endTicks(midX, midY, nx, ny, color, detailW, 0.7)}
        </>
      )}

      {kind === 'awning' && (
        <>
          <line x1={win.start.x} y1={win.start.y} x2={midX + nx * len * 0.35} y2={midY + ny * len * 0.35} stroke={color} strokeWidth={detailW} pointerEvents="none" />
          <line x1={win.end.x} y1={win.end.y} x2={midX + nx * len * 0.35} y2={midY + ny * len * 0.35} stroke={color} strokeWidth={detailW} pointerEvents="none" />
        </>
      )}

      {kind === 'floor' && endTicks(midX, midY, nx, ny, color, detailW, 0.95)}

      {kind === 'high' &&
        [0.25, 0.5, 0.75].map((t) => {
          const px = win.start.x + ux * len * t
          const py = win.start.y + uy * len * t
          return (
            <line
              key={t}
              x1={px + nx * gap}
              y1={py + ny * gap}
              x2={px - nx * gap}
              y2={py - ny * gap}
              stroke={color}
              strokeWidth={detailW * 0.85}
              pointerEvents="none"
            />
          )
        })}

      {selectable && onSelect && (
        <line
          className="window-hit-line"
          x1={win.start.x}
          y1={win.start.y}
          x2={win.end.x}
          y2={win.end.y}
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

/** 壁帯より少し広い白抜き幅 */
const WALL_PUNCH = 8
