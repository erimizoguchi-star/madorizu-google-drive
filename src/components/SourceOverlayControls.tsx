import { NumberField } from './NumberField'
import { normalizeAngle, splitRotation } from '../utils/overlayRotation'

export interface SourceOverlayState {
  /** 重ね合わせ表示するか */
  enabled: boolean
  /** 0〜1 */
  opacity: number
  /** 横方向の倍率（1 = 元のサイズ）。縦横比維持のため通常は scaleY と同じ */
  scaleX: number
  /** 縦方向の倍率。縮尺操作では scaleX と同じ値を保つ */
  scaleY: number
  /** 位置のずらし量（間取図と同じ座標系） */
  offset: { x: number; y: number }
  /** 回転（度、時計回りが正）。90° の倍数の「向き」と、残りの「傾き」に分けて操作する */
  rotation: number
  /** true の間は画像をドラッグして位置合わせできる（間取図の編集は一時停止） */
  adjusting: boolean
  /** true の間は、平面図側の建物の角を3つ（左上・右上・右下）クリックして自動で合わせる */
  calibrating: boolean
  /**
   * true のとき、表示側が平面図の大きさを間取図に合わせて縮尺と位置を自動で決める（決めたら false に戻す）。
   * 重ねる操作を始めたときやリセットしたときに立てる
   */
  needsFit?: boolean
}

export const DEFAULT_SOURCE_OVERLAY: SourceOverlayState = {
  enabled: false,
  opacity: 0.5,
  scaleX: 1,
  scaleY: 1,
  offset: { x: 0, y: 0 },
  rotation: 0,
  adjusting: false,
  calibrating: false,
  needsFit: false,
}

interface SourceOverlayControlsProps {
  fileName: string
  /** 間取図の階。2つ以上あれば、平面図を重ねる階を選べるようにする */
  floors?: { id: string; label: string }[]
  targetFloorId?: string | null
  onTargetFloorChange?: (floorId: string) => void
  state: SourceOverlayState
  /** 3点合わせで今いくつクリックしたか（0〜2） */
  calibrationStep: number
  onChange: (next: SourceOverlayState) => void
  /**
   * 3点合わせで、間取図と平面図の縦横比が違うと分かったとき。
   * sx, sy は間取図を平面図に合わせるための横・縦の倍率
   */
  stretch?: { sx: number; sy: number; onApply: () => void; onDismiss: () => void } | null
}

const percent = (s: number) => {
  const p = Math.round((s - 1) * 1000) / 10
  return `${p > 0 ? '+' : ''}${p}%`
}

export function SourceOverlayControls({
  fileName,
  floors = [],
  targetFloorId,
  onTargetFloorChange,
  state,
  calibrationStep,
  onChange,
  stretch,
}: SourceOverlayControlsProps) {
  const patch = (p: Partial<SourceOverlayState>) => onChange({ ...state, ...p })
  // 縦横比維持のため、表示・操作は共通の縮尺（横基準）を使う
  const scale = state.scaleX > 0 ? state.scaleX : 1
  const { quarter, tilt } = splitRotation(state.rotation ?? 0)
  // 90° 回すと建物の縦横が入れ替わるので、大きさと位置も合わせ直す
  const turn = (deg: number) =>
    patch({ rotation: normalizeAngle(quarter + deg + tilt), adjusting: false, calibrating: false, needsFit: true })
  const setTilt = (next: number) => patch({ rotation: normalizeAngle(quarter + next) })

  return (
    <div className="overlay-controls">
      <label className={`overlay-toggle ${state.enabled ? 'active' : ''}`}>
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) =>
            patch({ enabled: e.target.checked, adjusting: false, calibrating: false, needsFit: e.target.checked })
          }
        />
        元の平面図を重ねる
      </label>

      {floors.length > 1 && onTargetFloorChange && (
        <div className="overlay-field">
          <label htmlFor="overlay-floor">重ねる階</label>
          <select
            id="overlay-floor"
            value={targetFloorId ?? ''}
            onChange={(e) => onTargetFloorChange(e.target.value)}
            title="その階の元の図面を、その階の間取図に重ねます"
          >
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {state.enabled && (
        <>
          <div className="overlay-field">
            <label htmlFor="overlay-opacity">濃さ</label>
            <input
              id="overlay-opacity"
              type="range"
              min={5}
              max={100}
              step={5}
              value={Math.round(state.opacity * 100)}
              onChange={(e) => patch({ opacity: Number(e.target.value) / 100 })}
            />
            <span className="overlay-value">{Math.round(state.opacity * 100)}%</span>
          </div>

          <div className="overlay-field">
            <label htmlFor="overlay-scale">縮尺</label>
            <input
              id="overlay-scale"
              type="range"
              min={20}
              max={300}
              step={1}
              value={Math.round(scale * 100)}
              onChange={(e) => {
                const next = Number(e.target.value) / 100
                // 縦横同じ倍率にしてアスペクト比を維持
                patch({ scaleX: next, scaleY: next })
              }}
            />
            <span className="overlay-value">{Math.round(scale * 100)}%</span>
          </div>

          <div className="overlay-field">
            <span className="overlay-label">向き</span>
            <div className="overlay-turn-buttons">
              <button type="button" className="btn btn-secondary" onClick={() => turn(-90)} title="左に90°回す">
                ⟲ 90°
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => turn(90)} title="右に90°回す">
                ⟳ 90°
              </button>
            </div>
          </div>

          <div className="overlay-field">
            <label htmlFor="overlay-tilt">傾き</label>
            <input
              id="overlay-tilt"
              type="range"
              min={-10}
              max={10}
              step={0.1}
              value={Math.max(-10, Math.min(10, tilt))}
              onChange={(e) => setTilt(Number(e.target.value))}
            />
            <span className="overlay-value overlay-tilt-value">
              <NumberField
                aria-label="傾き（度）"
                value={tilt}
                digits={1}
                min={-45}
                max={45}
                step={0.1}
                onCommit={(v) => setTilt(v ?? 0)}
              />
              °
            </span>
          </div>

          <button
            type="button"
            className={`btn overlay-adjust-btn ${state.calibrating ? 'active' : ''}`}
            onClick={() =>
              patch({ calibrating: !state.calibrating, adjusting: false })
            }
            title="建物の左上・右上・右下をクリックすると、傾き・縮尺・位置をまとめて合わせます"
          >
            {state.calibrating ? '3点合わせをやめる' : '3点で合わせる（傾きも）'}
          </button>

          <button
            type="button"
            className={`btn overlay-adjust-btn ${state.adjusting ? 'active' : ''}`}
            onClick={() => patch({ adjusting: !state.adjusting, calibrating: false })}
          >
            {state.adjusting ? '位置合わせを終える' : '位置を動かす'}
          </button>

          <button
            type="button"
            className="btn btn-secondary overlay-reset-btn"
            onClick={() =>
              patch({
                opacity: 0.5,
                scaleX: 1,
                scaleY: 1,
                offset: { x: 0, y: 0 },
                // 90° の向きは残し、傾きだけ戻す（横向きの図面を回し直さなくて済むように）
                rotation: quarter,
                adjusting: false,
                calibrating: false,
                needsFit: true,
              })
            }
          >
            リセット
          </button>

          {stretch && (
            <div className="overlay-stretch">
              <p>
                間取図の大きさが平面図と <strong>横 {percent(stretch.sx)}・縦 {percent(stretch.sy)}</strong>{' '}
                違います（AI が寸法を読み違えたときに起きます）。
              </p>
              <div className="overlay-stretch__actions">
                <button type="button" className="btn btn-primary" onClick={stretch.onApply}>
                  間取図の縦横を平面図に合わせる
                </button>
                <button type="button" className="btn btn-secondary" onClick={stretch.onDismiss}>
                  このままにする
                </button>
              </div>
            </div>
          )}

          <p className="overlay-hint">
            {state.calibrating ? (
              calibrationStep === 0 ? (
                <>
                  <strong>① 重ねた平面図の上で、建物の「左上の角」をクリック</strong>
                  してください（間取図の建物の角に合わせます）。拡大してから角をクリックすると、傾きが正確になります
                </>
              ) : calibrationStep === 1 ? (
                <>
                  <strong>② 続いて「右上の角」をクリック</strong>
                  してください（上の辺の向きから傾きを求めます）
                </>
              ) : (
                <>
                  <strong>③ 最後に「右下の角」をクリック</strong>
                  してください。3点から傾き・縮尺（縦横比維持）・位置を自動で合わせます
                </>
              )
            ) : state.adjusting ? (
              '平面図をドラッグして動かしてください（この間は間取図の編集は止まります）'
            ) : (
              <>
                重ねているのは「{fileName}」です。最初は間取図の大きさにおおまかに合わせてあります。細かく合わせるには「3点で合わせる」が確実です（傾きも直ります）。横向きの図面は「向き」で回してください。縮尺は縦横比を保ったまま変更できます。出力（PNG /
                SVG / PDF）には含まれません。
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
