import React, { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Custom SVG Pin icon for location picking
const createPickerIcon = () =>
  L.divIcon({
    className: 'custom-picker-pin',
    html: `
      <div style="
        position: relative;
        width: 32px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.16344 0 0 7.16344 0 16C0 26 16 40 16 40C16 40 32 26 32 16C32 7.16344 24.8366 0 16 0Z" fill="#163323"/>
          <circle cx="16" cy="16" r="7" fill="white"/>
          <circle cx="16" cy="16" r="4" fill="#163323"/>
        </svg>
      </div>
    `,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
  })

// Click listener inside Leaflet map
function MapClickHandler({ onSelectLocation }) {
  useMapEvents({
    click(e) {
      onSelectLocation({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      })
    },
  })
  return null
}

// Controller to auto-pan when coordinates update from outside (e.g. GPS)
function MapCenterController({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (center && center[0] !== undefined && center[1] !== undefined) {
      map.flyTo(center, zoom || 15, { duration: 1 })
    }
  }, [center, zoom, map])
  return null
}

export default function LocationPickerMap({
  latitude,
  longitude,
  onChange,
  defaultCenter = [12.9165, 79.1325], // Default configurable Vellore placeholder
  defaultZoom = 13,
}) {
  const hasCoords = latitude !== null && longitude !== null && !isNaN(latitude) && !isNaN(longitude)
  const currentPos = hasCoords ? [Number(latitude), Number(longitude)] : defaultCenter
  const pinIcon = useMemo(() => createPickerIcon(), [])

  const handleMarkerDragEnd = (e) => {
    const latlng = e.target.getLatLng()
    onChange({
      lat: Number(latlng.lat.toFixed(6)),
      lng: Number(latlng.lng.toFixed(6)),
    })
  }

  return (
    <div className="location-picker-container">
      <div className="picker-map-help">
        <span>Click anywhere on the map or drag the pin to set the exact issue location.</span>
        {hasCoords && (
          <span className="picker-coords-badge">
            {latitude}, {longitude}
          </span>
        )}
      </div>

      <div style={{ height: '260px', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #d1d5db' }}>
        <MapContainer
          center={currentPos}
          zoom={hasCoords ? 15 : defaultZoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler onSelectLocation={onChange} />
          {hasCoords && (
            <MapCenterController center={currentPos} zoom={15} />
          )}

          {hasCoords && (
            <Marker
              position={currentPos}
              draggable={true}
              eventHandlers={{ dragend: handleMarkerDragEnd }}
              icon={pinIcon}
            />
          )}
        </MapContainer>
      </div>
    </div>
  )
}
