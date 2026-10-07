export type RoomType =
  | 'ld'
  | 'kitchen'
  | 'bathroom'
  | 'toilet'
  | 'washroom'
  | 'japanese'
  | 'western'
  | 'hallway'
  | 'entrance'
  | 'stairs'
  | 'storage'
  | 'porch'
  | 'attic'
  | 'void'
  | 'other'

export interface Point {
  x: number
  y: number
}

/** 部屋の塗り模様 */
export type RoomFillPattern = 'none' | 'hatch' | 'grid' | 'tatami' | 'wood' | 'tile'

export interface Room {
  id: string
  name: string
  type: RoomType
  /** 多角形の頂点（時計回り） */
  polygon: Point[]
  /** 帖数（省略時は形状から自動計算） */
  areaJo?: number
  note?: string
  /** 部屋名を表示するか（省略時は表示） */
  showName?: boolean
  /** 帖数を表示するか（省略時は表示） */
  showAreaJo?: boolean
  /** 備考を表示するか（省略時は表示） */
  showNote?: boolean
  /** 部屋名のフォントサイズ pt（省略時は 24pt） */
  labelFontSize?: number
  /** 備考のフォントサイズ pt（省略時は部屋名の 70%） */
  noteFontSize?: number
  /** 部屋名ラベルの位置オフセット */
  nameLabelOffset?: Point
  /** 帖数ラベルの位置オフセット */
  areaLabelOffset?: Point
  /** 備考ラベルの位置オフセット */
  noteLabelOffset?: Point
  /** 塗り色の上書き（省略時は部屋タイプのデフォルト色） */
  fillColor?: string
  /** 模様の上書き（省略時は部屋タイプのデフォルト） */
  fillPattern?: RoomFillPattern
  /**
   * 各頂点の角アール（mm）。polygon と同じ順番・長さ。
   * 0 / 省略は直角。凸角・凹角どちらも可。
   */
  cornerRadiiMm?: number[]
}

export interface Wall {
  id: string
  start: Point
  end: Point
  /** 外壁かどうか */
  exterior?: boolean
  /**
   * 手動で追加・編集した壁。
   * 壁は通常、部屋の形から自動生成され、部屋を編集するたび作り直される。
   * このフラグが立っている壁は作り直しの対象外にして、編集内容を残す。
   */
  manual?: boolean
}

/** 片開き / 両開き / 片引き / 引き違い / 折れ戸 / 両折れ / 引き込み / 親子戸 / 開口 */
export type DoorKind =
  | 'swing'
  | 'double_swing'
  | 'sliding'
  | 'double_sliding'
  | 'folding'
  | 'double_folding'
  | 'pocket'
  | 'parent_child'
  | 'opening'

export interface Door {
  id: string
  position: Point
  width: number
  /** 壁に沿った角度（度）— 閉じたときの戸の向き */
  angle: number
  /** 開閉方向: 1 = 左開き（反時計回り）, -1 = 右開き（時計回り） */
  swing: 1 | -1
  /** 省略時は片開き戸 */
  kind?: DoorKind
}

/** 引き違い / 片引き / 引き込み / 折れ / 片開き / 両開き */
export type WindowKind =
  | 'sliding'
  | 'single_sliding'
  | 'pocket'
  | 'folding'
  | 'casement'
  | 'double_casement'
  /** 横すべり出し窓（上を軸に外へ開く。平面図では外側に破線の四角と、壁側を頂点とする破線の三角） */
  | 'awning'
  /** 縦すべり出し窓（縦の軸が窓の端から内側へすべりながら外へ開く） */
  | 'slide_out'
  /** FIX窓（はめ殺し） */
  | 'fix'
  /** 中央が FIX、両端が外へ開く縦すべり出しの連窓 */
  | 'fix_casement'

export interface Window {
  id: string
  start: Point
  end: Point
  /** 省略時は引き違い窓 */
  kind?: WindowKind
  /**
   * 開き窓・片引き・引き込みの向き。
   * start→end の進行方向に対して 1 = 右側、-1 = 左側。
   * 通常は建物の外側になるよう自動判定する（省略時は 1）。
   */
  outward?: 1 | -1
}

export type FixtureType =
  | 'bathtub'
  | 'toilet'
  | 'sink'
  | 'stove'
  | 'kitchen_sink'
  | 'refrigerator'
  | 'washer'
  | 'car'

export interface Fixture {
  id: string
  type: FixtureType
  position: Point
  width: number
  height: number
  angle?: number
}

/**
 * 段の形状。
 * - straight: 直線
 * - turn-right / turn-left: L字・上り終わりの側で曲がる（右回り＝上りながら右へ）
 * - turn-right-start / turn-left-start: L字・上り始めの側で曲がる
 * - u-right / u-left: U字（折り返し）
 */
export type StairLayout =
  | 'straight'
  | 'turn-right'
  | 'turn-left'
  | 'turn-right-start'
  | 'turn-left-start'
  | 'u-right'
  | 'u-left'

/** 上り方向（SVG座標: y が小さいほど上） */
export type StairOrientation = 'up' | 'down' | 'left' | 'right'

export interface Stair {
  id: string
  polygon: Point[]
  /**
   * この階での表記。up = この階から上る（1階・UP）、down = この階から下りる（2階・DN）。
   * down のときは、上り終わり側から下りの向きに矢印を描く
   */
  direction: 'up' | 'down'
  /** 段の形状: 直線 / 右回り / 左回り */
  layout?: StairLayout
  /** 上り方向（L字・U字は最初に上る向き。L字・上り始めで曲がる形は、曲がったあとの向き） */
  orientation?: StairOrientation
  /** 破断線を入れる（1階の描き方。破断線より先の段は破線、矢印は破断線まで） */
  cutLine?: boolean
  /** 階段幅 mm（省略時 910） */
  widthMm?: number
  /** 表示ラベル用。省略時は direction から UP / DN を出す */
  name?: string
  showName?: boolean
  labelFontSize?: number
  nameLabelOffset?: Point
}

/** 部屋・階段に紐づかない自由配置の文字 */
export interface TextLabel {
  id: string
  text: string
  position: Point
  /** フォントサイズ pt（省略時は LABEL.defaultFontSize） */
  fontSize?: number
  /** 回転（度）。省略時は 0 */
  angle?: number
}

/**
 * ユーザーが削除した壁の記録。
 * 壁は部屋の形から作り直されるため、消しただけでは部屋を動かすと復活してしまう。
 * 内壁は「接する2部屋の組」で覚えるので、部屋を動かしても消えたままにできる。
 */
export interface HiddenWall {
  /** 内壁: 接する2つの部屋（階段）のIDを並べたキー */
  pair?: string
  /** 外壁など、部屋の組で特定できないものは座標で覚える */
  start?: Point
  end?: Point
}

export interface Floor {
  id: string
  name: string
  label: string
  /** 削除済みの壁（自動生成で復活させない） */
  hiddenWalls?: HiddenWall[]
  rooms: Room[]
  walls: Wall[]
  doors: Door[]
  windows: Window[]
  fixtures: Fixture[]
  stairs: Stair[]
  /** 自由配置の文字（省略時は空） */
  texts?: TextLabel[]
}

/** 階の並べ方（画面と出力の両方に使う） */
export interface FloorLayout {
  /** row = 横に並べる（既定）、column = 縦に並べる */
  direction?: 'row' | 'column'
  /** 建物の外形をそろえる位置。横並びなら上・中央・下、縦並びなら左・中央・右（既定 start） */
  align?: 'start' | 'center' | 'end'
}

export interface FloorPlan {
  title: string
  floors: Floor[]
  /** 階の並べ方（省略時は横並び・上そろえ） */
  layout?: FloorLayout
  /** 1単位 = 何mm か（デフォルト 100mm） */
  scaleMm?: number
  /**
   * 座標の単位。アプリが書き出す JSON は 'svg'（内部単位）を明示する。
   * 未指定の場合は座標の大きさから推定する（AI 出力は mm）。
   */
  coordUnits?: 'mm' | 'svg'
}

export interface AnalysisResult {
  floorPlan: FloorPlan
  confidence: number
  notes: string[]
  mode: 'demo' | 'gemini'
  sourcePreviewUrl?: string
  sourceFileName?: string
}
