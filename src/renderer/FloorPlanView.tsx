import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
import type { GridSnapKind } from './GridLinesLayer'
import { collectGridLines, type GridAxis } from '../utils/gridLines'
import { darkMapFromImage, findLineNear, type DarkMap } from '../utils/imageLines'
import { mmToSvgUnits } from '../utils/roomGeometry'

interface FloorPlanViewProps {
  floorPlan: FloorPlan
  id?: string
  /** 変わったときに図面全体を枠に収め直す（新しい図面を読み込んだとき） */
  fitKey?: string | number
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
  onStairMove?: (ref: SelectedElementRef & { kind: 'stair' }, polygon: Point[]) => void
  onTextMove?: (ref: SelectedElementRef & { kind: 'text' }, position: Point) => void
  onFixtureResize?: (
    ref: SelectedElementRef & { kind: 'fixture' },
    corner: FixtureCorner,
    position: Point
  ) => void
  onPlaceClick?: (floorId: string, position: Point) => void
  /** アップロードした平面図を重ねて表示する設定 */
  overlay?: SourceOverlayState
  overlayUrl?: string
  /** 平面図を重ねる階。位置合わせ・2点合わせ・吸い付きはこの階の間取図を基準にする（省略時は1つ目の階） */
  overlayFloorId?: string
  onOverlayOffsetChange?: (offset: Point) => void
  /**
   * 2点合わせの結果（倍率と位置）を反映する。
   * planStretch は、1つ目の階の建物を平面図の建物にぴったり合わせるための横・縦の倍率（2点合わせのときだけ）
   */
  onOverlayCalibrated?: (result: {
    scaleX: number
    scaleY: number
    offset: Point
    planStretch?: { sx: number; sy: number }
  }) => void
  /** 2点合わせで何点クリック済みかを親へ伝える */
  onOverlayCalibrationStep?: (step: number) => void
  /** 「線を合わせる」中。通りをドラッグで動かせ、ほかの編集は止まる */
  aligning?: boolean
  /** 選んだ要素の上に出すメニュー（部屋・扉・窓） */
  selectionToolbar?: ReactNode
  /** 部屋（部屋名）をダブルクリックしたとき */
  onRoomDoubleClick?: (ref: SelectedElementRef & { kind: 'room' }) => void
  /**
   * 通りを動かす。to は吸い付きを反映した位置。
   * start で動かす前の間取図を覚え、move のたびに from → to をその間取図に当て直す（end で終了）
   */
  onGridLineMove?: (
    floorId: string,
    axis: GridAxis,
    from: number,
    to: number,
    phase: 'start' | 'move' | 'end'
  ) => void
}

/** 吸い付く距離（画面上の px） */
const SNAP_RADIUS_PX = 14
const LINE_SNAP_PX = 8
/** 2本線で描いた壁とみなす最大の厚み */
const MAX_WALL_THICKNESS_MM = 250
/** 吸い付き・ドラッグ後の位置の刻み（5mm） */
const roundHalf = (v: number) => Math.round(v * 2) / 2

const BASE_PLACE_HINTS: Record<Exclude<PlaceKind, `fixture:${string}`>, string> = {
  room: '間取図上をクリックして部屋を配置（配置後ドラッグで移動できます）',
  door: '壁をクリックして扉を追加（続けて追加できます・Escで終了）',
  window: '壁をクリックして窓を追加（続けて追加できます・Escで終了）',
  opening: '壁をクリックして開口部を追加（続けて追加できます・Escで終了）',
  wall: '始点→終点の順にクリックして壁を追加',
  text: 'クリックして文字を配置（続けて追加できます・Escで終了）',
}

function placeHint(kind: PlaceKind): string {
  if (isFixturePlaceKind(kind)) {
    return `間取図上をクリックして「${fixtureTypeLabel(fixtureTypeFromPlaceKind(kind))}」を配置（続けて追加可・Escで終了）`
  }
  return BASE_PLACE_HINTS[kind]
}

/** 平面図を重ねる階の間取図（SVG）。見つからなければ1つ目の階 */
function findOverlayFloorSvg(container: HTMLElement | null, floorId: string | undefined): SVGSVGElement | null {
  if (!container) return null
  const target = floorId
    ? container.querySelector<SVGSVGElement>(`svg.floor-canvas[data-floor-id="${CSS.escape(floorId)}"]`)
    : null
  return target ?? container.querySelector<SVGSVGElement>('svg.floor-canvas')
}

/** 間取図の建物（その階の部屋全体）の画面上の矩形 */
function planRectOnScreen(svg: SVGSVGElement | null) {
  const layer = svg?.querySelector('.rooms-layer') as SVGGElement | null
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

export function FloorPlanView({
  floorPlan,
  id = 'madorizu-export',
  fitKey,
  editable,
  selected,
  mergeRoomIds,
  placeKind,
  wallDraftStart,
  overlay,
  overlayUrl,
  overlayFloorId,
  onOverlayOffsetChange,
  onOverlayCalibrated,
  onOverlayCalibrationStep,
  aligning,
  selectionToolbar,
  onRoomDoubleClick,
  onGridLineMove,
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
  onTextMove,
  onPlaceClick,
}: FloorPlanViewProps) {
  const placing = !!placeKind && !!onPlaceClick
  const calibrating = !!overlay?.enabled && overlay.calibrating
  const adjustingOverlay = (!!overlay?.enabled && overlay.adjusting) || calibrating
  // 配置中・平面図の位置合わせ中・線を合わせる中は、部屋などの選択や編集を止める
  const locked = placing || adjustingOverlay || !!aligning
  const floorsRef = useRef<HTMLDivElement | null>(null)
  const [calibFirst, setCalibFirst] = useState<{ client: Point; local: Point } | null>(null)

  // 2点合わせを終了・中断したら1点目の記録を破棄する。
  // effect で setState すると余計な再描画が走るため、React 推奨の
  // 「前回値と比較してレンダー中に調整する」パターンで書く
  const [prevCalibrating, setPrevCalibrating] = useState(calibrating)
  if (calibrating !== prevCalibrating) {
    setPrevCalibrating(calibrating)
    if (!calibrating) setCalibFirst(null)
  }

  useEffect(() => {
    onOverlayCalibrationStep?.(calibFirst ? 1 : 0)
  }, [calibFirst, onOverlayCalibrationStep])

  /** .floors-container に実際に掛かっている表示倍率（ZoomableView の拡大分） */
  const currentZoom = () => {
    const container = floorsRef.current
    if (!container || !container.offsetWidth) return 1
    return container.getBoundingClientRect().width / container.offsetWidth || 1
  }

  const overlayFloorSvg = () => findOverlayFloorSvg(floorsRef.current, overlayFloorId)

  /**
   * 重ねる操作を始めたとき（needsFit）は、平面図が間取図の建物をちょうど覆う縮尺と位置にしておく。
   * 平面図のどこに建物が描かれているかまでは分からないので、おおまかな初期値。細かくは「2点で合わせる」で。
   */
  const needsFit = !!overlay?.enabled && !!overlay.needsFit && !!overlayUrl
  useEffect(() => {
    if (!needsFit || !onOverlayCalibrated) return
    const container = floorsRef.current
    const img = container?.querySelector('.source-overlay-image') as HTMLImageElement | null
    if (!container || !img) return

    let cancelled = false
    const fit = () => {
      if (cancelled) return
      const plan = planRectOnScreen(findOverlayFloorSvg(container, overlayFloorId))
      const imgW = img.naturalWidth
      const imgH = img.naturalHeight
      if (!plan || !imgW || !imgH) return
      const zoom = currentZoom()
      const rect = container.getBoundingClientRect()
      const planW = (plan.p2.x - plan.p1.x) / zoom
      const planH = (plan.p2.y - plan.p1.y) / zoom
      const scale = Math.max(planW / imgW, planH / imgH)
      if (!(scale > 0) || !Number.isFinite(scale)) return
      // 画像は枠の中心に置かれるので、間取図の建物の中心との差をずらし量にする
      const planCenter = {
        x: ((plan.p1.x + plan.p2.x) / 2 - rect.left) / zoom,
        y: ((plan.p1.y + plan.p2.y) / 2 - rect.top) / zoom,
      }
      onOverlayCalibrated({
        scaleX: scale,
        scaleY: scale,
        offset: {
          x: planCenter.x - container.offsetWidth / 2,
          y: planCenter.y - container.offsetHeight / 2,
        },
      })
    }
    if (img.complete && img.naturalWidth) fit()
    else img.addEventListener('load', fit, { once: true })
    return () => {
      cancelled = true
      img.removeEventListener('load', fit)
    }
  }, [needsFit, onOverlayCalibrated, overlayFloorId])

  /** 元の平面図の暗い画素の表（画像ごとに1回だけ作る） */
  const darkMapRef = useRef<{ url: string; map: DarkMap } | null>(null)
  /** ドラッグ中の通りの情報（ドラッグ開始時に決める） */
  const gridDragRef = useRef<{ spans: Array<[number, number]>; others: number[] } | null>(null)

  const overlayImage = () => {
    if (!overlay?.enabled || !overlayUrl) return null
    const img = floorsRef.current?.querySelector('.source-overlay-image') as HTMLImageElement | null
    return img && img.complete && img.naturalWidth ? img : null
  }

  const ensureDarkMap = (img: HTMLImageElement) => {
    if (darkMapRef.current?.url !== overlayUrl) {
      const built = darkMapFromImage(img)
      darkMapRef.current = built && overlayUrl ? { url: overlayUrl, map: built.map } : null
    }
    return darkMapRef.current?.map ?? null
  }

  /**
   * ドラッグ中の通りの位置を決める。優先順は
   * ① 近くにある元の平面図の壁の線 ② 間取図のほかの通り ③ そのまま（5mm 刻み）
   */
  const snapGridLine = (floorId: string, axis: GridAxis, raw: number): { value: number; snap: GridSnapKind } => {
    const free = { value: roundHalf(raw), snap: null }
    const svg = floorsRef.current?.querySelector<SVGSVGElement>(
      `svg.floor-canvas[data-floor-id="${CSS.escape(floorId)}"]`
    )
    const ctm = svg?.getScreenCTM()
    const [originX, originY] = (svg?.dataset.origin ?? '').split(',').map(Number)
    const info = gridDragRef.current
    if (!svg || !ctm || !info || !Number.isFinite(originX) || !Number.isFinite(originY)) return free

    // 間取図の座標 ⇔ 画面座標（拡大縮小と平行移動だけなので軸ごとの1次式）
    const pxPerUnit = axis === 'x' ? ctm.a : ctm.d
    const toScreen = (v: number) => (axis === 'x' ? ctm.a * (v + originX) + ctm.e : ctm.d * (v + originY) + ctm.f)
    const toFloor = (s: number) => (axis === 'x' ? (s - ctm.e) / ctm.a - originX : (s - ctm.f) / ctm.d - originY)
    const alongToScreen = (v: number) =>
      axis === 'x' ? ctm.d * (v + originY) + ctm.f : ctm.a * (v + originX) + ctm.e

    // 平面図はその階の図面なので、重ねている階の通りだけを平面図の線に吸い付かせる
    const img = svg === overlayFloorSvg() ? overlayImage() : null
    const map = img ? ensureDarkMap(img) : null
    if (img && map) {
      const r = img.getBoundingClientRect()
      const k = axis === 'x' ? map.width / r.width : map.height / r.height
      const kAlong = axis === 'x' ? map.height / r.height : map.width / r.width
      const start = axis === 'x' ? r.left : r.top
      const alongStart = axis === 'x' ? r.top : r.left
      const spans = info.spans.map(
        ([a, b]) => [(alongToScreen(a) - alongStart) * kAlong, (alongToScreen(b) - alongStart) * kAlong] as [number, number]
      )
      const found = findLineNear(
        map,
        axis,
        (toScreen(raw) - start) * k,
        spans,
        SNAP_RADIUS_PX * k,
        mmToSvgUnits(MAX_WALL_THICKNESS_MM) * pxPerUnit * k
      )
      if (found != null) return { value: roundHalf(toFloor(found / k + start)), snap: 'image' }
    }

    const tolerance = LINE_SNAP_PX / pxPerUnit
    const nearest = info.others.reduce<number | null>(
      (best, v) => (Math.abs(v - raw) <= tolerance && (best == null || Math.abs(v - raw) < Math.abs(best - raw)) ? v : best),
      null
    )
    if (nearest != null) return { value: nearest, snap: 'line' }
    return free
  }

  /**
   * 重ねた平面図を、間取図の建物に対して動かないようにする。
   * 平面図の画像は枠（.floors-container）の中心を基準に置いている。ところが壁を建物の外へ動かすなどで
   * 図面の描画範囲が変わると、枠の大きさと枠の中での建物の位置が変わり、平面図だけが取り残されてずれる。
   * 重ねる階の原点（座標 0,0）が枠の中心からどれだけ離れているかを覚えておき、変わったぶんだけ平面図も動かす。
   * 描画のたびに測り、画面に出る前（useLayoutEffect）に直すので、ずれた瞬間は見えない。
   */
  const overlayAnchorRef = useRef<{ floorId: string; point: Point } | null>(null)
  const overlayShown = !!overlay?.enabled && !!overlayUrl
  useLayoutEffect(() => {
    if (!overlayShown || needsFit || !overlay) {
      overlayAnchorRef.current = null
      return
    }
    const container = floorsRef.current
    const svg = overlayFloorSvg()
    const [originX, originY] = (svg?.dataset.origin ?? '').split(',').map(Number)
    if (!container || !svg || !Number.isFinite(originX) || !Number.isFinite(originY)) return
    const floorId = svg.dataset.floorId ?? ''

    const zoom = currentZoom()
    const rect = container.getBoundingClientRect()
    const svgRect = svg.getBoundingClientRect()
    // SVG は 1単位 = 1px で描いているので、原点は SVG の左上から originX, originY px の位置
    const anchor = {
      x: (svgRect.left - rect.left) / zoom + originX - container.offsetWidth / 2,
      y: (svgRect.top - rect.top) / zoom + originY - container.offsetHeight / 2,
    }
    const prev = overlayAnchorRef.current
    overlayAnchorRef.current = { floorId, point: anchor }
    // 重ねる階が替わったときは、基準を測り直すだけ（前の階との差で平面図を動かさない）
    if (!prev || prev.floorId !== floorId) return
    const dx = anchor.x - prev.point.x
    const dy = anchor.y - prev.point.y
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return
    onOverlayOffsetChange?.({ x: overlay.offset.x + dx, y: overlay.offset.y + dy })
  })

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

    const plan = planRectOnScreen(overlayFloorSvg())
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
    // 縦横比を維持するため、縦横から求めた倍率の平均を共通縮尺にする
    const k = (Math.abs(kx) + Math.abs(ky)) / 2
    if (!(k > 0) || !Number.isFinite(k)) {
      setCalibFirst(null)
      return
    }

    // 拡大は画像の中心を基準に掛かるので、中心からの距離を倍率で伸ばした先を求める
    const img = container.querySelector('.source-overlay-image') as HTMLImageElement | null
    if (!img) {
      setCalibFirst(null)
      return
    }
    const imgRect = img.getBoundingClientRect()
    const origin = { x: imgRect.left + imgRect.width / 2, y: imgRect.top + imgRect.height / 2 }
    const movedC1 = {
      x: origin.x + (c1.x - origin.x) * k,
      y: origin.y + (c1.y - origin.y) * k,
    }

    const baseScale = (overlay.scaleX + overlay.scaleY) / 2
    const nextScale = baseScale * k
    onOverlayCalibrated({
      scaleX: nextScale,
      scaleY: nextScale,
      offset: {
        x: overlay.offset.x + (plan.p1.x - movedC1.x) / zoom,
        y: overlay.offset.y + (plan.p1.y - movedC1.y) / zoom,
      },
      // 平面図は縦横比を保って k 倍にした。建物の横幅は平面図側が dx·k、間取図側が dx·kx なので、
      // 間取図を横 k/kx 倍・縦 k/ky 倍すれば外形がぴったり重なる
      planStretch: { sx: k / Math.abs(kx), sy: k / Math.abs(ky) },
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
      ) : aligning ? (
        <p className="edit-mode-hint place-mode-hint">
          オレンジの線（壁の通り）をドラッグして、重ねた平面図の壁に合わせてください。
          平面図の壁の線に吸い付くと<strong className="align-hint-image">緑</strong>、
          ほかの通りにそろうと<strong className="align-hint-line">青</strong>になります。線に接する部屋・扉・窓は一緒に動きます。
          {!overlay?.enabled && '（平面図を重ねると、壁の線に吸い付きます）'}
        </p>
      ) : (
        onSelect && (
          <p className="edit-mode-hint">
            部屋・壁・扉・窓・設備・階段をクリックして選択。部屋と階段はドラッグで移動、部屋は辺ハンドル・設備は四隅でサイズ変更。
            選択して Delete キーで削除。追加は左パネルから。小さい要素は左の「要素を選択」から選ぶと確実です。
          </p>
        )
      )}

      <ZoomableView
        editInteractive={!!onSelect || placing}
        className="floor-plan-zoom"
        fitKey={fitKey}
      >
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
              editable={editable && !locked}
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
              selectedTextId={
                selected?.kind === 'text' && selected.floorId === floor.id ? selected.textId : null
              }
              placeMode={placing}
              wallDraftStart={placeKind === 'wall' ? wallDraftStart : null}
              onPlaceClick={
                placing ? (pos) => onPlaceClick?.(floor.id, pos) : undefined
              }
              selectionToolbar={
                !locked && selected?.floorId === floor.id ? selectionToolbar : undefined
              }
              onRoomDoubleClick={
                !locked && onRoomDoubleClick
                  ? (roomId) => onRoomDoubleClick({ kind: 'room', floorId: floor.id, roomId })
                  : undefined
              }
              onGridLineDrag={
                aligning && onGridLineMove
                  ? (axis, from, to, phase) => {
                      if (phase === 'start') {
                        const lines = collectGridLines(floor).filter((l) => l.axis === axis)
                        gridDragRef.current = {
                          spans: lines.find((l) => Math.abs(l.value - from) < 0.5)?.spans ?? [],
                          others: lines.map((l) => l.value).filter((v) => Math.abs(v - from) >= 0.5),
                        }
                        onGridLineMove(floor.id, axis, from, from, 'start')
                        return null
                      }
                      if (phase === 'end') {
                        gridDragRef.current = null
                        onGridLineMove(floor.id, axis, from, from, 'end')
                        return null
                      }
                      const snapped = snapGridLine(floor.id, axis, to)
                      onGridLineMove(floor.id, axis, from, snapped.value, 'move')
                      return snapped
                    }
                  : undefined
              }
              onRoomSelect={
                !locked && onSelect
                  ? (roomId, additive) =>
                      onSelect({ kind: 'room', floorId: floor.id, roomId }, { additive })
                  : undefined
              }
              onStairSelect={
                !locked && onSelect
                  ? (stairId) => onSelect({ kind: 'stair', floorId: floor.id, stairId })
                  : undefined
              }
              onStairMove={
                onStairMove && editable && !locked
                  ? (stairId, polygon) =>
                      onStairMove({ kind: 'stair', floorId: floor.id, stairId }, polygon)
                  : undefined
              }
              onWallSelect={
                !locked && onSelect
                  ? (wallId) => onSelect({ kind: 'wall', floorId: floor.id, wallId })
                  : undefined
              }
              onDoorSelect={
                !locked && onSelect
                  ? (doorId) => onSelect({ kind: 'door', floorId: floor.id, doorId })
                  : undefined
              }
              onWindowSelect={
                !locked && onSelect
                  ? (windowId) => onSelect({ kind: 'window', floorId: floor.id, windowId })
                  : undefined
              }
              onFixtureSelect={
                !locked && onSelect
                  ? (fixtureId) => onSelect({ kind: 'fixture', floorId: floor.id, fixtureId })
                  : undefined
              }
              onTextSelect={
                !locked && onSelect
                  ? (textId) => onSelect({ kind: 'text', floorId: floor.id, textId })
                  : undefined
              }
              onRoomLabelOffsetChange={
                !locked && onLabelOffsetChange
                  ? (roomId, kind, offset) =>
                      onLabelOffsetChange({ kind: 'room', floorId: floor.id, roomId }, kind, offset)
                  : undefined
              }
              onStairLabelOffsetChange={
                !locked && onLabelOffsetChange
                  ? (stairId, kind, offset) =>
                      onLabelOffsetChange(
                        { kind: 'stair', floorId: floor.id, stairId },
                        kind,
                        offset
                      )
                  : undefined
              }
              onRoomResize={
                onRoomResize && editable && !locked
                  ? (roomId, edge, positionFloorSvg) =>
                      onRoomResize(
                        { kind: 'room', floorId: floor.id, roomId },
                        edge,
                        positionFloorSvg
                      )
                  : undefined
              }
              onRoomMove={
                onRoomMove && editable && !locked
                  ? (roomId, polygon) =>
                      onRoomMove({ kind: 'room', floorId: floor.id, roomId }, polygon)
                  : undefined
              }
              onWallEndpointMove={
                onWallEndpointMove && editable && !locked
                  ? (wallId, endpoint, position) =>
                      onWallEndpointMove(
                        { kind: 'wall', floorId: floor.id, wallId },
                        endpoint,
                        position
                      )
                  : undefined
              }
              onWallMove={
                onWallMove && editable && !locked
                  ? (wallId, start, end) =>
                      onWallMove({ kind: 'wall', floorId: floor.id, wallId }, start, end)
                  : undefined
              }
              onDoorMove={
                onDoorMove && editable && !locked
                  ? (doorId, position) =>
                      onDoorMove({ kind: 'door', floorId: floor.id, doorId }, position)
                  : undefined
              }
              onWindowEndpointMove={
                onWindowEndpointMove && editable && !locked
                  ? (windowId, endpoint, position) =>
                      onWindowEndpointMove(
                        { kind: 'window', floorId: floor.id, windowId },
                        endpoint,
                        position
                      )
                  : undefined
              }
              onWindowMove={
                onWindowMove && editable && !locked
                  ? (windowId, start, end) =>
                      onWindowMove({ kind: 'window', floorId: floor.id, windowId }, start, end)
                  : undefined
              }
              onFixtureMove={
                onFixtureMove && editable && !locked
                  ? (fixtureId, position) =>
                      onFixtureMove({ kind: 'fixture', floorId: floor.id, fixtureId }, position)
                  : undefined
              }
              onFixtureResize={
                onFixtureResize && editable && !locked
                  ? (fixtureId, corner, position) =>
                      onFixtureResize(
                        { kind: 'fixture', floorId: floor.id, fixtureId },
                        corner,
                        position
                      )
                  : undefined
              }
              onTextMove={
                onTextMove && editable && !locked
                  ? (textId, position) =>
                      onTextMove({ kind: 'text', floorId: floor.id, textId }, position)
                  : undefined
              }
            />
          ))}
        </div>
      </ZoomableView>
    </div>
  )
}
