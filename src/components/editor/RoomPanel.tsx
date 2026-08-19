import { ROOM_TYPE_OPTIONS, isAreaJoHiddenByType } from '../../constants/roomTypes'
import { LABEL } from '../../renderer/styles'
import {
  getDefaultFillColor,
  normalizeHexColor,
  resolveRoomFillColor,
  resolveRoomFillPattern,
  ROOM_PATTERN_OPTIONS,
} from '../../renderer/roomFill'
import type { FloorPlan, Point, RoomFillPattern } from '../../types/floorPlan'
import type { LabelLineKind } from '../../renderer/roomLabelLayout'
import { setAllCornerRadiiMm, setCornerRadiusMmAt } from '../../utils/cornerFillet'
import {
  deleteRoom,
  findRoom,
  moveRoom,
  resizeRoomDimensions,
  type SelectedElementRef,
  type SelectOptions,
  updateRoom,
} from '../../utils/floorPlanEdit'
import {
  getRectDimensionsMm,
  MIN_ROOM_SIZE_MM,
  mmToSvgUnits,
  parseAxisAlignedRect,
} from '../../utils/roomGeometry'
import { OffsetFields } from './OffsetFields'

interface RoomPanelProps {
  floorPlan: FloorPlan
  selected: Extract<SelectedElementRef, { kind: 'room' }>
  onSelect: (ref: SelectedElementRef | null, options?: SelectOptions) => void
  onChange: (updater: (prev: FloorPlan) => FloorPlan) => void
}

export function RoomPanel({ floorPlan, selected, onSelect, onChange }: RoomPanelProps) {
  const applyPlan = onChange

  const currentRoom = findRoom(floorPlan, selected)

  const handleRoomField = (patch: Parameters<typeof updateRoom>[2]) => {
    applyPlan((prev) => updateRoom(prev, selected, patch))
  }

  const handleRoomOffset = (kind: LabelLineKind, offset: Point) => {
    const patch =
      kind === 'name'
        ? { nameLabelOffset: offset.x === 0 && offset.y === 0 ? null : offset }
        : kind === 'area'
          ? { areaLabelOffset: offset.x === 0 && offset.y === 0 ? null : offset }
          : { noteLabelOffset: offset.x === 0 && offset.y === 0 ? null : offset }
    applyPlan((prev) => updateRoom(prev, selected, patch))
  }

  const handleDelete = () => {
    if (!currentRoom) return
    if (!confirm(`「${currentRoom.room.name}」を削除しますか？`)) return
    applyPlan((prev) => deleteRoom(prev, selected))
    onSelect(null)
  }

  const handleMoveRoom = (dxMm: number, dyMm: number) => {
    applyPlan((prev) =>
      moveRoom(prev, selected, { x: mmToSvgUnits(dxMm), y: mmToSvgUnits(dyMm) })
    )
  }

  const handleRoomSize = (patch: { widthMm?: number; heightMm?: number }) => {
    const result = resizeRoomDimensions(floorPlan, selected, patch)
    if ('error' in result) {
      alert(result.error)
      return
    }
    applyPlan(() => result)
  }

  if (!currentRoom) return null

  const hideAreaJo = isAreaJoHiddenByType(currentRoom.room.type)
  const roomRect = parseAxisAlignedRect(currentRoom.room.polygon)
  const roomDimensions = roomRect ? getRectDimensionsMm(roomRect) : null

  return (
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
  )
}
