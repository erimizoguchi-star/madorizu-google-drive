import type { Fixture } from '../types/floorPlan'
import { FIXTURE } from './styles'

interface FixtureRendererProps {
  fixture: Fixture
}

export function FixtureRenderer({ fixture }: FixtureRendererProps) {
  const { position, width, height, type } = fixture
  const cx = position.x + width / 2
  const cy = position.y + height / 2
  const s = FIXTURE.stroke
  const sw = FIXTURE.strokeWidth

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
    default:
      return null
  }
}
