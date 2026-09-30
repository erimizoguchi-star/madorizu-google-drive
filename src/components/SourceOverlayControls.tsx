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
  /** true の間は画像をドラッグして位置合わせできる（間取図の編集は一時停止） */
  adjusting: boolean
  /** true の間は、平面図側の基準点を2つクリックして自動で合わせる */
  calibrating: boolean
}

export const DEFAULT_SOURCE_OVERLAY: SourceOverlayState = {
  enabled: false,
  opacity: 0.5,
  scaleX: 1,
  scaleY: 1,
  offset: { x: 0, y: 0 },
  adjusting: false,
  calibrating: false,
}

interface SourceOverlayControlsProps {
  fileName: string
  state: SourceOverlayState
  /** 2点合わせで今どこまでクリックしたか（0 or 1） */
  calibrationStep: number
  onChange: (next: SourceOverlayState) => void
}

export function SourceOverlayControls({
  fileName,
  state,
  calibrationStep,
  onChange,
}: SourceOverlayControlsProps) {
  const patch = (p: Partial<SourceOverlayState>) => onChange({ ...state, ...p })
  // 縦横比維持のため、表示・操作は共通の縮尺（横基準）を使う
  const scale = state.scaleX > 0 ? state.scaleX : 1

  return (
    <div className="overlay-controls">
      <label className={`overlay-toggle ${state.enabled ? 'active' : ''}`}>
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) =>
            patch({ enabled: e.target.checked, adjusting: false, calibrating: false })
          }
        />
        元の平面図を重ねる
      </label>

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

          <button
            type="button"
            className={`btn overlay-adjust-btn ${state.calibrating ? 'active' : ''}`}
            onClick={() =>
              patch({ calibrating: !state.calibrating, adjusting: false })
            }
          >
            {state.calibrating ? '2点合わせをやめる' : '2点で合わせる'}
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
                adjusting: false,
                calibrating: false,
              })
            }
          >
            リセット
          </button>

          <p className="overlay-hint">
            {state.calibrating ? (
              calibrationStep === 0 ? (
                <>
                  <strong>① 重ねた平面図の上で、建物の「左上の角」をクリック</strong>
                  してください（間取図の建物の角に合わせます）
                </>
              ) : (
                <>
                  <strong>② 続いて「右下の角」をクリック</strong>
                  してください。2点から縮尺（縦横比維持）と位置を自動で合わせます
                </>
              )
            ) : state.adjusting ? (
              '平面図をドラッグして動かしてください（この間は間取図の編集は止まります）'
            ) : (
              <>
                重ねているのは「{fileName}」です。縮尺は縦横比を保ったまま変更できます。出力（PNG /
                SVG / PDF）には含まれません。
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}
