import type { AnalysisResult, FloorPlan } from '../types/floorPlan'
import { isAreaJoHiddenByType } from '../constants/roomTypes'
import { sampleHouse } from '../data/sampleHouse'
import {
  fetchGeminiWithRetry,
  GEMINI_MODEL,
  normalizeApiKey,
  parseGeminiError,
  validateApiKeyFormat,
} from './geminiApi'

const ANALYSIS_PROMPT = `あなたは建築平面図の解析エキスパートです。
アップロードされた平面図画像を分析し、以下のJSON形式で間取りデータを出力してください。

{
  "title": "物件名",
  "floors": [
    {
      "id": "1f",
      "name": "1F",
      "label": "1階",
      "rooms": [
        {
          "id": "room1",
          "name": "LD",
          "type": "ld",
          "areaJo": 13.2,
          "polygon": [{"x": 0, "y": 0}, {"x": 100, "y": 0}]
        }
      ],
      "walls": [{"id": "w1", "start": {"x": 0, "y": 0}, "end": {"x": 100, "y": 0}, "exterior": true}],
      "doors": [{"id": "d1", "position": {"x": 50, "y": 0}, "width": 8, "angle": 0, "swing": 1}],
      "windows": [{"id": "win1", "start": {"x": 0, "y": 50}, "end": {"x": 30, "y": 50}}],
      "fixtures": [],
      "stairs": []
    }
  ]
}

room type は以下から選択: ld, kitchen, bathroom, toilet, washroom, japanese, western, hallway, entrance, stairs, storage, porch, attic, void, other
廊下・ホール（type: hallway）および階段（type: stairs）には areaJo を含めないでください。
階段は stairs 配列に含め、name フィールドで名称を指定してください。
座標は mm 単位（1m = 1000mm）。原点は左上。x は右方向、y は下方向。
壁・扉・窓・設備も可能な限り含めてください。
JSONのみを返してください。`

const MAX_IMAGE_DIMENSION = 1536

export type AnalysisMode = 'demo' | 'gemini'

export interface AnalyzeOptions {
  mode: AnalysisMode
  apiKey?: string
  useServerKey?: boolean
}

/** 大きな画像はリサイズして API の消費量を抑える */
async function prepareImageForAnalysis(file: File): Promise<{ base64: string; mimeType: string }> {
  const mimeType = file.type || 'image/png'

  if (!mimeType.startsWith('image/')) {
    const raw = await fileToBase64(file)
    return { base64: raw, mimeType: 'image/png' }
  }

  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height))

  if (scale >= 1) {
    bitmap.close()
    return { base64: await fileToBase64(file), mimeType }
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return { base64: await fileToBase64(file), mimeType }
  }

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { base64: dataUrl.split(',')[1] ?? '', mimeType: 'image/jpeg' }
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

async function analyzeWithGemini(file: File, apiKey?: string): Promise<FloorPlan> {
  const { base64, mimeType } = await prepareImageForAnalysis(file)

  const response = await fetchGeminiWithRetry(`/v1beta/models/${GEMINI_MODEL}:generateContent`, {
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
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(parseGeminiError(response.status, err))
  }

  const data = await response.json()
  const content =
    data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('AIからの応答をJSONとして解析できませんでした')
  }

  const parsed = JSON.parse(jsonMatch[0]) as FloorPlan
  return normalizeFloorPlan(parsed)
}

function normalizeFloorPlan(plan: FloorPlan): FloorPlan {
  return {
    title: plan.title || '間取図',
    scaleMm: plan.scaleMm ?? 100,
    floors: (plan.floors ?? []).map((floor, i) => ({
      id: floor.id ?? `floor-${i}`,
      name: floor.name ?? `${i + 1}F`,
      label: floor.label ?? `${i + 1}階`,
      rooms: (floor.rooms ?? []).map((room) => ({
        ...room,
        ...(isAreaJoHiddenByType(room.type) ? { showAreaJo: false as const } : {}),
      })),
      walls: floor.walls ?? [],
      doors: floor.doors ?? [],
      windows: floor.windows ?? [],
      fixtures: floor.fixtures ?? [],
      stairs: (floor.stairs ?? []).map((stair) => ({
        ...stair,
        name: stair.name ?? '階段',
      })),
    })),
  }
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

  if (!normalizedKey && !options.useServerKey) {
    throw new Error('Gemini API キーが必要です。.env に GEMINI_API_KEY を設定するか、入力欄にキーを入力してください。')
  }
  if (formatError && !options.useServerKey) {
    throw new Error(formatError)
  }

  const floorPlan = await analyzeWithGemini(file, normalizedKey || undefined)
  return {
    floorPlan,
    confidence: 0.7,
    mode: 'gemini',
    notes: ['Gemini AI解析結果です。必要に応じて手動で調整してください'],
  }
}

export function validateFloorPlanJson(json: unknown): FloorPlan {
  if (!json || typeof json !== 'object') {
    throw new Error('無効なJSONです')
  }
  return normalizeFloorPlan(json as FloorPlan)
}
