import { useMemo, useState } from 'react'
import type { FloorPlan } from '../types/floorPlan'
import type { SelectedElementRef } from '../utils/floorPlanEdit'
import { findPlanIssues, type PlanIssue } from '../utils/planChecks'

interface PlanChecksPanelProps {
  floorPlan: FloorPlan
  onSelect: (ref: SelectedElementRef) => void
  /** 数 cm ずれた壁をまとめて1本にそろえる */
  onAlignWalls?: () => void
  /** 重なった部屋から重なった部分を切り取る。切り取った数と、切り取れなかった数を返す */
  onCutOverlaps?: () => { cut: number; skipped: number }
}

const ICONS: Record<PlanIssue['kind'], string> = {
  'door-off-wall': '🚪',
  'window-off-wall': '🪟',
  'room-overlap': '⧉',
  'area-mismatch': '📐',
  'wall-duplicate': '▤',
  'wall-stray': '│',
  'wall-misaligned': '═',
}

/** 確認が必要なところの一覧。押すとその要素を選ぶ（その場メニューが出る） */
export function PlanChecksPanel({ floorPlan, onSelect, onAlignWalls, onCutOverlaps }: PlanChecksPanelProps) {
  const issues = useMemo(() => findPlanIssues(floorPlan), [floorPlan])
  const misaligned = issues.filter((issue) => issue.kind === 'wall-misaligned').length
  const overlaps = issues.filter((issue) => issue.kind === 'room-overlap').length
  const [cutMessage, setCutMessage] = useState<string | null>(null)
  return (
    <details className="plan-checks" open={issues.length > 0}>
      <summary>
        確認が必要なところ
        {issues.length > 0 ? <strong>（{issues.length}件）</strong> : <span className="plan-checks__ok">：なし ✓</span>}
      </summary>
      {issues.length > 0 && (
        <>
          {misaligned > 0 && onAlignWalls && (
            <button
              type="button"
              className="btn btn-primary plan-checks__align"
              onClick={onAlignWalls}
              title="数 cm ずれて2重（太く）に見える壁や外壁の段差を、ほかの部屋もそろっている線に合わせて1本にします"
            >
              ═ ずれた壁をまとめてそろえる（{misaligned}か所）
            </button>
          )}
          {overlaps > 0 && onCutOverlaps && (
            <button
              type="button"
              className="btn btn-primary plan-checks__align"
              onClick={() => {
                const { cut, skipped } = onCutOverlaps()
                setCutMessage(
                  skipped > 0
                    ? `${cut}か所を切り取りました。${skipped}か所は、部屋の内側に別の部屋がある（切り取ると穴があく）ため、そのままです。表示は小さい部屋が上になります。`
                    : null
                )
              }}
              title="重なった部分を大きいほうの部屋から切り取ります（階段と重なったときは部屋を切り取ります）。色・模様が隠れなくなり、帖数も正しくなります"
            >
              ⧉ 重なりを部屋から除く（{overlaps}か所）
            </button>
          )}
          {cutMessage && <p className="plan-checks__hint">{cutMessage}</p>}
          <ul className="plan-checks__list">
            {issues.map((issue, i) => (
              <li key={i}>
                <button type="button" className="plan-checks__item" onClick={() => onSelect(issue.ref)}>
                  <span aria-hidden>{ICONS[issue.kind]}</span> {issue.message}
                </button>
              </li>
            ))}
          </ul>
          <p className="plan-checks__hint">押すとその場所を選びます。帖数が合わない部屋は、大きさを平面図に合わせ直す目安です。</p>
        </>
      )}
    </details>
  )
}
