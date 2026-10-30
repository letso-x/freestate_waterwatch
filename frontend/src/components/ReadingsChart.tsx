import type { TelemetryReading } from '../lib/sensors'
import { readingTime, clockTime } from '../lib/display'

export default function ReadingsChart({ readings }: { readings: TelemetryReading[] }) {
  const values = [...readings].sort((a, b) => a.measuredAtUtc.localeCompare(b.measuredAtUtc))
  if (!values.length) return <p className="workspace-state">No measurements have been recorded yet.</p>
  if (values.length === 1) return <p className="workspace-state">One measurement recorded. The chart will appear after the next reading.</p>
  const low = Math.min(...values.map(item => item.value)); const high = Math.max(...values.map(item => item.value))
  const padding = Math.max((high - low) * .15, 1); const min = low - padding; const max = high + padding
  const first = Date.parse(values[0].measuredAtUtc); const last = Date.parse(values.at(-1)!.measuredAtUtc)
  const x = (timestamp: string) => 62 + (Date.parse(timestamp) - first) / (last - first || 1) * 792
  const y = (value: number) => 244 - (value - min) / (max - min) * 214
  const points = values.map(item => `${x(item.measuredAtUtc)},${y(item.value)}`).join(' ')
  return <figure className="readings-chart"><svg viewBox="0 0 880 290" role="img" aria-label={`Recent measurements in ${values[0].unit}`}>
    <title>{values.length} persisted readings; actual values {low}–{high} {values[0].unit}</title>
    {[0, 1, 2, 3, 4].map(index => { const value = min + (max - min) * index / 4; return <g key={index}><line x1="62" x2="854" y1={y(value)} y2={y(value)} className="chart-grid" /><text x="48" y={y(value) + 4} textAnchor="end">{Number(value.toFixed(1))}</text></g> })}
    {[0, 1, 2, 3, 4].map(index => { const timestamp = new Date(first + (last - first) * index / 4).toISOString(); return <text key={index} x={x(timestamp)} y="270" textAnchor={index === 0 ? 'start' : index === 4 ? 'end' : 'middle'}>{clockTime(timestamp).replace(' SAST', '')}</text> })}
    <polyline points={points} fill="none" stroke="var(--brand-green)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    {values.map(item => <circle key={item.id} cx={x(item.measuredAtUtc)} cy={y(item.value)} r="2.5" fill="var(--brand-green)"><title>{readingTime(item.measuredAtUtc)} SAST · {item.value} {item.unit}</title></circle>)}
  </svg><figcaption>{readingTime(values[0].measuredAtUtc)} – {readingTime(values.at(-1)!.measuredAtUtc)} SAST · {values[0].unit === 'adc' ? 'Raw counts; not calibrated moisture percentages.' : values[0].unit}</figcaption></figure>
}
