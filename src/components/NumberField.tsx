import { useState, type InputHTMLAttributes } from 'react'

interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> {
  /** 今の値。空欄を許す欄では null */
  value: number | null
  /** 打ち終わった値（Enter か欄を離れたとき）。範囲に収めてから渡す。空欄にしたときは null */
  onCommit: (value: number | null) => void
  min?: number
  max?: number
  /** 表示する小数の桁数（帖数なら 1、mm なら 0） */
  digits?: number
  /** 空欄を許すか（空欄で onCommit(null)） */
  allowEmpty?: boolean
}

/**
 * 数値の入力欄。
 * - 範囲内の数値になったら、その場で反映する（▲▼ボタンで 50mm ずつ変えるときなど）
 * - 範囲外の途中の値（「800」と打つ途中の「8」など）は反映せず、Enter か欄を離れたときに決める。
 *   下限に足りなければ下限に合わせ、上限を超えていれば打ち間違いとみなして元の値に戻す
 *
 * 1文字ごとに範囲へ補正すると「8」が 300 に直されて「3000」になったり、帖数の「6.5」の「.」が消えたりした。
 * かといって離れるまで反映しないと、▲▼ボタンがその場で効かなくなる。打っている間は打った文字をそのまま表示する。
 * Esc で打ちかけの値を取り消す。
 */
export function NumberField({ value, onCommit, min, max, digits = 0, allowEmpty, ...rest }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const round = (v: number) => Math.round(v * 10 ** digits) / 10 ** digits
  const shown = draft ?? (value == null ? '' : String(round(value)))

  const commit = () => {
    if (draft == null) return
    setDraft(null)
    const text = draft.trim()
    if (text === '') {
      if (allowEmpty && value != null) onCommit(null)
      return
    }
    const parsed = Number(text)
    if (!Number.isFinite(parsed)) return
    // 上限を超える値は打ち間違い（今の値の後ろに数字が付いた「900750」など）とみなして反映しない。
    // 上限に丸めると、思いもしない値（3000mm など）になってしまう。下限に足りない値は下限に合わせる
    if (max != null && parsed > max) return
    const next = round(Math.max(min ?? -Infinity, parsed))
    if (value == null || Math.abs(next - value) > 1e-9) onCommit(next)
  }

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={shown}
      onChange={(e) => {
        const text = e.target.value
        setDraft(text)
        // 範囲内の数値なら、その場で反映する（打っている間の表示は打った文字のまま）
        const parsed = text.trim() === '' ? NaN : Number(text)
        if (!Number.isFinite(parsed)) return
        if ((min != null && parsed < min) || (max != null && parsed > max)) return
        const next = round(parsed)
        if (value == null || Math.abs(next - value) > 1e-9) onCommit(next)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          ;(e.target as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          setDraft(null)
        }
        rest.onKeyDown?.(e)
      }}
    />
  )
}
