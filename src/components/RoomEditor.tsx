import { useMemo } from 'react'
import { ROOM_TYPE_OPTIONS, isAreaJoHiddenByType } from '../constants/roomTypes'
import { LABEL } from '../renderer/styles'
import { STAIR_LAYOUT_OPTIONS, STAIR_ORIENTATION_OPTIONS } from '../constants/stairOptions'
import { getStairLengthMm, STAIR_DEFAULT_WIDTH_MM } from '../utils/resizeStair'
import { resolveStairLayout, resolveStairOrientation, getStairBounds } from '../renderer/stairGraphics'
import {
  getDefaultFillColor,
  normalizeHexColor,
  resolveRoomFillColor,
  resolveRoomFillPattern,
  ROOM_PATTERN_OPTIONS,
} from '../renderer/roomFill'
import type { DoorKind, FloorPlan, Point, RoomFillPattern, StairLayout, StairOrientation, WindowKind } from '../types/floorPlan'
import {
  setAllCornerRadiiMm,
  setCornerRadiusMmAt,
} from '../utils/cornerFillet'
import {
  deleteRoom,
  deleteWall,
  deleteDoor,
  deleteWindow,
  deleteFixture,
  deleteStair,
  elementRefToKey,
  findRoom,
  findStair,
  findWall,
  findDoor,
  findWindow,
  findFixture,
  listAllEditableElements,
  parseElementRefKey,
  type SelectedElementRef,
  updateFloorPlanTitle,
  updateRoom,
  updateStair,
  updateDoor,
  updateWindow,
  updateFixture,
  moveRoom,
  resizeRoomDimensions,
  type SelectOptions,
} from '../utils/floorPlanEdit'
import {
  DOOR_KIND_OPTIONS,
  DOOR_KINDS_WITH_SWING,
  DOOR_SWING_OPTIONS,
  doorKindLabel,
} from '../constants/doorOptions'
import {
  WINDOW_KIND_OPTIONS,
  windowKindLabel,
} from '../constants/windowOptions'
import {
  defaultFixtureSizeMm,
  FIXTURE_TYPE_OPTIONS,
  fixtureTypeLabel,
  normalizeFixtureAngle,
} from '../constants/fixtureOptions'
import {
  addRoomBesideExisting,
  fixturePlaceKind,
  isFixturePlaceKind,
  type PlaceKind,
} from '../utils/floorPlanAdd'
import type { LabelLineKind } from '../renderer/roomLabelLayout'
import { mergeRooms } from '../utils/mergeRooms'
import { hasWindowDirection } from '../utils/windowOrientation'
import {
  getRectDimensionsMm,
  MIN_ROOM_SIZE_MM,
  mmToSvgUnits,
  parseAxisAlignedRect,
  svgUnitsToMm,
} from '../utils/roomGeometry'

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

function parseOffsetInput(value: string): number | null {
  if (value.trim() === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function OffsetFields({
  label,
  offset,
  onChange,
  onReset,
}: {
  label: string
  offset?: Point
  onChange: (offset: Point) => void
  onReset: () => void
}) {
  const x = offset?.x ?? 0
  const y = offset?.y ?? 0
  return (
    <div className="editor-offset-group">
      <span className="editor-offset-label">{label}</span>
      <div className="editor-offset-inputs">
        <label>
          X
          <input
            type="number"
            step="1"
            value={x}
            onChange={(e) => {
              const nx = parseOffsetInput(e.target.value)
              if (nx === null) return
              onChange({ x: nx, y })
            }}
          />
        </label>
        <label>
          Y
          <input
            type="number"
            step="1"
            value={y}
            onChange={(e) => {
              const ny = parseOffsetInput(e.target.value)
              if (ny === null) return
              onChange({ x, y: ny })
            }}
          />
        </label>
        {(x !== 0 || y !== 0) && (
          <button type="button" className="editor-reset-btn" onClick={onReset}>
            リセット
          </button>
        )}
      </div>
    </div>
  )
}

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
  const currentRoom = selected?.kind === 'room' ? findRoom(floorPlan, selected) : null
  const currentStair = selected?.kind === 'stair' ? findStair(floorPlan, selected) : null
  const currentWall = selected?.kind === 'wall' ? findWall(floorPlan, selected) : null
  const currentDoor = selected?.kind === 'door' ? findDoor(floorPlan, selected) : null
  const currentWindow = selected?.kind === 'window' ? findWindow(floorPlan, selected) : null
  const currentFixture = selected?.kind === 'fixture' ? findFixture(floorPlan, selected) : null

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

  const applyPlan = (updater: (prev: FloorPlan) => FloorPlan) => {
    onChange(updater)
  }

  const handleRoomField = (patch: Parameters<typeof updateRoom>[2]) => {
    if (!selected || selected.kind !== 'room') return
    applyPlan((prev) => updateRoom(prev, selected, patch))
  }

  const handleStairField = (patch: Parameters<typeof updateStair>[2]) => {
    if (!selected || selected.kind !== 'stair') return
    applyPlan((prev) => updateStair(prev, selected, patch))
  }

  const handleDeleteStair = () => {
    if (!selected || selected.kind !== 'stair' || !currentStair) return
    if (!confirm('この階段を削除しますか？')) return
    applyPlan((prev) => deleteStair(prev, selected))
    onSelect(null)
  }

  const handleRoomOffset = (kind: LabelLineKind, offset: Point) => {
    if (!selected || selected.kind !== 'room') return
    const patch =
      kind === 'name'
        ? { nameLabelOffset: offset.x === 0 && offset.y === 0 ? null : offset }
        : kind === 'area'
          ? { areaLabelOffset: offset.x === 0 && offset.y === 0 ? null : offset }
          : { noteLabelOffset: offset.x === 0 && offset.y === 0 ? null : offset }
    applyPlan((prev) => updateRoom(prev, selected, patch))
  }

  const handleStairOffset = (offset: Point) => {
    if (!selected || selected.kind !== 'stair') return
    handleStairField({
      nameLabelOffset: offset.x === 0 && offset.y === 0 ? null : offset,
    })
  }

  const handleDelete = () => {
    if (!selected || selected.kind !== 'room' || !currentRoom) return
    if (!confirm(`「${currentRoom.room.name}」を削除しますか？`)) return
    applyPlan((prev) => deleteRoom(prev, selected))
    onSelect(null)
  }

  const handleDeleteWall = () => {
    if (!selected || selected.kind !== 'wall' || !currentWall) return
    const label = currentWall.wall.exterior ? '外壁' : '内壁'
    if (!confirm(`${label}（${currentWall.wall.id}）を削除しますか？`)) return
    applyPlan((prev) => deleteWall(prev, selected))
    onSelect(null)
  }

  const handleDeleteDoor = () => {
    if (!selected || selected.kind !== 'door' || !currentDoor) return
    if (!confirm('この扉を削除しますか？')) return
    applyPlan((prev) => deleteDoor(prev, selected))
    onSelect(null)
  }

  const handleDeleteWindow = () => {
    if (!selected || selected.kind !== 'window' || !currentWindow) return
    if (!confirm('この窓を削除しますか？')) return
    applyPlan((prev) => deleteWindow(prev, selected))
    onSelect(null)
  }

  const handleDeleteFixture = () => {
    if (!selected || selected.kind !== 'fixture' || !currentFixture) return
    if (!confirm('この設備を削除しますか？')) return
    applyPlan((prev) => deleteFixture(prev, selected))
    onSelect(null)
  }

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

  const handleMoveRoom = (dxMm: number, dyMm: number) => {
    if (!selected || selected.kind !== 'room') return
    applyPlan((prev) =>
      moveRoom(prev, selected, { x: mmToSvgUnits(dxMm), y: mmToSvgUnits(dyMm) })
    )
  }

  const handleDoorField = (patch: Parameters<typeof updateDoor>[2]) => {
    if (!selected || selected.kind !== 'door') return
    applyPlan((prev) => updateDoor(prev, selected, patch))
  }

  const handleWindowField = (patch: Parameters<typeof updateWindow>[2]) => {
    if (!selected || selected.kind !== 'window') return
    applyPlan((prev) => updateWindow(prev, selected, patch))
  }

  const hideAreaJo =
    currentRoom != null && isAreaJoHiddenByType(currentRoom.room.type)

  const roomRect =
    currentRoom != null ? parseAxisAlignedRect(currentRoom.room.polygon) : null
  const roomDimensions = roomRect ? getRectDimensionsMm(roomRect) : null

  const handleRoomSize = (patch: { widthMm?: number; heightMm?: number }) => {
    if (!selected || selected.kind !== 'room') return
    const result = resizeRoomDimensions(floorPlan, selected, patch)
    if ('error' in result) {
      alert(result.error)
      return
    }
    applyPlan(() => result)
  }

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

      {currentRoom && (
        <div className="room-editor-form">
          <h4>部屋の詳細</h4>

          <div className="editor-field">
            <label htmlFor="room-name">部屋名</label>
            <input
              id="room-name"
              type="text"
              value={currentRoom.room.name}
              onChange={(e) => handleRoomField({ name: e.target.value })}
            />
            <label className="editor-checkbox">
              <input
                type="checkbox"
                checked={currentRoom.room.showName !== false}
                onChange={(e) => handleRoomField({ showName: e.target.checked })}
              />
              部屋名を表示
            </label>
          </div>

          <div className="editor-field">
            <label htmlFor="room-type">部屋タイプ</label>
            <select
              id="room-type"
              value={currentRoom.room.type}
              onChange={(e) => handleRoomField({ type: e.target.value as typeof currentRoom.room.type })}
            >
              {ROOM_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {roomDimensions ? (
            <div className="editor-field editor-size-section">
              <span className="editor-offset-heading">部屋サイズ</span>
              <p className="editor-offset-hint">
                選択中の部屋と、その辺の壁区間を直交に移動します。数値入力または辺ハンドルをドラッグ。
              </p>
              <div className="editor-size-inputs">
                <label>
                  幅（mm）
                  <input
                    type="number"
                    step={50}
                    min={MIN_ROOM_SIZE_MM}
                    value={roomDimensions.widthMm}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (Number.isNaN(val)) return
                      handleRoomSize({ widthMm: val })
                    }}
                  />
                </label>
                <label>
                  奥行（mm）
                  <input
                    type="number"
                    step={50}
                    min={MIN_ROOM_SIZE_MM}
                    value={roomDimensions.heightMm}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (Number.isNaN(val)) return
                      handleRoomSize({ heightMm: val })
                    }}
                  />
                </label>
              </div>
              <div className="editor-nudge-row">
                <span className="editor-offset-label">位置（50mm）</span>
                <button type="button" className="btn editor-nudge-btn" onClick={() => handleMoveRoom(0, -50)}>
                  ↑
                </button>
                <button type="button" className="btn editor-nudge-btn" onClick={() => handleMoveRoom(-50, 0)}>
                  ←
                </button>
                <button type="button" className="btn editor-nudge-btn" onClick={() => handleMoveRoom(50, 0)}>
                  →
                </button>
                <button type="button" className="btn editor-nudge-btn" onClick={() => handleMoveRoom(0, 50)}>
                  ↓
                </button>
              </div>
            </div>
          ) : (
            <div className="editor-field editor-size-section">
              <p className="editor-fixed-hint">
                L字型など複雑な形状は数値サイズ変更非対応。外壁をドラッグするか、上下左右で全体移動できます。
              </p>
              <div className="editor-nudge-row">
                <span className="editor-offset-label">位置（50mm）</span>
                <button type="button" className="btn editor-nudge-btn" onClick={() => handleMoveRoom(0, -50)}>
                  ↑
                </button>
                <button type="button" className="btn editor-nudge-btn" onClick={() => handleMoveRoom(-50, 0)}>
                  ←
                </button>
                <button type="button" className="btn editor-nudge-btn" onClick={() => handleMoveRoom(50, 0)}>
                  →
                </button>
                <button type="button" className="btn editor-nudge-btn" onClick={() => handleMoveRoom(0, 50)}>
                  ↓
                </button>
              </div>
            </div>
          )}

          <div className="editor-field editor-size-section">
            <span className="editor-offset-heading">角のアール</span>
            <p className="editor-offset-hint">
              凸角・凹角（L字の内側など）どちらも円弧にできます。0 で直角に戻ります。壁線は角で直角のままです。
            </p>
            <div className="editor-size-inputs">
              <label>
                すべての角（mm）
                <input
                  type="number"
                  step={50}
                  min={0}
                  placeholder="例: 150"
                  value={
                    (() => {
                      const radii = currentRoom.room.cornerRadiiMm
                      const n = currentRoom.room.polygon.length
                      if (!radii || radii.length === 0) return ''
                      const first = radii[0] ?? 0
                      const uniform = Array.from({ length: n }, (_, i) => radii[i] ?? 0).every((v) => v === first)
                      return uniform && first > 0 ? first : ''
                    })()
                  }
                  onChange={(e) => {
                    const raw = e.target.value
                    if (raw === '') {
                      handleRoomField({ cornerRadiiMm: null })
                      return
                    }
                    const val = parseInt(raw, 10)
                    if (Number.isNaN(val) || val < 0) return
                    handleRoomField({
                      cornerRadiiMm: setAllCornerRadiiMm(currentRoom.room.polygon.length, val) ?? null,
                    })
                  }}
                />
              </label>
            </div>
            <div className="editor-nudge-row" style={{ marginTop: 8 }}>
              {[0, 100, 150, 200, 300].map((mm) => (
                <button
                  key={mm}
                  type="button"
                  className="btn editor-nudge-btn"
                  onClick={() =>
                    handleRoomField({
                      cornerRadiiMm:
                        mm <= 0 ? null : setAllCornerRadiiMm(currentRoom.room.polygon.length, mm) ?? null,
                    })
                  }
                >
                  {mm === 0 ? '直角' : `${mm}`}
                </button>
              ))}
            </div>
            {currentRoom.room.polygon.length > 0 && (
              <div className="editor-corner-list" style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                {currentRoom.room.polygon.map((_, index) => (
                  <label key={index} className="editor-corner-item" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ minWidth: '3.5em' }}>角 {index + 1}</span>
                    <input
                      type="number"
                      step={50}
                      min={0}
                      value={currentRoom.room.cornerRadiiMm?.[index] ?? 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10)
                        if (Number.isNaN(val) || val < 0) return
                        handleRoomField({
                          cornerRadiiMm:
                            setCornerRadiusMmAt(
                              currentRoom.room.cornerRadiiMm,
                              currentRoom.room.polygon.length,
                              index,
                              val
                            ) ?? null,
                        })
                      }}
                    />
                    <span>mm</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="editor-field">
            <label htmlFor="room-fill-color">塗り色</label>
            <div className="editor-color-row">
              <input
                id="room-fill-color"
                type="color"
                value={resolveRoomFillColor(currentRoom.room)}
                onChange={(e) => handleRoomField({ fillColor: e.target.value.toUpperCase() })}
              />
              <input
                type="text"
                className="editor-color-text"
                value={resolveRoomFillColor(currentRoom.room)}
                onChange={(e) => {
                  const hex = normalizeHexColor(e.target.value)
                  if (hex) handleRoomField({ fillColor: hex })
                }}
                placeholder="#RRGGBB"
                spellCheck={false}
              />
              {currentRoom.room.fillColor != null && (
                <button
                  type="button"
                  className="editor-reset-btn"
                  onClick={() => handleRoomField({ fillColor: null })}
                >
                  デフォルト
                </button>
              )}
            </div>
            <p className="editor-field-hint">
              デフォルト: {getDefaultFillColor(currentRoom.room.type)}
              {currentRoom.room.fillColor == null && '（タイプ連動）'}
            </p>
          </div>

          <div className="editor-field">
            <label htmlFor="room-fill-pattern">模様</label>
            <select
              id="room-fill-pattern"
              value={currentRoom.room.fillPattern ?? ''}
              onChange={(e) => {
                const val = e.target.value
                handleRoomField({
                  fillPattern: val === '' ? null : (val as RoomFillPattern),
                })
              }}
            >
              {ROOM_PATTERN_OPTIONS.map((opt) => (
                <option key={opt.value || 'auto'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="editor-field-hint">
              表示:{' '}
              {ROOM_PATTERN_OPTIONS.find((o) => o.value === resolveRoomFillPattern(currentRoom.room))
                ?.label ?? 'なし'}
              {currentRoom.room.fillPattern == null && '（タイプ連動）'}
            </p>
          </div>

          <div className="editor-field">
            <label htmlFor="room-font-size">
              部屋名フォントサイズ（pt）
              {currentRoom.room.labelFontSize == null && (
                <span className="editor-field-default"> デフォルト {LABEL.defaultFontSize}pt</span>
              )}
            </label>
            <input
              id="room-font-size"
              type="number"
              step="1"
              min={LABEL.fontSizeMin}
              max={LABEL.fontSizeMax}
              value={currentRoom.room.labelFontSize ?? LABEL.defaultFontSize}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                if (Number.isNaN(val)) return
                const clamped = Math.min(LABEL.fontSizeMax, Math.max(LABEL.fontSizeMin, val))
                if (clamped === LABEL.defaultFontSize) {
                  handleRoomField({ labelFontSize: null })
                } else {
                  handleRoomField({ labelFontSize: clamped })
                }
              }}
            />
            {currentRoom.room.labelFontSize != null && (
              <button
                type="button"
                className="editor-reset-btn"
                onClick={() => handleRoomField({ labelFontSize: null })}
              >
                {LABEL.defaultFontSize}pt（デフォルト）に戻す
              </button>
            )}
          </div>

          {hideAreaJo ? (
            <p className="editor-fixed-hint">
              廊下・ホール・階段は帖数を表示しません（部屋名のみ表示）。
            </p>
          ) : (
            <div className="editor-field">
              <label htmlFor="room-area">帖数</label>
              <input
                id="room-area"
                type="number"
                step="0.1"
                min="0"
                placeholder="空欄で自動計算"
                value={currentRoom.room.areaJo ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                  handleRoomField({ areaJo: val === '' ? null : parseFloat(val) })
                }}
              />
              <label className="editor-checkbox">
                <input
                  type="checkbox"
                  checked={currentRoom.room.showAreaJo !== false}
                  onChange={(e) => handleRoomField({ showAreaJo: e.target.checked })}
                />
                帖数を表示
              </label>
            </div>
          )}

          <div className="editor-field">
            <label htmlFor="room-note">備考（勾配天井など）</label>
            <input
              id="room-note"
              type="text"
              placeholder="例: ※勾配天井"
              value={currentRoom.room.note ?? ''}
              onChange={(e) => handleRoomField({ note: e.target.value || null })}
            />
            <label className="editor-checkbox">
              <input
                type="checkbox"
                checked={currentRoom.room.showNote !== false}
                onChange={(e) => handleRoomField({ showNote: e.target.checked })}
                disabled={!currentRoom.room.note}
              />
              備考を表示
            </label>
          </div>

          {currentRoom.room.note && (
            <div className="editor-field">
              <label htmlFor="room-note-font-size">
                備考フォントサイズ（pt）
                {currentRoom.room.noteFontSize == null && (
                  <span className="editor-field-default">
                    {' '}
                    デフォルト{' '}
                    {Math.round(
                      (currentRoom.room.labelFontSize ?? LABEL.defaultFontSize) *
                        LABEL.noteSizeRatio *
                        10
                    ) / 10}
                    pt
                  </span>
                )}
              </label>
              <input
                id="room-note-font-size"
                type="number"
                step="1"
                min={LABEL.fontSizeMin}
                max={LABEL.fontSizeMax}
                value={
                  currentRoom.room.noteFontSize ??
                  Math.round(
                    (currentRoom.room.labelFontSize ?? LABEL.defaultFontSize) *
                      LABEL.noteSizeRatio *
                      10
                  ) / 10
                }
                onChange={(e) => {
                  const val = parseFloat(e.target.value)
                  if (Number.isNaN(val)) return
                  const clamped = Math.min(LABEL.fontSizeMax, Math.max(LABEL.fontSizeMin, val))
                  const defaultNote =
                    Math.round(
                      (currentRoom.room.labelFontSize ?? LABEL.defaultFontSize) *
                        LABEL.noteSizeRatio *
                        10
                    ) / 10
                  if (clamped === defaultNote) {
                    handleRoomField({ noteFontSize: null })
                  } else {
                    handleRoomField({ noteFontSize: clamped })
                  }
                }}
              />
              {currentRoom.room.noteFontSize != null && (
                <button
                  type="button"
                  className="editor-reset-btn"
                  onClick={() => handleRoomField({ noteFontSize: null })}
                >
                  デフォルトサイズに戻す
                </button>
              )}
              <OffsetFields
                label="備考の位置"
                offset={currentRoom.room.noteLabelOffset}
                onChange={(o) => handleRoomOffset('note', o)}
                onReset={() => handleRoomOffset('note', { x: 0, y: 0 })}
              />
            </div>
          )}

          <div className="editor-field">
            <span className="editor-offset-heading">表示位置の調整</span>
            <p className="editor-offset-hint">数値入力または間取図上でラベルをドラッグ</p>
            <OffsetFields
              label="部屋名"
              offset={currentRoom.room.nameLabelOffset}
              onChange={(o) => handleRoomOffset('name', o)}
              onReset={() => handleRoomOffset('name', { x: 0, y: 0 })}
            />
            {!hideAreaJo && (
              <OffsetFields
                label="帖数"
                offset={currentRoom.room.areaLabelOffset}
                onChange={(o) => handleRoomOffset('area', o)}
                onReset={() => handleRoomOffset('area', { x: 0, y: 0 })}
              />
            )}
          </div>

          <button type="button" className="btn btn-danger" onClick={handleDelete}>
            この部屋を削除
          </button>
        </div>
      )}

      {currentStair && (
        <div className="room-editor-form">
          <h4>階段の詳細</h4>

          <div className="editor-field">
            <label htmlFor="stair-width">幅（mm）</label>
            <input
              id="stair-width"
              type="number"
              min={600}
              max={1500}
              step={10}
              value={currentStair.stair.widthMm ?? STAIR_DEFAULT_WIDTH_MM}
              onChange={(e) => {
                const widthMm = Number(e.target.value)
                if (!Number.isFinite(widthMm) || widthMm <= 0) return
                handleStairField({ widthMm })
              }}
            />
            <p className="editor-field-hint">標準幅は {STAIR_DEFAULT_WIDTH_MM}mm です。</p>
          </div>

          <div className="editor-field">
            <label htmlFor="stair-length">長さ（mm）</label>
            <input
              id="stair-length"
              type="number"
              min={900}
              max={9000}
              step={50}
              value={getStairLengthMm(currentStair.stair)}
              onChange={(e) => {
                const lengthMm = Number(e.target.value)
                if (!Number.isFinite(lengthMm) || lengthMm <= 0) return
                handleStairField({ lengthMm })
              }}
            />
            <p className="editor-field-hint">上り方向の長さです。上り始め側は動きません。</p>
          </div>

          <div className="editor-nudge-row">
            <span className="editor-offset-label">位置（50mm）</span>
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() => handleStairField({ moveBy: { x: 0, y: -mmToSvgUnits(50) } })}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() => handleStairField({ moveBy: { x: -mmToSvgUnits(50), y: 0 } })}
            >
              ←
            </button>
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() => handleStairField({ moveBy: { x: mmToSvgUnits(50), y: 0 } })}
            >
              →
            </button>
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() => handleStairField({ moveBy: { x: 0, y: mmToSvgUnits(50) } })}
            >
              ↓
            </button>
          </div>
          <p className="editor-offset-hint">図面上で階段をドラッグしても移動できます。</p>

          <div className="editor-field">
            <label htmlFor="stair-layout">段の形状</label>
            <select
              id="stair-layout"
              value={resolveStairLayout(currentStair.stair)}
              onChange={(e) => handleStairField({ layout: e.target.value as StairLayout })}
            >
              {STAIR_LAYOUT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="editor-field">
            <label htmlFor="stair-orientation">上り方向</label>
            <select
              id="stair-orientation"
              value={
                currentStair.stair.orientation ??
                resolveStairOrientation(currentStair.stair, getStairBounds(currentStair.stair.polygon))
              }
              onChange={(e) => handleStairField({ orientation: e.target.value as StairOrientation })}
            >
              {STAIR_ORIENTATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="editor-field-hint">矢印と段差線の向きを変更します。</p>
          </div>

          <div className="editor-field">
            <label htmlFor="stair-name">表示名</label>
            <input
              id="stair-name"
              type="text"
              value={currentStair.stair.name ?? '階段'}
              onChange={(e) => handleStairField({ name: e.target.value })}
            />
            <label className="editor-checkbox">
              <input
                type="checkbox"
                checked={currentStair.stair.showName !== false}
                onChange={(e) => handleStairField({ showName: e.target.checked })}
              />
              名称を表示
            </label>
          </div>

          <div className="editor-field">
            <label htmlFor="stair-font-size">
              フォントサイズ（pt）
              {currentStair.stair.labelFontSize == null && (
                <span className="editor-field-default"> デフォルト {LABEL.defaultFontSize}pt</span>
              )}
            </label>
            <input
              id="stair-font-size"
              type="number"
              step="1"
              min={LABEL.fontSizeMin}
              max={LABEL.fontSizeMax}
              value={currentStair.stair.labelFontSize ?? LABEL.defaultFontSize}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                if (Number.isNaN(val)) return
                const clamped = Math.min(LABEL.fontSizeMax, Math.max(LABEL.fontSizeMin, val))
                if (clamped === LABEL.defaultFontSize) {
                  handleStairField({ labelFontSize: null })
                } else {
                  handleStairField({ labelFontSize: clamped })
                }
              }}
            />
          </div>

          <p className="editor-fixed-hint">階段は帖数を表示しません。</p>

          <div className="editor-field">
            <span className="editor-offset-heading">表示位置の調整</span>
            <p className="editor-offset-hint">数値入力または間取図上でラベルをドラッグ</p>
            <OffsetFields
              label="名称"
              offset={currentStair.stair.nameLabelOffset}
              onChange={handleStairOffset}
              onReset={() => handleStairOffset({ x: 0, y: 0 })}
            />
          </div>

          <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDeleteStair}>
            この階段を削除
          </button>
        </div>
      )}

      {currentWall && selected?.kind === 'wall' && (
        <div className="room-editor-form">
          <h4>壁の詳細</h4>
          <p className="editor-field-hint">
            {currentWall.wall.exterior ? '外壁（建物の輪郭）' : '内壁'}
          </p>
          <p className="editor-offset-hint">
            端点（●）で長さ変更、中央（○）で平行移動。外壁を動かすと接している部屋の形状も追従します。
          </p>
          <p className="editor-field-hint">
            壁は部屋の形から自動生成されますが、<strong>手動で追加・調整した壁は作り直されず残ります</strong>。
            自動生成の壁は、部屋を移動・変形・合成すると引き直されます。
          </p>
          <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDeleteWall}>
            この壁を削除
          </button>
        </div>
      )}

      {currentDoor && selected?.kind === 'door' && (
        <div className="room-editor-form">
          <h4>
            {(currentDoor.door.kind ?? 'swing') === 'opening' ? '開口部の詳細' : '扉の詳細'}
          </h4>
          <p className="editor-offset-hint">
            ドラッグで移動。種類・開き方向を変えると図上の記号がすぐ変わります。
          </p>
          <div className="editor-field">
            <label htmlFor="door-kind">種類</label>
            <select
              id="door-kind"
              value={currentDoor.door.kind ?? 'swing'}
              onChange={(e) => handleDoorField({ kind: e.target.value as DoorKind })}
            >
              {DOOR_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="editor-field-hint">
              {DOOR_KIND_OPTIONS.find((o) => o.value === (currentDoor.door.kind ?? 'swing'))?.hint}
            </p>
          </div>
          <div className="editor-field">
            <label htmlFor="door-width">幅（mm）</label>
            <input
              id="door-width"
              type="number"
              step={50}
              min={300}
              max={3000}
              value={Math.round(svgUnitsToMm(currentDoor.door.width))}
              onChange={(e) => {
                const widthMm = parseInt(e.target.value, 10)
                if (Number.isNaN(widthMm)) return
                handleDoorField({ widthMm })
              }}
            />
          </div>
          <div className="editor-field">
            <label htmlFor="door-angle">戸の向き（壁沿い）</label>
            <select
              id="door-angle"
              value={((((Math.round(currentDoor.door.angle / 90) % 4) + 4) % 4) * 90)}
              onChange={(e) => handleDoorField({ angle: Number(e.target.value) })}
            >
              <option value={0}>右方向（0°）</option>
              <option value={90}>下方向（90°）</option>
              <option value={180}>左方向（180°）</option>
              <option value={270}>上方向（270°）</option>
            </select>
            <p className="editor-field-hint">閉じたときの戸が壁に沿って伸びる向きです。</p>
          </div>
          {DOOR_KINDS_WITH_SWING.has(currentDoor.door.kind ?? 'swing') && (
            <div className="editor-field">
              <span className="editor-offset-label">開閉の向き</span>
              <div className="editor-swing-grid">
                {DOOR_SWING_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`btn editor-swing-btn ${currentDoor.door.swing === opt.value ? 'active' : ''}`}
                    onClick={() => handleDoorField({ swing: opt.value })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="editor-field-hint">
                {DOOR_SWING_OPTIONS.find((o) => o.value === currentDoor.door.swing)?.hint}
              </p>
              <button
                type="button"
                className="btn btn-secondary editor-flip-hinge-btn"
                onClick={() => handleDoorField({ flipHinge: true })}
              >
                丁番の位置を反対側へ
              </button>
              <p className="editor-field-hint">開き始点（丁番）を開口の反対端に移します。</p>
            </div>
          )}
          <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDeleteDoor}>
            この{doorKindLabel(currentDoor.door.kind)}を削除
          </button>
        </div>
      )}

      {currentWindow && selected?.kind === 'window' && (
        <div className="room-editor-form">
          <h4>窓の詳細</h4>
          <p className="editor-offset-hint">
            両端の●で幅を調整、中央の○で平行移動できます。種類を変えると図上の記号が変わります。
          </p>
          <div className="editor-field">
            <label htmlFor="window-kind">種類</label>
            <select
              id="window-kind"
              value={currentWindow.window.kind ?? 'sliding'}
              onChange={(e) => handleWindowField({ kind: e.target.value as WindowKind })}
            >
              {WINDOW_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="editor-field-hint">
              {
                WINDOW_KIND_OPTIONS.find((o) => o.value === (currentWindow.window.kind ?? 'sliding'))
                  ?.hint
              }
            </p>
          </div>

          {hasWindowDirection(currentWindow.window.kind) && (
            <div className="editor-field">
              <span className="editor-offset-label">開く向き</span>
              <div className="editor-nudge-row">
                <button
                  type="button"
                  className="btn editor-nudge-btn"
                  onClick={() =>
                    handleWindowField({
                      outward: currentWindow.window.outward === -1 ? 1 : -1,
                    })
                  }
                >
                  ⇄ 反対側に開く
                </button>
              </div>
              <p className="editor-field-hint">
                生成時は建物の外側へ開くよう自動で向けています。
                室内側を向いてしまったときはこのボタンで反転してください。
              </p>
            </div>
          )}

          <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDeleteWindow}>
            この{windowKindLabel(currentWindow.window.kind)}を削除
          </button>
        </div>
      )}

      {currentFixture && selected?.kind === 'fixture' && (
        <div className="room-editor-form">
          <h4>設備の詳細</h4>
          <div className="editor-field">
            <label htmlFor="fixture-type">種類</label>
            <select
              id="fixture-type"
              value={currentFixture.fixture.type}
              onChange={(e) =>
                applyPlan((prev) =>
                  updateFixture(prev, selected, {
                    type: e.target.value as (typeof FIXTURE_TYPE_OPTIONS)[number]['value'],
                  })
                )
              }
            >
              {FIXTURE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <p className="editor-field-hint">{fixtureTypeLabel(currentFixture.fixture.type)}</p>

          <div className="editor-field-row">
            <div className="editor-field">
              <label htmlFor="fixture-width">幅（mm）</label>
              <input
                id="fixture-width"
                type="number"
                step={10}
                min={100}
                max={6000}
                value={Math.round(svgUnitsToMm(currentFixture.fixture.width))}
                onChange={(e) => {
                  const widthMm = parseInt(e.target.value, 10)
                  if (Number.isNaN(widthMm) || widthMm <= 0) return
                  applyPlan((prev) => updateFixture(prev, selected, { widthMm }))
                }}
              />
            </div>
            <div className="editor-field">
              <label htmlFor="fixture-height">奥行き（mm）</label>
              <input
                id="fixture-height"
                type="number"
                step={10}
                min={100}
                max={6000}
                value={Math.round(svgUnitsToMm(currentFixture.fixture.height))}
                onChange={(e) => {
                  const heightMm = parseInt(e.target.value, 10)
                  if (Number.isNaN(heightMm) || heightMm <= 0) return
                  applyPlan((prev) => updateFixture(prev, selected, { heightMm }))
                }}
              />
            </div>
          </div>
          <p className="editor-field-hint">
            図面の上下方向が「奥行き」です。標準は{' '}
            {defaultFixtureSizeMm(currentFixture.fixture.type).widthMm} ×{' '}
            {defaultFixtureSizeMm(currentFixture.fixture.type).heightMm} mm。
          </p>

          <div className="editor-field">
            <label htmlFor="fixture-angle">向き（回転）</label>
            <select
              id="fixture-angle"
              value={normalizeFixtureAngle(currentFixture.fixture.angle)}
              onChange={(e) =>
                applyPlan((prev) =>
                  updateFixture(prev, selected, { angle: Number(e.target.value) })
                )
              }
            >
              <option value={0}>0°（そのまま）</option>
              <option value={90}>90°（右へ）</option>
              <option value={180}>180°（上下反転）</option>
              <option value={270}>270°（左へ）</option>
            </select>
          </div>
          <div className="editor-nudge-row">
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() =>
                applyPlan((prev) =>
                  updateFixture(prev, selected, {
                    angle: (normalizeFixtureAngle(currentFixture.fixture.angle) + 270) % 360,
                  })
                )
              }
            >
              ↺ 左に90°
            </button>
            <button
              type="button"
              className="btn editor-nudge-btn"
              onClick={() =>
                applyPlan((prev) =>
                  updateFixture(prev, selected, {
                    angle: (normalizeFixtureAngle(currentFixture.fixture.angle) + 90) % 360,
                  })
                )
              }
            >
              ↻ 右に90°
            </button>
          </div>
          <button
            type="button"
            className="btn editor-nudge-btn"
            onClick={() => {
              const size = defaultFixtureSizeMm(currentFixture.fixture.type)
              applyPlan((prev) =>
                updateFixture(prev, selected, {
                  widthMm: size.widthMm,
                  heightMm: size.heightMm,
                })
              )
            }}
          >
            標準サイズに戻す
          </button>

          <p className="editor-offset-hint">
            枠をドラッグで移動、四隅の■をドラッグで大きさを変更できます（10mm 刻み）。
          </p>
          <button type="button" className="btn btn-danger editor-delete-btn" onClick={handleDeleteFixture}>
            この設備を削除
          </button>
        </div>
      )}

    </div>
  )
}
