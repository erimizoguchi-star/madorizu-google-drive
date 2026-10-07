import { CANVAS, LABEL } from '../renderer/styles'

const EXPORT_SCALE = 2
const FLOOR_GAP = 40
/** 階名の文字の大きさ（間取図と同じ単位。1単位 = 10mm） */
const FLOOR_LABEL_SIZE = 32
/** 建物の下端から階名のベースラインまで */
const FLOOR_LABEL_OFFSET = FLOOR_LABEL_SIZE + 8
/** 階名の下に足す余白 */
const FLOOR_LABEL_BAND = 16
const FLOOR_LABEL_COLOR = '#222222'

/**
 * 階が複数あるときだけ、各階の右下に階名（「1階」「2F」など）を描く。
 * 画面では階名を HTML で出しているので、図面の SVG だけを並べると出力に階名が入らない。
 */
function floorLabelsOf(svgs: ArrayLike<SVGSVGElement>): string[] | null {
  if (svgs.length < 2) return null
  const labels = Array.from(svgs, (svg) => svg.dataset.floorLabel?.trim() ?? '')
  return labels.some(Boolean) ? labels : null
}

/**
 * 階名の右端・ベースライン（その階の図面の左上が原点）。建物（部屋の範囲）の右下に置く。
 * 図面の端を基準にすると、車や外の設備で余白が大きい階だけ階名が建物から離れてしまう
 */
function floorLabelAnchor(svg: SVGSVGElement): { x: number; y: number } {
  const vb = svg.viewBox.baseVal
  // 見た目の範囲（getBBox）は床模様の切り抜き前の線まで含んで建物より広くなるので、
  // FloorCanvas が部屋の座標から求めた右下を使う
  const [x, y] = (svg.dataset.buildingCorner ?? '').split(',').map(Number)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: vb.width, y: vb.height }
  return { x, y: y + FLOOR_LABEL_OFFSET }
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** 出力する1つの階：図面（SVG）と、並べた位置・大きさ・階名 */
interface PlacedFloor {
  svg: SVGSVGElement
  x: number
  y: number
  width: number
  height: number
  label: string | null
  labelAnchor: { x: number; y: number } | null
}

/**
 * 各階を並べた位置を、画面で並んでいる位置からそのまま写し取る（並べ方・そろえ方を画面と出力で一致させる）。
 * 画面に出ていないとき（大きさが測れないとき）は、従来どおり上をそろえて横に並べる。
 * 位置は図面の単位（1単位 = 1px で描いているので、画面の px を拡大率で割った値）。
 */
function placeFloors(container: HTMLElement): { floors: PlacedFloor[]; width: number; height: number } | null {
  const svgs = Array.from(container.querySelectorAll<SVGSVGElement>('svg.floor-canvas'))
  if (svgs.length === 0) return null
  const labels = floorLabelsOf(svgs)

  const stage = svgs[0].closest('.floors-container') as HTMLElement | null
  const rects = svgs.map((svg) => svg.getBoundingClientRect())
  const zoom = stage && stage.offsetWidth > 0 ? stage.getBoundingClientRect().width / stage.offsetWidth : 0
  const measurable = zoom > 0 && rects.every((r) => r.width > 0)
  const minLeft = Math.min(...rects.map((r) => r.left))
  const minTop = Math.min(...rects.map((r) => r.top))

  let nextX = 0
  const floors = svgs.map((svg, i): PlacedFloor => {
    const vb = svg.viewBox.baseVal
    const x = measurable ? (rects[i].left - minLeft) / zoom : nextX
    const y = measurable ? (rects[i].top - minTop) / zoom : 0
    nextX += vb.width + FLOOR_GAP
    return {
      svg,
      x,
      y,
      width: vb.width,
      height: vb.height,
      label: labels?.[i] || null,
      labelAnchor: labels?.[i] ? floorLabelAnchor(svg) : null,
    }
  })

  const width = Math.max(...floors.map((f) => f.x + f.width))
  const height =
    Math.max(...floors.map((f) => f.y + Math.max(f.height, f.labelAnchor ? f.labelAnchor.y : 0))) +
    (labels ? FLOOR_LABEL_BAND : 0)
  return { floors, width, height }
}

function buildCombinedSvg(container: HTMLElement): SVGSVGElement | null {
  const placed = placeFloors(container)
  if (!placed) return null

  const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  for (const floor of placed.floors) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('transform', `translate(${floor.x}, ${floor.y})`)
    g.appendChild(floor.svg.cloneNode(true))
    if (floor.label && floor.labelAnchor) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('x', String(floor.labelAnchor.x))
      text.setAttribute('y', String(floor.labelAnchor.y))
      text.setAttribute('text-anchor', 'end')
      text.setAttribute('font-family', LABEL.fontFamily)
      text.setAttribute('font-size', String(FLOOR_LABEL_SIZE))
      text.setAttribute('font-weight', '600')
      text.setAttribute('fill', FLOOR_LABEL_COLOR)
      text.textContent = floor.label
      g.appendChild(text)
    }
    wrapper.appendChild(g)
  }

  wrapper.setAttribute('viewBox', `0 0 ${placed.width} ${placed.height}`)
  wrapper.setAttribute('width', String(placed.width))
  wrapper.setAttribute('height', String(placed.height))
  wrapper.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return wrapper
}

/** 1つの階の図面（SVG）を画像にする */
async function renderSvg(svg: SVGSVGElement, width: number, height: number): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' })
  )
  const img = new Image()
  img.width = width
  img.height = height
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVGの描画に失敗しました'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
  return img
}

export async function renderFloorPlanCanvas(targetId: string): Promise<HTMLCanvasElement | null> {
  const container = document.getElementById(targetId)
  if (!container) return null
  const placed = placeFloors(container)
  if (!placed) return null

  const images = await Promise.all(placed.floors.map((f) => renderSvg(f.svg, f.width, f.height)))

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(placed.width * EXPORT_SCALE)
  canvas.height = Math.ceil(placed.height * EXPORT_SCALE)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.scale(EXPORT_SCALE, EXPORT_SCALE)
  ctx.fillStyle = CANVAS.background
  ctx.fillRect(0, 0, placed.width, placed.height)

  if (placed.floors.some((f) => f.label)) await document.fonts?.ready
  placed.floors.forEach((floor, i) => {
    ctx.drawImage(images[i], floor.x, floor.y, floor.width, floor.height)
    if (floor.label && floor.labelAnchor) {
      ctx.save()
      ctx.font = `600 ${FLOOR_LABEL_SIZE}px ${LABEL.fontFamily}`
      ctx.fillStyle = FLOOR_LABEL_COLOR
      ctx.textAlign = 'right'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(floor.label, floor.x + floor.labelAnchor.x, floor.y + floor.labelAnchor.y)
      ctx.restore()
    }
  })

  return canvas
}

export function exportFloorPlanSvg(targetId: string, filename: string) {
  const container = document.getElementById(targetId)
  if (!container) return

  const wrapper = buildCombinedSvg(container)
  if (!wrapper) return

  const blob = new Blob([new XMLSerializer().serializeToString(wrapper)], {
    type: 'image/svg+xml',
  })
  downloadBlob(blob, `${filename}.svg`)
}

export async function exportFloorPlanPng(targetId: string, filename: string) {
  const canvas = await renderFloorPlanCanvas(targetId)
  if (!canvas) return

  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `${filename}.png`)
  }, 'image/png')
}

export async function exportFloorPlanJpeg(targetId: string, filename: string) {
  const canvas = await renderFloorPlanCanvas(targetId)
  if (!canvas) return

  canvas.toBlob(
    (blob) => {
      if (blob) downloadBlob(blob, `${filename}.jpg`)
    },
    'image/jpeg',
    0.92
  )
}

/**
 * 間取図を JPEG の Blob にする（ダウンロードせず、他のシステムへ送るとき用）。
 * 送り先の上限に収まるよう、大きすぎるときは画質を下げる。
 */
export async function renderFloorPlanJpegBlob(targetId: string, maxBytes = 3_500_000): Promise<Blob | null> {
  const canvas = await renderFloorPlanCanvas(targetId)
  if (!canvas) return null
  const toBlob = (quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  for (const quality of [0.92, 0.8, 0.65]) {
    const blob = await toBlob(quality)
    if (blob && blob.size <= maxBytes) return blob
  }
  return toBlob(0.5)
}

export async function exportFloorPlanPdf(targetId: string, filename: string) {
  const canvas = await renderFloorPlanCanvas(targetId)
  if (!canvas) return

  const { jsPDF } = await import('jspdf')
  const width = canvas.width
  const height = canvas.height
  const orientation = width >= height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [width, height],
    hotfixes: ['px_scaling'],
  })

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
  pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height)
  pdf.save(`${filename}.pdf`)
}
