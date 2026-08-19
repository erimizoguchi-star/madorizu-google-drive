import { describe, expect, it } from 'vitest'
import { parseAiJsonContent } from '../utils/parseAiJson'

/**
 * AI 応答の JSON 修復を守るテスト。
 * Gemini は出力上限に当たると JSON が途中で切れる。修復できないと
 * 「解析できませんでした」で全滅するため、ここの頑健さが体感を左右する。
 */
describe('AI応答のJSON修復', () => {
  it('正常な JSON はそのまま読む', () => {
    expect(parseAiJsonContent('{"title":"テスト"}')).toEqual({ title: 'テスト' })
  })

  it('末尾の余分なカンマを取り除く', () => {
    expect(parseAiJsonContent('{"a":1,"b":[1,2,],}')).toEqual({ a: 1, b: [1, 2] })
  })

  it('markdown のコードフェンスに包まれていても読む', () => {
    expect(parseAiJsonContent('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('途中で切れた JSON は閉じ括弧を補って復元する', () => {
    const truncated = '{"title":"t","floors":[{"id":"1f","rooms":[{"id":"r1"'
    const result = parseAiJsonContent(truncated) as {
      floors: { rooms: { id: string }[] }[]
    }
    expect(result.floors[0].rooms[0].id).toBe('r1')
  })

  it('文字列の途中で切れていても復元する', () => {
    const truncated = '{"title":"t","floors":[{"name":"1'
    const result = parseAiJsonContent(truncated) as { title: string }
    expect(result.title).toBe('t')
  })

  it('JSON が含まれない応答はエラーを投げる', () => {
    expect(() => parseAiJsonContent('すみません、解析できませんでした。')).toThrow()
  })
})
