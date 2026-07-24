import type { Fixture } from '../types/floorPlan'
import { FIXTURE, LABEL } from './styles'

interface FixtureRendererProps {
  fixture: Fixture
}

function markLabel(
  cx: number,
  cy: number,
  text: string,
  boxW: number,
  boxH: number,
  stroke: string,
  sw: number
) {
  return (
    <>
      <rect
        x={cx - boxW / 2}
        y={cy - boxH / 2}
        width={boxW}
        height={boxH}
        fill={FIXTURE.fill}
        stroke={stroke}
        strokeWidth={sw}
        rx={2}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill={stroke}
        fontSize={Math.min(boxW, boxH) * 0.55}
        fontFamily={LABEL.fontFamily}
        fontWeight={700}
        pointerEvents="none"
      >
        {text}
      </text>
    </>
  )
}

/** 上から見た車の簡略アウトライン */
function CarOutline({
  x,
  y,
  w,
  h,
  stroke,
  sw,
}: {
  x: number
  y: number
  w: number
  h: number
  stroke: string
  sw: number
}) {
  const bodyX = x + w * 0.08
  const bodyY = y + h * 0.12
  const bodyW = w * 0.84
  const bodyH = h * 0.76
  const cabinY = bodyY + bodyH * 0.22
  const cabinH = bodyH * 0.38
  const wheelR = Math.min(w, h) * 0.055
  return (
    <g className="fixture car">
      {/* 車体 */}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyW}
        height={bodyH}
        rx={bodyW * 0.18}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
      />
      {/* キャビン */}
      <rect
        x={bodyX + bodyW * 0.12}
        y={cabinY}
        width={bodyW * 0.76}
        height={cabinH}
        rx={3}
        fill="none"
        stroke={stroke}
        strokeWidth={sw * 0.85}
      />
      {/* 前後バンパー線 */}
      <line
        x1={bodyX + bodyW * 0.2}
        y1={bodyY + bodyH * 0.08}
        x2={bodyX + bodyW * 0.8}
        y2={bodyY + bodyH * 0.08}
        stroke={stroke}
        strokeWidth={sw * 0.7}
      />
      <line
        x1={bodyX + bodyW * 0.2}
        y1={bodyY + bodyH * 0.92}
        x2={bodyX + bodyW * 0.8}
        y2={bodyY + bodyH * 0.92}
        stroke={stroke}
        strokeWidth={sw * 0.7}
      />
      {/* タイヤ */}
      {[
        [bodyX - wheelR * 0.2, bodyY + bodyH * 0.22],
        [bodyX + bodyW + wheelR * 0.2, bodyY + bodyH * 0.22],
        [bodyX - wheelR * 0.2, bodyY + bodyH * 0.78],
        [bodyX + bodyW + wheelR * 0.2, bodyY + bodyH * 0.78],
      ].map(([wx, wy], i) => (
        <circle key={i} cx={wx} cy={wy} r={wheelR} fill="none" stroke={stroke} strokeWidth={sw * 0.85} />
      ))}
    </g>
  )
}

export function FixtureRenderer({ fixture }: FixtureRendererProps) {
  const { position, width, height, type, angle = 0 } = fixture
  const cx = position.x + width / 2
  const cy = position.y + height / 2
  const s = FIXTURE.stroke
  const sw = FIXTURE.strokeWidth

  const content = (() => {
    switch (type) {
      case 'bathtub':
        return (
          <g className="fixture bathtub">
            <rect
              x={position.x}
              y={position.y}
              width={width}
              height={height}
              rx={height * 0.3}
              fill="none"
              stroke={s}
              strokeWidth={sw}
            />
            <ellipse
              cx={cx}
              cy={cy}
              rx={width * 0.35}
              ry={height * 0.3}
              fill="none"
              stroke={s}
              strokeWidth={sw * 0.85}
            />
          </g>
        )
      case 'toilet':
        return (
          <g className="fixture toilet">
            <ellipse
              cx={cx}
              cy={cy + height * 0.1}
              rx={width * 0.4}
              ry={height * 0.35}
              fill="none"
              stroke={s}
              strokeWidth={sw}
            />
            <rect
              x={cx - width * 0.15}
              y={position.y}
              width={width * 0.3}
              height={height * 0.25}
              rx={2}
              fill="none"
              stroke={s}
              strokeWidth={sw * 0.85}
            />
          </g>
        )
      case 'sink':
        return (
          <g className="fixture sink">
            <rect
              x={position.x}
              y={position.y}
              width={width}
              height={height * 0.6}
              rx={3}
              fill="none"
              stroke={s}
              strokeWidth={sw}
            />
            <ellipse
              cx={cx}
              cy={cy}
              rx={width * 0.2}
              ry={height * 0.15}
              fill={FIXTURE.fill}
              stroke={s}
              strokeWidth={sw * 0.5}
            />
          </g>
        )
      case 'kitchen_sink':
        return (
          <g className="fixture kitchen-sink">
            <rect
              x={position.x}
              y={position.y}
              width={width}
              height={height}
              fill="none"
              stroke={s}
              strokeWidth={sw}
            />
            <rect
              x={position.x + width * 0.1}
              y={position.y + height * 0.2}
              width={width * 0.35}
              height={height * 0.5}
              rx={2}
              fill={FIXTURE.fill}
              stroke={s}
              strokeWidth={sw * 0.5}
            />
          </g>
        )
      case 'stove':
        return (
          <g className="fixture stove">
            <rect
              x={position.x}
              y={position.y}
              width={width}
              height={height}
              fill="none"
              stroke={s}
              strokeWidth={sw}
            />
            {[0.25, 0.5, 0.75].map((ratio) => (
              <circle
                key={ratio}
                cx={position.x + width * ratio}
                cy={cy}
                r={Math.min(width, height) * 0.12}
                fill="none"
                stroke={s}
                strokeWidth={sw * 0.85}
              />
            ))}
          </g>
        )
      case 'refrigerator':
        return (
          <g className="fixture refrigerator">
            {markLabel(cx, cy, '冷', width * 0.92, height * 0.92, s, sw)}
          </g>
        )
      case 'washer':
        return (
          <g className="fixture washer">
            {markLabel(cx, cy, '洗', width * 0.92, height * 0.92, s, sw)}
          </g>
        )
      case 'car':
        return (
          <CarOutline x={position.x} y={position.y} w={width} h={height} stroke={s} sw={sw} />
        )
      default:
        return null
    }
  })()

  if (!content) return null
  if (!angle) return content
  return <g transform={`rotate(${angle} ${cx} ${cy})`}>{content}</g>
}
