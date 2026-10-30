import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSensorMonitoring } from './useSensorMonitoring'
import { getSensors, getSensorReadings } from './api'
import type { Sensor, TelemetryReading } from './sensors'

vi.mock('./api', () => ({ getSensors: vi.fn(), getSensorReadings: vi.fn() }))
const sensor: Sensor = { id: 'physical-1', sensorKey: 'arduino-01', name: 'Arduino Uno', location: 'Bench', measurementType: 'soil-moisture-raw', unit: 'adc', source: 'Physical', latestValue: 338, lastMeasuredAtUtc: '2026-10-30T02:00:00Z', lastReceivedAtUtc: '2026-10-30T02:00:01Z', staleAfterSeconds: 120, activeAnomaly: null }
const reading: TelemetryReading = { id: 'reading-1', sensorId: sensor.id, measurementId: 'measurement-1', measurementType: sensor.measurementType, value: 338, unit: 'adc', source: 'Physical', measuredAtUtc: sensor.lastMeasuredAtUtc!, receivedAtUtc: sensor.lastReceivedAtUtc!, isAbnormal: false }
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); vi.mocked(getSensors).mockResolvedValue([sensor]); vi.mocked(getSensorReadings).mockResolvedValue([reading]) })
afterEach(() => { vi.useRealTimers() })
describe('ten-second monitoring refresh', () => {
  it('polls sensors and persisted readings every ten seconds and cancels on unmount', async () => {
    const view = renderHook(useSensorMonitoring)
    await act(async () => { await Promise.resolve() })
    expect(getSensors).toHaveBeenCalledTimes(1); expect(getSensorReadings).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(9999) })
    expect(getSensors).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(getSensors).toHaveBeenCalledTimes(2); expect(getSensorReadings).toHaveBeenCalledTimes(2)
    const signal = vi.mocked(getSensorReadings).mock.calls[1][1]!
    view.unmount(); expect(signal.aborted).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(getSensors).toHaveBeenCalledTimes(2)
  })
  it('keeps the previous chart visible during polling and exposes a failed refresh', async () => {
    const view = renderHook(useSensorMonitoring)
    await act(async () => { await Promise.resolve() })
    vi.mocked(getSensorReadings).mockReturnValueOnce(new Promise(() => {}))
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(view.result.current.readings).toEqual([reading]); expect(view.result.current.readingLoading).toBe(true)
    vi.mocked(getSensorReadings).mockRejectedValueOnce(new Error('Readings unavailable.'))
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(view.result.current.readings).toEqual([reading]); expect(view.result.current.readingError).toBe('Readings unavailable.')
    view.unmount()
  })
})
