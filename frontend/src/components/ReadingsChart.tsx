import type { TelemetryReading } from '../lib/sensors'
import { formatTimestamp } from '../lib/incidents'

export default function ReadingsChart({ readings }: { readings: TelemetryReading[] }) {
  const values = [...readings].reverse()
  if (values.length === 0) return <p className="sensor-empty">No measurements have been recorded yet.</p>
  if (values.length === 1) return <p className="sensor-empty">One measurement recorded. The chart will appear after the next reading.</p>
  const low = Math.min(...values.map(x => x.value)); const high = Math.max(...values.map(x => x.value))
  const span = high - low || 1
  const first = Date.parse(values[0].measuredAtUtc); const last = Date.parse(values.at(-1)!.measuredAtUtc)
  const points = values.map(x => `${48 + (Date.parse(x.measuredAtUtc) - first) / (last - first || 1) * 640},${176 - (x.value - low) / span * 136}`).join(' ')
  return <figure className="readings-chart"><svg viewBox="0 0 720 220" role="img" aria-label={`Recent measurements in ${values[0].unit}`}>
    <title>Recent {values.length} measurements, from {low} to {high} {values[0].unit}</title>
    <line x1="48" x2="688" y1="40" y2="40" className="chart-grid" /><line x1="48" x2="688" y1="176" y2="176" className="chart-grid" />
    <text x="4" y="43">{high.toLocaleString('en-ZA')}</text><text x="4" y="179">{low.toLocaleString('en-ZA')}</text>
    <polyline points={points} fill="none" stroke="var(--brand-green)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    <text x="48" y="210">{new Date(first).toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' })}</text>
    <text x="688" y="210" textAnchor="end">{new Date(last).toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' })} SAST</text>
  </svg><figcaption>{values.length} readings · {formatTimestamp(values[0].measuredAtUtc)} to {formatTimestamp(values.at(-1)!.measuredAtUtc)} SAST</figcaption></figure>
}
