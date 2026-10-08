import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalysisMode } from '../services/analyzeFloorPlan'
import { analyzeFloorPlan } from '../services/analyzeFloorPlan'
import { fetchAppConfig, normalizeApiKey, verifyApiKey } from '../services/geminiApi'
import {
  isSupportedFloorPlanFile,
  normalizeQuarterTurns,
  prepareFloorPlanInput,
  rotatePreparedInput,
  type PreparedFloorPlanInput,
} from '../services/pdfToImage'
import type { AnalysisResult } from '../types/floorPlan'
import type { PropertySource } from '../utils/propertyLink'

const STORAGE_KEY = 'madorizu-gemini-api-key'

interface UploadPanelProps {
  /** append: true のときは今の間取図に階として加える。false は作り直す */
  onResult: (result: AnalysisResult, options: { append: boolean }) => void
  onSourceReady: (source: { previewUrl: string; fileName: string }) => void
  onError: (message: string) => void
  disabled?: boolean
  /**
   * 物件情報管理システムにある、この物件の図面。指定があると一覧を出し、選ぶとアップロードと同じように読み込む。
   */
  propertySources?: {
    sources: PropertySource[]
    load: (source: PropertySource) => Promise<File>
    /** 前に送った間取図の編集データを開く（続きから編集） */
    loadEditData?: (source: PropertySource) => Promise<void>
  }
  /** 間取図がすでにあるとき true。「階として追加」を出す */
  canAppend?: boolean
}

export function UploadPanel({
  onResult,
  onSourceReady,
  onError,
  disabled,
  propertySources,
  canAppend,
}: UploadPanelProps) {
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [mode, setMode] = useState<AnalysisMode>('demo')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '')
  const [serverHasKey, setServerHasKey] = useState(false)
  const [verifyingKey, setVerifyingKey] = useState(false)
  const [keyStatus, setKeyStatus] = useState<string | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [preparedInput, setPreparedInput] = useState<PreparedFloorPlanInput | null>(null)
  /** 回す前の図面（回すときはいつもここから回す。回した画像をさらに回すと画質が落ちる） */
  const [baseInput, setBaseInput] = useState<PreparedFloorPlanInput | null>(null)
  /** 図面を右回りに 90° ずつ回した回数（0〜3） */
  const [turns, setTurns] = useState(0)
  const [selectedPage, setSelectedPage] = useState(1)
  const [highQuality, setHighQuality] = useState(false)
  /** 最後に解析した図面。同じ図面を続けて階として追加しないように使う */
  const [analyzedInput, setAnalyzedInput] = useState<PreparedFloorPlanInput | null>(null)

  const revokePreview = useCallback((url: string | null) => {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }, [])

  /** 利用者が自分でモードを選んだか。選んでいなければ、サーバーにキーがあるとき AI解析を既定にする */
  const modeTouchedRef = useRef(false)
  useEffect(() => {
    void fetchAppConfig().then((config) => {
      setServerHasKey(config.hasServerApiKey)
      // 社内サーバーではキーが設定済みなので、毎回「サンプル表示」から切り替えなくて済むようにする
      if (config.hasServerApiKey && !modeTouchedRef.current) setMode('gemini')
    })
  }, [])

  useEffect(() => {
    return () => revokePreview(previewUrlRef.current)
  }, [revokePreview])

  const hasApiKey = serverHasKey || Boolean(normalizeApiKey(apiKey))

  const runAnalysis = useCallback(
    async (input: PreparedFloorPlanInput, sourceName: string, append: boolean) => {
      const normalized = normalizeApiKey(apiKey)
      const useServerKey = serverHasKey && !normalized

      if (mode === 'gemini' && !serverHasKey && !normalized) {
        onError(
          'APIキーが未設定です。\n' +
            '① プロジェクト直下に .env を作成（GEMINI_API_KEY=...）\n' +
            '② npm run dev を再起動\n' +
            'または入力欄にキーを直接入力してください。'
        )
        return
      }

      setAnalyzing(true)
      const startedAt = Date.now()
      try {
        if (mode === 'gemini' && normalized) {
          localStorage.setItem(STORAGE_KEY, normalized)
        }
        const result = await analyzeFloorPlan(input.analysisFile, {
          mode,
          apiKey: useServerKey ? undefined : normalized || undefined,
          useServerKey,
          quality: highQuality ? 'high' : 'standard',
        })
        result.analysisMs = mode === 'gemini' ? Date.now() - startedAt : 0
        result.sourcePreviewUrl = input.previewUrl
        result.sourceFileName = sourceName
        if (input.sourceType === 'pdf') {
          result.notes = [
            `PDF ${input.selectedPage}/${input.pageCount} ページを対象`,
            ...result.notes,
          ]
        }
        setAnalyzedInput(input)
        onResult(result, { append })
      } catch (e) {
        onError(e instanceof Error ? e.message : '解析に失敗しました')
      } finally {
        setAnalyzing(false)
      }
    },
    [mode, apiKey, serverHasKey, highQuality, onResult, onError]
  )

  const handleVerifyKey = useCallback(async () => {
    setVerifyingKey(true)
    setKeyStatus(null)
    try {
      const normalized = normalizeApiKey(apiKey)
      const useServerKey = serverHasKey && !normalized
      await verifyApiKey(useServerKey ? undefined : normalized || undefined)
      setKeyStatus('success')
      onError('')
    } catch (e) {
      onError(e instanceof Error ? e.message : 'APIキーの確認に失敗しました')
      setKeyStatus('error')
    } finally {
      setVerifyingKey(false)
    }
  }, [apiKey, serverHasKey, onError])

  const handleClearKey = useCallback(() => {
    setApiKey('')
    setKeyStatus(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  /** 回して作った画像の URL（元のファイルやPDFから作った URL と分けて、解放してよいものだけを覚える） */
  const rotatedUrlsRef = useRef(new Set<string>())
  /** 今選んでいる図面（非同期の処理の中でも最新を見るため） */
  const preparedRef = useRef<PreparedFloorPlanInput | null>(null)
  const analyzedRef = useRef<PreparedFloorPlanInput | null>(null)
  useEffect(() => {
    analyzedRef.current = analyzedInput
  }, [analyzedInput])

  /**
   * 回した図面を選んでいる図面にする。
   * 回して作った画像は、読み取りに使わないまま回し直したら解放する（読み取った図面の画像は、重ね合わせでまだ使う）
   */
  const applyInput = useCallback(
    (input: PreparedFloorPlanInput, fileName: string) => {
      const prev = preparedRef.current
      if (
        prev &&
        prev.previewUrl !== input.previewUrl &&
        prev.previewUrl !== analyzedRef.current?.previewUrl &&
        rotatedUrlsRef.current.delete(prev.previewUrl)
      ) {
        revokePreview(prev.previewUrl)
      }
      preparedRef.current = input
      setPreparedInput(input)
      setPreview(input.previewUrl)
      onSourceReady({ previewUrl: input.previewUrl, fileName })
    },
    [onSourceReady, revokePreview]
  )

  const loadInput = useCallback(
    async (file: File, page: number, quarterTurns = 0) => {
      if (!isSupportedFloorPlanFile(file)) {
        onError('対応形式: PNG, JPG, WebP, PDF')
        return
      }

      setLoadingPreview(true)

      try {
        const prepared = await prepareFloorPlanInput(file, page)
        // 前の図面のプレビューは解放しない。階ごとに図面を読み込むので、前の階の図面を
        // 「重ねる階」で切り替えて重ねるときにまだ使う（解放すると画像が出ず、位置も合わせられない）
        previewUrlRef.current = prepared.sourceType === 'image' ? prepared.previewUrl : null
        // PDF のページを替えたときは、同じ向きに回したままにする（横向きの図面はどのページも横向きのことが多い）
        const rotated = await rotatePreparedInput(prepared, quarterTurns)
        if (rotated !== prepared) rotatedUrlsRef.current.add(rotated.previewUrl)
        setSourceFile(file)
        setBaseInput(prepared)
        setTurns(normalizeQuarterTurns(quarterTurns))
        setSelectedPage(prepared.selectedPage)
        applyInput(rotated, file.name)
      } catch (e) {
        onError(e instanceof Error ? e.message : 'ファイルの読み込みに失敗しました')
      } finally {
        setLoadingPreview(false)
      }
    },
    [onError, applyInput]
  )

  /** 図面を 90° 回す（delta = 1 で右回り、-1 で左回り） */
  const handleRotate = useCallback(
    async (delta: number) => {
      if (!baseInput || !sourceFile) return
      const next = normalizeQuarterTurns(turns + delta)
      setLoadingPreview(true)
      try {
        const rotated = await rotatePreparedInput(baseInput, next)
        if (rotated !== baseInput) rotatedUrlsRef.current.add(rotated.previewUrl)
        setTurns(next)
        applyInput(rotated, sourceFile.name)
      } catch (e) {
        onError(e instanceof Error ? e.message : '図面を回せませんでした')
      } finally {
        setLoadingPreview(false)
      }
    },
    [baseInput, sourceFile, turns, applyInput, onError]
  )

  const handleFile = useCallback(
    (file: File) => {
      void loadInput(file, 1)
    },
    [loadInput]
  )

  /** 物件へ前に送った間取図を、編集データから開き直す */
  const handleEditData = useCallback(
    async (source: PropertySource) => {
      if (!propertySources?.loadEditData) return
      setLoadingSourceId(`${source.id}:data`)
      onError('')
      try {
        await propertySources.loadEditData(source)
      } catch (e) {
        onError(e instanceof Error ? e.message : '編集データを読み込めませんでした')
      } finally {
        setLoadingSourceId(null)
      }
    },
    [propertySources, onError]
  )

  /** 物件情報管理システムの図面を読み込む */
  const handlePropertySource = useCallback(
    async (source: PropertySource) => {
      if (!propertySources) return
      setLoadingSourceId(source.id)
      onError('')
      try {
        handleFile(await propertySources.load(source))
      } catch (e) {
        onError(e instanceof Error ? e.message : '図面を読み込めませんでした')
      } finally {
        setLoadingSourceId(null)
      }
    },
    [propertySources, handleFile, onError]
  )

  const handlePageChange = useCallback(
    (page: number) => {
      if (!sourceFile) return
      void loadInput(sourceFile, page, turns)
    },
    [sourceFile, loadInput, turns]
  )

  const handleGenerate = useCallback(
    (append: boolean) => {
      if (!preparedInput || !sourceFile) {
        onError('先に平面図ファイルをアップロードしてください')
        return
      }
      void runAnalysis(preparedInput, sourceFile.name, append)
    },
    [preparedInput, sourceFile, runAnalysis, onError]
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const busy = analyzing || loadingPreview
  const showAppend = canAppend && !!preparedInput
  // いま選んでいる図面が、すでに間取図にした図面のまま（次の階の図面をまだ選んでいない）
  const sameAsAnalyzed = preparedInput != null && preparedInput === analyzedInput

  return (
    <div className="upload-panel">
      <h3>平面図をアップロード</h3>
      <p className="upload-desc">
        建築平面図（PNG / JPG / PDF）をドラッグ＆ドロップするか、ファイルを選択してください。
      </p>

      <div className="mode-selector">
        <label className={mode === 'demo' ? 'active' : ''}>
          <input
            type="radio"
            name="mode"
            value="demo"
            checked={mode === 'demo'}
            onChange={() => {
              modeTouchedRef.current = true
              setMode('demo')
            }}
          />
          サンプル表示（解析なし）
        </label>
        <label className={mode === 'gemini' ? 'active' : ''}>
          <input
            type="radio"
            name="mode"
            value="gemini"
            checked={mode === 'gemini'}
            onChange={() => {
              modeTouchedRef.current = true
              setMode('gemini')
            }}
          />
          AI解析（Gemini）
        </label>
      </div>

      {mode === 'demo' && (
        <div className="mode-notice demo-notice">
          デモモードではアップロード内容は解析されず、固定のサンプル間取図が表示されます。
        </div>
      )}

      {mode === 'gemini' && (
        <>
          {!serverHasKey && (
            <div className="mode-notice demo-notice">
              ⚠ .env に GEMINI_API_KEY が未設定です。下の入力欄にキーを入れるか、.env に設定してください。
            </div>
          )}
          {/* サーバーにキーがあるときは入力欄を使わないので、たたんでおく */}
          <details className="api-key-details" open={!serverHasKey}>
            <summary>
              {serverHasKey ? '✓ サーバーの API キーで解析します（キーの設定）' : 'Gemini API キーの設定'}
            </summary>
            <div className="api-key-input">
              <label htmlFor="api-key">Gemini API キー{serverHasKey ? '（.env 設定時は任意）' : ''}</label>
              <input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setKeyStatus(null)
                }}
                placeholder={serverHasKey ? '空欄のままで .env のキーを使用' : 'AIza...'}
              />
              <div className="api-key-actions">
                <button
                  type="button"
                  className="btn btn-secondary verify-key-btn"
                  disabled={!hasApiKey || verifyingKey || busy}
                  onClick={() => void handleVerifyKey()}
                >
                  {verifyingKey ? '確認中...' : 'キーを確認'}
                </button>
                {apiKey && (
                  <button
                    type="button"
                    className="btn btn-secondary clear-key-btn"
                    disabled={busy}
                    onClick={handleClearKey}
                  >
                    クリア
                  </button>
                )}
              </div>
              {keyStatus === 'success' && (
                <p className="key-status success">APIキーは有効です</p>
              )}
            </div>
            <details className="api-help">
              <summary>APIキーの取得方法</summary>
              <ol>
                <li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a> で API キーを作成</li>
                <li>プロジェクト直下に <code>.env</code> を作成: <code>GEMINI_API_KEY=AIza...</code></li>
                <li><code>npm run dev</code> を再起動</li>
              </ol>
            </details>
          </details>
          <label className="quality-toggle">
            <input
              type="checkbox"
              checked={highQuality}
              disabled={busy}
              onChange={(e) => setHighQuality(e.target.checked)}
            />
            高精度解析（Proモデル・高解像度・時間とAPIコスト増）
          </label>
          <p className="quality-hint">
            1/50 の平面詳細図など、文字や寸法が細かい図面は「高精度解析」を使ってください（標準では部屋の大きさがずれやすい）。
          </p>
        </>
      )}

      {preparedInput && preparedInput.sourceType === 'pdf' && preparedInput.pageCount > 1 && (
        <div className="pdf-page-selector">
          <label htmlFor="pdf-page">PDFページ</label>
          <select
            id="pdf-page"
            value={selectedPage}
            disabled={busy}
            onChange={(e) => handlePageChange(Number(e.target.value))}
          >
            {Array.from({ length: preparedInput.pageCount }, (_, i) => i + 1).map((page) => (
              <option key={page} value={page}>
                {page} / {preparedInput.pageCount} ページ
              </option>
            ))}
          </select>
        </div>
      )}

      {propertySources && propertySources.sources.length > 0 && (
        <div className="property-sources">
          <p className="property-sources__title">物件情報管理システムの図面</p>
          {propertySources.sources.map((source) =>
            source.editData && propertySources.loadEditData ? (
              <button
                key={source.id}
                type="button"
                className="btn btn-primary property-sources__item property-sources__item--edit"
                disabled={disabled || busy || loadingSourceId !== null}
                onClick={() => void handleEditData(source)}
                title="前にこのツールで作って送った間取図を、編集できる状態で開きます（AI の読み取りはしません）"
              >
                {loadingSourceId === `${source.id}:data` ? '読み込み中…' : `✎ 続きから編集：${source.name}`}
                <span className="property-sources__label">前にこのツールで作った間取図（{source.label}）</span>
              </button>
            ) : (
              <button
                key={source.id}
                type="button"
                className="btn btn-secondary property-sources__item"
                disabled={disabled || busy || loadingSourceId !== null}
                onClick={() => void handlePropertySource(source)}
                title={`${source.label}から読み込みます`}
              >
                {loadingSourceId === source.id ? '読み込み中…' : source.name}
                <span className="property-sources__label">{source.label}</span>
              </button>
            )
          )}
        </div>
      )}

      <div
        className={`drop-zone ${dragging ? 'dragging' : ''} ${busy ? 'analyzing' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
        {loadingPreview ? (
          <div className="analyzing-state">
            <div className="spinner" />
            <p>ファイルを読み込み中...</p>
          </div>
        ) : preview ? (
          <img src={preview} alt="アップロードプレビュー" className="preview-image" />
        ) : (
          <div className="drop-placeholder">
            <span className="drop-icon">📐</span>
            <p>ここに平面図をドロップ</p>
            <p className="sub">PNG / JPG / PDF に対応</p>
          </div>
        )}
      </div>

      {preparedInput && (
        <div className="upload-rotate">
          <span className="upload-rotate__label">図面の向き</span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || disabled}
            onClick={() => void handleRotate(-1)}
            title="左に90°回す"
          >
            ⟲ 左へ90°
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || disabled}
            onClick={() => void handleRotate(1)}
            title="右に90°回す"
          >
            ⟳ 右へ90°
          </button>
          <span className="upload-rotate__hint">
            {turns === 0 ? '横向きの図面は、読み取る前に正しい向きにしてください' : `${turns * 90}° 回しています`}
          </span>
        </div>
      )}

      {showAppend && (
        <>
          <button
            type="button"
            className="btn btn-primary generate-btn"
            disabled={analyzing || disabled || sameAsAnalyzed}
            onClick={() => handleGenerate(true)}
          >
            {analyzing ? '生成中...' : '今の間取図に階として追加'}
          </button>
          <p className="append-hint">
            {sameAsAnalyzed
              ? '次の階の図面を選ぶと、今の間取図の横に階として追加できます。'
              : '1階・2階が別の図面のときは、こちらを押すと横に並んで1枚の間取図になります。'}
          </p>
        </>
      )}
      <button
        type="button"
        className={`btn ${showAppend ? 'btn-secondary' : 'btn-primary'} generate-btn`}
        disabled={!preparedInput || analyzing || disabled}
        onClick={() => handleGenerate(false)}
      >
        {analyzing
          ? '生成中...'
          : showAppend
            ? '新しい間取図として作り直す'
            : mode === 'demo'
              ? 'サンプル間取図を表示'
              : '間取図を生成'}
      </button>
      {analyzing && mode === 'gemini' && (
        <p className="analyzing-hint">
          {highQuality
            ? '高精度AI解析中です。2〜5分かかることがあります。そのままお待ちください。'
            : 'AI解析中です。1〜3分かかることがあります。そのままお待ちください。'}
        </p>
      )}
    </div>
  )
}
