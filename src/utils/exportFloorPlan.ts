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

function buildCombinedSvg(container: HTMLElement): SVGSVGElement | null {
  const svgs = container.querySelectorAll('svg')
  if (svgs.length === 0) return null

  const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const labels = floorLabelsOf(svgs)
  let totalWidth = 0
  let maxHeight = 0

  svgs.forEach((svg, i) => {
    const clone = svg.cloneNode(true) as SVGSVGElement
    const vb = svg.viewBox.baseVal
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('transform', `translate(${totalWidth}, 0)`)
    g.appendChild(clone)
    if (labels?.[i]) {
      const anchor = floorLabelAnchor(svg)
      maxHeight = Math.max(maxHeight, anchor.y)
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('x', String(anchor.x))
      text.setAttribute('y', String(anchor.y))
      text.setAttribute('text-anchor', 'end')
      text.setAttribute('font-family', LABEL.fontFamily)
      text.setAttribute('font-size', String(FLOOR_LABEL_SIZE))
      text.setAttribute('font-weight', '600')
      text.setAttribute('fill', FLOOR_LABEL_COLOR)
      text.textContent = labels[i]
      g.appendChild(text)
    }
    wrapper.appendChild(g)
    totalWidth += vb.width + (i < svgs.length - 1 ? FLOOR_GAP : 0)
    maxHeight = Math.max(maxHeight, vb.height)
  })
  if (labels) maxHeight += FLOOR_LABEL_BAND

  wrapper.setAttribute('viewBox', `0 0 ${totalWidth} ${maxHeight}`)
  wrapper.setAttribute('width', String(totalWidth))
  wrapper.setAttribute('height', String(maxHeight))
  wrapper.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return wrapper
}

export async function renderFloorPlanCanvas(targetId: string): Promise<HTMLCanvasElement | null> {
  const container = document.getElementById(targetId)
  if (!container) return null

  const svgs = container.querySelectorAll('svg')
  if (svgs.length === 0) return null

  const labels = floorLabelsOf(svgs)
  let totalWidth = 0
  let maxHeight = 0
  const canvases: HTMLCanvasElement[] = []
  const anchors: { x: number; y: number }[] = []

  for (const svg of svgs) {
    const vb = svg.viewBox.baseVal
    const canvas = document.createElement('canvas')
    canvas.width = vb.width * EXPORT_SCALE
    canvas.height = vb.height * EXPORT_SCALE
    const ctx = canvas.getContext('2d')
    if (!ctx) continue

    ctx.scale(EXPORT_SCALE, EXPORT_SCALE)
    ctx.fillStyle = CANVAS.background
    ctx.fillRect(0, 0, vb.width, vb.height)

    const svgData = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' }))
    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, vb.width, vb.height)
        URL.revokeObjectURL(url)
        resolve()
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('SVGの描画に失敗しました'))
      }
      img.src = url
    })

    canvases.push(canvas)
    if (labels) {
      const anchor = floorLabelAnchor(svg)
      anchors.push(anchor)
      maxHeight = Math.max(maxHeight, anchor.y)
    }
    totalWidth += vb.width + FLOOR_GAP
    maxHeight = Math.max(maxHeight, vb.height)
  }

  if (labels) maxHeight += FLOOR_LABEL_BAND
  const finalCanvas = document.createElement('canvas')
  finalCanvas.width = (totalWidth - FLOOR_GAP) * EXPORT_SCALE
  finalCanvas.height = maxHeight * EXPORT_SCALE
  const ctx = finalCanvas.getContext('2d')
  if (!ctx) return null

  ctx.scale(EXPORT_SCALE, EXPORT_SCALE)
  ctx.fillStyle = CANVAS.background
  ctx.fillRect(0, 0, totalWidth - FLOOR_GAP, maxHeight)

  if (labels) await document.fonts?.ready
  let x = 0
  canvases.forEach((canvas, i) => {
    const width = canvas.width / EXPORT_SCALE
    const height = canvas.height / EXPORT_SCALE
    ctx.drawImage(canvas, x, 0, width, height)
    const anchor = anchors[i]
    if (labels?.[i] && anchor) {
      ctx.save()
      ctx.font = `600 ${FLOOR_LABEL_SIZE}px ${LABEL.fontFamily}`
      ctx.fillStyle = FLOOR_LABEL_COLOR
      ctx.textAlign = 'right'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(labels[i], x + anchor.x, anchor.y)
      ctx.restore()
    }
    x += width + FLOOR_GAP
  })

  return finalCanvas
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
