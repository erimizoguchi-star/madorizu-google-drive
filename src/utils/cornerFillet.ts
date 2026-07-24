import type { Point } from '../types/floorPlan'
import { mmToSvgUnits } from './roomGeometry'

const EPS = 1e-4

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function normalize(dx: number, dy: number): Point | null {
  const len = Math.hypot(dx, dy)
  if (len < EPS) return null
  return { x: dx / len, y: dy / len }
}

function sharpPolygonPath(polygon: Point[]): string {
  if (polygon.length === 0) return ''
  const [first, ...rest] = polygon
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')} Z`
}

/** 各頂点のアール（SVG単位）。隣接辺長を超えないようクランプする */
export function resolveCornerRadiiSvg(polygon: Point[], cornerRadiiMm?: number[]): number[] {
  const n = polygon.length
  const radii = Array.from({ length: n }, (_, i) => {
    const mm = cornerRadiiMm?.[i]
    return typeof mm === 'number' && Number.isFinite(mm) && mm > 0 ? mmToSvgUnits(mm) : 0
  })

  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n]
    const curr = polygon[i]
    const next = polygon[(i + 1) % n]
    const maxR = Math.min(dist(prev, curr), dist(curr, next)) / 2
    radii[i] = Math.max(0, Math.min(radii[i], maxR))
  }

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const edgeLen = dist(polygon[i], polygon[j])
    const sum = radii[i] + radii[j]
    if (sum > edgeLen && sum > EPS) {
      const scale = (edgeLen - EPS) / sum
      radii[i] *= scale
      radii[j] *= scale
    }
  }

  return radii
}

export function hasAnyCornerRadius(cornerRadiiMm?: number[]): boolean {
  return (cornerRadiiMm ?? []).some((r) => typeof r === 'number' && r > 0)
}

/**
 * 直交多角形の角を円弧で面取りした SVG path。
 * 凸角・凹角の両方に対応（時計回りポリゴン想定）。
 */
export function filletedPolygonPath(polygon: Point[], cornerRadiiMm?: number[]): string {
  if (polygon.length < 3) return ''
  if (!hasAnyCornerRadius(cornerRadiiMm)) return sharpPolygonPath(polygon)

  const radii = resolveCornerRadiiSvg(polygon, cornerRadiiMm)
  if (radii.every((r) => r < EPS)) return sharpPolygonPath(polygon)

  const n = polygon.length
  const parts: string[] = []
  let started = false

  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n]
    const curr = polygon[i]
    const next = polygon[(i + 1) % n]
    const r = radii[i]

    const inDir = normalize(curr.x - prev.x, curr.y - prev.y)
    const outDir = normalize(next.x - curr.x, next.y - curr.y)
    if (!inDir || !outDir) continue

    if (r < EPS) {
      if (!started) {
        parts.push(`M ${curr.x} ${curr.y}`)
        started = true
      } else {
        parts.push(`L ${curr.x} ${curr.y}`)
      }
      continue
    }

    const p1 = { x: curr.x - inDir.x * r, y: curr.y - inDir.y * r }
    const p2 = { x: curr.x + outDir.x * r, y: curr.y + outDir.y * r }

    // SVG（y下向き）で時計回りポリゴン: 凸角は左折(cross>0)、凹角は右折(cross<0)
    // 角を切り落とす短い円弧は、凸で反時計(sweep=0)、凹で時計(sweep=1)
    const cross = inDir.x * outDir.y - inDir.y * outDir.x
    const sweep = cross > 0 ? 0 : 1

    if (!started) {
      parts.push(`M ${p1.x} ${p1.y}`)
      started = true
    } else {
      parts.push(`L ${p1.x} ${p1.y}`)
    }
    parts.push(`A ${r} ${r} 0 0 ${sweep} ${p2.x} ${p2.y}`)
  }

  parts.push('Z')
  return parts.join(' ')
}

/** 頂点数が変わったときに長さを合わせる。余った値は切り捨て、足りない分は 0 */
export function resizeCornerRadiiMm(
  cornerRadiiMm: number[] | undefined,
  vertexCount: number
): number[] | undefined {
  if (!cornerRadiiMm || cornerRadiiMm.length === 0) return undefined
  if (vertexCount <= 0) return undefined
  const next = Array.from({ length: vertexCount }, (_, i) => {
    const v = cornerRadiiMm[i]
    return typeof v === 'number' && v > 0 ? v : 0
  })
  return next.some((v) => v > 0) ? next : undefined
}

export function setAllCornerRadiiMm(vertexCount: number, radiusMm: number): number[] | undefined {
  if (vertexCount <= 0 || radiusMm <= 0) return undefined
  return Array.from({ length: vertexCount }, () => radiusMm)
}

export function setCornerRadiusMmAt(
  cornerRadiiMm: number[] | undefined,
  vertexCount: number,
  index: number,
  radiusMm: number
): number[] | undefined {
  if (index < 0 || index >= vertexCount) return cornerRadiiMm
  const next = Array.from({ length: vertexCount }, (_, i) => {
    if (i === index) return Math.max(0, radiusMm)
    const v = cornerRadiiMm?.[i]
    return typeof v === 'number' && v > 0 ? v : 0
  })
  return next.some((v) => v > 0) ? next : undefined
}
