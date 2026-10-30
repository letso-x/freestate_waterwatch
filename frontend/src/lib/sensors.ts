export type TelemetrySource = 'Physical' | 'Synthetic'
export interface SensorAnomaly {
  id: string; sensorId: string; startedAtUtc: string; recoveredAtUtc: string | null
  triggerValue: number; baseline: number; threshold: number; minimumDeviation: number
  direction: 'Above' | 'Below'; consecutiveReadings: number; source: TelemetrySource
}
export interface Sensor {
  id: string; sensorKey: string; name: string; location: string; measurementType: string; unit: string
  source: TelemetrySource; latestValue: number | null; lastMeasuredAtUtc: string | null
  lastReceivedAtUtc: string | null; staleAfterSeconds: number; activeAnomaly: SensorAnomaly | null; lastRecoveredAnomaly?: SensorAnomaly | null
}
export interface TelemetryReading {
  id: string; sensorId: string; measurementId: string; measurementType: string; value: number; unit: string
  source: TelemetrySource; measuredAtUtc: string; receivedAtUtc: string; isAbnormal: boolean
}
export function sourceLabel(source: TelemetrySource) { return source === 'Physical' ? 'Physical sensor' : 'Synthetic test data' }
export function freshness(sensor: Sensor, now = Date.now()) {
  if (!sensor.lastMeasuredAtUtc || !sensor.lastReceivedAtUtc) return 'No readings'
  return now - Math.min(Date.parse(sensor.lastMeasuredAtUtc), Date.parse(sensor.lastReceivedAtUtc)) > sensor.staleAfterSeconds * 1000
    ? 'No recent readings' : 'Receiving readings'
}
export function measurementLabel(type: string) {
  return ({ 'soil-moisture-raw': 'Relative Wetness (%)', 'soil-moisture-percent': 'Soil moisture' } as Record<string, string>)[type] ?? type.replaceAll('-', ' ')
}

// Display conversion only; stored telemetry and anomaly evaluation remain unchanged.
export function relativeWetnessIndex(raw: number): number | null {
  if (!Number.isFinite(raw)) return null
  return Math.round(Math.max(0, Math.min(100, 100 * (561 - raw) / 338)) * 10) / 10
}

export function wetnessValue(value: number, unit: string): number | null {
  if (unit.toLowerCase() === 'adc') return relativeWetnessIndex(value)
  if (unit === '%' && Number.isFinite(value)) return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10
  return null
}
export function formatWetness(value: number | null): string {
  return value == null ? '—' : value.toLocaleString('en-ZA', { maximumFractionDigits: 1 }) + '%'
}
