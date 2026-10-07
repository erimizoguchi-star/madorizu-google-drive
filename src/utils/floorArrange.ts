import type { Floor, Point } from '../types/floorPlan'
import { isAreaJoHiddenByType } from '../constants/roomTypes'
import { polygonArea } from '../renderer/styles'
import { scaleFloor } from './gridLines'
import { svgUnitsToMm } from './roomGeometry'

/**
 * 階ごとの大きさをそろえる。
 * 階ごとに別の図面を解析すると、AI の寸法の読み違いで片方の階だけ大きく（小さく）描かれることがある。
 */

export interface BuildingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** 建物（部屋・階段）の外接矩形。部屋がなければ null */
export function buildingBox(floor: Floor): BuildingBox | null {
  const points = [...floor.rooms.flatMap((r) => r.polygon), ...floor.stairs.flatMap((s) => s.polygon)]
  if (points.length === 0) return null
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  }
}

/** 建物の幅・奥行（mm） */
export function buildingSizeMm(floor: Floor): { widthMm: number; depthMm: number } | null {
  const box = buildingBox(floor)
  if (!box) return null
  return { widthMm: svgUnitsToMm(box.maxX - box.minX), depthMm: svgUnitsToMm(box.maxY - box.minY) }
}

/** 1帖の面積（mm²）。表示の帖数と同じ 1.62㎡ */
const JO_MM2 = 1_620_000

/** これより差が小さければ「帖数と合っている」とみなす */
const AREA_SCALE_TOLERANCE = 0.02

/**
 * 図面に書かれた帖数から見た、この階の縮尺の直し方（長さの倍率）。
 * 部屋ごとに「帖数 ÷ 形の帖数」の平方根を求め、その中央値を使う（1部屋だけ帖数を読み違えていても引っぱられない）。
 * 帖数のある部屋が2つ未満、または差が 2% 未満なら null。
 */
export function areaScaleSuggestion(floor: Floor): { scale: number; rooms: number } | null {
  const ratios = floor.rooms
    .filter((room) => room.areaJo != null && room.areaJo > 0 && !isAreaJoHiddenByType(room.type))
    .map((room) => {
      // 表示用の帖数（小数1桁に丸める）ではなく、丸めない面積で比べる
      const shapeJo = (polygonArea(room.polygon) * svgUnitsToMm(1) ** 2) / JO_MM2
      return shapeJo > 0 ? Math.sqrt(room.areaJo! / shapeJo) : null
    })
    .filter((r): r is number => r != null && Number.isFinite(r))
    .sort((a, b) => a - b)
  if (ratios.length < 2) return null
  const mid = Math.floor(ratios.length / 2)
  const scale = ratios.length % 2 === 1 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2
  if (Math.abs(scale - 1) < AREA_SCALE_TOLERANCE) return null
  return { scale, rooms: ratios.length }
}

/** 階を、建物の左上を基準に縦横同じ倍率で拡大縮小する */
export function scaleFloorUniform(floor: Floor, scale: number): Floor {
  const box = buildingBox(floor)
  if (!box || !(scale > 0) || Math.abs(scale - 1) < 1e-6) return floor
  const origin: Point = { x: box.minX, y: box.minY }
  return scaleFloor(floor, origin, scale, scale)
}

/** 建物の幅が widthMm になるよう、縦横同じ倍率で拡大縮小する */
export function scaleFloorToWidth(floor: Floor, widthMm: number): Floor {
  const size = buildingSizeMm(floor)
  if (!size || size.widthMm <= 0 || !(widthMm > 0)) return floor
  return scaleFloorUniform(floor, widthMm / size.widthMm)
}
