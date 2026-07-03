import { useState } from 'react'

import { ExportButton } from './components/ExportButton'

import { JsonDataButtons } from './components/JsonDataButtons'

import { RoomEditor } from './components/RoomEditor'

import { UploadPanel } from './components/UploadPanel'

import { ZoomableView } from './components/ZoomableView'

import { FloorPlanView } from './renderer/FloorPlanView'

import { LEGEND_ITEMS, ROOM_COLORS } from './renderer/styles'

import type { AnalysisResult, FloorPlan } from './types/floorPlan'

import type { SelectedElementRef, SelectOptions } from './utils/floorPlanEdit'

import { resizeRoomEdge, updateLabelOffset } from './utils/floorPlanEdit'

import './App.css'



function App() {

  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null)

  const [sourcePreview, setSourcePreview] = useState<{ url: string; fileName: string } | null>(null)

  const [analysisInfo, setAnalysisInfo] = useState<AnalysisResult | null>(null)

  const [error, setError] = useState<string | null>(null)

  const [editMode, setEditMode] = useState(false)

  const [selected, setSelected] = useState<SelectedElementRef | null>(null)

  const [mergeRoomIds, setMergeRoomIds] = useState<{ floorId: string; roomIds: string[] } | null>(

    null

  )



  const handleResult = (result: AnalysisResult) => {

    setFloorPlan(result.floorPlan)

    setAnalysisInfo(result)

    setError(null)

    setSelected(null)

    setMergeRoomIds(null)

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



  const isDemo = analysisInfo?.mode === 'demo'



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

                  onSelect={handleSelect}

                  onMergeRoomIdsChange={setMergeRoomIds}

                  onChange={(updater) => setFloorPlan((prev) => (prev ? updater(prev) : prev))}

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
                  setFloorPlan(plan)
                  setSelected(null)
                  setMergeRoomIds(null)
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

                onSelect={handleSelect}

                onLabelOffsetChange={(ref, kind, offset) => {

                  setFloorPlan((plan) => (plan ? updateLabelOffset(plan, ref, kind, offset) : plan))

                }}

                onRoomResize={(ref, edge, positionFloorSvg) => {

                  setFloorPlan((plan) => {

                    if (!plan) return plan

                    const result = resizeRoomEdge(plan, ref, edge, positionFloorSvg)

                    if ('error' in result) return plan

                    return result

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


