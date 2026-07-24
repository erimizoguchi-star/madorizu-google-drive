import { CANVAS } from '../renderer/styles'

const EXPORT_SCALE = 2
const FLOOR_GAP = 40

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
  let totalWidth = 0
  let maxHeight = 0

  svgs.forEach((svg, i) => {
    const clone = svg.cloneNode(true) as SVGSVGElement
    const vb = svg.viewBox.baseVal
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('transform', `translate(${totalWidth}, 0)`)
    g.appendChild(clone)
    wrapper.appendChild(g)
    totalWidth += vb.width + (i < svgs.length - 1 ? FLOOR_GAP : 0)
    maxHeight = Math.max(maxHeight, vb.height)
  })

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

  let totalWidth = 0
  let maxHeight = 0
  const canvases: HTMLCanvasElement[] = []

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
    totalWidth += vb.width + FLOOR_GAP
    maxHeight = Math.max(maxHeight, vb.height)
  }

  const finalCanvas = document.createElement('canvas')
  finalCanvas.width = (totalWidth - FLOOR_GAP) * EXPORT_SCALE
  finalCanvas.height = maxHeight * EXPORT_SCALE
  const ctx = finalCanvas.getContext('2d')
  if (!ctx) return null

  ctx.scale(EXPORT_SCALE, EXPORT_SCALE)
  ctx.fillStyle = CANVAS.background
  ctx.fillRect(0, 0, totalWidth - FLOOR_GAP, maxHeight)

  let x = 0
  for (const canvas of canvases) {
    ctx.drawImage(canvas, x, 0, canvas.width / EXPORT_SCALE, canvas.height / EXPORT_SCALE)
    x += canvas.width / EXPORT_SCALE + FLOOR_GAP
  }

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
