import type { TextLabel } from '../types/floorPlan'
import { LABEL, SELECTION } from './styles'
import { attachSvgPointerDrag, canvasToFloor } from './svgCoords'

interface TextLabelRendererProps {
  label: TextLabel
  selected?: boolean
  editable?: boolean
  floorOffset?: { x: number; y: number }
  onSelect?: (textId: string) => void
  onMove?: (positionFloor: { x: number; y: number }) => void
}

function estimateBox(text: string, fontSize: number) {
  const width = Math.max(text.length * fontSize * 0.92, fontSize * 2.2)
  const height = fontSize * 1.4
  return { width, height }
}

export function TextLabelRenderer({
  label,
  selected,
  editable,
  floorOffset,
  onSelect,
  onMove,
}: TextLabelRendererProps) {
  const fontSize = label.fontSize ?? LABEL.defaultFontSize
  const { width, height } = estimateBox(label.text || ' ', fontSize)
  const canDrag = editable && onMove && floorOffset
  const angle = label.angle ?? 0

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (!canDrag || !floorOffset) return
    const svg = e.currentTarget.ownerSVGElement
    if (!svg) return
    onSelect?.(label.id)
    attachSvgPointerDrag(e, svg, (canvasPos) => {
      onMove(canvasToFloor(canvasPos, floorOffset))
    })
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect?.(label.id)
  }

  return (
    <g
      className={`text-label ${selected ? 'text-label-selected' : ''} ${editable ? 'text-label-editable' : ''}`}
      data-text-id={label.id}
      data-no-pan=""
      transform={`translate(${label.position.x} ${label.position.y}) rotate(${angle})`}
      style={{ cursor: canDrag ? 'grab' : onSelect ? 'pointer' : undefined }}
      onPointerDown={canDrag ? handlePointerDown : undefined}
      onClick={onSelect ? handleClick : undefined}
    >
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        fill={selected ? 'rgba(192, 138, 62, 0.12)' : 'transparent'}
        stroke={selected ? SELECTION.stroke : 'transparent'}
        strokeWidth={selected ? 1 : 0}
        rx={2}
      />
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fill={LABEL.color}
        fontFamily={LABEL.fontFamily}
        fontSize={fontSize}
        fontWeight={LABEL.fontWeight}
        fontStyle={LABEL.fontStyle}
        letterSpacing={LABEL.letterSpacing}
        pointerEvents="none"
      >
        {label.text}
      </text>
    </g>
  )
}
