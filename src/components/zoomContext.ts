import { createContext, useContext } from 'react'

/**
 * ZoomableView の今の表示倍率。取っ手やその場メニューを、拡大率にかかわらず
 * 画面上で同じ大きさに保つために使う（図面の単位で大きさを決めると、縮小時に小さくなりすぎる）。
 */
export const ZoomContext = createContext(1)

export function useZoom(): number {
  return useContext(ZoomContext)
}

/** 画面上で px ピクセルになる、図面の単位での長さ */
export function useScreenPx(px: number): number {
  return px / useZoom()
}
