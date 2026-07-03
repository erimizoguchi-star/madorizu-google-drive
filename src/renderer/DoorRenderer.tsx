import type { Door } from '../types/floorPlan'
import { DOOR } from './styles'

interface DoorRendererProps {
  door: Door
}

export function DoorRenderer({ door }: DoorRendererProps) {
  const rad = (door.angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const x2 = door.position.x + door.width * cos
  const y2 = door.position.y + door.width * sin

  const arcStartAngle = rad
  const arcEndAngle = rad + (door.swing * Math.PI) / 2
  const arcR = door.width

  const arcStartX = door.position.x + arcR * Math.cos(arcStartAngle)
  const arcStartY = door.position.y + arcR * Math.sin(arcStartAngle)
  const arcEndX = door.position.x + arcR * Math.cos(arcEndAngle)
  const arcEndY = door.position.y + arcR * Math.sin(arcEndAngle)

  const largeArc = 0
  const sweep = door.swing === 1 ? 1 : 0

  return (
    <g className="door">
      <line
        x1={door.position.x}
        y1={door.position.y}
        x2={x2}
        y2={y2}
        stroke={DOOR.color}
        strokeWidth={1.5}
      />
      <path
        d={`M ${arcStartX} ${arcStartY} A ${arcR} ${arcR} 0 ${largeArc} ${sweep} ${arcEndX} ${arcEndY}`}
        fill="none"
        stroke={DOOR.color}
        strokeWidth={0.8}
        opacity={DOOR.arcOpacity}
      />
    </g>
  )
}
