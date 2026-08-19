import { useMemo } from 'react'
import type { FloorPlan } from '../types/floorPlan'
import {
  elementRefToKey,
  listAllEditableElements,
  parseElementRefKey,
  type SelectedElementRef,
  type SelectOptions,
  updateFloorPlanTitle,
} from '../utils/floorPlanEdit'
import { FIXTURE_TYPE_OPTIONS } from '../constants/fixtureOptions'
import {
  addRoomBesideExisting,
  fixturePlaceKind,
  isFixturePlaceKind,
  type PlaceKind,
} from '../utils/floorPlanAdd'
import { mergeRooms } from '../utils/mergeRooms'
import { DoorPanel } from './editor/DoorPanel'
import { FixturePanel } from './editor/FixturePanel'
import { RoomPanel } from './editor/RoomPanel'
import { StairPanel } from './editor/StairPanel'
import { WallPanel } from './editor/WallPanel'
import { WindowPanel } from './editor/WindowPanel'

interface RoomEditorProps {
  floorPlan: FloorPlan
  selected: SelectedElementRef | null
  mergeRoomIds: { floorId: string; roomIds: string[] } | null
  placeKind: PlaceKind | null
  onPlaceKindChange: (kind: PlaceKind | null) => void
  onSelect: (ref: SelectedElementRef | null, options?: SelectOptions) => void
  onMergeRoomIdsChange: (ids: { floorId: string; roomIds: string[] } | null) => void
  onChange: (updater: (prev: FloorPlan) => FloorPlan) => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
}

/**
 * 編集パネルの外枠。共通操作（元に戻す・追加・要素選択・合成）だけを持ち、
 * 選択中の要素の詳細フォームは editor/ 配下の各パネルに任せる。
 */
export function RoomEditor({
  floorPlan,
  selected,
  mergeRoomIds,
  placeKind,
  onPlaceKindChange,
  onSelect,
  onMergeRoomIdsChange,
  onChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: RoomEditorProps) {
  const elementList = useMemo(() => listAllEditableElements(floorPlan), [floorPlan])

  const mergeFloorId =
    mergeRoomIds?.floorId ??
    (selected?.kind === 'room' ? selected.floorId : floorPlan.floors[0]?.id)
  const mergeFloor = floorPlan.floors.find((f) => f.id === mergeFloorId)
  const activeMergeIds =
    mergeRoomIds?.floorId === mergeFloorId ? mergeRoomIds.roomIds : []

  const toggleMergeRoom = (floorId: string, roomId: string) => {
    if (mergeRoomIds?.floorId === floorId && mergeRoomIds.roomIds.includes(roomId)) {
      const next = mergeRoomIds.roomIds.filter((id) => id !== roomId)
      onMergeRoomIdsChange(next.length > 0 ? { floorId, roomIds: next } : null)
      if (selected?.kind === 'room' && selected.roomId === roomId && next.length > 0) {
        onSelect({ kind: 'room', floorId, roomId: next[0] }, { keepMergeSelection: true })
      }
      return
    }
    const prev = mergeRoomIds?.floorId === floorId ? mergeRoomIds.roomIds : []
    const next = [...new Set([...prev, roomId])]
    onMergeRoomIdsChange({ floorId, roomIds: next })
    // keepMergeSelection を付けないと、選択が「クリックした1部屋だけ」に戻され、
    // チェックを2つ以上入れられなくなる（合成ボタンが押せない）
    onSelect({ kind: 'room', floorId, roomId }, { keepMergeSelection: true })
  }

  const handleMergeRooms = () => {
    if (!mergeRoomIds || mergeRoomIds.roomIds.length < 2) return
    const primaryId =
      selected?.kind === 'room' &&
      selected.floorId === mergeRoomIds.floorId &&
      mergeRoomIds.roomIds.includes(selected.roomId)
        ? selected.roomId
        : mergeRoomIds.roomIds[0]
    const result = mergeRooms(floorPlan, mergeRoomIds.floorId, mergeRoomIds.roomIds, primaryId)
    if ('error' in result) {
      alert(result.error)
      return
    }
    onChange(() => result.floorPlan)
    onSelect({ kind: 'room', floorId: mergeRoomIds.floorId, roomId: result.mergedRoomId })
    onMergeRoomIdsChange({
      floorId: mergeRoomIds.floorId,
      roomIds: [result.mergedRoomId],
    })
  }

  const applyPlan = onChange

  const handleQuickAddRoom = () => {
    const floorId =
      selected?.kind === 'room'
        ? selected.floorId
        : mergeFloorId ?? floorPlan.floors[0]?.id
    if (!floorId) return
    const result = addRoomBesideExisting(floorPlan, floorId)
    if ('error' in result) {
      alert(result.error)
      return
    }
    onChange(() => result.floorPlan)
    onSelect({ kind: 'room', floorId, roomId: result.roomId })
    onPlaceKindChange(null)
  }

  const panelProps = { floorPlan, onSelect, onChange }

  return (
    <div className="room-editor">
      <h3>間取図を編集</h3>
      <p className="editor-hint">
        「追加」からクリック配置。部屋はドラッグで自由に移動できます。既存要素は選択して変形・移動・削除。<kbd>Esc</kbd>
        で配置キャンセル、<kbd>Delete</kbd> で削除。<kbd>Ctrl</kbd>+<kbd>Z</kbd> で一手戻る。
      </p>

      <div className="editor-history-row">
        <button
          type="button"
          className="btn btn-secondary editor-history-btn"
          disabled={!canUndo}
          onClick={onUndo}
          title="一手戻る (Ctrl+Z)"
        >
          一手戻る
        </button>
        <button
          type="button"
          className="btn btn-secondary editor-history-btn"
          disabled={!canRedo}
          onClick={onRedo}
          title="やり直す (Ctrl+Y)"
        >
          やり直す
        </button>
      </div>

      <div className="editor-add-section">
        <h4>要素を追加</h4>
        <div className="editor-add-grid">
          {(
            [
              ['room', '部屋'],
              ['door', '扉'],
              ['window', '窓'],
              ['opening', '開口'],
              ['wall', '壁'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={`btn editor-add-btn ${placeKind === kind ? 'active' : ''}`}
              onClick={() => onPlaceKindChange(placeKind === kind ? null : kind)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="editor-field-hint">設備記号</p>
        <div className="editor-add-grid">
          {FIXTURE_TYPE_OPTIONS.map((opt) => {
            const kind = fixturePlaceKind(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                className={`btn editor-add-btn ${placeKind === kind ? 'active' : ''}`}
                title={opt.hint}
                onClick={() => onPlaceKindChange(placeKind === kind ? null : kind)}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <button type="button" className="btn btn-secondary editor-add-quick" onClick={handleQuickAddRoom}>
          部屋をすぐ追加（横に配置）
        </button>
        {placeKind && (
          <p className="editor-field-hint">
            {placeKind === 'door' || placeKind === 'window' || placeKind === 'opening'
              ? '壁・部屋の辺をクリックして追加（連続配置可）。もう一度ボタンか Esc で終了。'
              : isFixturePlaceKind(placeKind)
                ? '間取図をクリックして設備を配置（連続配置可）。もう一度ボタンか Esc で終了。'
                : '配置モード中 — 間取図をクリックして追加（もう一度ボタンか Esc で解除）'}
          </p>
        )}
      </div>

      <div className="editor-field">
        <label htmlFor="plan-title">物件名</label>
        <input
          id="plan-title"
          type="text"
          value={floorPlan.title}
          onChange={(e) => applyPlan((prev) => updateFloorPlanTitle(prev, e.target.value))}
        />
      </div>

      <div className="editor-field">
        <label htmlFor="element-select">要素を選択</label>
        <select
          id="element-select"
          value={selected ? elementRefToKey(selected) : ''}
          onChange={(e) => {
            if (!e.target.value) {
              onSelect(null)
              return
            }
            onSelect(parseElementRefKey(e.target.value))
          }}
        >
          <option value="">— 選択してください —</option>
          {elementList.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {mergeFloor && mergeFloor.rooms.length >= 2 && (
        <div className="editor-merge-section">
          <h4>部屋の合成</h4>
          <p className="editor-hint">
            同じ階で隣り合った部屋を2つ以上選び「合成する」を押してください。矩形だけでなく
            L字・コの字などの直交多角形も合成できます。内壁があっても合成できます。Ctrl+クリックでも追加選択できます。
          </p>
          <p className="editor-field-hint">{mergeFloor.label} — {activeMergeIds.length} 部屋選択中</p>
          <div className="editor-merge-list">
            {mergeFloor.rooms.map((room) => (
              <label key={room.id} className="editor-checkbox editor-merge-item">
                <input
                  type="checkbox"
                  checked={activeMergeIds.includes(room.id)}
                  onChange={() => toggleMergeRoom(mergeFloor.id, room.id)}
                />
                {room.name}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary editor-merge-btn"
            disabled={activeMergeIds.length < 2}
            onClick={handleMergeRooms}
          >
            選択した部屋を合成
          </button>
        </div>
      )}

      {selected?.kind === 'room' && <RoomPanel {...panelProps} selected={selected} />}
      {selected?.kind === 'stair' && <StairPanel {...panelProps} selected={selected} />}
      {selected?.kind === 'wall' && <WallPanel {...panelProps} selected={selected} />}
      {selected?.kind === 'door' && <DoorPanel {...panelProps} selected={selected} />}
      {selected?.kind === 'window' && <WindowPanel {...panelProps} selected={selected} />}
      {selected?.kind === 'fixture' && <FixturePanel {...panelProps} selected={selected} />}
    </div>
  )
}
