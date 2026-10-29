import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import LocationPicker from './LocationPicker'

const mocks = vi.hoisted(() => {
  const map = { setView: vi.fn(), on: vi.fn(), remove: vi.fn(), getZoom: vi.fn(() => 12), getCenter: vi.fn(() => ({ lat: -29.13, lng: 26.22 })) }
  const tiles = { on: vi.fn(), addTo: vi.fn() }
  const marker = { addTo: vi.fn(), remove: vi.fn() }
  return { map, tiles, marker, circleMarker: vi.fn() }
})
vi.mock('leaflet', () => ({ default: { map: vi.fn(() => mocks.map), tileLayer: vi.fn(() => mocks.tiles), circleMarker: mocks.circleMarker } }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.map.setView.mockReturnValue(mocks.map)
  mocks.tiles.on.mockReturnValue(mocks.tiles)
  mocks.marker.addTo.mockReturnValue(mocks.marker)
  mocks.circleMarker.mockReturnValue(mocks.marker)
})

describe('interactive map adapter', () => {
  it('does not submit the initial map centre as an incident location', () => {
    const onChange = vi.fn()
    const view = render(<LocationPicker value={null} onChange={onChange} />)
    expect(onChange).not.toHaveBeenCalled()
    view.unmount()
    expect(mocks.map.remove).toHaveBeenCalled()
  })
  it('passes a clicked map point back to the real form', () => {
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    const callback = mocks.map.on.mock.calls.find(call => call[0] === 'click')![1]
    act(() => callback({ latlng: { lat: -29.12, lng: 26.21 } }))
    expect(onChange).toHaveBeenCalledWith({ latitude: -29.12, longitude: 26.21 })
  })
  it('supports selecting the map centre with a keyboard-operable button', async () => {
    const onChange = vi.fn()
    render(<LocationPicker value={null} onChange={onChange} />)
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Select map centre' }))
    expect(onChange).toHaveBeenCalledWith({ latitude: -29.13, longitude: 26.22 })
  })
  it('shows the selected marker and reports tile errors without blocking address entry', () => {
    render(<LocationPicker value={{ latitude: -29.12, longitude: 26.21 }} onChange={vi.fn()} />)
    expect(mocks.circleMarker).toHaveBeenCalledWith([-29.12, 26.21], expect.any(Object))
    const tileError = mocks.tiles.on.mock.calls.find(call => call[0] === 'tileerror')![1]
    act(() => tileError())
    expect(screen.getByRole('status')).toHaveTextContent('The map couldn’t load')
  })
})
