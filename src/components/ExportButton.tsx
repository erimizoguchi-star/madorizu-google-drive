import { CANVAS } from '../renderer/styles'

interface ExportButtonProps {
  targetId: string
  filename?: string
}

export function ExportButton({ targetId, filename = 'madorizu' }: ExportButtonProps) {
  const exportSvg = () => {
    const container = document.getElementById(targetId)
    if (!container) return

    const svgs = container.querySelectorAll('svg')
    if (svgs.length === 0) return

    const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    let totalWidth = 0
    let maxHeight = 0
    const gap = 40

    svgs.forEach((svg, i) => {
      const clone = svg.cloneNode(true) as SVGSVGElement
      const vb = svg.viewBox.baseVal
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      g.setAttribute('transform', `translate(${totalWidth}, 0)`)
      g.appendChild(clone)
      wrapper.appendChild(g)
      totalWidth += vb.width + (i < svgs.length - 1 ? gap : 0)
      maxHeight = Math.max(maxHeight, vb.height)
    })

    wrapper.setAttribute('viewBox', `0 0 ${totalWidth} ${maxHeight}`)
    wrapper.setAttribute('width', String(totalWidth))
    wrapper.setAttribute('height', String(maxHeight))
    wrapper.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    const blob = new Blob([new XMLSerializer().serializeToString(wrapper)], {
      type: 'image/svg+xml',
    })
    download(blob, `${filename}.svg`)
  }

  const exportPng = async () => {
    const container = document.getElementById(targetId)
    if (!container) return

    const svgs = container.querySelectorAll('svg')
    if (svgs.length === 0) return

    const gap = 40
    let totalWidth = 0
    let maxHeight = 0
    const canvases: HTMLCanvasElement[] = []

    for (const svg of svgs) {
      const vb = svg.viewBox.baseVal
      const canvas = document.createElement('canvas')
      const scale = 2
      canvas.width = vb.width * scale
      canvas.height = vb.height * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      ctx.scale(scale, scale)
      ctx.fillStyle = CANVAS.background
      ctx.fillRect(0, 0, vb.width, vb.height)

      const svgData = new XMLSerializer().serializeToString(svg)
      const img = new Image()
      const url = URL.createObjectURL(
        new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
      )
      await new Promise<void>((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, vb.width, vb.height)
          URL.revokeObjectURL(url)
          resolve()
        }
        img.src = url
      })

      canvases.push(canvas)
      totalWidth += vb.width + gap
      maxHeight = Math.max(maxHeight, vb.height)
    }

    const finalCanvas = document.createElement('canvas')
    const scale = 2
    finalCanvas.width = (totalWidth - gap) * scale
    finalCanvas.height = maxHeight * scale
    const ctx = finalCanvas.getContext('2d')
    if (!ctx) return

    ctx.scale(scale, scale)
    ctx.fillStyle = CANVAS.background
    ctx.fillRect(0, 0, totalWidth - gap, maxHeight)

    let x = 0
    for (const canvas of canvases) {
      ctx.drawImage(canvas, x, 0, canvas.width / scale, canvas.height / scale)
      x += canvas.width / scale + gap
    }

    finalCanvas.toBlob((blob) => {
      if (blob) download(blob, `${filename}.png`)
    }, 'image/png')
  }

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="export-buttons">
      <button type="button" onClick={exportSvg} className="btn btn-secondary">
        SVGで保存
      </button>
      <button type="button" onClick={exportPng} className="btn btn-primary">
        PNGで保存
      </button>
    </div>
  )
}
