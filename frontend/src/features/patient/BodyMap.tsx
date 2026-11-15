import type { Region } from '../../lib/i18n'

const REGION_ZONES: Record<Region, string[]> = {
  head: ['head'], neck: ['neck'], chest: ['chest-r', 'chest-c', 'chest-l'],
  stomach: ['abd-ur', 'abd-ul', 'abd-c', 'abd-lr', 'abd-ll'], back: ['chest-r', 'chest-l', 'abd-ur', 'abd-ul', 'abd-lr', 'abd-ll'],
  arms: ['arm-r', 'arm-l'], legs: ['leg-r', 'leg-l'], pelvis: ['pelvis'], whole_body: [], other: [],
}
const ZONE_REGION: Record<string, Region> = {
  head: 'head', neck: 'neck', 'chest-r': 'chest', 'chest-c': 'chest', 'chest-l': 'chest',
  'abd-ur': 'stomach', 'abd-ul': 'stomach', 'abd-c': 'stomach', 'abd-lr': 'stomach', 'abd-ll': 'stomach',
  'arm-r': 'arms', 'arm-l': 'arms', 'leg-r': 'legs', 'leg-l': 'legs', pelvis: 'pelvis',
}

type Shape = { id: string; el: 'rect' | 'circle'; a: Record<string, number> }
// Front view. Patient's right side is on the viewer's left.
const SHAPES: Shape[] = [
  { id: 'arm-r', el: 'rect', a: { x: 30, y: 90, width: 26, height: 140, rx: 13 } },
  { id: 'arm-l', el: 'rect', a: { x: 144, y: 90, width: 26, height: 140, rx: 13 } },
  { id: 'leg-r', el: 'rect', a: { x: 66, y: 256, width: 32, height: 136, rx: 14 } },
  { id: 'leg-l', el: 'rect', a: { x: 102, y: 256, width: 32, height: 136, rx: 14 } },
  { id: 'head', el: 'circle', a: { cx: 100, cy: 40, r: 28 } },
  { id: 'neck', el: 'rect', a: { x: 89, y: 66, width: 22, height: 18, rx: 6 } },
  { id: 'chest-r', el: 'rect', a: { x: 60, y: 84, width: 40, height: 72, rx: 14 } },
  { id: 'chest-l', el: 'rect', a: { x: 100, y: 84, width: 40, height: 72, rx: 14 } },
  { id: 'chest-c', el: 'rect', a: { x: 88, y: 96, width: 24, height: 52, rx: 10 } },
  { id: 'abd-ur', el: 'rect', a: { x: 62, y: 158, width: 38, height: 32, rx: 8 } },
  { id: 'abd-ul', el: 'rect', a: { x: 100, y: 158, width: 38, height: 32, rx: 8 } },
  { id: 'abd-lr', el: 'rect', a: { x: 62, y: 190, width: 38, height: 34, rx: 8 } },
  { id: 'abd-ll', el: 'rect', a: { x: 100, y: 190, width: 38, height: 34, rx: 8 } },
  { id: 'abd-c', el: 'circle', a: { cx: 100, cy: 191, r: 12 } },
  { id: 'pelvis', el: 'rect', a: { x: 64, y: 226, width: 72, height: 28, rx: 12 } },
]

type Props = {
  region?: Region | null
  activeZones?: string[]
  focusRegion?: Region | null
  selectable?: Region[]
  onRegion?: (r: Region) => void
  label: string
}

export function BodyMap({ region, activeZones, focusRegion, selectable, onRegion, label }: Props) {
  const lit = new Set(activeZones ?? (region ? REGION_ZONES[region] : []))
  const focus = new Set(focusRegion ? REGION_ZONES[focusRegion] : [])
  const isBack = region === 'back' || focusRegion === 'back'
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 200 400" className="h-[44vh] max-h-[460px] w-auto" role="img" aria-label={label}>
        {SHAPES.map((s) => {
          const r = ZONE_REGION[s.id]
          const on = lit.has(s.id)
          const f = focus.has(s.id)
          const clickable = onRegion && (!selectable || selectable.includes(r))
          const props = {
            ...s.a,
            fill: on ? '#087a7f' : f ? '#f9bb45' : '#dbe7ef',
            stroke: on ? '#06585c' : f ? '#b7791f' : '#9fb3c8',
            strokeWidth: on || f ? 3 : 1.5,
            strokeDasharray: isBack && (on || f) ? '6 4' : undefined,
            className: clickable ? 'cursor-pointer' : undefined,
            onClick: clickable ? () => onRegion!(r) : undefined,
          }
          return s.el === 'rect' ? <rect key={s.id} {...props} /> : <circle key={s.id} {...props} />
        })}
        <text x="22" y="398" fontSize="11" fill="#486581">R</text>
        <text x="172" y="398" fontSize="11" fill="#486581">L</text>
      </svg>
      {isBack && <figcaption className="mt-1 text-sm text-navy-500">Back (shown from the front, dashed)</figcaption>}
    </figure>
  )
}
