import { wetnessValue, formatWetness, type TelemetryReading } from '../lib/sensors'
import { readingTime, clockTime } from '../lib/display'

export default function ReadingsChart({ readings }: { readings: TelemetryReading[] }) {
  const values = readings.map(reading => ({ ...reading, value: wetnessValue(reading.value, reading.unit) })).filter((reading): reading is typeof reading & { value: number } => reading.value != null).sort((a, b) => a.measuredAtUtc.localeCompare(b.measuredAtUtc))
  if (!values.length) return <p className="workspace-state">No measurements have been recorded yet.</p>
  if (values.length === 1) return <p className="workspace-state">One measurement recorded. The chart will appear after the next reading.</p>
  const low = Math.min(...values.map(item => item.value)); const high = Math.max(...values.map(item => item.value))
  const min = 0; const max = 100
  const first = Date.parse(values[0].measuredAtUtc); const last = Date.parse(values.at(-1)!.measuredAtUtc)
  const x = (timestamp: string) => 62 + (Date.parse(timestamp) - first) / (last - first || 1) * 792
  const y = (value: number) => 244 - (value - min) / (max - min) * 214
  const points = values.map(item => `${x(item.measuredAtUtc)},${y(item.value)}`).join(' ')
  return <figure className="readings-chart"><svg viewBox="0 0 880 290" role="img" aria-label="Relative Wetness (%) historical readings">
    <title>{values.length} readings; Relative Wetness {formatWetness(low)}–{formatWetness(high)}</title>
    {[0, 1, 2, 3, 4].map(index => { const value = min + (max - min) * index / 4; return <g key={index}><line x1="62" x2="854" y1={y(value)} y2={y(value)} className="chart-grid" /><text x="48" y={y(value) + 4} textAnchor="end">{value}%</text></g> })}
    {[0, 1, 2, 3, 4].map(index => { const timestamp = new Date(first + (last - first) * index / 4).toISOString(); return <text key={index} x={x(timestamp)} y="270" textAnchor={index === 0 ? 'start' : index === 4 ? 'end' : 'middle'}>{clockTime(timestamp).replace(' SAST', '')}</text> })}
    <polyline points={points} fill="none" stroke="var(--brand-green)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    {values.map(item => <circle key={item.id} cx={x(item.measuredAtUtc)} cy={y(item.value)} r="2.5" fill="var(--brand-green)"><title>{readingTime(item.measuredAtUtc)} SAST · {formatWetness(item.value)}</title></circle>)}
  </svg><figcaption>{readingTime(values[0].measuredAtUtc)} – {readingTime(values.at(-1)!.measuredAtUtc)} SAST · Relative Wetness (%)</figcaption></figure>
}
