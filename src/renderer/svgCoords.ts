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

/**
 * ドラッグ中かどうかの共有フラグ。
 * 要素を建物の外へ動かすと描画範囲が広がり、図面全体が縮小されてしまう。
 * すると掴んでいる点の座標変換までずれて、要素がカーソルから離れていく。
 * これを防ぐため、ドラッグ中は描画範囲を固定する（FloorCanvas が参照する）。
 */
let activeDragCount = 0
const dragListeners = new Set<() => void>()

export function isSvgDragging(): boolean {
  return activeDragCount > 0
}

export function subscribeSvgDrag(listener: () => void): () => void {
  dragListeners.add(listener)
  return () => dragListeners.delete(listener)
}

function setDragging(delta: number) {
  activeDragCount = Math.max(0, activeDragCount + delta)
  dragListeners.forEach((fn) => fn())
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
  setDragging(1)

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
    setDragging(-1)
    onEnd?.()
  }

  svg.addEventListener('pointermove', onPointerMove)
  svg.addEventListener('pointerup', onPointerUp)
  svg.addEventListener('pointercancel', onPointerUp)
}
