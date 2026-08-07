import { useEffect, useRef, useState } from 'react'
import type { FloorPlan } from '../types/floorPlan'
import type { Point } from '../types/floorPlan'
import { ZoomableView } from '../components/ZoomableView'
import type { SourceOverlayState } from '../components/SourceOverlayControls'
import type { SelectedElementRef, SelectOptions } from '../utils/floorPlanEdit'
import {
  fixtureTypeFromPlaceKind,
  isFixturePlaceKind,
  type PlaceKind,
} from '../utils/floorPlanAdd'
import { fixtureTypeLabel } from '../constants/fixtureOptions'
import type { FixtureCorner } from '../utils/floorPlanDrag'
import type { RectEdge } from '../utils/roomGeometry'
import type { LabelLineKind } from './roomLabelLayout'
import { FloorCanvas } from './FloorCanvas'

interface FloorPlanViewProps {
  floorPlan: FloorPlan
  id?: string
  editable?: boolean
  selected?: SelectedElementRef | null
  mergeRoomIds?: { floorId: string; roomIds: string[] } | null
  placeKind?: PlaceKind | null
  wallDraftStart?: Point | null
  onSelect?: (ref: SelectedElementRef, options?: SelectOptions) => void
  onLabelOffsetChange?: (ref: SelectedElementRef, kind: LabelLineKind, offset: Point) => void
  onRoomResize?: (
    ref: SelectedElementRef & { kind: 'room' },
    edge: RectEdge,
    positionFloorSvg: number
  ) => void
  onRoomMove?: (ref: SelectedElementRef & { kind: 'room' }, polygon: Point[]) => void
  onWallEndpointMove?: (
    ref: SelectedElementRef & { kind: 'wall' },
    endpoint: 'start' | 'end',
    position: Point
  ) => void
  onWallMove?: (ref: SelectedElementRef & { kind: 'wall' }, start: Point, end: Point) => void
  onDoorMove?: (ref: SelectedElementRef & { kind: 'door' }, position: Point) => void
  onWindowEndpointMove?: (
    ref: SelectedElementRef & { kind: 'window' },
    endpoint: 'start' | 'end',
    position: Point
  ) => void
  onWindowMove?: (ref: SelectedElementRef & { kind: 'window' }, start: Point, end: Point) => void
  onFixtureMove?: (ref: SelectedElementRef & { kind: 'fixture' }, position: Point) => void
  onStairMove?: (ref: SelectedElementRef & { kind: 'stair' }, delta: Point) => void
  onFixtureResize?: (
    ref: SelectedElementRef & { kind: 'fixture' },
    corner: FixtureCorner,
    position: Point
  ) => void
  onPlaceClick?: (floorId: string, position: Point) => void
  /** アップロードした平面図を重ねて表示する設定 */
  overlay?: SourceOverlayState
  overlayUrl?: string
  onOverlayOffsetChange?: (offset: Point) => void
  /** 2点合わせの結果（倍率と位置）を反映する */
  onOverlayCalibrated?: (result: { scaleX: number; scaleY: number; offset: Point }) => void
  /** 2点合わせで何点クリック済みかを親へ伝える */
  onOverlayCalibrationStep?: (step: number) => void
}

const BASE_PLACE_HINTS: Record<Exclude<PlaceKind, `fixture:${string}`>, string> = {
  room: '間取図上をクリックして部屋を配置（配置後ドラッグで移動できます）',
  door: '壁付近をクリックして扉を追加（続けて追加できます・Escで終了）',
  window: '壁付近をクリックして窓を追加（続けて追加できます・Escで終了）',
  opening: '壁付近をクリックして開口部を追加（続けて追加できます・Escで終了）',
  wall: '始点→終点の順にクリックして壁を追加',
}

function placeHint(kind: PlaceKind): string {
  if (isFixturePlaceKind(kind)) {
    return `間取図上をクリックして「${fixtureTypeLabel(fixtureTypeFromPlaceKind(kind))}」を配置（続けて追加可・Escで終了）`
  }
  return BASE_PLACE_HINTS[kind]
}

export function FloorPlanView({
  floorPlan,
  id = 'madorizu-export',
  editable,
  selected,
  mergeRoomIds,
  placeKind,
  overlay,
  overlayUrl,
  onOverlayOffsetChange,
  onOverlayCalibrated,
  onOverlayCalibrationStep,
  onSelect,
  onLabelOffsetChange,
  onRoomResize,
  onRoomMove,
  onWallEndpointMove,
  onWallMove,
  onDoorMove,
  onWindowEndpointMove,
  onWindowMove,
  onFixtureMove,
  onFixtureResize,
  onStairMove,
  onPlaceClick,
}: FloorPlanViewProps) {
  const placing = !!placeKind && !!onPlaceClick
  const calibrating = !!overlay?.enabled && overlay.calibrating
  const adjustingOverlay = (!!overlay?.enabled && overlay.adjusting) || calibrating
  const floorsRef = useRef<HTMLDivElement | null>(null)
  const [calibFirst, setCalibFirst] = useState<{ client: Point; local: Point } | null>(null)

  useEffect(() => {
    if (!calibrating) setCalibFirst(null)
  }, [calibrating])

  useEffect(() => {
    onOverlayCalibrationStep?.(calibFirst ? 1 : 0)
  }, [calibFirst, onOverlayCalibrationStep])

  /** .floors-container に実際に掛かっている表示倍率（ZoomableView の拡大分） */
  const currentZoom = () => {
    const container = floorsRef.current
    if (!container || !container.offsetWidth) return 1
    return container.getBoundingClientRect().width / container.offsetWidth || 1
  }

  /** 間取図の建物（1つ目の階の部屋全体）の画面上の矩形 */
  const planRectOnScreen = () => {
    const layer = floorsRef.current?.querySelector('svg .rooms-layer') as SVGGElement | null
    if (!layer) return null
    const box = layer.getBBox()
    const ctm = layer.getScreenCTM()
    if (!ctm || box.width < 1 || box.height < 1) return null
    const toScreen = (x: number, y: number) => ({
      x: ctm.a * x + ctm.c * y + ctm.e,
      y: ctm.b * x + ctm.d * y + ctm.f,
    })
    const p1 = toScreen(box.x, box.y)
    const p2 = toScreen(box.x + box.width, box.y + box.height)
    return { p1, p2 }
  }

  /**
   * 重ねた平面図の上で建物の左上・右下をクリックしてもらい、
   * その2点が間取図の建物の角に重なるよう、縦横の倍率と位置を求める。
   */
  const handleCalibrationClick = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!overlay || !onOverlayCalibrated) return
    e.preventDefault()
    e.stopPropagation()

    const container = floorsRef.current
    if (!container) return
    const zoom = currentZoom()
    const rect = container.getBoundingClientRect()
    const client = { x: e.clientX, y: e.clientY }
    const local = { x: (client.x - rect.left) / zoom, y: (client.y - rect.top) / zoom }

    if (!calibFirst) {
      setCalibFirst({ client, local })
      return
    }

    const plan = planRectOnScreen()
    if (!plan) {
      setCalibFirst(null)
      return
    }

    const c1 = calibFirst.client
    const c2 = client
    const dx = c2.x - c1.x
    const dy = c2.y - c1.y
    // 2点が近すぎると倍率が発散するので無視する
    if (Math.abs(dx) < 8 || Math.abs(dy) < 8) {
      setCalibFirst(null)
      return
    }

    const kx = (plan.p2.x - plan.p1.x) / dx
    const ky = (plan.p2.y - plan.p1.y) / dy

    // 拡大は画像の中心を基準に掛かるので、中心からの距離を倍率で伸ばした先を求める
    const img = container.querySelector('.source-overlay-image') as HTMLImageElement | null
    if (!img) {
      setCalibFirst(null)
      return
    }
    const imgRect = img.getBoundingClientRect()
    const origin = { x: imgRect.left + imgRect.width / 2, y: imgRect.top + imgRect.height / 2 }
    const movedC1 = {
      x: origin.x + (c1.x - origin.x) * kx,
      y: origin.y + (c1.y - origin.y) * ky,
    }

    onOverlayCalibrated({
      scaleX: overlay.scaleX * kx,
      scaleY: overlay.scaleY * ky,
      offset: {
        x: overlay.offset.x + (plan.p1.x - movedC1.x) / zoom,
        y: overlay.offset.y + (plan.p1.y - movedC1.y) / zoom,
      },
    })
    setCalibFirst(null)
  }

  /**
   * 重ねた平面図をドラッグして位置合わせする。
   * ZoomableView が拡大縮小しているぶん、画面上の移動量をそのまま使うとずれるため、
   * 実際の表示倍率で割ってから反映する。
   */
  const startOverlayDrag = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!overlay || !onOverlayOffsetChange) return
    e.preventDefault()
    e.stopPropagation()

    const container = floorsRef.current
    const zoom = container
      ? container.getBoundingClientRect().width / (container.offsetWidth || 1)
      : 1
    const startX = e.clientX
    const startY = e.clientY
    const origin = { ...overlay.offset }
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      onOverlayOffsetChange({
        x: origin.x + (ev.clientX - startX) / (zoom || 1),
        y: origin.y + (ev.clientY - startY) / (zoom || 1),
      })
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      target.releasePointerCapture(e.pointerId)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  return (
    <div className="floor-plan-view" id={id}>
      <h2 className="floor-plan-title">{floorPlan.title}</h2>
      {placing ? (
        <p className="edit-mode-hint place-mode-hint">{placeHint(placeKind)}</p>
      ) : (
        onSelect && (
          <p className="edit-mode-hint">
            部屋・壁・扉・窓・設備・階段をクリックして選択。部屋と階段はドラッグで移動、部屋は辺ハンドル・設備は四隅でサイズ変更。
            選択して Delete キーで削除。追加は左パネルから。小さい要素は左の「要素を選択」から選ぶと確実です。
          </p>
        )
      )}

      <ZoomableView editInteractive={!!onSelect || placing} className="floor-plan-zoom">
        <div className="floors-container" ref={floorsRef}>
          {overlay?.enabled && overlayUrl && (
            <>
              <img
                src={overlayUrl}
                alt="重ねた平面図"
                className={`source-overlay-image ${overlay.adjusting ? 'adjusting' : ''} ${
                  calibrating ? 'calibrating' : ''
                }`}
                draggable={false}
                style={{
                  opacity: overlay.opacity,
                  transform: `translate(-50%, -50%) translate(${overlay.offset.x}px, ${overlay.offset.y}px) scale(${overlay.scaleX}, ${overlay.scaleY})`,
                  pointerEvents: overlay.adjusting || calibrating ? 'auto' : 'none',
                }}
                onPointerDown={
                  calibrating
                    ? handleCalibrationClick
                    : overlay.adjusting
                      ? startOverlayDrag
                      : undefined
                }
              />
              {calibFirst && (
                <span
                  className="overlay-calib-marker"
                  style={{ left: `${calibFirst.local.x}px`, top: `${calibFirst.local.y}px` }}
                />
              )}
            </>
          )}
          {floorPlan.floors.map((floor) => (
            <FloorCanvas
              key={floor.id}
              floor={floor}
              editable={editable && !placing && !adjustingOverlay}
              mergeRoomIds={
                mergeRoomIds?.floorId === floor.id ? mergeRoomIds.roomIds : undefined
              }
              selectedRoomId={
                selected?.kind === 'room' && selected.floorId === floor.id ? selected.roomId : null
              }
              selectedStairId={
                selected?.kind === 'stair' && selected.floorId === floor.id ? selected.stairId : null
              }
              selectedWallId={
                selected?.kind === 'wall' && selected.floorId === floor.id ? selected.wallId : null
              }
              selectedDoorId={
                selected?.kind === 'door' && selected.floorId === floor.id ? selected.doorId : null
              }
              selectedWindowId={
                selected?.kind === 'window' && selected.floorId === floor.id
                  ? selected.windowId
                  : null
              }
              selectedFixtureId={
                selected?.kind === 'fixture' && selected.floorId === floor.id
                  ? selected.fixtureId
                  : null
              }
              placeMode={placing}
              onPlaceClick={
                placing ? (pos) => onPlaceClick?.(floor.id, pos) : undefined
              }
              onRoomSelect={
                !placing && !adjustingOverlay && onSelect
                  ? (roomId, additive) =>
                      onSelect({ kind: 'room', floorId: floor.id, roomId }, { additive })
                  : undefined
              }
              onStairSelect={
                !placing && !adjustingOverlay && onSelect
                  ? (stairId) => onSelect({ kind: 'stair', floorId: floor.id, stairId })
                  : undefined
              }
              onStairMove={
                onStairMove && editable && !placing && !adjustingOverlay
                  ? (stairId, delta) =>
                      onStairMove({ kind: 'stair', floorId: floor.id, stairId }, delta)
                  : undefined
              }
              onWallSelect={
                !placing && !adjustingOverlay && onSelect
                  ? (wallId) => onSelect({ kind: 'wall', floorId: floor.id, wallId })
                  : undefined
              }
              onDoorSelect={
                !placing && !adjustingOverlay && onSelect
                  ? (doorId) => onSelect({ kind: 'door', floorId: floor.id, doorId })
                  : undefined
              }
              onWindowSelect={
                !placing && !adjustingOverlay && onSelect
                  ? (windowId) => onSelect({ kind: 'window', floorId: floor.id, windowId })
                  : undefined
              }
              onFixtureSelect={
                !placing && !adjustingOverlay && onSelect
                  ? (fixtureId) => onSelect({ kind: 'fixture', floorId: floor.id, fixtureId })
                  : undefined
              }
              onRoomLabelOffsetChange={
                !placing && onLabelOffsetChange
                  ? (roomId, kind, offset) =>
                      onLabelOffsetChange({ kind: 'room', floorId: floor.id, roomId }, kind, offset)
                  : undefined
              }
              onStairLabelOffsetChange={
                !placing && onLabelOffsetChange
                  ? (stairId, kind, offset) =>
                      onLabelOffsetChange(
                        { kind: 'stair', floorId: floor.id, stairId },
                        kind,
                        offset
                      )
                  : undefined
              }
              onRoomResize={
                onRoomResize && editable && !placing && !adjustingOverlay
                  ? (roomId, edge, positionFloorSvg) =>
                      onRoomResize(
                        { kind: 'room', floorId: floor.id, roomId },
                        edge,
                        positionFloorSvg
                      )
                  : undefined
              }
              onRoomMove={
                onRoomMove && editable && !placing && !adjustingOverlay
                  ? (roomId, polygon) =>
                      onRoomMove({ kind: 'room', floorId: floor.id, roomId }, polygon)
                  : undefined
              }
              onWallEndpointMove={
                onWallEndpointMove && editable && !placing && !adjustingOverlay
                  ? (wallId, endpoint, position) =>
                      onWallEndpointMove(
                        { kind: 'wall', floorId: floor.id, wallId },
                        endpoint,
                        position
                      )
                  : undefined
              }
              onWallMove={
                onWallMove && editable && !placing && !adjustingOverlay
                  ? (wallId, start, end) =>
                      onWallMove({ kind: 'wall', floorId: floor.id, wallId }, start, end)
                  : undefined
              }
              onDoorMove={
                onDoorMove && editable && !placing && !adjustingOverlay
                  ? (doorId, position) =>
                      onDoorMove({ kind: 'door', floorId: floor.id, doorId }, position)
                  : undefined
              }
              onWindowEndpointMove={
                onWindowEndpointMove && editable && !placing && !adjustingOverlay
                  ? (windowId, endpoint, position) =>
                      onWindowEndpointMove(
                        { kind: 'window', floorId: floor.id, windowId },
                        endpoint,
                        position
                      )
                  : undefined
              }
              onWindowMove={
                onWindowMove && editable && !placing && !adjustingOverlay
                  ? (windowId, start, end) =>
                      onWindowMove({ kind: 'window', floorId: floor.id, windowId }, start, end)
                  : undefined
              }
              onFixtureMove={
                onFixtureMove && editable && !placing && !adjustingOverlay
                  ? (fixtureId, position) =>
                      onFixtureMove({ kind: 'fixture', floorId: floor.id, fixtureId }, position)
                  : undefined
              }
              onFixtureResize={
                onFixtureResize && editable && !placing && !adjustingOverlay
                  ? (fixtureId, corner, position) =>
                      onFixtureResize(
                        { kind: 'fixture', floorId: floor.id, fixtureId },
                        corner,
                        position
                      )
                  : undefined
              }
            />
          ))}
        </div>
      </ZoomableView>
    </div>
  )
}
