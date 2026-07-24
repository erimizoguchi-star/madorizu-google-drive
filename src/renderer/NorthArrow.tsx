import { NORTH_ARROW } from './styles'

interface NorthArrowProps {
  x: number
  y: number
  size?: number
}

/** 参考間取図風の方位記号 */
export function NorthArrow({ x, y, size = NORTH_ARROW.size }: NorthArrowProps) {
  const s = size
  const color = NORTH_ARROW.color
  return (
    <g className="north-arrow" transform={`translate(${x}, ${y})`} pointerEvents="none">
      <polygon
        points={`0,${-s * 0.55} ${s * 0.22},${s * 0.2} 0,${s * 0.05} ${-s * 0.22},${s * 0.2}`}
        fill={color}
      />
      <line
        x1={0}
        y1={s * 0.05}
        x2={0}
        y2={s * 0.42}
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <text
        x={0}
        y={s * 0.72}
        textAnchor="middle"
        fill={color}
        fontSize={s * 0.42}
        fontFamily='"Noto Sans JP", "Hiragino Sans", sans-serif'
        fontWeight={700}
      >
        N
      </text>
    </g>
  )
}
