/**
 * A tiny line of recent values, drawn as plain SVG so a server-rendered table
 * can carry one per row without loading the chart library. A null value breaks
 * the line rather than dropping it to zero; the last known point gets a dot.
 */
export function Sparkline({
  values,
  color,
  label,
  width = 72,
  height = 22,
}: {
  values: readonly (number | null)[]
  color: string
  /** What the line shows, for screen readers (the figures sit in the row beside it). */
  label: string
  width?: number
  height?: number
}) {
  const known = values.filter((v): v is number => v != null)
  if (known.length < 2) return null
  const min = Math.min(...known)
  const max = Math.max(...known)
  const pad = 2
  const x = (i: number) => pad + (values.length === 1 ? 0 : (i / (values.length - 1)) * (width - pad * 2))
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2))

  const segments: string[] = []
  let current: string[] = []
  values.forEach((v, i) => {
    if (v == null) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
      return
    }
    current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  })
  if (current.length > 1) segments.push(current.join(' '))
  const lastIndex = values.map((v) => v != null).lastIndexOf(true)

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block overflow-visible">
      {segments.map((points) => (
        <polyline key={points} points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      <circle cx={x(lastIndex)} cy={y(values[lastIndex]!)} r={2} fill={color} />
    </svg>
  )
}
