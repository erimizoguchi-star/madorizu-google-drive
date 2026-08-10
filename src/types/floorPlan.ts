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

/** 引き違い / 嵌め殺し / 開き / 両開き / すべり出し / 掃き出し / 高窓 */
export type WindowKind =
  | 'sliding'
  | 'fixed'
  | 'casement'
  | 'double_casement'
  | 'awning'
  | 'floor'
  | 'high'

export interface Window {
  id: string
  start: Point
  end: Point
  /** 省略時は引き違い窓 */
  kind?: WindowKind
  /**
   * すべり出し窓・開き窓が開く向き。
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

export type StairLayout = 'straight' | 'turn-right' | 'turn-left'

/** 上り方向（SVG座標: y が小さいほど上） */
export type StairOrientation = 'up' | 'down' | 'left' | 'right'

export interface Stair {
  id: string
  polygon: Point[]
  /** @deprecated orientation を優先。未設定時の上り/下り表示用 */
  direction: 'up' | 'down'
  /** 段の形状: 直線 / 右回り / 左回り */
  layout?: StairLayout
  /** 上り方向 */
  orientation?: StairOrientation
  /** 階段幅 mm（省略時 910） */
  widthMm?: number
  /** 表示名（省略時は「階段」） */
  name?: string
  showName?: boolean
  labelFontSize?: number
  nameLabelOffset?: Point
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
}

export interface FloorPlan {
  title: string
  floors: Floor[]
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
