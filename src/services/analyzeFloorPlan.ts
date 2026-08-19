import type { AnalysisResult, FloorPlan } from '../types/floorPlan'

import { sampleHouse } from '../data/sampleHouse'

import { ANALYSIS_PROMPT } from './analysisPrompt'

import { normalizeFloorPlan } from '../utils/floorPlanNormalize'
import { extractGeminiText, parseAiJsonContent, type GeminiGenerateResponse } from '../utils/parseAiJson'
import { parseNormalizedRegion, regionToCropRect } from '../utils/cropRegion'

import {

  fetchGeminiWithRetry,

  GEMINI_MODEL_FLASH,

  GEMINI_MODEL_FLASH_THINKING,

  GEMINI_MODEL_PRO,

  normalizeApiKey,

  parseGeminiError,

  validateApiKeyFormat,

} from './geminiApi'



const STANDARD_MAX_IMAGE_DIMENSION = 2048

const HIGH_MAX_IMAGE_DIMENSION = 2560



export type AnalysisMode = 'demo' | 'gemini'

export type AnalysisQuality = 'standard' | 'high'



export interface AnalyzeOptions {

  mode: AnalysisMode

  apiKey?: string

  useServerKey?: boolean

  quality?: AnalysisQuality

}



function isModelUnavailable(status: number, body: string): boolean {

  if (status !== 400 && status !== 404) return false

  const lower = body.toLowerCase()

  return lower.includes('model') && (lower.includes('not found') || lower.includes('not available'))

}



/** 図面の線を潰さないよう PNG で高解像度に整える */

async function prepareImageForAnalysis(

  file: File,

  maxDimension: number

): Promise<{ base64: string; mimeType: string }> {

  const mimeType = file.type || 'image/png'



  if (!mimeType.startsWith('image/')) {

    const raw = await fileToBase64(file)

    return { base64: raw, mimeType: 'image/png' }

  }



  const bitmap = await createImageBitmap(file)

  const { width, height } = bitmap

  const scale = Math.min(1, maxDimension / Math.max(width, height))

  const canvas = document.createElement('canvas')

  canvas.width = Math.max(1, Math.round(width * scale))

  canvas.height = Math.max(1, Math.round(height * scale))

  const ctx = canvas.getContext('2d')

  if (!ctx) {

    bitmap.close()

    return { base64: await fileToBase64(file), mimeType }

  }



  ctx.fillStyle = '#FFFFFF'

  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  bitmap.close()



  const dataUrl = canvas.toDataURL('image/png')

  return { base64: dataUrl.split(',')[1] ?? '', mimeType: 'image/png' }

}



function fileToBase64(file: File): Promise<string> {

  return new Promise((resolve, reject) => {

    const reader = new FileReader()

    reader.onload = () => {

      const result = reader.result as string

      resolve(result.split(',')[1] ?? '')

    }

    reader.onerror = reject

    reader.readAsDataURL(file)

  })

}



function buildGenerationConfig(_quality: AnalysisQuality, model: string) {

  // Pro は思考トークンも出力上限に含まれる（実測: 図面1枚で思考12,000トークン）。

  // 上限が足りないと JSON が途中で切れるため、Flash 以外は余裕を持たせる。

  const isFlash = model.includes('flash')

  const config: Record<string, unknown> = {

    responseMimeType: 'application/json',

    temperature: 0,

    maxOutputTokens: isFlash ? 32768 : 65536,

  }



  // gemini-3.5-flash に thinkingBudget を与えると、JSON が最後まで出力されず

  // 途中で打ち切られる（同じ図面で再現。budget 0 では毎回完走）。

  // 思考を使いたい場合は thinking が既定で有効な GEMINI_MODEL_FLASH_THINKING を使う。

  if (model === GEMINI_MODEL_FLASH) {

    config.thinkingConfig = { thinkingBudget: 0 }

  }



  return config

}



const REGION_DETECT_PROMPT = `この建築図面の画像から、間取り（平面図）本体と、それを囲む寸法線・寸法数値までを含む矩形範囲を求めてください。
タイトル欄・図面枠・建具表・仕上表・凡例・注記の文章は範囲に含めません。
複数の平面図がある場合はすべてを含む範囲にしてください。
座標は画像の左上を(0,0)、右下を(1000,1000)とする正規化座標で、JSONのみ返してください:
{"x0": 数値, "y0": 数値, "x1": 数値, "y1": 数値}`

/**
 * 図面本体の範囲を Gemini に尋ねる（軽量な前処理呼び出し）。
 * A3 図面はタイトル欄や建具表が面積の多くを占め、そのまま送ると
 * 平面図に使える解像度が下がる。先に範囲を検出して切り出すことで、
 * 同じ送信サイズでも図面本体の解像度を上げられる。
 * 失敗したら null（呼び出し側は全体画像で続行）。
 */
async function detectDrawingRegion(
  file: File,
  apiKey: string | undefined
): Promise<{ x0: number; y0: number; x1: number; y1: number } | null> {
  try {
    // 範囲検出は低解像度で十分
    const { base64, mimeType } = await prepareImageForAnalysis(file, 1024)
    const response = await fetchGeminiWithRetry(
      `/v1beta/models/${GEMINI_MODEL_FLASH}:generateContent`,
      {
        method: 'POST',
        apiKey,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: REGION_DETECT_PROMPT }, { inlineData: { mimeType, data: base64 } }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0,
            maxOutputTokens: 200,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    )
    if (!response.ok) return null
    const data = (await response.json()) as GeminiGenerateResponse
    const { text } = extractGeminiText(data)
    return parseNormalizedRegion(parseAiJsonContent(text))
  } catch {
    return null
  }
}

/** 元画像から矩形を切り出して新しい File にする。切り出す価値がなければ null */
async function cropFileToRegion(
  file: File,
  region: { x0: number; y0: number; x1: number; y1: number }
): Promise<File | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const rect = regionToCropRect(region, bitmap.width, bitmap.height)
    if (!rect) return null
    const canvas = document.createElement('canvas')
    canvas.width = rect.width
    canvas.height = rect.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return null
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '-cropped.png', {
      type: 'image/png',
    })
  } finally {
    bitmap.close()
  }
}

/** そのまま JSON.parse できるか（できなければ = 応答が途中で切れて修復された） */

function isCompleteJson(text: string): boolean {

  try {

    JSON.parse(text.trim())

    return true

  } catch {

    return false

  }

}



async function requestFloorPlan(

  file: File,

  apiKey: string | undefined,

  model: string,

  quality: AnalysisQuality

): Promise<{ floorPlan: FloorPlan; truncated: boolean }> {

  const maxDimension =

    quality === 'high' ? HIGH_MAX_IMAGE_DIMENSION : STANDARD_MAX_IMAGE_DIMENSION

  const { base64, mimeType } = await prepareImageForAnalysis(file, maxDimension)



  const response = await fetchGeminiWithRetry(`/v1beta/models/${model}:generateContent`, {

    method: 'POST',

    apiKey,

    body: JSON.stringify({

      contents: [

        {

          role: 'user',

          parts: [

            { text: ANALYSIS_PROMPT },

            {

              inlineData: {

                mimeType,

                data: base64,

              },

            },

          ],

        },

      ],

      generationConfig: buildGenerationConfig(quality, model),

    }),

  })



  if (!response.ok) {

    const err = await response.text()

    const error = new Error(parseGeminiError(response.status, err))

    if (isModelUnavailable(response.status, err)) {

      ;(error as Error & { modelUnavailable?: boolean }).modelUnavailable = true

    }

    // 500/503 はモデル側の一時的な混雑。別モデルへ切り替えれば通ることが多い

    if (response.status >= 500) {

      ;(error as Error & { modelBusy?: boolean }).modelBusy = true

    }

    throw error

  }



  const data = (await response.json()) as GeminiGenerateResponse

  if (!data.candidates?.length) {

    const blockReason = data.promptFeedback?.blockReason

    throw new Error(

      blockReason

        ? `AI解析がブロックされました（${blockReason}）。別の画像で試してください。`

        : 'AIから有効な応答が返りませんでした。'

    )

  }



  const { text: content, finishReason } = extractGeminiText(data)



  if (!content.trim()) {

    throw new Error('AIから空の応答が返りました。')

  }



  // 応答が途中で切れていても、parseAiJsonContent が閉じ括弧を補って復元できることが多い。

  // 先に復元を試し、間取データが取れたら「一部欠けているかも」と伝えたうえで使う。

  let parsed: FloorPlan

  try {

    parsed = parseAiJsonContent(content) as FloorPlan

  } catch {

    if (finishReason === 'MAX_TOKENS') {

      throw new Error(

        'AIの応答が長すぎて途中で切れました。画像を1階分にクロップして再試行してください。'

      )

    }

    throw new Error(

      'AIからの応答をJSONとして解析できませんでした。もう一度お試しください。\n' +

        '（図面を1階ずつ・余白を少なくしたPNGで試すと成功率が上がります）'

    )

  }



  const truncated = finishReason === 'MAX_TOKENS' || !isCompleteJson(content)



  try {

    return { floorPlan: normalizeFloorPlan(parsed), truncated }

  } catch (error) {

    if (error instanceof Error) throw error

    throw new Error('AIの応答を間取データに変換できませんでした。', { cause: error })

  }

}



async function analyzeWithGemini(

  file: File,

  apiKey: string | undefined,

  quality: AnalysisQuality

): Promise<{ floorPlan: FloorPlan; modelUsed: string; truncated: boolean; autoCropped: boolean }> {

  // 図面本体を切り出してから解析する（失敗時は全体画像のまま）
  let workFile = file
  let autoCropped = false
  if (file.type.startsWith('image/')) {
    const region = await detectDrawingRegion(file, apiKey)
    if (region) {
      const cropped = await cropFileToRegion(file, region).catch(() => null)
      if (cropped) {
        workFile = cropped
        autoCropped = true
      }
    }
  }

  const models =

    quality === 'high'

      ? [GEMINI_MODEL_PRO, GEMINI_MODEL_FLASH_THINKING, GEMINI_MODEL_FLASH, 'gemini-2.5-flash']

      : [GEMINI_MODEL_FLASH, 'gemini-2.5-flash']



  let lastError: Error | null = null

  for (let i = 0; i < models.length; i++) {

    const model = models[i]

    try {

      const { floorPlan, truncated } = await requestFloorPlan(workFile, apiKey, model, quality)

      return { floorPlan, modelUsed: model, truncated, autoCropped }

    } catch (error) {

      const err = error instanceof Error ? error : new Error('解析に失敗しました')

      lastError = err

      const canFallback =

        i < models.length - 1 &&

        ((err as Error & { modelUnavailable?: boolean }).modelUnavailable === true ||

          (err as Error & { modelBusy?: boolean }).modelBusy === true ||

          err.message.includes('JSONとして解析'))

      if (!canFallback) break

    }

  }



  throw lastError ?? new Error('解析に失敗しました')

}



export async function analyzeFloorPlan(

  file: File,

  options: AnalyzeOptions

): Promise<AnalysisResult> {

  if (options.mode === 'demo') {

    await new Promise((r) => setTimeout(r, 800))

    return {

      floorPlan: structuredClone(sampleHouse),

      confidence: 0,

      mode: 'demo',

      notes: [

        'デモモードでは、アップロードした平面図は解析されません',

        '右側に表示されているのは固定のサンプル間取図です',

        '実際の平面図から間取図を作るには「AI解析」モードと Gemini API キーが必要です',

      ],

    }

  }



  const normalizedKey = options.apiKey ? normalizeApiKey(options.apiKey) : ''

  const formatError = normalizedKey ? validateApiKeyFormat(normalizedKey) : null

  const quality = options.quality ?? 'standard'



  if (!normalizedKey && !options.useServerKey) {

    throw new Error('Gemini API キーが必要です。.env に GEMINI_API_KEY を設定するか、入力欄にキーを入力してください。')

  }

  if (formatError && !options.useServerKey) {

    throw new Error(formatError)

  }



  const { floorPlan, modelUsed, truncated, autoCropped } = await analyzeWithGemini(

    file,

    normalizedKey || undefined,

    quality

  )



  const notes = [

  quality === 'high'

    ? `高精度モード（${modelUsed}）で解析しました`

    : `標準モード（${modelUsed}）で解析しました`,

    ...(autoCropped
      ? ['図面本体を自動で切り出し、解像度を上げて解析しました']
      : []),
    ...(truncated

      ? ['AIの応答が途中で切れたため、部屋や扉が一部欠けている可能性があります']

      : []),

    '図面の縮尺・部屋数・形状は手動で調整が必要な場合があります',

    '編集モードで部屋名・サイズ・合成を調整できます',

  ]



  return {

    floorPlan,

    confidence: quality === 'high' ? 0.75 : 0.65,

    mode: 'gemini',

    notes,

  }

}



export function validateFloorPlanJson(json: unknown): FloorPlan {

  if (!json || typeof json !== 'object') {

    throw new Error('無効なJSONです')

  }

  return normalizeFloorPlan(json as FloorPlan)

}


