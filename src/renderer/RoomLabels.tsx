import { useRef } from 'react'
import type { Point } from '../types/floorPlan'
import { LABEL } from './styles'
import type { LabelLine, LabelLineKind, RoomLabelLayout } from './roomLabelLayout'

interface RoomLabelsProps {
  layout: RoomLabelLayout
  editable?: boolean
  selected?: boolean
  offsets?: Partial<Record<LabelLineKind, Point>>
  draggableKinds?: LabelLineKind[]
  onLabelOffsetChange?: (kind: LabelLineKind, offset: Point) => void
  onSelect?: () => void
}

function estimateTextBox(text: string, fontSize: number) {
  const width = Math.max(text.length * fontSize * 0.92, fontSize * 2)
  const height = fontSize * 1.35
  return { width, height }
}

function getSvgUserUnitScale(svg: SVGSVGElement): number {
  const rect = svg.getBoundingClientRect()
  const vb = svg.viewBox.baseVal
  const viewWidth = vb.width || svg.clientWidth
  if (!viewWidth || !rect.width) return 1
  return rect.width / viewWidth
}

export function RoomLabels({
  layout,
  editable,
  selected,
  offsets = {},
  draggableKinds = ['name', 'area', 'note'],
  onLabelOffsetChange,
  onSelect,
}: RoomLabelsProps) {
  const dragRef = useRef<{
    kind: LabelLineKind
    pointerId: number
    startClientX: number
    startClientY: number
    originOffset: Point
    scale: number
    moved: boolean
  } | null>(null)

  const canDrag = editable && onLabelOffsetChange

  const endDrag = (pointerId: number) => {
    if (dragRef.current?.pointerId !== pointerId) return
    dragRef.current = null
  }

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>, line: LabelLine) => {
    if (!canDrag || !draggableKinds.includes(line.kind)) return
    if (e.button !== 0) return

    e.stopPropagation()
    e.preventDefault()

    const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement) ?? null
    if (!svg) return

    dragRef.current = {
      kind: line.kind,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originOffset: offsets[line.kind] ?? { x: 0, y: 0 },
      scale: getSvgUserUnitScale(svg),
      moved: false,
    }

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || ev.pointerId !== drag.pointerId) return

      ev.preventDefault()
      ev.stopPropagation()

      const dx = (ev.clientX - drag.startClientX) / drag.scale
      const dy = (ev.clientY - drag.startClientY) / drag.scale
      if (!drag.moved && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
        drag.moved = true
      }

      onLabelOffsetChange!(drag.kind, {
        x: Math.round((drag.originOffset.x + dx) * 10) / 10,
        y: Math.round((drag.originOffset.y + dy) * 10) / 10,
      })
    }

    const onUp = (ev: PointerEvent) => {
      if (dragRef.current?.pointerId !== ev.pointerId) return
      const moved = dragRef.current.moved
      endDrag(ev.pointerId)
      document.removeEventListener('pointermove', onMove, true)
      document.removeEventListener('pointerup', onUp, true)
      document.removeEventListener('pointercancel', onUp, true)
      if (!moved) onSelect?.()
    }

    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('pointerup', onUp, true)
    document.addEventListener('pointercancel', onUp, true)
  }

  return (
    <g className="room-label" data-no-pan>
      {[...layout.lines].reverse().map((line) => {
        const isDraggable = canDrag && draggableKinds.includes(line.kind)
        const { width, height } = estimateTextBox(line.text, line.fontSize)
        const hitPad = 12
        const hitW = width + hitPad * 2
        const hitH = height + hitPad * 2

        return (
          <g
            key={line.kind}
            data-label-kind={line.kind}
            data-no-pan={isDraggable ? '' : undefined}
            className={`room-label-line room-label-${line.kind}${selected ? ' room-label-selected' : ''}`}
            style={isDraggable ? { cursor: 'move' } : undefined}
            onPointerDownCapture={isDraggable ? (e) => handlePointerDown(e, line) : undefined}
            onClick={
              onSelect
                ? (e) => {
                    e.stopPropagation()
                    if (!isDraggable) onSelect()
                  }
                : undefined
            }
          >
            {isDraggable && (
              <rect
                x={line.x - hitW / 2}
                y={line.y - hitH / 2}
                width={hitW}
                height={hitH}
                fill="transparent"
                data-no-pan
              />
            )}
            <text
              x={line.x}
              y={line.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily={LABEL.fontFamily}
              fontSize={line.fontSize}
              fontWeight={line.fontWeight}
              fontStyle={LABEL.fontStyle}
              letterSpacing={LABEL.letterSpacing}
              fill={line.fill}
              style={{ pointerEvents: 'none' }}
            >
              {line.text}
            </text>
          </g>
        )
      })}
    </g>
  )
}
