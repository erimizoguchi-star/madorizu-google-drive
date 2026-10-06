import { useEffect, useRef, useState } from 'react'
import { ExportButton } from './components/ExportButton'
import { FloorsPanel } from './components/FloorsPanel'
import { JsonDataButtons } from './components/JsonDataButtons'
import { RoomEditor } from './components/RoomEditor'
import { SavedPlansPanel } from './components/SavedPlansPanel'
import {
  DEFAULT_SOURCE_OVERLAY,
  SourceOverlayControls,
  type SourceOverlayState,
} from './components/SourceOverlayControls'
import { UploadPanel } from './components/UploadPanel'
import { ZoomableView } from './components/ZoomableView'
import { FloorPlanView } from './renderer/FloorPlanView'
import { LEGEND_ITEMS, ROOM_COLORS } from './renderer/styles'
import { useFloorPlanHistory } from './hooks/useFloorPlanHistory'
import type { AnalysisResult, FloorPlan, Point } from './types/floorPlan'
import type { SelectedElementRef, SelectOptions } from './utils/floorPlanEdit'
import {
  deleteSelectedElement,
  describeSelection,
  isDeletableSelection,
  isTypingInEditableField,
  resizeRoomEdge,
  setRoomPolygon,
  setStairPolygon,
  updateLabelOffset,
} from './utils/floorPlanEdit'
import {
  addDoorAt,
  addFixtureAt,
  addRoomAt,
  addTextAt,
  addWallSegment,
  addWindowAt,
  fixtureTypeFromPlaceKind,
  isFixturePlaceKind,
  type PlaceKind,
} from './utils/floorPlanAdd'
import {
  moveDoor,
  moveFixture,
  moveTextLabel,
  moveWallEndpoint,
  moveWindowEndpoint,
  resizeFixtureCorner,
  setWallEndpoints,
  setWindowEndpoints,
} from './utils/floorPlanDrag'
import { appendFloors } from './utils/floorPlanFloors'
import { moveGridLine, scaleFloor } from './utils/gridLines'
import {
  fetchPropertySourceFile,
  fetchPropertySources,
  fileSafeName,
  propertyLinkFromUrl,
  removeUploadFromAddressBar,
  type PropertySource,
} from './utils/propertyLink'
import './App.css'

function App() {
  // 物件情報管理システムから開かれた場合の物件情報（URL の ?property= / name=）
  const [propertyLink] = useState(() => propertyLinkFromUrl())
  useEffect(() => {
    removeUploadFromAddressBar()
  }, [])
  // 物件情報管理システムにある、この物件の図面（建物図面や図面の写真）の一覧
  const [propertySources, setPropertySources] = useState<PropertySource[]>([])
  const uploadUrl = propertyLink?.uploadUrl ?? null
  useEffect(() => {
    if (!uploadUrl) return
    let cancelled = false
    void fetchPropertySources(uploadUrl).then((sources) => {
      if (!cancelled) setPropertySources(sources)
    })
    return () => {
      cancelled = true
    }
  }, [uploadUrl])
  const {
    floorPlan,
    canUndo,
    canRedo,
    planGeneration,
    reset: resetFloorPlan,
    commit,
    undo,
    redo,
  } = useFloorPlanHistory()
  const [sourcePreview, setSourcePreview] = useState<{ url: string; fileName: string } | null>(null)
  const [analysisInfo, setAnalysisInfo] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [selected, setSelected] = useState<SelectedElementRef | null>(null)
  const [mergeRoomIds, setMergeRoomIds] = useState<{ floorId: string; roomIds: string[] } | null>(
    null
  )
  const [placeKind, setPlaceKind] = useState<PlaceKind | null>(null)
  const [overlay, setOverlay] = useState<SourceOverlayState>(DEFAULT_SOURCE_OVERLAY)
  const [calibrationStep, setCalibrationStep] = useState(0)
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null)
  const [wideEdit, setWideEdit] = useState(false)
  const [panelHidden, setPanelHidden] = useState(false)
  const [wallDraftStart, setWallDraftStart] = useState<Point | null>(null)
  /** 「線を合わせる」中。壁の通りをドラッグして元の平面図に合わせる */
  const [aligning, setAligning] = useState(false)
  /** 通りのドラッグを始めたときの間取図。ドラッグ中はこれに当て直す（途中で別の通りと重なっても混ざらない） */
  const gridDragBaseRef = useRef<FloorPlan | null>(null)
  /** 2点合わせで分かった、間取図を平面図に合わせるための横・縦の倍率（ずれが小さければ null） */
  const [planStretch, setPlanStretch] = useState<{ sx: number; sy: number } | null>(null)
  /** 扉・窓・開口の連続配置で優先する壁 */
  const [placeWallTarget, setPlaceWallTarget] = useState<{
    floorId: string
    wallId: string
  } | null>(null)

  const handleResult = (result: AnalysisResult, options: { append: boolean }) => {
    if (options.append && floorPlan) {
      const appended = appendFloors(floorPlan, result.floorPlan)
      if ('error' in appended) {
        setError(appended.error)
        return
      }
      // 階の追加も「元に戻す」で取り消せるよう、履歴に積む
      commit(appended.floorPlan)
      // 重ね合わせは間取図全体に合わせる作りなので、階が増えたら一度外す
      setOverlay((prev) => ({ ...prev, enabled: false, adjusting: false, calibrating: false }))
    } else {
      resetFloorPlan(result.floorPlan)
    }
    setAnalysisInfo(result)
    setError(null)
    setAligning(false)
    setPlanStretch(null)
    setSelected(null)
    setMergeRoomIds(null)
    setPlaceKind(null)
    setWallDraftStart(null)
    setPlaceWallTarget(null)
    if (result.sourcePreviewUrl && result.sourceFileName) {
      setSourcePreview({ url: result.sourcePreviewUrl, fileName: result.sourceFileName })
    }
  }

  /** 「線を合わせる」を始める・終える。始めるときは選択や配置をやめ、平面図があれば重ねる */
  const toggleAligning = (on: boolean) => {
    setAligning(on)
    if (!on) return
    setSelected(null)
    setMergeRoomIds(null)
    setPlaceKind(null)
    setWallDraftStart(null)
    setPlaceWallTarget(null)
    if (sourcePreview && !overlay.enabled) {
      setOverlay((prev) => ({ ...prev, enabled: true, adjusting: false, calibrating: false, needsFit: true }))
    }
  }

  /** 選択中の要素を削除する（間取図の上の「削除」ボタン。Delete キーも同じ処理） */
  const deleteSelection = () => {
    if (!selected || !isDeletableSelection(selected)) return
    commit((prev) => deleteSelectedElement(prev, selected))
    setSelected(null)
    setMergeRoomIds(null)
  }
  const selectedLabel = selected && floorPlan ? describeSelection(floorPlan, selected) : null

  const handleSelect = (ref: SelectedElementRef | null, options?: SelectOptions) => {
    if (!ref) {
      setSelected(null)
      setMergeRoomIds(null)
      return
    }

    setSelected(ref)
    setEditMode(true)
    setPlaceKind(null)
    setWallDraftStart(null)
    setPlaceWallTarget(null)

    if (ref.kind === 'room') {
      const { floorId, roomId } = ref
      if (options?.keepMergeSelection) {
        // 合成リスト側が選択を管理しているので、ここでは上書きしない
      } else if (options?.additive) {
        setMergeRoomIds((prev) => {
          const base = prev?.floorId === floorId ? [...prev.roomIds] : []
          if (!base.includes(roomId)) base.push(roomId)
          else {
            const idx = base.indexOf(roomId)
            base.splice(idx, 1)
          }
          if (base.length === 0) return { floorId, roomIds: [roomId] }
          return { floorId, roomIds: base }
        })
      } else {
        setMergeRoomIds({ floorId, roomIds: [roomId] })
      }
    } else {
      setMergeRoomIds(null)
    }
  }

  const handlePlaceClick = (floorId: string, position: Point) => {
    if (!placeKind || !floorPlan) return

    if (placeKind === 'wall') {
      if (!wallDraftStart) {
        setWallDraftStart(position)
        return
      }
      const result = addWallSegment(floorPlan, floorId, wallDraftStart, position, {
        exterior: true,
      })
      setWallDraftStart(null)
      if ('error' in result) {
        setError(result.error)
        return
      }
      commit(result.floorPlan)
      setSelected({ kind: 'wall', floorId, wallId: result.wallId })
      setPlaceKind(null)
      return
    }

    const preferredWallId =
      placeWallTarget?.floorId === floorId
        ? placeWallTarget.wallId
        : selected?.kind === 'wall' && selected.floorId === floorId
          ? selected.wallId
          : undefined

    let result:
      | { floorPlan: FloorPlan; roomId: string }
      | { floorPlan: FloorPlan; doorId: string }
      | { floorPlan: FloorPlan; windowId: string }
      | { floorPlan: FloorPlan; fixtureId: string }
      | { floorPlan: FloorPlan; textId: string }
      | { error: string }

    if (placeKind === 'room') result = addRoomAt(floorPlan, floorId, position)
    else if (placeKind === 'door') {
      result = addDoorAt(floorPlan, floorId, position, { preferredWallId })
    } else if (placeKind === 'opening') {
      result = addDoorAt(floorPlan, floorId, position, { kind: 'opening', preferredWallId })
    } else if (placeKind === 'text') {
      result = addTextAt(floorPlan, floorId, position)
    } else if (isFixturePlaceKind(placeKind)) {
      result = addFixtureAt(floorPlan, floorId, position, fixtureTypeFromPlaceKind(placeKind))
    } else {
      result = addWindowAt(floorPlan, floorId, position, { preferredWallId })
    }

    if ('error' in result) {
      setError(result.error)
      return
    }

    commit(result.floorPlan)
    setWallDraftStart(null)
    setError(null)
    if ('roomId' in result) {
      setPlaceKind(null)
      setSelected({ kind: 'room', floorId, roomId: result.roomId })
      setMergeRoomIds({ floorId, roomIds: [result.roomId] })
    } else if ('doorId' in result) {
      setSelected({ kind: 'door', floorId, doorId: result.doorId })
      setMergeRoomIds(null)
    } else if ('fixtureId' in result) {
      setSelected({ kind: 'fixture', floorId, fixtureId: result.fixtureId })
      setMergeRoomIds(null)
    } else if ('textId' in result) {
      setSelected({ kind: 'text', floorId, textId: result.textId })
      setMergeRoomIds(null)
    } else {
      setSelected({ kind: 'window', floorId, windowId: result.windowId })
      setMergeRoomIds(null)
    }
  }

  const isDemo = analysisInfo?.mode === 'demo'

  useEffect(() => {
    if (!editMode) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPlaceKind(null)
        setWallDraftStart(null)
        setPlaceWallTarget(null)
        return
      }

      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isTypingInEditableField(e.target)) return
        e.preventDefault()
        undo()
        setSelected(null)
        setMergeRoomIds(null)
        return
      }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        if (isTypingInEditableField(e.target)) return
        e.preventDefault()
        redo()
        setSelected(null)
        setMergeRoomIds(null)
        return
      }

      if (!selected) return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (isTypingInEditableField(e.target)) return
      if (!isDeletableSelection(selected)) return

      e.preventDefault()
      commit((prev) => deleteSelectedElement(prev, selected))
      setSelected(null)
      setMergeRoomIds(null)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editMode, selected, undo, redo, commit])

  useEffect(() => {
    if (!aligning) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAligning(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [aligning])

  useEffect(() => {
    if (!placeKind) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPlaceKind(null)
      setWallDraftStart(null)
      setPlaceWallTarget(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [placeKind])

  return (
    <div className={`app ${wideEdit ? 'app-wide-edit' : ''}`}>
      <header className="app-header">
        <div className="header-content">
          <h1>間取図ジェネレーター</h1>
          <p className="tagline">平面図から、カラー間取図を自動生成</p>
        </div>
        {propertyLink && (
          <div className="property-link">
            <span className="property-link__label">物件</span>
            <strong className="property-link__name">{propertyLink.name}</strong>
            <span className="property-link__hint">
              物件情報管理システムから開きました。
              {propertyLink.uploadUrl
                ? '仕上げたら、書き出しの「物件へ送る」を押すと、広告シートの「間取り図」の枠に入ります。'
                : 'できあがった画像は、広告シートの「間取り図」の枠に入れてください。'}
            </span>
          </div>
        )}
      </header>

      <main className="app-main">
        <aside className={`sidebar ${panelHidden ? 'sidebar-collapsed' : ''}`}>
          <UploadPanel
            onResult={handleResult}
            canAppend={!!floorPlan}
            onSourceReady={(source) => {
              setSourcePreview({ url: source.previewUrl, fileName: source.fileName })
              setError(null)
            }}
            onError={(msg) => {
              setError(msg || null)
            }}
            propertySources={
              uploadUrl
                ? { sources: propertySources, load: (source) => fetchPropertySourceFile(uploadUrl, source) }
                : undefined
            }
          />

          {error && <div className="error-banner">{error}</div>}

          {analysisInfo && (
            <div className="analysis-info">
              <h4>解析結果</h4>
              {analysisInfo.mode === 'gemini' && (
                <p>信頼度: {Math.round(analysisInfo.confidence * 100)}%</p>
              )}
              <ul>
                {analysisInfo.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {floorPlan && (
            <>
              <FloorsPanel
                floorPlan={floorPlan}
                onChange={(next, options) => commit(next, options)}
                onFloorRemoved={() => {
                  setSelected(null)
                  setMergeRoomIds(null)
                  setPlaceKind(null)
                  setWallDraftStart(null)
                  setPlaceWallTarget(null)
                }}
              />

              <div className="edit-mode-toggle">
                <label className={editMode ? 'active' : ''}>
                  <input
                    type="checkbox"
                    checked={editMode}
                    onChange={(e) => {
                      setEditMode(e.target.checked)
                      if (!e.target.checked) {
                        setSelected(null)
                        setMergeRoomIds(null)
                        setPlaceKind(null)
                        setWallDraftStart(null)
                      }
                    }}
                  />
                  間取図を編集する
                </label>
              </div>

              {editMode && (
                <RoomEditor
                  floorPlan={floorPlan}
                  selected={selected}
                  mergeRoomIds={mergeRoomIds}
                  placeKind={placeKind}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  onUndo={() => {
                    undo()
                    setSelected(null)
                    setMergeRoomIds(null)
                  }}
                  onRedo={() => {
                    redo()
                    setSelected(null)
                    setMergeRoomIds(null)
                  }}
                  onPlaceKindChange={(kind) => {
                    setPlaceKind(kind)
                    setWallDraftStart(null)
                    if (kind === 'door' || kind === 'window' || kind === 'opening') {
                      if (selected?.kind === 'wall') {
                        setPlaceWallTarget({
                          floorId: selected.floorId,
                          wallId: selected.wallId,
                        })
                      } else {
                        setPlaceWallTarget(null)
                        setSelected(null)
                      }
                    } else {
                      setPlaceWallTarget(null)
                      if (kind) setSelected(null)
                    }
                  }}
                  onSelect={handleSelect}
                  onMergeRoomIdsChange={setMergeRoomIds}
                  onChange={(updater) => commit(updater)}
                  onError={setError}
                />
              )}
            </>
          )}

          <div className="legend">
            <h4>凡例</h4>
            <div className="legend-items">
              {LEGEND_ITEMS.map((item) => (
                <span key={item.type} className="legend-item">
                  <i style={{ background: ROOM_COLORS[item.type].fill }} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          {floorPlan && (
            <>
              <SavedPlansPanel
                floorPlan={floorPlan}
                currentId={savedPlanId}
                onCurrentIdChange={setSavedPlanId}
                onLoad={(plan) => {
                  resetFloorPlan(plan)
                  setSelected(null)
                  setMergeRoomIds(null)
                  setPlaceKind(null)
                }}
              />
              <JsonDataButtons
                floorPlan={floorPlan}
                onImport={(plan) => {
                  resetFloorPlan(plan)
                  setSelected(null)
                  setMergeRoomIds(null)
                  setPlaceKind(null)
                }}
              />
              <ExportButton
                targetId="madorizu-export"
                filename={propertyLink ? `間取り図_${fileSafeName(propertyLink.name)}` : 'madorizu'}
                sendTo={
                  propertyLink?.uploadUrl
                    ? { uploadUrl: propertyLink.uploadUrl, propertyName: propertyLink.name }
                    : undefined
                }
                onBeforeExport={() => {
                  // 選択枠・編集ハンドル・線合わせの線が画像に写り込まないよう解除してから出力する
                  setAligning(false)
                  setSelected(null)
                  setMergeRoomIds(null)
                  setPlaceKind(null)
                  setWallDraftStart(null)
                  setPlaceWallTarget(null)
                }}
              />
            </>
          )}
        </aside>

        <section
          className={[
            'preview-section',
            sourcePreview && !floorPlan ? 'preview-section-source-only' : '',
            sourcePreview && floorPlan ? 'preview-section-with-both' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {!sourcePreview && !floorPlan && (
            <div className="empty-state">
              <span className="empty-icon">🏠</span>
              <h2>平面図をアップロードしてください</h2>
              <p>左のパネルから PNG / JPG / PDF を選択し、「間取図を生成」を押してください。</p>
            </div>
          )}

          {floorPlan && (
            <div className="edit-space-bar">
              <button
                type="button"
                className={`btn wide-edit-btn align-btn ${aligning ? 'active' : ''}`}
                onClick={() => toggleAligning(!aligning)}
                title="壁の通りをまとめて動かして、元の平面図に合わせます（Esc で終了）"
              >
                {aligning ? '✓ 線合わせを終える' : '📏 線を合わせる'}
              </button>
              <button
                type="button"
                className={`btn btn-secondary wide-edit-btn ${wideEdit ? 'active' : ''}`}
                onClick={() => setWideEdit((v) => !v)}
              >
                {wideEdit ? '標準の表示に戻す' : '編集画面を広げる ⤢'}
              </button>
              <button
                type="button"
                className={`btn btn-secondary wide-edit-btn ${panelHidden ? 'active' : ''}`}
                onClick={() => setPanelHidden((v) => !v)}
              >
                {panelHidden ? '▶ 編集パネルを表示' : '◀ 編集パネルを隠す'}
              </button>
              {editMode && selected && selectedLabel && (
                <span className="edit-selection">
                  <span className="edit-selection__label">
                    選択中: <strong>{selectedLabel}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn edit-selection__delete"
                    onClick={deleteSelection}
                    title="選択中の要素を削除します（Delete キーでも削除できます。「一手戻る」で戻せます）"
                  >
                    削除
                  </button>
                </span>
              )}
              {/* 選択中は「選択中・削除」を優先し、帯が2段にならないよう説明を隠す */}
              {wideEdit && !(editMode && selectedLabel) && (
                <span className="edit-space-hint">
                  アップロード画像と見出しを隠して、間取図を画面いっぱいに表示しています。
                </span>
              )}
            </div>
          )}

          {sourcePreview && !wideEdit && (
            <div className="source-preview-card">
              <h3>アップロードした平面図</h3>
              <p className="source-file-name">{sourcePreview.fileName}</p>
              <ZoomableView className="source-preview-zoom" fitToView>
                <img
                  src={sourcePreview.url}
                  alt="アップロードした平面図"
                  className="source-preview-image"
                  draggable={false}
                />
              </ZoomableView>
            </div>
          )}

          {isDemo && sourcePreview && (
            <div className="demo-banner">
              <strong>デモモード</strong>
              <p>
                下の間取図はサンプルです。アップロードした平面図の内容は反映されていません。
                実際に生成するには「AI解析」モードに切り替えてください。
              </p>
            </div>
          )}

          {floorPlan && (
            <div className="generated-preview-card">
              <h3>{isDemo ? 'サンプル間取図' : '生成された間取図'}</h3>
              {sourcePreview && (
                <SourceOverlayControls
                  fileName={sourcePreview.fileName}
                  state={overlay}
                  calibrationStep={calibrationStep}
                  onChange={(next) => {
                    setOverlay(next)
                    // 重ね方をやり直したら、前の2点合わせで出した提案は使えない
                    if (!next.enabled || next.needsFit || next.calibrating) setPlanStretch(null)
                  }}
                  stretch={
                    planStretch && {
                      ...planStretch,
                      onApply: () => {
                        const { sx, sy } = planStretch
                        commit((plan) => ({
                          ...plan,
                          floors: plan.floors.map((floor, i) => {
                            // 2点合わせは1つ目の階の建物で測っているので、その階だけを合わせる
                            if (i !== 0) return floor
                            const points = floor.rooms.flatMap((r) => r.polygon)
                            if (points.length === 0) return floor
                            const origin = {
                              x: Math.min(...points.map((p) => p.x)),
                              y: Math.min(...points.map((p) => p.y)),
                            }
                            return scaleFloor(floor, origin, sx, sy)
                          }),
                        }))
                        setPlanStretch(null)
                      },
                      onDismiss: () => setPlanStretch(null),
                    }
                  }
                />
              )}
              <FloorPlanView
                floorPlan={floorPlan}
                // 階を足したり消したりしたときも、全体が枠に収まるよう合わせ直す
                fitKey={`${planGeneration}-${floorPlan.floors.length}`}
                editable={editMode}
                overlay={overlay}
                overlayUrl={sourcePreview?.url}
                onOverlayOffsetChange={(offset) => setOverlay((prev) => ({ ...prev, offset }))}
                onOverlayCalibrationStep={setCalibrationStep}
                onOverlayCalibrated={({ scaleX, scaleY, offset, planStretch: stretch }) => {
                  // 縦横の倍率の差が 2% 未満なら、クリックの誤差とみなして提案しない
                  setPlanStretch(
                    stretch && (Math.abs(stretch.sx - 1) >= 0.02 || Math.abs(stretch.sy - 1) >= 0.02)
                      ? stretch
                      : null
                  )
                  // 縦横比維持: 万一ずれていても共通の縮尺に揃える
                  const scale = (scaleX + scaleY) / 2
                  setOverlay((prev) => ({
                    ...prev,
                    scaleX: scale,
                    scaleY: scale,
                    offset,
                    calibrating: false,
                    needsFit: false,
                  }))
                }}
                aligning={aligning}
                onGridLineMove={(floorId, axis, from, to, phase) => {
                  if (phase === 'start') {
                    gridDragBaseRef.current = floorPlan
                    return
                  }
                  if (phase === 'end') {
                    gridDragBaseRef.current = null
                    return
                  }
                  const base = gridDragBaseRef.current
                  if (!base) return
                  commit(
                    () => ({
                      ...base,
                      floors: base.floors.map((f) => (f.id === floorId ? moveGridLine(f, axis, from, to) : f)),
                    }),
                    { coalesce: true }
                  )
                }}
                selected={selected}
                mergeRoomIds={mergeRoomIds}
                placeKind={editMode ? placeKind : null}
                wallDraftStart={wallDraftStart}
                onSelect={handleSelect}
                onPlaceClick={editMode && placeKind ? handlePlaceClick : undefined}
                onLabelOffsetChange={(ref, kind, offset) => {
                  commit((plan) => updateLabelOffset(plan, ref, kind, offset), { coalesce: true })
                }}
                onRoomResize={(ref, edge, positionFloorSvg) => {
                  commit((plan) => {
                    const result = resizeRoomEdge(plan, ref, edge, positionFloorSvg)
                    if ('error' in result) return plan
                    return result
                  }, { coalesce: true })
                }}
                onRoomMove={(ref, polygon) => {
                  commit((plan) => setRoomPolygon(plan, ref, polygon), { coalesce: true })
                }}
                onWallEndpointMove={(ref, endpoint, position) => {
                  commit((plan) => moveWallEndpoint(plan, ref, endpoint, position), {
                    coalesce: true,
                  })
                }}
                onWallMove={(ref, start, end) => {
                  commit((plan) => setWallEndpoints(plan, ref, start, end), { coalesce: true })
                }}
                onDoorMove={(ref, position) => {
                  commit((plan) => moveDoor(plan, ref, position), { coalesce: true })
                }}
                onWindowEndpointMove={(ref, endpoint, position) => {
                  commit((plan) => moveWindowEndpoint(plan, ref, endpoint, position), {
                    coalesce: true,
                  })
                }}
                onWindowMove={(ref, start, end) => {
                  commit((plan) => setWindowEndpoints(plan, ref, start, end), { coalesce: true })
                }}
                onFixtureMove={(ref, position) => {
                  commit((plan) => moveFixture(plan, ref, position), { coalesce: true })
                }}
                onStairMove={(ref, polygon) => {
                  commit((plan) => setStairPolygon(plan, ref, polygon), { coalesce: true })
                }}
                onTextMove={(ref, position) => {
                  commit((plan) => moveTextLabel(plan, ref, position), { coalesce: true })
                }}
                onFixtureResize={(ref, corner, position) => {
                  commit((plan) => resizeFixtureCorner(plan, ref, corner, position), {
                    coalesce: true,
                  })
                }}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
