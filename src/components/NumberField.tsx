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
 * 数値の入力欄。打っている途中では反映せず、Enter か欄を離れたときに反映する。
 *
 * 1文字ごとに反映すると、最小値で補正される欄では「800」と打つ途中の「8」が 300 に直されて「3000」になったり、
 * 帖数の「6.5」の「.」が消えたりして、正しく打ち込めなかった。Esc で打ちかけの値を取り消す。
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
    const next = round(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed)))
    if (value == null || Math.abs(next - value) > 1e-9) onCommit(next)
  }

  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
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
