/** 平面図AI解析用プロンプト */
export const ANALYSIS_PROMPT = `あなたは日本の住宅・建築平面図を読み取る専門家です。
アップロード画像を注意深く観察し、間取りデータをJSONで出力してください。

## 解析手順（この順で考える）
0. **図面枠・タイトルブロック・建具表・仕上表・家具・電気記号は間取りではない。無視する**
   （表・凡例、室内に描かれたソファ/ベッド/テーブル、引き出し線つきの注記文字は読み飛ばす）
1. **最初に建物全体の外形寸法（幅と高さ）を mm で確定する**
   - いちばん外側の通し寸法（総寸法）を最優先で使う。縦向き（90度回転）の寸法数値も必ず読む
   - 個別寸法の合計が総寸法と合うか検算する（例: 1365+1365+2275+910+2275 = 8190）
   - ポーチ・玄関などの張り出しを含めた最大の外形を採用する
2. 建物外周（外壁）の矩形または直交多角形を決める。**手順1で決めた外形寸法と必ず一致させる**
3. 内壁で区切られた各部屋を識別し、図面上のラベル（LD、キッチン、Living Dining、Kitchen など）を name に使う
4. 各部屋を直交する矩形ポリゴン（4頂点）で表現する（L字・コの字は矩形を分割して複数部屋にする）
5. **面積表記（「26.58㎡ 16.1J」「(4.73㎡ 2.9J)」など）がある部屋は、その面積と一致する寸法にする**
   - 帖数 × 1.62 ≒ ㎡。ポリゴンの面積が表記と大きく食い違ったら寸法を取り直す
6. 全部屋を合計したとき、手順1の外形寸法をはみ出さず、内側に空白も残さないよう調整する
7. 外壁・内壁・扉・窓・設備・階段を配置する

## 座標ルール（厳守）
- 単位は mm（1m = 1000mm）。整数または50mm刻みを推奨
- 原点は図面左上。x は右、y は下
- 部屋ポリゴンは時計回りの4点 [{x,y}, {x,y}, {x,y}, {x,y}]
- 隣接部屋は辺を共有し、隙間や重なりを作らない
- **建物外周の内側に白い空白セルを残さない**（廊下・ホール・階段前も必ず部屋または stairs で埋める）
- 壁は start/end の2点。水平・垂直のみ（斜め壁は禁止）
- **内壁は部屋ポリゴンの共有辺ごとに分割**（複数部屋をまたぐ1本の長い内壁は禁止。walls の内壁は省略可＝部屋から自動生成）
- 扉 position は**扉の端**（開口の始まり）の座標。中心ではない
  - 水平な壁の扉 → position は開口の**左端**。そこから右へ width 分が扉
  - 垂直な壁の扉 → position は開口の**上端**。そこから下へ width 分が扉
  - 例: 壁 y=7280 の x=910〜1710 が開口なら {"position": {"x": 910, "y": 7280}, "width": 800, "angle": 0}
  - **扉は必ず壁の内側に収める**（壁の端からはみ出さない）
- width は扉幅(mm)。swing は 1 または -1
- **扉の angle は、その扉が付いている壁の向きと必ず一致させる**
  - 上下の壁（水平な壁＝y が同じ2点を結ぶ壁）に付く扉 → angle は 0
  - 左右の壁（垂直な壁＝x が同じ2点を結ぶ壁）に付く扉 → angle は 90
  - 使うのは 0 と 90 だけ。180 や 270 は使わない（開く向きは swing で表す）
- 窓は start/end の2点（壁上の線分）
- **窓の start/end は必ず同じ壁の線上に置く**（壁から浮かせない・壁の端からはみ出さない）
  - 例: 上辺の壁 y=0 の x 910〜2730 に窓 → {"start": {"x": 910, "y": 0}, "end": {"x": 2730, "y": 0}}
  - 図面の窓記号（壁の中の二重線・細長い枠）の**両端の位置を寸法線と照らして**正確に読む

## 室名の対応（英語表記の図面も多い）
- Living Dining / LDK / LD / Living → ld
- Kitchen → kitchen
- Pantry / Closet / Cloak / Walk-In Closet / WIC / Storage / 物入 / 収納 → storage
- Laundry / Sanitary / Washroom / 洗面 / 脱衣 → washroom
- Lavatory / Toilet / WC / トイレ → toilet
- Bathroom / Bath / UB / 浴室 → bathroom
- Entrance / 玄関 → entrance
- Hall / Corridor / 廊下 / ホール → hallway
- Porch / Pouch / Deck / Terrace / ポーチ → porch
- Room / Bedroom / Study / 洋室 / 寝室 → western
- Japanese Room / 和室 → japanese
- Void / 吹抜 → void
- name は図面の表記をそのまま使う（Living Dining なら "Living Dining"）。type だけ上の表で決める

## 部屋タイプ（type はこの一覧のみ）
ld, kitchen, bathroom, toilet, washroom, japanese, western, hallway, entrance, stairs, storage, porch, attic, void, other

- 図面の表記を優先: 「洗面」「脱衣」→ washroom、「WC」「トイレ」→ toilet、「L/D」「LDK」のLD部分→ ld
- 廊下・ホール・階段前の通路 → hallway（areaJo なし）。トイレや各室の扉が開く先が通路なら必ず hallway を置く
- 吹抜のみ void（塗りつぶし領域として出力。空白のままにしない）
- 階段室は rooms に入れず stairs 配列へ（polygon + direction: up/down + name）
- 階段幅 widthMm は 910（省略時も910）。上り方向に垂直な方向の寸法。ポリゴン幅もこれに合わせる
- 階段の layout: straight（直線）| turn-right（右回り）| turn-left（左回り）。省略時 straight
- 階段の orientation: up | down | left | right（上り方向）。省略時は形状から推定
- hallway と stairs には areaJo を含めない

## 設備（fixtures）
type: bathtub, toilet, sink, stove, kitchen_sink, refrigerator, washer, car
浴室→bathtub、トイレ→toilet、洗面→sink、コンロ→stove、キッチンシンク→kitchen_sink
冷蔵庫・「冷」記号→refrigerator、洗濯機・「洗」記号→washer、駐車場の車アウトライン→car
冷蔵庫・洗濯機は正方形に近い枠（約500×500mm）、車は上面図（約1800×4200mm、駐車マスに合わせる）

**設備は必ず次の形式で出力する（x/y や depth を直接書かない）**
{"id": "fx1", "type": "bathtub", "position": {"x": 2730, "y": 3640}, "width": 1600, "height": 800}
- position は設備を囲む長方形の**左上**の座標（mm）。中心ではない
- width は x 方向、height は y 方向の寸法（mm）。奥行きも height で表す
- 縦向きに置く場合は angle（度）を付けてもよい（省略時 0）

## 出力JSONスキーマ
{
  "title": "物件名（図面タイトルがあれば使用）",
  "floors": [
    {
      "id": "1f",
      "name": "1F",
      "label": "1階",
      "rooms": [
        {
          "id": "ld",
          "name": "LD",
          "type": "ld",
          "areaJo": 13.2,
          "polygon": [
            {"x": 1800, "y": 1800},
            {"x": 5400, "y": 1800},
            {"x": 5400, "y": 4200},
            {"x": 1800, "y": 4200}
          ]
        }
      ],
      "walls": [
        {"id": "w1", "start": {"x": 0, "y": 0}, "end": {"x": 5400, "y": 0}, "exterior": true}
      ],
      "doors": [
        {"id": "d1", "position": {"x": 2700, "y": 4200}, "width": 800, "angle": 0, "swing": 1, "kind": "swing"}
      ],
      "windows": [
        {"id": "win1", "start": {"x": 2000, "y": 0}, "end": {"x": 3500, "y": 0}, "kind": "sliding"}
      ],
      "fixtures": [],
      "stairs": []
    }
  ]
}

## 扉・窓の種類
扉 kind（省略時 swing）: swing（片開き）, double_swing（両開き）, parent_child（親子戸）, sliding（片引き）, double_sliding（引き違い）, pocket（引き込み）, folding（折れ戸）, double_folding（両折れ）, opening（開口）
窓 kind（省略時 sliding）: sliding（引き違い）, fixed（嵌め殺し）, casement（開き）, double_casement（両開き）, awning（すべり出し）, floor（掃き出し）, high（高窓）

## 品質要件
- 図面に複数階があれば floors に各階を追加
- **外壁（exterior: true）は建物外周を一周する閉じた輪郭として必ず出力**（欠け・途切れ禁止）
- 寸法線の数値と部屋サイズが矛盾しないよう整合させる
- **扉（doors）と窓（windows）は図面に見えるものを必ずすべて出力**（空配列にしない。入口・各部屋の戸・掃き出し窓などを漏らさない）
- 扉 width は mm（例: 800）。position は壁上の点。angle は壁の向き（水平=0、垂直=90）
- 扉・窓の kind は図面の記号・表記から推定して付与する
- 省略せず、認識できる部屋・壁・扉・窓をすべて含める
- JSONのみ出力（説明文・マークダウン不可）`
