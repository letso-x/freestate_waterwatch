import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SensorMonitoring from './SensorMonitoring'
import { getSensors, getSensorReadings } from '../lib/api'
import { freshness } from '../lib/sensors'
import type { Sensor, TelemetryReading } from '../lib/sensors'

vi.mock('../lib/api', () => ({ getSensors: vi.fn(), getSensorReadings: vi.fn() }))
const time = new Date().toISOString()
const sensor: Sensor = { id: 'sensor-1', sensorKey: 'bench-01', name: 'Moisture bench', location: 'Testing bench',
  measurementType: 'soil-moisture-raw', unit: 'adc', source: 'Synthetic', latestValue: 200,
  lastMeasuredAtUtc: time, lastReceivedAtUtc: time, staleAfterSeconds: 120, activeAnomaly: null }
const readings: TelemetryReading[] = [0, 1].map(index => ({ id: `reading-${index}`, sensorId: sensor.id, measurementId: `measurement-${index}`,
  measurementType: sensor.measurementType, unit: 'adc', source: 'Synthetic', value: 200 + index,
  measuredAtUtc: new Date(Date.parse(time) - index * 5000).toISOString(), receivedAtUtc: time, isAbnormal: false }))
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getSensors).mockResolvedValue([]); vi.mocked(getSensorReadings).mockResolvedValue(readings) })
function open() { return render(<MemoryRouter><SensorMonitoring /></MemoryRouter>) }

describe('sensor monitoring', () => {
  it('shows loading and an honest empty state', async () => {
    open(); expect(screen.getByRole('status')).toHaveTextContent('Loading sensors')
    expect(await screen.findByText('No sensors registered')).toBeInTheDocument()
    expect(getSensorReadings).not.toHaveBeenCalled()
  })
  it('shows actual response values, chart and synthetic labels', async () => {
    vi.mocked(getSensors).mockResolvedValue([sensor]); open()
    expect(await screen.findByRole('img', { name: 'Recent measurements in adc' })).toBeInTheDocument()
    expect(screen.getAllByText('200 adc').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Synthetic test data').length).toBeGreaterThan(0)
    expect(screen.queryByText('Physical sensor')).not.toBeInTheDocument()
    expect(getSensorReadings).toHaveBeenCalledWith('sensor-1', expect.any(AbortSignal))
    expect(screen.getByRole('table')).toHaveTextContent('Latest measurements · Synthetic test data')
  })
  it('distinguishes suspected anomalies from confirmed leaks and switches sensors', async () => {
    vi.mocked(getSensors).mockResolvedValue([sensor, { ...sensor, id: 'sensor-2', name: 'Field sensor', source: 'Physical', activeAnomaly: {
      id: 'anomaly-1', sensorId: 'sensor-2', startedAtUtc: time, recoveredAtUtc: null, triggerValue: 200,
      threshold: 300, baseline: 600, minimumDeviation: 150, direction: 'Below', consecutiveReadings: 3, source: 'Physical' } }])
    open(); await screen.findByRole('region', { name: 'Suspected anomalies' })
    expect(screen.getByText(/They do not confirm a water leak/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'View readings' }))
    expect(getSensorReadings).toHaveBeenLastCalledWith('sensor-2', expect.any(AbortSignal))
    expect(screen.getAllByText('Physical sensor').length).toBeGreaterThan(0)
  })
  it('shows fetch failures and supports retry', async () => {
    vi.mocked(getSensors).mockRejectedValueOnce(new Error('Connection unavailable.')); open()
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection unavailable.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No sensors registered')).toBeInTheDocument()
  })
  it('shows reading errors without inventing a chart', async () => {
    vi.mocked(getSensors).mockResolvedValue([sensor]); vi.mocked(getSensorReadings).mockRejectedValue(new Error('Measurements unavailable.')); open()
    expect(await screen.findByRole('alert')).toHaveTextContent('Measurements unavailable.')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
  it('derives staleness from measured and received timestamps', () => {
    const now = Date.parse(time)
    expect(freshness(sensor, now)).toBe('Receiving readings')
    expect(freshness(sensor, now + 121000)).toBe('No recent readings')
    expect(freshness({ ...sensor, lastMeasuredAtUtc: null }, now)).toBe('No readings')
    expect(freshness({ ...sensor, lastMeasuredAtUtc: new Date(now - 121000).toISOString() }, now)).toBe('No recent readings')
  })
})
