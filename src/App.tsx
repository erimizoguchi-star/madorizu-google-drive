import { useEffect, useState } from 'react'
import { ExportButton } from './components/ExportButton'
import { JsonDataButtons } from './components/JsonDataButtons'
import { RoomEditor } from './components/RoomEditor'
import { UploadPanel } from './components/UploadPanel'
import { ZoomableView } from './components/ZoomableView'
import { FloorPlanView } from './renderer/FloorPlanView'
import { LEGEND_ITEMS, ROOM_COLORS } from './renderer/styles'
import { useFloorPlanHistory } from './hooks/useFloorPlanHistory'
import type { AnalysisResult, FloorPlan, Point } from './types/floorPlan'
import type { SelectedElementRef, SelectOptions } from './utils/floorPlanEdit'
import {
  deleteSelectedElement,
  isDeletableSelection,
  isTypingInEditableField,
  resizeRoomEdge,
  setRoomPolygon,
  updateLabelOffset,
} from './utils/floorPlanEdit'
import {
  addDoorAt,
  addFixtureAt,
  addRoomAt,
  addWallSegment,
  addWindowAt,
  fixtureTypeFromPlaceKind,
  isFixturePlaceKind,
  type PlaceKind,
} from './utils/floorPlanAdd'
import {
  moveDoor,
  moveFixture,
  moveWallEndpoint,
  moveWindowEndpoint,
  setWallEndpoints,
  setWindowEndpoints,
} from './utils/floorPlanDrag'
import './App.css'

function App() {
  const {
    floorPlan,
    canUndo,
    canRedo,
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
  const [wallDraftStart, setWallDraftStart] = useState<Point | null>(null)

  const handleResult = (result: AnalysisResult) => {
    resetFloorPlan(result.floorPlan)
    setAnalysisInfo(result)
    setError(null)
    setSelected(null)
    setMergeRoomIds(null)
    setPlaceKind(null)
    setWallDraftStart(null)
    if (result.sourcePreviewUrl && result.sourceFileName) {
      setSourcePreview({ url: result.sourcePreviewUrl, fileName: result.sourceFileName })
    }
  }

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

    if (ref.kind === 'room') {
      const { floorId, roomId } = ref
      if (options?.additive) {
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

    let result:
      | { floorPlan: FloorPlan; roomId: string }
      | { floorPlan: FloorPlan; doorId: string }
      | { floorPlan: FloorPlan; windowId: string }
      | { floorPlan: FloorPlan; fixtureId: string }
      | { error: string }

    if (placeKind === 'room') result = addRoomAt(floorPlan, floorId, position)
    else if (placeKind === 'door') result = addDoorAt(floorPlan, floorId, position)
    else if (placeKind === 'opening') {
      result = addDoorAt(floorPlan, floorId, position, { kind: 'opening' })
    } else if (isFixturePlaceKind(placeKind)) {
      result = addFixtureAt(floorPlan, floorId, position, fixtureTypeFromPlaceKind(placeKind))
    } else result = addWindowAt(floorPlan, floorId, position)

    if ('error' in result) {
      setError(result.error)
      return
    }

    commit(result.floorPlan)
    setWallDraftStart(null)
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
    if (!placeKind) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPlaceKind(null)
      setWallDraftStart(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [placeKind])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>間取図ジェネレーター</h1>
          <p className="tagline">平面図から、カラー間取図を自動生成</p>
        </div>
      </header>

      <main className="app-main">
        <aside className="sidebar">
          <UploadPanel
            onResult={handleResult}
            onSourceReady={(source) => {
              setSourcePreview({ url: source.previewUrl, fileName: source.fileName })
              setError(null)
            }}
            onError={(msg) => {
              setError(msg || null)
            }}
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
                    if (kind) setSelected(null)
                  }}
                  onSelect={handleSelect}
                  onMergeRoomIdsChange={setMergeRoomIds}
                  onChange={(updater) => commit(updater)}
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
              <JsonDataButtons
                floorPlan={floorPlan}
                onImport={(plan) => {
                  resetFloorPlan(plan)
                  setSelected(null)
                  setMergeRoomIds(null)
                  setPlaceKind(null)
                }}
              />
              <ExportButton targetId="madorizu-export" filename="madorizu" />
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

          {sourcePreview && (
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
              <FloorPlanView
                floorPlan={floorPlan}
                editable={editMode}
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
              />
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
