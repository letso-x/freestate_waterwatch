import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface Coordinates { latitude: number; longitude: number }
interface Props { value: Coordinates | null; onChange: (value: Coordinates) => void }

export default function LocationPicker({ value, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)
  const changeRef = useRef(onChange)
  const [tileError, setTileError] = useState(false)
  changeRef.current = onChange

  useEffect(() => {
    if (!container.current) return
    const map = L.map(container.current, { scrollWheelZoom: false }).setView([-29.12, 26.21], 12)
    mapRef.current = map
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).on('tileerror', () => setTileError(true)).addTo(map)
    map.on('click', (event: L.LeafletMouseEvent) => changeRef.current({ latitude: event.latlng.lat, longitude: event.latlng.lng }))
    return () => { map.remove(); mapRef.current = null; markerRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markerRef.current?.remove()
    markerRef.current = null
    if (value) {
      const point: L.LatLngTuple = [value.latitude, value.longitude]
      const tokens = getComputedStyle(document.documentElement)
      markerRef.current = L.circleMarker(point, { radius: 9, color: tokens.getPropertyValue('--brand-green').trim(), fillColor: tokens.getPropertyValue('--brand-orange').trim(), fillOpacity: 1, weight: 3 }).addTo(map)
      map.setView(point, map.getZoom())
    }
  }, [value])

  function useMapCentre() {
    const point = mapRef.current?.getCenter()
    if (point) onChange({ latitude: point.lat, longitude: point.lng })
  }

  return <div className="location-picker">
    <div ref={container} className="location-map" role="region" aria-label="Incident location map" aria-describedby="map-help" />
    <div className="map-controls"><p id="map-help">Tap the map to place a pin. Keyboard: focus the map, pan with arrow keys, then select its centre.</p><button type="button" className="button button-secondary" onClick={useMapCentre}>Select map centre</button></div>
    {tileError && <p className="field-error" role="status">Map tiles could not load. You can still enter an address and coordinates, or use GPS.</p>}
  </div>
}
