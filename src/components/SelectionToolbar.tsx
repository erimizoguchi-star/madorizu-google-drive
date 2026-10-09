import { useEffect, useRef } from 'react'
import { DOOR_KIND_OPTIONS, DOOR_KINDS_WITH_SWING } from '../constants/doorOptions'
import { mirrorStairLayout, nextStairOrientation, STAIR_LAYOUT_OPTIONS } from '../constants/stairOptions'
import {
  effectiveStairSteps,
  effectiveStairSteps2,
  getStairBounds,
  isLShapeLayout,
  resolveStairLayout,
  resolveStairOrientation,
} from '../renderer/stairGraphics'
import { ROOM_TYPE_OPTIONS, isAreaJoHiddenByType } from '../constants/roomTypes'
import { WINDOW_KIND_OPTIONS, normalizeWindowKind } from '../constants/windowOptions'
import type { DoorKind, FloorPlan, RoomType, StairLayout, WindowKind } from '../types/floorPlan'
import {
  cycleDoorOrientation,
  cycleWindowOrientation,
  findDoor,
  findRoom,
  findStair,
  findWindow,
  STAIR_MAX_STEPS,
  STAIR_MIN_STEPS,
  updateDoor,
  updateRoom,
  updateStair,
  updateWindow,
  type SelectedElementRef,
} from '../utils/floorPlanEdit'
import { svgUnitsToMm } from '../utils/roomGeometry'
import { hasFourWayDirection, hasWindowDirection } from '../utils/windowOrientation'
import { NumberField } from './NumberField'
import { STAIR } from '../renderer/styles'

type Updater = (prev: FloorPlan) => FloorPlan

interface SelectionToolbarProps {
  floorPlan: FloorPlan
  selected: SelectedElementRef
  /** coalesce: 入力欄の連続した変更を、「一手戻る」1回で戻せる1つの操作にまとめる */
  onChange: (updater: Updater, options?: { coalesce?: boolean }) => void
  onDelete: () => void
  /** true のとき部屋名の欄にカーソルを置き、onNameFocused で知らせる（部屋をダブルクリックしたとき） */
  focusName?: boolean
  onNameFocused?: () => void
  /** 部屋の範囲を四角で描き始める（set: 描き直す、add: 足す、cut: 削る） */
  onStartRange?: (mode: 'set' | 'add' | 'cut') => void
}

/**
 * 選んだ部屋・扉・窓のすぐ上に出す小さなメニュー。よく使う設定だけを、
 * 左のパネルまで行かずにその場で変えられる。細かい設定は左のパネルに残す。
 */
export function SelectionToolbar({
  floorPlan,
  selected,
  onChange,
  onDelete,
  focusName,
  onNameFocused,
  onStartRange,
}: SelectionToolbarProps) {
  if (selected.kind === 'room') {
    return (
      <RoomToolbar
        floorPlan={floorPlan}
        selected={selected}
        onChange={onChange}
        onDelete={onDelete}
        focusName={focusName}
        onNameFocused={onNameFocused}
        onStartRange={onStartRange}
      />
    )
  }
  if (selected.kind === 'door') {
    return <DoorToolbar floorPlan={floorPlan} selected={selected} onChange={onChange} onDelete={onDelete} />
  }
  if (selected.kind === 'window') {
    return <WindowToolbar floorPlan={floorPlan} selected={selected} onChange={onChange} onDelete={onDelete} />
  }
  if (selected.kind === 'stair') {
    return <StairToolbar floorPlan={floorPlan} selected={selected} onChange={onChange} onDelete={onDelete} />
  }
  return null
}

function StairToolbar({
  floorPlan,
  selected,
  onChange,
  onDelete,
}: SelectionToolbarProps & { selected: Extract<SelectedElementRef, { kind: 'stair' }> }) {
  const found = findStair(floorPlan, selected)
  if (!found) return null
  const { stair } = found
  const layout = resolveStairLayout(stair)
  const orientation = resolveStairOrientation(stair, getStairBounds(stair.polygon))
  const down = stair.direction === 'down'
  const steps = effectiveStairSteps(stair)
  const setSteps = (n: number) => onChange((prev) => updateStair(prev, selected, { steps: n }))
  const lShape = isLShapeLayout(layout)
  const steps2 = lShape ? effectiveStairSteps2(stair) : 0
  const setSteps2 = (n: number) => onChange((prev) => updateStair(prev, selected, { steps2: n }))
  const landing = stair.corner === 'landing'
  return (
    <div className="selection-toolbar selection-toolbar--wrap" data-no-pan>
      <select
        aria-label="階段の形"
        value={layout}
        onChange={(e) => onChange((prev) => updateStair(prev, selected, { layout: e.target.value as StairLayout }))}
      >
        {STAIR_LAYOUT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="selection-toolbar__btn"
        title="上る向きを時計回りに 90° ずつ変えます"
        onClick={() => onChange((prev) => updateStair(prev, selected, { orientation: nextStairOrientation(orientation) }))}
      >
        ↻ 向き
      </button>
      {layout !== 'straight' && (
        <button
          type="button"
          className="selection-toolbar__btn"
          title="曲がる向き（右回り・左回り）を反対にします"
          onClick={() => onChange((prev) => updateStair(prev, selected, { layout: mirrorStairLayout(layout) }))}
        >
          ⇄ 回る向き
        </button>
      )}
      <span
        className="selection-toolbar__steps"
        title={
          layout === 'straight'
            ? '段の数'
            : layout.startsWith('u')
              ? '段の数（片側の、まっすぐな部分）'
              : lShape
                ? '曲がる前の段の数（角の回り段は含めない）'
                : '段の数（まっすぐな部分）'
        }
      >
        {lShape ? '段（前）' : '段'}
        <button
          type="button"
          className="selection-toolbar__btn"
          aria-label="段を減らす"
          disabled={steps <= STAIR_MIN_STEPS}
          onClick={() => setSteps(steps - 1)}
        >
          −
        </button>
        <strong>{steps}</strong>
        <button
          type="button"
          className="selection-toolbar__btn"
          aria-label="段を増やす"
          disabled={steps >= STAIR_MAX_STEPS}
          onClick={() => setSteps(steps + 1)}
        >
          ＋
        </button>
      </span>
      {lShape && (
        <span className="selection-toolbar__steps" title="曲がったあとの段の数（角の回り段は含めない）">
          段（後）
          <button
            type="button"
            className="selection-toolbar__btn"
            aria-label="曲がったあとの段を減らす"
            disabled={steps2 <= STAIR_MIN_STEPS}
            onClick={() => setSteps2(steps2 - 1)}
          >
            −
          </button>
          <strong>{steps2}</strong>
          <button
            type="button"
            className="selection-toolbar__btn"
            aria-label="曲がったあとの段を増やす"
            disabled={steps2 >= STAIR_MAX_STEPS}
            onClick={() => setSteps2(steps2 + 1)}
          >
            ＋
          </button>
        </span>
      )}
      {lShape && (
        <button
          type="button"
          className="selection-toolbar__btn"
          title="角を、回り段（扇形の段）と踊り場で切り替えます"
          onClick={() => onChange((prev) => updateStair(prev, selected, { corner: landing ? 'winder' : 'landing' }))}
        >
          {landing ? '踊り場 → 回り段' : '回り段 → 踊り場'}
        </button>
      )}
      <button
        type="button"
        className="selection-toolbar__btn"
        title="1階は UP（上り始めから矢印）、2階は DN（上り終わり側から下りの矢印）"
        onClick={() => onChange((prev) => updateStair(prev, selected, { direction: down ? 'up' : 'down' }))}
      >
        {down ? 'DN → UP' : 'UP → DN'}
      </button>
      <label className="selection-toolbar__color" title="階段の塗り色">
        <input
          type="color"
          aria-label="階段の塗り色"
          value={stair.fillColor ?? STAIR.fill}
          onChange={(e) =>
            onChange((prev) => updateStair(prev, selected, { fillColor: e.target.value.toUpperCase() }), { coalesce: true })
          }
        />
      </label>
      {!down && (
        <label className="selection-toolbar__check" title="1階の描き方。破断線より先の段は破線、矢印は破断線まで">
          <input
            type="checkbox"
            checked={!!stair.cutLine}
            onChange={(e) => onChange((prev) => updateStair(prev, selected, { cutLine: e.target.checked }))}
          />
          破断線
        </label>
      )}
      <button type="button" className="selection-toolbar__btn is-danger" title="削除（Delete キー）" onClick={onDelete}>
        削除
      </button>
    </div>
  )
}

/** 種類の選択肢は短い名前にする（「LD（リビング・ダイニング）」→「LD」） */
const ROOM_TYPE_SHORT = ROOM_TYPE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label.replace(/（.*）/, '') }))

function RoomToolbar({
  floorPlan,
  selected,
  onChange,
  onDelete,
  focusName,
  onNameFocused,
  onStartRange,
}: SelectionToolbarProps & { selected: Extract<SelectedElementRef, { kind: 'room' }> }) {
  const nameRef = useRef<HTMLInputElement>(null)
  // ダブルクリックされた部屋のときだけ、1回カーソルを置く。普段の選択で欄に入ると、
  // Delete キーが部屋の削除ではなく文字の削除になってしまう
  useEffect(() => {
    if (!focusName || !nameRef.current) return
    // 自動スクロールさせない（図面の表示枠がずれて、図面が見えなくなる）
    nameRef.current.focus({ preventScroll: true })
    nameRef.current.select()
    onNameFocused?.()
  }, [focusName, onNameFocused])

  const found = findRoom(floorPlan, selected)
  if (!found) return null
  const { room } = found
  return (
    <div className="selection-toolbar" data-no-pan>
      <select
        aria-label="部屋の種類"
        title="種類を変えると、名前・色・模様もその種類に合わせて変わります"
        value={room.type}
        onChange={(e) => onChange((prev) => updateRoom(prev, selected, { type: e.target.value as RoomType }))}
      >
        {ROOM_TYPE_SHORT.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <input
        ref={nameRef}
        className="selection-toolbar__name"
        aria-label="部屋名"
        value={room.name}
        onChange={(e) => onChange((prev) => updateRoom(prev, selected, { name: e.target.value }), { coalesce: true })}
      />
      {!isAreaJoHiddenByType(room.type) && (
        <label className="selection-toolbar__width">
          <NumberField
            step={0.5}
            min={0}
            digits={2}
            allowEmpty
            aria-label="帖数"
            placeholder="自動"
            value={room.areaJo ?? null}
            onCommit={(areaJo) => onChange((prev) => updateRoom(prev, selected, { areaJo }))}
          />
          帖
        </label>
      )}
      <button type="button" className="selection-toolbar__btn is-danger" title="削除（Delete キー）" onClick={onDelete}>
        削除
      </button>
      {onStartRange && (
        <span className="selection-toolbar__range" title="着色する範囲を、図面の上で四角を描いて決めます">
          <span className="selection-toolbar__range-label">範囲</span>
          <button
            type="button"
            className="selection-toolbar__btn"
            title="図面の上をドラッグして描いた四角を、この部屋の範囲にします"
            onClick={() => onStartRange('set')}
          >
            ▭ 描き直す
          </button>
          <button
            type="button"
            className="selection-toolbar__btn"
            title="描いた四角を、この部屋の範囲に足します（L 字の部屋など）"
            onClick={() => onStartRange('add')}
          >
            ＋足す
          </button>
          <button
            type="button"
            className="selection-toolbar__btn"
            title="描いた四角を、この部屋の範囲から削ります"
            onClick={() => onStartRange('cut')}
          >
            −削る
          </button>
        </span>
      )}
    </div>
  )
}

function DoorToolbar({
  floorPlan,
  selected,
  onChange,
  onDelete,
}: SelectionToolbarProps & { selected: Extract<SelectedElementRef, { kind: 'door' }> }) {
  const found = findDoor(floorPlan, selected)
  if (!found) return null
  const { door } = found
  const kind = door.kind ?? 'swing'
  return (
    <div className="selection-toolbar" data-no-pan>
      <select
        aria-label="扉の種類"
        value={kind}
        onChange={(e) => onChange((prev) => updateDoor(prev, selected, { kind: e.target.value as DoorKind }))}
      >
        {DOOR_KIND_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {DOOR_KINDS_WITH_SWING.has(kind) && (
        <button
          type="button"
          className="selection-toolbar__btn"
          title="押すたびに、開く向き（吊元と開く側の4通り）が順に変わります（R キー）"
          onClick={() => onChange((prev) => cycleDoorOrientation(prev, selected))}
        >
          ↻ 向き
        </button>
      )}
      <WidthField
        valueMm={Math.round(svgUnitsToMm(door.width))}
        max={3000}
        onChange={(widthMm) => onChange((prev) => updateDoor(prev, selected, { widthMm }))}
      />
      <button type="button" className="selection-toolbar__btn is-danger" title="削除（Delete キー）" onClick={onDelete}>
        削除
      </button>
    </div>
  )
}

function WindowToolbar({
  floorPlan,
  selected,
  onChange,
  onDelete,
}: SelectionToolbarProps & { selected: Extract<SelectedElementRef, { kind: 'window' }> }) {
  const found = findWindow(floorPlan, selected)
  if (!found) return null
  const win = found.window
  const widthMm = Math.round(svgUnitsToMm(Math.hypot(win.end.x - win.start.x, win.end.y - win.start.y)))
  return (
    <div className="selection-toolbar" data-no-pan>
      <select
        aria-label="窓の種類"
        value={normalizeWindowKind(win.kind)}
        onChange={(e) => onChange((prev) => updateWindow(prev, selected, { kind: e.target.value as WindowKind }))}
      >
        {WINDOW_KIND_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hasWindowDirection(win.kind) && (
        <button
          type="button"
          className="selection-toolbar__btn"
          title={
            hasFourWayDirection(win.kind)
              ? '押すたびに、向き（軸のある端と内外の4通り）が順に変わります（R キー）'
              : '開く向きを反対にします（R キー）'
          }
          onClick={() => onChange((prev) => cycleWindowOrientation(prev, selected))}
        >
          {hasFourWayDirection(win.kind) ? '↻ 向き' : '⇄ 向き'}
        </button>
      )}
      <WidthField
        valueMm={widthMm}
        max={6000}
        onChange={(next) => onChange((prev) => updateWindow(prev, selected, { widthMm: next }))}
      />
      <button type="button" className="selection-toolbar__btn is-danger" title="削除（Delete キー）" onClick={onDelete}>
        削除
      </button>
    </div>
  )
}

function WidthField({ valueMm, max, onChange }: { valueMm: number; max: number; onChange: (mm: number) => void }) {
  return (
    <label className="selection-toolbar__width">
      幅
      <NumberField step={50} min={300} max={max} value={valueMm} onCommit={(next) => next != null && onChange(next)} />
      mm
    </label>
  )
}
