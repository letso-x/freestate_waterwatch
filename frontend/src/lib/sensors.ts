export type TelemetrySource = 'Physical' | 'Synthetic'
export interface SensorAnomaly {
  id: string; sensorId: string; startedAtUtc: string; recoveredAtUtc: string | null
  triggerValue: number; baseline: number; threshold: number; minimumDeviation: number
  direction: 'Above' | 'Below'; consecutiveReadings: number; source: TelemetrySource
}
export interface Sensor {
  id: string; sensorKey: string; name: string; location: string; measurementType: string; unit: string
  source: TelemetrySource; latestValue: number | null; lastMeasuredAtUtc: string | null
  lastReceivedAtUtc: string | null; staleAfterSeconds: number; activeAnomaly: SensorAnomaly | null
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
  return ({ 'soil-moisture-raw': 'Soil moisture', 'soil-moisture-percent': 'Soil moisture' } as Record<string, string>)[type] ?? type.replaceAll('-', ' ')
}
