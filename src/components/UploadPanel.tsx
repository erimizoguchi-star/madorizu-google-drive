import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalysisMode } from '../services/analyzeFloorPlan'
import { analyzeFloorPlan } from '../services/analyzeFloorPlan'
import { fetchAppConfig, normalizeApiKey, verifyApiKey } from '../services/geminiApi'
import {
  isSupportedFloorPlanFile,
  prepareFloorPlanInput,
  type PreparedFloorPlanInput,
} from '../services/pdfToImage'
import type { AnalysisResult } from '../types/floorPlan'

const STORAGE_KEY = 'madorizu-gemini-api-key'

interface UploadPanelProps {
  onResult: (result: AnalysisResult) => void
  onSourceReady: (source: { previewUrl: string; fileName: string }) => void
  onError: (message: string) => void
  disabled?: boolean
}

export function UploadPanel({ onResult, onSourceReady, onError, disabled }: UploadPanelProps) {
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
  const [selectedPage, setSelectedPage] = useState(1)

  const revokePreview = useCallback((url: string | null) => {
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }, [])

  useEffect(() => {
    void fetchAppConfig().then((config) => setServerHasKey(config.hasServerApiKey))
  }, [])

  useEffect(() => {
    return () => revokePreview(previewUrlRef.current)
  }, [revokePreview])

  const hasApiKey = serverHasKey || Boolean(normalizeApiKey(apiKey))

  const runAnalysis = useCallback(
    async (input: PreparedFloorPlanInput, sourceName: string) => {
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
      try {
        if (mode === 'gemini' && normalized) {
          localStorage.setItem(STORAGE_KEY, normalized)
        }
        const result = await analyzeFloorPlan(input.analysisFile, {
          mode,
          apiKey: useServerKey ? undefined : normalized || undefined,
          useServerKey,
        })
        result.sourcePreviewUrl = input.previewUrl
        result.sourceFileName = sourceName
        if (input.sourceType === 'pdf') {
          result.notes = [
            `PDF ${input.selectedPage}/${input.pageCount} ページを対象`,
            ...result.notes,
          ]
        }
        onResult(result)
      } catch (e) {
        onError(e instanceof Error ? e.message : '解析に失敗しました')
      } finally {
        setAnalyzing(false)
      }
    },
    [mode, apiKey, serverHasKey, onResult, onError]
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

  const loadInput = useCallback(
    async (file: File, page: number) => {
      if (!isSupportedFloorPlanFile(file)) {
        onError('対応形式: PNG, JPG, WebP, PDF')
        return
      }

      setLoadingPreview(true)

      try {
        const prepared = await prepareFloorPlanInput(file, page)
        revokePreview(previewUrlRef.current)
        previewUrlRef.current = prepared.sourceType === 'image' ? prepared.previewUrl : null
        setPreview(prepared.previewUrl)
        setSourceFile(file)
        setPreparedInput(prepared)
        setSelectedPage(prepared.selectedPage)
        onSourceReady({ previewUrl: prepared.previewUrl, fileName: file.name })
      } catch (e) {
        onError(e instanceof Error ? e.message : 'ファイルの読み込みに失敗しました')
      } finally {
        setLoadingPreview(false)
      }
    },
    [onError, onSourceReady, revokePreview]
  )

  const handleFile = useCallback(
    (file: File) => {
      void loadInput(file, 1)
    },
    [loadInput]
  )

  const handlePageChange = useCallback(
    (page: number) => {
      if (!sourceFile) return
      void loadInput(sourceFile, page)
    },
    [sourceFile, loadInput]
  )

  const handleGenerate = useCallback(() => {
    if (!preparedInput || !sourceFile) {
      onError('先に平面図ファイルをアップロードしてください')
      return
    }
    void runAnalysis(preparedInput, sourceFile.name)
  }, [preparedInput, sourceFile, runAnalysis, onError])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const busy = analyzing || loadingPreview

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
            onChange={() => setMode('demo')}
          />
          サンプル表示（解析なし）
        </label>
        <label className={mode === 'gemini' ? 'active' : ''}>
          <input
            type="radio"
            name="mode"
            value="gemini"
            checked={mode === 'gemini'}
            onChange={() => setMode('gemini')}
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
          <div className="mode-notice ai-notice">
            Google Gemini API で平面図を解析します。
            {serverHasKey
              ? ' .env にキーが設定されています。'
              : ' .env ファイルに設定するか、下の欄に入力してください。'}
          </div>
          {!serverHasKey && (
            <div className="mode-notice demo-notice">
              ⚠ .env に GEMINI_API_KEY が未設定です。下の入力欄にキーを入れるか、.env に設定してください。
            </div>
          )}
          {serverHasKey && (
            <div className="mode-notice ai-notice">
              ✓ .env の Gemini API キーを使用できます（入力欄は空でOK）
            </div>
          )}
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

      <button
        type="button"
        className="btn btn-primary generate-btn"
        disabled={!preparedInput || analyzing || disabled}
        onClick={handleGenerate}
      >
        {analyzing ? '生成中...' : mode === 'demo' ? 'サンプル間取図を表示' : '間取図を生成'}
      </button>
    </div>
  )
}
