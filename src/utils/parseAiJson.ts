function repairTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1')
}

function tryCloseTruncatedJson(text: string): string {
  let s = text.trim()
  s = s.replace(/,\s*"[^"]*$/s, '')
  s = s.replace(/,\s*$/s, '')

  const stack: string[] = []
  let inString = false
  let escape = false

  for (const ch of s) {
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }

  if (inString) s += '"'
  return s + stack.reverse().join('')
}

function extractJsonCandidates(content: string): string[] {
  const results: string[] = []
  const trimmed = content.trim()

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const block = match[1]?.trim()
    if (block) results.push(block)
  }

  if (trimmed.startsWith('{')) results.push(trimmed)

  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) {
    results.push(trimmed.slice(first, last + 1))
  }

  return [...new Set(results.filter(Boolean))]
}

export function parseAiJsonContent(content: string): unknown {
  const candidates = extractJsonCandidates(content)
  if (candidates.length === 0) {
    throw new Error('JSONが見つかりません')
  }

  let lastError: Error | null = null
  for (const raw of candidates) {
    const attempts = [raw, repairTrailingCommas(raw), tryCloseTruncatedJson(repairTrailingCommas(raw))]
    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }
  }

  throw lastError ?? new Error('JSONの解析に失敗しました')
}

interface GeminiPart {
  text?: string
  thought?: boolean
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] }
  finishReason?: string
}

export interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[]
  promptFeedback?: { blockReason?: string }
}

export function extractGeminiText(data: GeminiGenerateResponse): {
  text: string
  finishReason?: string
} {
  const candidate = data.candidates?.[0]
  const parts = candidate?.content?.parts ?? []
  const visible = parts.filter((part) => !part.thought && typeof part.text === 'string')
  const text =
    visible.length > 0
      ? visible.map((part) => part.text ?? '').join('')
      : parts.map((part) => part.text ?? '').join('')

  return { text, finishReason: candidate?.finishReason }
}
