/**
 * 元の平面図（画像）から、壁の線の位置を探す。
 * 間取図の通りをドラッグしたとき、近くにある平面図の壁の線へ吸い付かせるために使う。
 *
 * 画像の暗い画素（壁の黒い線）を、縦の列・横の行ごとに累積で数えておき、
 * 「この範囲の、この列にどれだけ黒い画素が並んでいるか」をすぐ求められるようにする。
 */
export interface DarkMap {
  width: number
  height: number
  /** colPrefix[x * (height + 1) + y] = 列 x の 0〜y-1 行目にある暗い画素の数 */
  colPrefix: Uint32Array
  /** rowPrefix[y * (width + 1) + x] = 行 y の 0〜x-1 列目にある暗い画素の数 */
  rowPrefix: Uint32Array
}

/** これより暗い画素を線とみなす（0〜255 の明るさ）。色付きの部屋の塗りは拾わない程度 */
const DARK_THRESHOLD = 110
/** 線とみなす最低の割合（範囲のうち何割が暗い画素か）。開口や文字で途切れる分を見込む */
const MIN_LINE_RATIO = 0.35

export function buildDarkMap(rgba: ArrayLike<number>, width: number, height: number): DarkMap {
  const colPrefix = new Uint32Array(width * (height + 1))
  const rowPrefix = new Uint32Array(height * (width + 1))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const alpha = rgba[i + 3] / 255
      // 透明な画素は白とみなす
      const lum = 255 - alpha * (255 - (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]))
      const dark = lum < DARK_THRESHOLD ? 1 : 0
      colPrefix[x * (height + 1) + y + 1] = colPrefix[x * (height + 1) + y] + dark
      rowPrefix[y * (width + 1) + x + 1] = rowPrefix[y * (width + 1) + x] + dark
    }
  }
  return { width, height, colPrefix, rowPrefix }
}

/** 画像から暗い画素の表を作る。大きい画像は長辺 maxSize に縮めて数える（scale = 縮めた倍率） */
export function darkMapFromImage(img: HTMLImageElement, maxSize = 2000): { map: DarkMap; scale: number } | null {
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return null
  const scale = Math.min(1, maxSize / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, cw, ch)
  const { data } = ctx.getImageData(0, 0, cw, ch)
  return { map: buildDarkMap(data, cw, ch), scale: cw / w }
}

/** 縦の線（列 x）の、行 y0〜y1 にある暗い画素の数 */
function darkInColumn(map: DarkMap, x: number, y0: number, y1: number): number {
  const base = x * (map.height + 1)
  return map.colPrefix[base + y1] - map.colPrefix[base + y0]
}

function darkInRow(map: DarkMap, y: number, x0: number, x1: number): number {
  const base = y * (map.width + 1)
  return map.rowPrefix[base + x1] - map.rowPrefix[base + x0]
}

/**
 * approx の近く（±radius）で、spans の範囲に沿って暗い画素がいちばん並んでいる線を探す。
 * すべて画像の画素単位。axis 'x' は縦の線（列）、'y' は横の線（行）。
 *
 * - 太い壁（黒く塗った壁）は、黒い帯の中央を返す
 * - 2本線で描いた壁（中が白い壁）は、maxThickness 以内に並ぶ2本の線の中央を返す
 * 見つからなければ null。
 */
export function findLineNear(
  map: DarkMap,
  axis: 'x' | 'y',
  approx: number,
  spans: Array<[number, number]>,
  radius: number,
  maxThickness: number
): number | null {
  const limit = axis === 'x' ? map.width : map.height
  const alongLimit = axis === 'x' ? map.height : map.width
  const clipped = spans
    .map(([a, b]) => [Math.max(0, Math.floor(Math.min(a, b))), Math.min(alongLimit, Math.ceil(Math.max(a, b)))])
    .filter(([a, b]) => b - a >= 1)
  const total = clipped.reduce((sum, [a, b]) => sum + (b - a), 0)
  // 画像の外側ばかりで、比べられるだけの長さがない
  if (total < 8) return null

  const lo = Math.max(0, Math.floor(approx - radius))
  const hi = Math.min(limit - 1, Math.ceil(approx + radius))
  if (hi < lo) return null

  const ratios: number[] = []
  for (let c = lo; c <= hi; c++) {
    let dark = 0
    for (const [a, b] of clipped) {
      dark += axis === 'x' ? darkInColumn(map, c, a, b) : darkInRow(map, c, a, b)
    }
    ratios.push(dark / total)
  }

  const peak = Math.max(...ratios)
  if (peak < MIN_LINE_RATIO) return null

  // 線とみなす列のまとまり（帯）を作る
  const cut = Math.max(MIN_LINE_RATIO, peak * 0.6)
  const runs: Array<{ start: number; end: number; best: number }> = []
  ratios.forEach((r, i) => {
    if (r < cut) return
    const last = runs[runs.length - 1]
    if (last && last.end === i - 1) {
      last.end = i
      last.best = Math.max(last.best, r)
    } else {
      runs.push({ start: i, end: i, best: r })
    }
  })
  const center = (run: { start: number; end: number }) => lo + (run.start + run.end) / 2

  // 指定位置にいちばん近い帯を基準にする（同じくらい濃い帯が複数あるときに、手元の線を選ぶ）
  const strong = runs.filter((run) => run.best >= peak * 0.8)
  const main = strong.reduce((a, b) => (Math.abs(center(a) - approx) <= Math.abs(center(b) - approx) ? a : b))

  // 2本線の壁: 壁の厚み以内に、同じくらい濃いもう1本の線があれば、その中央
  const partner = runs
    .filter((run) => run !== main && run.best >= main.best * 0.6)
    .filter((run) => Math.abs(center(run) - center(main)) <= maxThickness)
    .sort((a, b) => Math.abs(center(a) - center(main)) - Math.abs(center(b) - center(main)))[0]
  return partner ? (center(main) + center(partner)) / 2 : center(main)
}
