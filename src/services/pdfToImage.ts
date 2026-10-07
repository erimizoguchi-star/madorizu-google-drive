import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

export interface PdfPageImage {
  dataUrl: string
  blob: Blob
  width: number
  height: number
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
}

export function isSupportedFloorPlanFile(file: File): boolean {
  return isImageFile(file) || isPdfFile(file)
}

async function loadPdf(file: File) {
  const data = await file.arrayBuffer()
  return getDocument({ data }).promise
}

export async function getPdfPageCount(file: File): Promise<number> {
  const pdf = await loadPdf(file)
  return pdf.numPages
}

export async function renderPdfPage(file: File, pageNumber: number, scale = 2): Promise<PdfPageImage> {
  const pdf = await loadPdf(file)

  if (pageNumber < 1 || pageNumber > pdf.numPages) {
    throw new Error(`PDFのページ ${pageNumber} は存在しません（全 ${pdf.numPages} ページ）`)
  }

  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas の初期化に失敗しました')
  }

  await page.render({ canvasContext: context, viewport, canvas }).promise

  const dataUrl = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PDF画像の変換に失敗しました'))), 'image/png')
  })

  return {
    dataUrl,
    blob,
    width: viewport.width,
    height: viewport.height,
  }
}

export interface PreparedFloorPlanInput {
  previewUrl: string
  analysisFile: File
  sourceType: 'image' | 'pdf'
  pageCount: number
  selectedPage: number
}

export async function prepareFloorPlanInput(file: File, pageNumber = 1): Promise<PreparedFloorPlanInput> {
  if (isPdfFile(file)) {
    const pdf = await loadPdf(file)
    const pageCount = pdf.numPages
    const page = Math.min(Math.max(pageNumber, 1), pageCount)

    const pdfPage = await pdf.getPage(page)
    const scale = 2
    const viewport = pdfPage.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas の初期化に失敗しました')
    }

    await pdfPage.render({ canvasContext: context, viewport, canvas }).promise

    const dataUrl = canvas.toDataURL('image/png')
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PDF画像の変換に失敗しました'))), 'image/png')
    })

    const baseName = file.name.replace(/\.pdf$/i, '') || 'floor-plan'
    const analysisFile = new File([blob], `${baseName}-p${page}.png`, { type: 'image/png' })

    return {
      previewUrl: dataUrl,
      analysisFile,
      sourceType: 'pdf',
      pageCount,
      selectedPage: page,
    }
  }

  if (isImageFile(file)) {
    return {
      previewUrl: URL.createObjectURL(file),
      analysisFile: file,
      sourceType: 'image',
      pageCount: 1,
      selectedPage: 1,
    }
  }

  throw new Error('対応形式: PNG, JPG, WebP, PDF')
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('図面の画像を読み込めませんでした'))
    img.src = url
  })
}

/** 回した回数（右回りに 90° ずつ）を 0〜3 にそろえる */
export function normalizeQuarterTurns(turns: number): number {
  return ((Math.round(turns) % 4) + 4) % 4
}

/**
 * 読み込んだ図面を右回りに 90° × turns 回す。
 * 横向きの図面は、AI が読み取る前に正しい向きにしておく（文字や寸法が横倒しだと読み違えやすい）。
 * 回した画像は、そのまま重ね合わせにも使う。
 */
export async function rotatePreparedInput(
  input: PreparedFloorPlanInput,
  turns: number
): Promise<PreparedFloorPlanInput> {
  const quarter = normalizeQuarterTurns(turns)
  if (quarter === 0) return input
  const img = await loadImage(input.previewUrl)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = quarter % 2 ? h : w
  canvas.height = quarter % 2 ? w : h
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas の初期化に失敗しました')
  }
  // JPEG は透明を持てないので、回したときに背景が黒くならないよう白で塗っておく
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((quarter * Math.PI) / 2)
  context.drawImage(img, -w / 2, -h / 2)

  // 写真やスキャンの JPEG を PNG にすると何倍にも大きくなるので、元の形式に合わせる
  const type = input.analysisFile.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('図面を回せませんでした'))), type, 0.92)
  })
  const ext = type === 'image/jpeg' ? 'jpg' : 'png'
  const baseName = input.analysisFile.name.replace(/\.[^.]+$/, '') || 'floor-plan'
  return {
    ...input,
    previewUrl: URL.createObjectURL(blob),
    analysisFile: new File([blob], `${baseName}-rot${quarter * 90}.${ext}`, { type }),
  }
}
