import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 「使い方」。初めて使う人が、画面の流れに沿って読めば一通り作れるように書く。
 * 画面のボタン名は、実際の表示と同じ言葉にする（探しやすいように「」で囲む）。
 */

export type HelpSectionId =
  | 'flow'
  | 'load'
  | 'edit-basic'
  | 'fit'
  | 'openings'
  | 'stairs'
  | 'color'
  | 'checks'
  | 'output'
  | 'trouble'
  | 'keys'

interface Section {
  id: HelpSectionId
  title: string
  body: ReactNode
}

const B = ({ children }: { children: ReactNode }) => <strong className="help-ui">{children}</strong>

const SECTIONS: Section[] = [
  {
    id: 'flow',
    title: 'はじめに（全体の流れ）',
    body: (
      <>
        <p>
          建物の平面図（PDF・画像）を読み込むと、AI が部屋・壁・扉・窓を読み取って、色付きの間取図を作ります。
          読み取りは完全ではないので、<strong>元の平面図に合わせて直してから</strong>出力します。
        </p>
        <ol className="help-steps">
          <li>
            <B>① 読み込み</B>：平面図を選んで「間取図を生成」（AI の読み取りに 1〜3 分）
          </li>
          <li>
            <B>② 編集</B>：元の平面図を重ねて、部屋の大きさ・扉・窓・階段を合わせる
          </li>
          <li>
            <B>③ 出力・保存</B>：「物件へ送る」で広告シートへ。画像・PDF にもできる
          </li>
        </ol>
        <p className="help-note">
          目安は1枚 10 分です。編集中は画面上部に「⏱ 編集 〇分〇秒」が出ます。編集した内容はこのブラウザに自動で保存されるので、
          途中で閉じても「続きから編集」で戻せます。
        </p>
      </>
    ),
  },
  {
    id: 'load',
    title: '① 読み込み',
    body: (
      <>
        <h4>物件情報管理システムから開いたとき</h4>
        <ul>
          <li>
            「物件情報管理システムの図面」に、その物件の建物図面が並びます。押すと読み込まれます。
          </li>
          <li>
            前にこのアプリで作って送った間取図があれば <B>✎ 続きから編集</B> が出ます。押すと、作ったときの状態で開きます（別の PC からでも可）。
          </li>
        </ul>
        <h4>ファイルから読み込むとき</h4>
        <ul>
          <li>平面図（PDF・PNG・JPG）を枠にドラッグ＆ドロップするか、枠を押して選びます。PDF は使うページを選べます。</li>
          <li>
            図面が横向きなら <B>⟲ 左へ90°</B>・<B>⟳ 右へ90°</B> で正しい向きにしてから読み取ります（横倒しの文字は読み違えやすいため）。
          </li>
        </ul>
        <h4>間取図を作る</h4>
        <ul>
          <li>
            <B>AI解析（Gemini）</B> を選んで <B>間取図を生成</B>。1/50 の詳細図など文字が細かい図面は <B>高精度解析</B> にチェックを入れます（2〜5 分）。
          </li>
          <li>
            1階と2階が別の図面のときは、1階を作ったあと2階の図面を選び、<B>今の間取図に階として追加</B> を押します。
          </li>
          <li>「サンプル表示」は練習用です（読み込んだ図面に関係なく、見本の間取図が出ます）。</li>
        </ul>
      </>
    ),
  },
  {
    id: 'edit-basic',
    title: '② 編集の基本',
    body: (
      <>
        <ul>
          <li>
            部屋・壁・扉・窓・階段・設備は、<strong>クリックで選びます</strong>。選ぶと、そのすぐ上に小さなメニューが出て、よく使う設定をその場で変えられます。細かい設定は左の欄に出ます。
          </li>
          <li>小さくて選びにくいものは、左の <B>要素を選択</B> の一覧から選ぶと確実です。</li>
          <li>部屋・階段はドラッグで動かせます。部屋の名前はダブルクリックで直せます。</li>
          <li>
            図面の拡大・縮小はマウスのホイール、移動は何もない所をドラッグします。「リセット」で全体表示に戻ります。
          </li>
          <li>
            間違えたら <B>一手戻る</B>（Ctrl+Z）。消すときは選んで Delete キーか、メニューの <B>削除</B>。
          </li>
          <li>
            部屋・扉・窓などを足すときは、左の <B>要素を追加</B> から種類を選び、図面上をクリックします（扉・窓は壁をクリック。続けて置け、Esc で終わり）。
          </li>
          <li>画面が狭いときは <B>編集画面を広げる</B> や <B>編集パネルを隠す</B> を使います。</li>
        </ul>
      </>
    ),
  },
  {
    id: 'fit',
    title: '元の平面図に合わせる（いちばん大事）',
    body: (
      <>
        <p>部屋の大きさや壁の位置は、元の平面図を重ねて合わせると速く正確です。この順に進めてください。</p>
        <ol className="help-steps">
          <li>
            「生成された間取図」の上の <B>元の平面図を重ねる</B> にチェック。「濃さ」で見やすくします。2階は「重ねる階」で切り替えます。
          </li>
          <li>
            <B>3点で合わせる（傾きも）</B> を押し、重なった平面図の建物の <strong>左上 → 右上 → 右下</strong> の角を順にクリック。縮尺・位置・傾きがまとめて合います（拡大してからクリックすると正確）。
            平面図が横向きなら、先に「向き」の ⟲ ⟳ で回します。
          </li>
          <li>
            <B>線を合わせる</B> を押すと、壁の通りがオレンジの線で出ます。線をドラッグして平面図の壁に合わせます。平面図の壁に吸い付くと
            <span className="help-green">緑</span>、ほかの通りにそろうと<span className="help-blue">青</span>になります。線に接する部屋・扉・窓は一緒に動きます。
          </li>
          <li>
            1部屋だけ直すときは、部屋を選んで辺のオレンジの取っ手をドラッグします。ほかの部屋の辺の近くでは吸い付きます。幅・奥行は数字でも入れられます。
          </li>
          <li>
            部屋の形が四角でないとき（L 字など）や、色を付ける範囲を決めたいときは、部屋のメニューの <B>範囲：▭ 描き直す／＋足す／−削る</B> を押して、図面の上で四角を描きます。
          </li>
        </ol>
        <p className="help-note">
          AI が縦横の寸法を読み違えていると、3点で合わせたあとに「間取図の縦横を平面図に合わせる」が出ます。押すと間取図全体の縦横が合います。
        </p>
      </>
    ),
  },
  {
    id: 'openings',
    title: '扉・窓',
    body: (
      <ul>
        <li>扉・窓をクリックすると、メニューで種類・幅・向きを変えられます。</li>
        <li>
          <B>向き</B>（または R キー）で、扉の開く向き・吊り元、窓の外側を順に切り替えます。縦すべり出し窓などは4通りに変わります。
        </li>
        <li>幅は数字を入れるか、▲▼ で 50mm ずつ変えられます。扉・窓はドラッグで動かせ、窓は両端の取っ手で幅も変えられます。</li>
        <li>扉・窓は壁の上にあるものとして描きます。「確認が必要なところ」に「壁に乗っていません」と出たら、壁の上へ動かします。</li>
      </ul>
    ),
  },
  {
    id: 'stairs',
    title: '階段',
    body: (
      <ul>
        <li>
          階段を選ぶと、メニューのいちばん左で形（直線・L字・U字・L字・2方向に段）を選べます。角で扇形に曲がる階段は「L字・2方向に段」です（角は回り段と踊り場を切り替え）。
        </li>
        <li>
          <B>↻ 向き</B> で上る向きを 90° ずつ、<B>⇄ 回る向き</B> で右回り・左回りを変えます。<B>段</B> の − ＋ で段の数を変えます。
        </li>
        <li>
          1階は <B>UP</B>、2階は <B>DN</B> にします（<B>UP → DN</B> で切り替え）。1階で途中を切る描き方にするときは <B>破断線</B> にチェック。
        </li>
        <li>大きさは、辺のオレンジの取っ手をドラッグするか、詳細設定の幅・長さで変えます。色は見本を押して選びます。</li>
      </ul>
    ),
  },
  {
    id: 'color',
    title: '色・模様',
    body: (
      <ul>
        <li>部屋の色と模様（木目・畳・タイル）は、部屋の <B>種類</B> で自動で決まります。種類を変えると名前・色・模様も変わります。</li>
        <li>好きな色にするときは、左の詳細設定の <B>塗り色</B>・<B>模様</B> で変えます。「デフォルト」で種類の色に戻ります。</li>
        <li>
          色を付けたい範囲が部屋の形と違うときは、部屋のメニューの <B>範囲：▭ 描き直す</B> で、図面の上に四角を描いて範囲を決めます。
        </li>
        <li>部屋が重なっていると、小さい部屋が上に描かれます。重なりそのものは「確認が必要なところ」の <B>重なりを部屋から除く</B> で直せます。</li>
      </ul>
    ),
  },
  {
    id: 'checks',
    title: '確認が必要なところ',
    body: (
      <ul>
        <li>
          編集タブの上に、間違えやすい所の一覧が出ます（扉・窓が壁に乗っていない、部屋が重なっている、帖数と大きさが合わない など）。押すとその場所を選びます。
        </li>
        <li>
          <B>ずれた壁をまとめてそろえる</B>：数 cm ずれて2重（太く）に見える壁や、外壁の小さな段差を1本にします。
        </li>
        <li>
          <B>重なりを部屋から除く</B>：重なった部分を大きいほうの部屋から切り取ります。
        </li>
        <li>帖数が合わない部屋は、大きさを平面図に合わせ直す目安です。</li>
      </ul>
    ),
  },
  {
    id: 'output',
    title: '③ 出力・保存',
    body: (
      <ul>
        <li>
          物件情報管理システムから開いたときは <B>物件へ送る</B> を押すと、広告シートの「間取り図」の枠に入ります。編集データも一緒に保存されるので、あとで別の PC からでも「続きから編集」で直せます。
        </li>
        <li>
          <B>PNG</B>・<B>JPG</B>・<B>PDF</B>・<B>SVG</B> で書き出せます。選んでいる枠や取っ手は写りません。
        </li>
        <li>2階建ては「階の大きさと並べ方」で、階を同じ縮尺にそろえて横・縦に並べられます。</li>
        <li>「編集時間の記録」に、送った・出力した間取図の編集時間が残ります（10分の目安に近づいたかの確認に）。</li>
      </ul>
    ),
  },
  {
    id: 'trouble',
    title: '困ったとき',
    body: (
      <dl className="help-faq">
        <dt>編集中の間取図が消えた・ブラウザを閉じてしまった</dt>
        <dd>もう一度開くと「前回の編集中の間取図があります」と出ます。<B>続きから編集</B> を押します。</dd>
        <dt>重ねた平面図と間取図の大きさが合わない</dt>
        <dd><B>3点で合わせる（傾きも）</B> をやり直します。拡大して角を正確にクリックすると合いやすくなります。</dd>
        <dt>壁が太く（2重に）見える</dt>
        <dd>「確認が必要なところ」の <B>ずれた壁をまとめてそろえる</B> を押します。</dd>
        <dt>色を付けたのに、別の部屋の色が上に出る</dt>
        <dd>部屋が重なっています。<B>重なりを部屋から除く</B> を押すか、<B>範囲：▭ 描き直す</B> で範囲を描き直します。</dd>
        <dt>AI の読み取りが大きく違う</dt>
        <dd>
          図面の向き（⟲ ⟳）を直し、<B>高精度解析</B> で作り直します。それでも違うときは、合っている部屋を基に「線を合わせる」で直すほうが早いことがあります。
        </dd>
        <dt>操作を間違えた</dt>
        <dd><B>一手戻る</B>（Ctrl+Z）で戻せます。やり直すときは Ctrl+Y です。</dd>
        <dt>別の PC で続きを直したい</dt>
        <dd>「物件へ送る」で送っておけば、物件情報管理システムから開いたときに <B>✎ 続きから編集</B> が出ます。</dd>
      </dl>
    ),
  },
  {
    id: 'keys',
    title: 'キー操作',
    body: (
      <table className="help-keys">
        <tbody>
          <tr>
            <th>Ctrl + Z</th>
            <td>一手戻る</td>
          </tr>
          <tr>
            <th>Ctrl + Y</th>
            <td>やり直す</td>
          </tr>
          <tr>
            <th>Delete</th>
            <td>選んだものを消す</td>
          </tr>
          <tr>
            <th>R</th>
            <td>選んだ扉・窓の向きを変える</td>
          </tr>
          <tr>
            <th>Esc</th>
            <td>追加・線合わせ・範囲を描く操作をやめる／この画面を閉じる</td>
          </tr>
          <tr>
            <th>ホイール</th>
            <td>図面の拡大・縮小</td>
          </tr>
        </tbody>
      </table>
    ),
  },
]

interface HelpDialogProps {
  open: boolean
  /** 開いたときに表示する項目 */
  section?: HelpSectionId
  onClose: () => void
}

export function HelpDialog({ open, section = 'flow', onClose }: HelpDialogProps) {
  const [current, setCurrent] = useState<HelpSectionId>(section)
  const closeRef = useRef<HTMLButtonElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // 開くたびに、指定された項目から読めるようにする
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setCurrent(section)
  }

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus({ preventScroll: true })
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  useEffect(() => {
    if (open) bodyRef.current?.scrollTo({ top: 0 })
  }, [open, current])

  if (!open) return null
  const index = SECTIONS.findIndex((s) => s.id === current)
  const active = SECTIONS[index] ?? SECTIONS[0]
  const prev = SECTIONS[index - 1]
  const next = SECTIONS[index + 1]

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="help-dialog__header">
          <h2 id="help-title">使い方</h2>
          <button ref={closeRef} type="button" className="btn btn-secondary help-dialog__close" onClick={onClose}>
            閉じる（Esc）
          </button>
        </header>
        <div className="help-dialog__main">
          <nav className="help-dialog__toc" aria-label="使い方の項目">
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`help-dialog__toc-item ${s.id === active.id ? 'is-active' : ''}`}
                aria-current={s.id === active.id ? 'true' : undefined}
                onClick={() => setCurrent(s.id)}
              >
                <span className="help-dialog__toc-num">{i + 1}</span>
                {s.title}
              </button>
            ))}
          </nav>
          <div className="help-dialog__body" ref={bodyRef}>
            <h3>{active.title}</h3>
            {active.body}
            <div className="help-dialog__pager">
              {prev ? (
                <button type="button" className="btn btn-secondary" onClick={() => setCurrent(prev.id)}>
                  ← {prev.title}
                </button>
              ) : (
                <span />
              )}
              {next && (
                <button type="button" className="btn btn-primary" onClick={() => setCurrent(next.id)}>
                  {next.title} →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
