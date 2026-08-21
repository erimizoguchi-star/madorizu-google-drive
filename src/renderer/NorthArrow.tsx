import { NORTH_ARROW } from './styles'

interface NorthArrowProps {
  x: number
  y: number
  size?: number
}

/** 参考間取図風の8方位コンパス */
export function NorthArrow({ x, y, size = NORTH_ARROW.size }: NorthArrowProps) {
  const s = size
  const color = NORTH_ARROW.color
  const accent = NORTH_ARROW.accent
  const tips: { angle: number; len: number; fill: string }[] = [
    { angle: -90, len: 1, fill: accent },
    { angle: -45, len: 0.55, fill: color },
    { angle: 0, len: 0.72, fill: color },
    { angle: 45, len: 0.55, fill: color },
    { angle: 90, len: 0.72, fill: color },
    { angle: 135, len: 0.55, fill: color },
    { angle: 180, len: 0.72, fill: color },
    { angle: 225, len: 0.55, fill: color },
  ]

  return (
    <g className="north-arrow" transform={`translate(${x}, ${y})`} pointerEvents="none">
      <circle r={s * 0.12} fill="#FFFFFF" stroke={color} strokeWidth={0.8} />
      {tips.map(({ angle, len, fill }) => {
        const rad = (angle * Math.PI) / 180
        const tipX = Math.cos(rad) * s * 0.48 * len
        const tipY = Math.sin(rad) * s * 0.48 * len
        const side = s * 0.08
        const px = Math.cos(rad + Math.PI / 2) * side
        const py = Math.sin(rad + Math.PI / 2) * side
        return (
          <polygon
            key={angle}
            points={`0,0 ${tipX + px * 0.15},${tipY + py * 0.15} ${tipX},${tipY} ${tipX - px * 0.15},${tipY - py * 0.15}`}
            fill={fill}
            opacity={angle === -90 ? 1 : 0.85}
          />
        )
      })}
      <text
        x={0}
        y={-s * 0.62}
        textAnchor="middle"
        fill={accent}
        fontSize={s * 0.38}
        fontFamily='"Noto Serif JP", "Hiragino Mincho ProN", serif'
        fontWeight={600}
        fontStyle="italic"
      >
        N
      </text>
    </g>
  )
}
