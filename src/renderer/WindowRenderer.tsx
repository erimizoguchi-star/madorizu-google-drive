import type { Window } from '../types/floorPlan'
import { WINDOW } from './styles'

interface WindowRendererProps {
  window: Window
}

export function WindowRenderer({ window: win }: WindowRendererProps) {
  const dx = win.end.x - win.start.x
  const dy = win.end.y - win.start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return null

  const nx = -dy / len
  const ny = dx / len
  const gap = WINDOW.gap / 2

  const l1s = { x: win.start.x + nx * gap, y: win.start.y + ny * gap }
  const l1e = { x: win.end.x + nx * gap, y: win.end.y + ny * gap }
  const l2s = { x: win.start.x - nx * gap, y: win.start.y - ny * gap }
  const l2e = { x: win.end.x - nx * gap, y: win.end.y - ny * gap }

  const midX = (win.start.x + win.end.x) / 2
  const midY = (win.start.y + win.end.y) / 2
  const tickLen = 4
  const tx = (nx * tickLen) / 2
  const ty = (ny * tickLen) / 2

  return (
    <g className="window">
      <line x1={l1s.x} y1={l1s.y} x2={l1e.x} y2={l1e.y} stroke={WINDOW.color} strokeWidth={1} />
      <line x1={l2s.x} y1={l2s.y} x2={l2e.x} y2={l2e.y} stroke={WINDOW.color} strokeWidth={1} />
      <line
        x1={midX - tx}
        y1={midY - ty}
        x2={midX + tx}
        y2={midY + ty}
        stroke={WINDOW.color}
        strokeWidth={0.8}
      />
    </g>
  )
}
