import { describe, expect, it } from 'vitest'
import { normalizeWindowKind } from '../constants/windowOptions'
import { hasWindowDirection } from '../utils/windowOrientation'

describe('窓の種類', () => {
  it('横すべり出し・FIX・FIX＋両端すべり出しを扱える', () => {
    expect(normalizeWindowKind('awning')).toBe('awning')
    expect(normalizeWindowKind('fix')).toBe('fix')
    expect(normalizeWindowKind('fix_casement')).toBe('fix_casement')
  })

  it('古いデータの fixed は FIX窓として読む（以前は引き違いになっていた）', () => {
    expect(normalizeWindowKind('fixed')).toBe('fix')
  })

  it('外へ開く窓は向きを持ち、FIX は持たない', () => {
    expect(hasWindowDirection('awning')).toBe(true)
    expect(hasWindowDirection('fix_casement')).toBe(true)
    expect(hasWindowDirection('fix')).toBe(false)
  })
})
