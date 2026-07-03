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
export type RoomFillPattern = 'none' | 'hatch' | 'grid' | 'tatami'

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
}

export interface Wall {
  id: string
  start: Point
  end: Point
  /** 外壁かどうか */
  exterior?: boolean
}

export interface Door {
  id: string
  position: Point
  width: number
  /** 壁に沿った角度（度） */
  angle: number
  /** 開き方向: 1 = 反時計回り, -1 = 時計回り */
  swing: 1 | -1
}

export interface Window {
  id: string
  start: Point
  end: Point
}

export type FixtureType = 'bathtub' | 'toilet' | 'sink' | 'stove' | 'kitchen_sink'

export interface Fixture {
  id: string
  type: FixtureType
  position: Point
  width: number
  height: number
  angle?: number
}

export interface Stair {
  id: string
  polygon: Point[]
  direction: 'up' | 'down'
  /** 表示名（省略時は「階段」） */
  name?: string
  showName?: boolean
  labelFontSize?: number
  nameLabelOffset?: Point
}

export interface Floor {
  id: string
  name: string
  label: string
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
}

export interface AnalysisResult {
  floorPlan: FloorPlan
  confidence: number
  notes: string[]
  mode: 'demo' | 'gemini'
  sourcePreviewUrl?: string
  sourceFileName?: string
}
