import type { Point } from '../types/floorPlan'

export function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Point | null {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const local = pt.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

export function canvasToFloor(canvas: Point, floorOffset: Point): Point {
  return { x: canvas.x - floorOffset.x, y: canvas.y - floorOffset.y }
}

export function attachSvgPointerDrag(
  e: React.PointerEvent<Element>,
  svg: SVGSVGElement,
  onMove: (canvasPos: Point) => void,
  onEnd?: () => void
) {
  e.stopPropagation()
  e.preventDefault()

  const pointerId = e.pointerId
  svg.setPointerCapture(pointerId)

  const onPointerMove = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    const pos = clientToSvg(svg, ev.clientX, ev.clientY)
    if (pos) onMove(pos)
  }

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return
    svg.releasePointerCapture(pointerId)
    svg.removeEventListener('pointermove', onPointerMove)
    svg.removeEventListener('pointerup', onPointerUp)
    svg.removeEventListener('pointercancel', onPointerUp)
    onEnd?.()
  }

  svg.addEventListener('pointermove', onPointerMove)
  svg.addEventListener('pointerup', onPointerUp)
  svg.addEventListener('pointercancel', onPointerUp)
}
