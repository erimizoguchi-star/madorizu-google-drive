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
