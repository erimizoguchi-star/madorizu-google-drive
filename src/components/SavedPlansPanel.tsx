import { useState } from 'react'
import type { FloorPlan } from '../types/floorPlan'
import {
  deleteSavedPlan,
  formatSavedAt,
  listSavedPlans,
  savePlan,
  type SavedPlan,
} from '../services/planStorage'

interface SavedPlansPanelProps {
  floorPlan: FloorPlan
  /** 現在編集しているのがどの保存データか（上書き保存用） */
  currentId: string | null
  onCurrentIdChange: (id: string | null) => void
  onLoad: (plan: FloorPlan) => void
}

export function SavedPlansPanel({
  floorPlan,
  currentId,
  onCurrentIdChange,
  onLoad,
}: SavedPlansPanelProps) {
  const [plans, setPlans] = useState<SavedPlan[]>(() => listSavedPlans())
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')

  const refresh = () => setPlans(listSavedPlans())

  const notify = (text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 3000)
  }

  const handleSaveNew = () => {
    try {
      const entry = savePlan(name || floorPlan.title, floorPlan)
      onCurrentIdChange(entry.id)
      setName('')
      refresh()
      notify(`「${entry.name}」を保存しました`)
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存に失敗しました')
    }
  }

  const handleOverwrite = () => {
    if (!currentId) return
    try {
      const target = plans.find((p) => p.id === currentId)
      const entry = savePlan(name || target?.name || floorPlan.title, floorPlan, currentId)
      refresh()
      notify(`「${entry.name}」に上書き保存しました`)
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存に失敗しました')
    }
  }

  const handleLoad = (plan: SavedPlan) => {
    onLoad(plan.floorPlan)
    onCurrentIdChange(plan.id)
    setName(plan.name)
    notify(`「${plan.name}」を開きました`)
  }

  const handleDelete = (plan: SavedPlan) => {
    if (!confirm(`「${plan.name}」を削除しますか？`)) return
    deleteSavedPlan(plan.id)
    if (currentId === plan.id) onCurrentIdChange(null)
    refresh()
  }

  const currentName = plans.find((p) => p.id === currentId)?.name

  return (
    <div className="saved-plans-section">
      <h4>保存して続きから編集</h4>
      <p className="data-share-hint">
        この PC のブラウザに保存します。別の PC へ渡すときは下の JSON を使ってください。
      </p>

      <input
        type="text"
        className="saved-plan-name"
        placeholder={currentName ?? floorPlan.title ?? '間取図の名前'}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="export-buttons">
        <button type="button" className="btn btn-primary" onClick={handleSaveNew}>
          新規保存
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleOverwrite}
          disabled={!currentId}
          title={currentId ? `「${currentName}」に上書き` : '先に保存するか、保存済みを開いてください'}
        >
          上書き保存
        </button>
      </div>

      {message && <p className="saved-plan-message">{message}</p>}

      {plans.length > 0 && (
        <ul className="saved-plan-list">
          {plans.map((plan) => (
            <li key={plan.id} className={plan.id === currentId ? 'current' : ''}>
              <div className="saved-plan-info">
                <span className="saved-plan-title">{plan.name}</span>
                <span className="saved-plan-date">{formatSavedAt(plan.updatedAt)}</span>
              </div>
              <div className="saved-plan-actions">
                <button type="button" className="btn btn-secondary" onClick={() => handleLoad(plan)}>
                  開く
                </button>
                <button type="button" className="btn btn-danger" onClick={() => handleDelete(plan)}>
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
