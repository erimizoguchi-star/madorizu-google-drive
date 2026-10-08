import { formatDuration, GOAL_MS, summarizeEditHistory, type EditRecord } from '../services/editTime'

interface EditTimePanelProps {
  history: EditRecord[]
}

/** 最近仕上げた間取図の編集時間。「10分で終える」に近づいたかを見る */
export function EditTimePanel({ history }: EditTimePanelProps) {
  const summary = summarizeEditHistory(history)
  return (
    <details className="edit-time-panel">
      <summary>
        編集時間の記録
        {summary.count > 0 && (
          <span className="edit-time-panel__summary">
            ：最近{summary.count}件の中央値 {formatDuration(summary.medianMs)}（10分以内 {summary.withinGoal}/{summary.count}件）
          </span>
        )}
      </summary>
      {history.length === 0 ? (
        <p className="edit-time-panel__hint">物件へ送る・出力すると、その間取図の編集時間がここに記録されます。</p>
      ) : (
        <>
          <table className="edit-time-panel__table">
            <thead>
              <tr>
                <th>仕上げた日時</th>
                <th>間取図</th>
                <th>編集</th>
                <th>AI待ち</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 10).map((r) => {
                const d = new Date(r.finishedAt)
                return (
                  <tr key={r.sessionId}>
                    <td>
                      {d.getMonth() + 1}/{d.getDate()} {String(d.getHours()).padStart(2, '0')}:
                      {String(d.getMinutes()).padStart(2, '0')}
                    </td>
                    <td>
                      {r.propertyName ?? r.title}
                      {r.floors > 1 ? `（${r.floors}階）` : ''}
                    </td>
                    <td className={r.activeMs <= GOAL_MS ? 'is-goal' : ''}>{formatDuration(r.activeMs)}</td>
                    <td>{r.analysisMs > 0 ? formatDuration(r.analysisMs) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="edit-time-panel__hint">
            編集は操作していた時間だけを数えます（2分以上操作がない間は数えません）。同じ間取図を送り直すと上書きされます。記録はこの
            PC のブラウザに残ります。
          </p>
        </>
      )}
    </details>
  )
}
