/**
 * @see https://ai.google.dev/gemini-api/docs/deprecations
 * モデル名は実在するものだけを指定する（存在しない名前は 404 になり、
 * フォールバックで1往復ぶん時間とコストを無駄にする）。
 * 利用可能な一覧は `npm run test-api-key` または GET /v1beta/models で確認できる。
 */
export const GEMINI_MODEL_FLASH = 'gemini-3.5-flash'
/** 高精度モード用。Flash より読み取りは丁寧だが 1分以上かかり、混雑時は 503 になる */
export const GEMINI_MODEL_PRO = 'gemini-3.1-pro-preview'
/** Pro が混雑しているときの高精度側フォールバック（thinking 既定で精度が高い） */
export const GEMINI_MODEL_FLASH_THINKING = 'gemini-3.6-flash'
const MAX_RETRIES = 3
/** 高精度モードの Pro は 1 図面で 2 分前後かかる（実測 121〜125 秒）ため余裕を見る */
const REQUEST_TIMEOUT_MS = 300_000

export function normalizeApiKey(key: string): string {
  return key.trim().replace(/^["']|["']$/g, '')
}

export function validateApiKeyFormat(key: string): string | null {
  const normalized = normalizeApiKey(key)
  if (!normalized) {
    return 'APIキーを入力するか、プロジェクト直下の .env に GEMINI_API_KEY を設定してください'
  }
  if (normalized.length < 20) {
    return 'APIキーが短すぎます。全体がコピーできているか確認してください。'
  }
  return null
}

function buildAuthHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const normalized = apiKey ? normalizeApiKey(apiKey) : ''
  if (normalized) {
    headers['x-goog-api-key'] = normalized
  }
  return headers
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function parseGeminiError(status: number, body: string): string {
  try {
    const data = JSON.parse(body) as { error?: { message?: string; status?: string } }
    const msg = data.error?.message
    if (status === 400 && msg?.includes('API key')) {
      return 'APIキーの形式が正しくありません。Google AI Studio で取得したキーを使用してください。'
    }
    if (status === 401 || status === 403) {
      return [
        'Gemini APIキーが無効です。次を確認してください：',
        '・https://aistudio.google.com/apikey でキーを作成',
        '・キー全体をコピー（前後に空白が入っていないか）',
        '・.env に GEMINI_API_KEY=... を設定して npm run dev を再起動',
        msg ? `（詳細: ${msg}）` : '',
      ]
        .filter(Boolean)
        .join('\n')
    }
    if (status === 429) {
      const isQuota = msg?.toLowerCase().includes('quota') || msg?.toLowerCase().includes('resource exhausted')
      return [
        'Gemini API の利用上限に達しました。',
        '',
        '【このアプリから上限を外すことはできません】',
        '制限は Google 側で設定されています。',
        '',
        '【対処法】',
        isQuota
          ? '・1日の無料枠を使い切った可能性があります → 明日まで待つか、有料プランへ'
          : '・短時間にリクエストが多すぎます → 1〜2分待ってから再試行',
        '・Google AI Studio の有料プラン（従量課金）を有効化すると上限が緩和されます',
        '  https://aistudio.google.com/',
        '・「キーを確認」と「間取図を生成」を連続で押さない',
        '',
        '※ アプリは自動で数回リトライしますが、上限超過時は待つ必要があります。',
        msg ? `（詳細: ${msg}）` : '',
      ]
        .filter(Boolean)
        .join('\n')
    }
    if (status === 503 || status === 500) {
      return [
        'Gemini のモデルが混雑しています（一時的なエラー）。',
        '・少し待ってから再試行してください',
        '・高精度モードで起きた場合は、標準モードなら通ることがあります',
        msg ? `（詳細: ${msg}）` : '',
      ]
        .filter(Boolean)
        .join('\n')
    }
    if (msg) return msg
  } catch {
    // ignore
  }
  return `Gemini API エラー (${status})`
}

export async function fetchGemini(
  path: string,
  options: RequestInit & { apiKey?: string } = {}
): Promise<Response> {
  const { apiKey, headers: extraHeaders, signal, ...rest } = options
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  try {
    return await fetch(`/api/gemini${path}`, {
      ...rest,
      signal: signal ?? timeoutSignal,
      headers: {
        ...buildAuthHeaders(apiKey),
        ...(extraHeaders as Record<string, string>),
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(
        'AI解析がタイムアウトしました（5分）。画像サイズを小さくするか、しばらく待ってから再試行してください。',
        { cause: error }
      )
    }
    throw new Error(
      'APIへの接続に失敗しました。npm run dev で起動した http://localhost:5173 からアクセスしているか確認してください。',
      { cause: error }
    )
  }
}

/**
 * 429（レート制限）と 5xx（モデル混雑）のとき指数バックオフで自動リトライ。
 * 高精度モードの Pro モデルは混雑時に 503 を返すことが多く、待てば通る。
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

export async function fetchGeminiWithRetry(
  path: string,
  options: RequestInit & { apiKey?: string } = {}
): Promise<Response> {
  let lastResponse: Response | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetchGemini(path, options)
    if (!isRetryableStatus(response.status)) {
      return response
    }
    lastResponse = response
    if (attempt < MAX_RETRIES) {
      const delayMs = Math.min(2000 * Math.pow(2, attempt), 30000)
      await sleep(delayMs)
    }
  }

  return lastResponse!
}

export async function verifyApiKey(apiKey?: string): Promise<void> {
  const formatError = apiKey ? validateApiKeyFormat(apiKey) : null
  if (formatError && apiKey) {
    throw new Error(formatError)
  }

  const response = await fetchGeminiWithRetry('/v1beta/models', { apiKey })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(parseGeminiError(response.status, body))
  }
}

export async function fetchAppConfig(): Promise<{ hasServerApiKey: boolean }> {
  try {
    const response = await fetch('/api/config')
    if (!response.ok) return { hasServerApiKey: false }
    return (await response.json()) as { hasServerApiKey: boolean }
  } catch {
    return { hasServerApiKey: false }
  }
}

