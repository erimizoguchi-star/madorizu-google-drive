import { useMemo } from 'react'
import { ROOM_TYPE_OPTIONS, isAreaJoHiddenByType } from '../constants/roomTypes'
import { LABEL } from '../renderer/styles'
import {
  getDefaultFillColor,
  normalizeHexColor,
  resolveRoomFillColor,
  resolveRoomFillPattern,
  ROOM_PATTERN_OPTIONS,
} from '../renderer/roomFill'
import type { FloorPlan, Point, RoomFillPattern } from '../types/floorPlan'
import {
  deleteRoom,
  elementRefToKey,
  findRoom,
  findStair,
  listAllEditableElements,
  parseElementRefKey,
  type SelectedElementRef,
  updateFloorPlanTitle,
  updateRoom,
  updateStair,
  resizeRoomDimensions,
  type SelectOptions,
} from '../utils/floorPlanEdit'
import type { LabelLineKind } from '../renderer/roomLabelLayout'
import { mergeRooms } from '../utils/mergeRooms'
import {
  getRectDimensionsMm,
  MIN_ROOM_SIZE_MM,
  parseAxisAlignedRect,
} from '../utils/roomGeometry'

interface RoomEditorProps {
  floorPlan: FloorPlan
  selected: SelectedElementRef | null
  mergeRoomIds: { floorId: string; roomIds: string[] } | null
  onSelect: (ref: SelectedElementRef | null, options?: SelectOptions) => void
  onMergeRoomIdsChange: (ids: { floorId: string; roomIds: string[] } | null) => void
  onChange: (updater: (prev: FloorPlan) => FloorPlan) => void
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
  onSelect,
  onMergeRoomIdsChange,
  onChange,
}: RoomEditorProps) {
  const elementList = useMemo(() => listAllEditableElements(floorPlan), [floorPlan])
  const currentRoom = selected?.kind === 'room' ? findRoom(floorPlan, selected) : null
  const currentStair = selected?.kind === 'stair' ? findStair(floorPlan, selected) : null

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
        onSelect({ kind: 'room', floorId, roomId: next[0] })
      }
      return
    }
    const prev = mergeRoomIds?.floorId === floorId ? mergeRoomIds.roomIds : []
    const next = [...new Set([...prev, roomId])]
    onMergeRoomIdsChange({ floorId, roomIds: next })
    onSelect({ kind: 'room', floorId, roomId })
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
      <p className="editor-hint">部屋・階段をクリックするか、一覧から選択して編集できます。</p>

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
        <label htmlFor="element-select">部屋・階段を選択</label>
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
            同じ階で隣り合った部屋を2つ以上選び「合成する」を押してください。Ctrl+クリックでも追加選択できます。
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
                選択中の部屋と、その辺の壁・扉・窓を更新します（隣の部屋の塗りは動きません）。
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
            </div>
          ) : (
            <p className="editor-fixed-hint">
              L字型など複雑な形状の部屋は、サイズの数値調整に対応していません。
            </p>
          )}

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
        </div>
      )}

    </div>
  )
}
