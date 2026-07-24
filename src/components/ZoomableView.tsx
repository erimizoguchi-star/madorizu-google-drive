import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 3
const ZOOM_STEP = 0.1
const DEFAULT_ZOOM = 1

interface ZoomableViewProps {
  children: ReactNode
  className?: string
  /** ラベル編集などインタラクティブ時はラベル上でのみパンを抑止 */
  editInteractive?: boolean
  /** 初期表示で内容全体がビューポートに収まるよう調整 */
  fitToView?: boolean
}

function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value))
}

function isPanTarget(target: EventTarget | null, editInteractive: boolean): boolean {
  if (!(target instanceof Element)) return true
  if (
    target.closest(
      '[data-label-kind], [data-no-pan], .place-overlay, .room-label-line, .room-label, .room-resize-handle, .edit-handle, .door-hit, .door-hit-line, .window-hit-line, .fixture-hit, .wall-hit-line, .room-draggable'
    )
  ) {
    return false
  }
  if (editInteractive) {
    if (target.closest('[data-room-id], [data-stair-id]')) return false
    if (target.tagName === 'text' || target.closest('text')) return false
    return true
  }
  return true
}

const FIT_ZOOM_MIN = 0.05

function measureStageContent(stage: HTMLDivElement): { width: number; height: number } {
  const child = stage.firstElementChild as HTMLElement | null
  if (child instanceof HTMLImageElement && child.naturalWidth > 0) {
    return {
      width: child.offsetWidth || child.naturalWidth,
      height: child.offsetHeight || child.naturalHeight,
    }
  }
  return { width: stage.scrollWidth, height: stage.scrollHeight }
}

export function ZoomableView({
  children,
  className = '',
  editInteractive = false,
  fitToView = false,
}: ZoomableViewProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({ zoom: DEFAULT_ZOOM, pan: { x: 0, y: 0 } })
  const dragRef = useRef<{
    startX: number
    startY: number
    panX: number
    panY: number
    panning: boolean
  } | null>(null)

  stateRef.current = { zoom, pan }

  const applyZoomAtPoint = useCallback((nextZoom: number, clientX: number, clientY: number) => {
    const viewport = viewportRef.current
    if (!viewport) return

    const rect = viewport.getBoundingClientRect()
    const mouseX = clientX - rect.left
    const mouseY = clientY - rect.top
    const { zoom: prevZoom, pan: prevPan } = stateRef.current
    const clamped = clampZoom(nextZoom)
    if (clamped === prevZoom) return

    const contentX = (mouseX - prevPan.x) / prevZoom
    const contentY = (mouseY - prevPan.y) / prevZoom
    const nextPan = {
      x: mouseX - contentX * clamped,
      y: mouseY - contentY * clamped,
    }

    setZoom(clamped)
    setPan(nextPan)
  }, [])

  const zoomFromViewportCenter = useCallback(
    (delta: number) => {
      const viewport = viewportRef.current
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      applyZoomAtPoint(
        stateRef.current.zoom + delta,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      )
    },
    [applyZoomAtPoint]
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      applyZoomAtPoint(stateRef.current.zoom + delta, e.clientX, e.clientY)
    }

    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [applyZoomAtPoint])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return
    if (!isPanTarget(e.target, editInteractive)) return

    const viewport = viewportRef.current
    if (!viewport) return

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      panning: false,
    }
    setDragging(true)
    viewport.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.panning) {
      if (Math.hypot(dx, dy) < 4) return
      dragRef.current.panning = true
    }
    setPan({
      x: dragRef.current.panX + dx,
      y: dragRef.current.panY + dy,
    })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    viewportRef.current?.releasePointerCapture(e.pointerId)
  }

  const fitContentToViewport = useCallback(() => {
    const viewport = viewportRef.current
    const stage = stageRef.current
    if (!viewport || !stage) return

    const { width: contentW, height: contentH } = measureStageContent(stage)
    if (contentW <= 0 || contentH <= 0) return

    const nextZoom = Math.min(
      (viewport.clientWidth - 2) / contentW,
      (viewport.clientHeight - 2) / contentH,
      ZOOM_MAX
    )
    const clampedZoom = Math.max(nextZoom, FIT_ZOOM_MIN)

    setZoom(clampedZoom)
    setPan({
      x: (viewport.clientWidth - contentW * clampedZoom) / 2,
      y: (viewport.clientHeight - contentH * clampedZoom) / 2,
    })
  }, [])

  useEffect(() => {
    if (!fitToView) return

    const viewport = viewportRef.current
    const stage = stageRef.current
    if (!viewport || !stage) return

    const scheduleFit = () => requestAnimationFrame(() => fitContentToViewport())

    const observer = new ResizeObserver(scheduleFit)
    observer.observe(viewport)
    observer.observe(stage)

    const img = stage.querySelector('img')
    if (img) {
      if (img.complete) scheduleFit()
      else img.addEventListener('load', scheduleFit)
    } else {
      scheduleFit()
    }

    return () => {
      observer.disconnect()
      img?.removeEventListener('load', scheduleFit)
    }
  }, [fitToView, fitContentToViewport, children])

  const resetView = () => {
    if (fitToView) {
      fitContentToViewport()
      return
    }
    setZoom(DEFAULT_ZOOM)
    setPan({ x: 0, y: 0 })
  }

  return (
    <div className={`zoomable-view ${className}`.trim()}>
      <div className="zoom-toolbar" role="toolbar" aria-label="表示倍率">
        <button
          type="button"
          className="btn btn-secondary zoom-btn"
          onClick={() => zoomFromViewportCenter(-ZOOM_STEP * 2.5)}
          disabled={zoom <= ZOOM_MIN}
          aria-label="縮小"
        >
          −
        </button>
        <span className="zoom-level" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="btn btn-secondary zoom-btn"
          onClick={() => zoomFromViewportCenter(ZOOM_STEP * 2.5)}
          disabled={zoom >= ZOOM_MAX}
          aria-label="拡大"
        >
          ＋
        </button>
        <button
          type="button"
          className="btn btn-secondary zoom-reset-btn"
          onClick={resetView}
          disabled={!fitToView && zoom === DEFAULT_ZOOM && pan.x === 0 && pan.y === 0}
        >
          リセット
        </button>
        <span className="zoom-hint">スクロール＝拡大／ドラッグ＝移動</span>
      </div>

      <div
        ref={viewportRef}
        className={`zoom-viewport ${dragging ? 'zoom-viewport-dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          ref={stageRef}
          className="zoom-stage"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
