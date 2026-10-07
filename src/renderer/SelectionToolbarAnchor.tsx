import type { ReactNode } from 'react'
import { useZoom } from '../components/zoomContext'

/**
 * その場メニューを、選んだ要素の上（図面の座標 x, y）に置く。
 * 図面と一緒に拡大縮小すると縮小時に読めなくなるので、拡大率で割り戻して画面上の大きさを一定にする。
 */
export function SelectionToolbarAnchor({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const zoom = useZoom()
  return (
    <div
      className="selection-toolbar-anchor"
      data-no-pan
      style={{
        left: x,
        top: y - 8 / zoom,
        transform: `translate(-50%, -100%) scale(${1 / zoom})`,
      }}
    >
      {children}
    </div>
  )
}
