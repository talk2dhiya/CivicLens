import React, { useState, useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Default configurable center from env or fallback to Vellore placeholder
const DEFAULT_CENTER = [
  Number(import.meta.env.VITE_MAP_CENTER_LAT) || 12.9165,
  Number(import.meta.env.VITE_MAP_CENTER_LNG) || 79.1325,
]
const DEFAULT_ZOOM = Number(import.meta.env.VITE_MAP_DEFAULT_ZOOM) || 12

// Category color mappings for map pins
const CATEGORY_COLORS = {
  'Road Damage / Potholes': '#b91c1c', // Crimson
  'Water Leakage': '#1e40af', // Deep Blue
  'Garbage Overflow': '#b45309', // Amber
  'Flooding / Waterlogging': '#4338ca', // Indigo
  'Broken Streetlights': '#6d28d9', // Purple
}

const CATEGORIES = [
  'Road Damage / Potholes',
  'Water Leakage',
  'Garbage Overflow',
  'Flooding / Waterlogging',
  'Broken Streetlights',
]

const STATUSES = ['Pending', 'Acknowledged', 'In Progress', 'Resolved', 'Rejected']

function getStatusClass(status) {
  switch (status) {
    case 'Pending':
      return 'status-pending'
    case 'Acknowledged':
      return 'status-acknowledged'
    case 'In Progress':
      return 'status-in-progress'
    case 'Resolved':
      return 'status-resolved'
    case 'Rejected':
      return 'status-rejected'
    default:
      return 'status-pending'
  }
}

// Custom SVG Pin creator with category color
function createReportPinIcon(category) {
  const color = CATEGORY_COLORS[category] || '#163323'
  return L.divIcon({
    className: 'custom-report-pin',
    html: `
      <div style="
        position: relative;
        width: 28px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
      ">
        <svg width="28" height="36" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.16344 0 0 7.16344 0 16C0 26 16 40 16 40C16 40 32 26 32 16C32 7.16344 24.8366 0 16 0Z" fill="${color}"/>
          <circle cx="16" cy="16" r="6" fill="#ffffff"/>
        </svg>
      </div>
    `,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -34],
  })
}

// Custom hotspot centroid badge
function createHotspotCentroidIcon(count) {
  return L.divIcon({
    className: 'custom-hotspot-centroid',
    html: `
      <div style="
        background: #991b1b;
        color: #ffffff;
        font-weight: 700;
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 4px;
        border: 1px solid #7f1d1d;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        display: flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">
        <span>Cluster:</span> <strong>${count}</strong>
      </div>
    `,
    iconSize: [80, 24],
    iconAnchor: [40, 12],
    popupAnchor: [0, -14],
  })
}

// Map bounds controller to dynamically fit to all report coordinates
function MapBoundsController({ reports }) {
  const map = useMap()
  const prevReportCountRef = useRef(0)

  useEffect(() => {
    if (!reports || reports.length === 0) return

    // Extract valid lat/lng pairs
    const validPoints = reports
      .filter((r) => r.latitude !== null && r.longitude !== null)
      .map((r) => [Number(r.latitude), Number(r.longitude)])

    if (validPoints.length === 0) return

    // Only auto-fit when reports count changes or on first load
    if (prevReportCountRef.current !== validPoints.length) {
      prevReportCountRef.current = validPoints.length
      if (validPoints.length === 1) {
        map.setView(validPoints[0], 14, { animate: true })
      } else {
        const bounds = L.latLngBounds(validPoints)
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true })
      }
    }
  }, [reports, map])

  return null
}

export default function CivicMapExplorer({ onSelectReport }) {
  // Filters
  const [filterCategory, setFilterCategory] = useState('ALL')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [filterTimeRange, setFilterTimeRange] = useState('all') // '7d' | '30d' | '90d' | 'all'
  const [showHotspots, setShowHotspots] = useState(true)

  // Data states
  const [reports, setReports] = useState([])
  const [hotspotData, setHotspotData] = useState({ hotspots: [], noise_reports: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Selected hotspot for drill-down modal/card
  const [inspectedHotspot, setInspectedHotspot] = useState(null)

  // Fetch reports with coordinates
  const fetchMapData = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (filterCategory !== 'ALL') params.append('category', filterCategory)
      if (filterStatus !== 'ALL') params.append('status', filterStatus)
      if (filterTimeRange !== 'all') params.append('time_range', filterTimeRange)

      // Fetch geolocated reports
      const repRes = await fetch(`/api/v1/map/reports?${params.toString()}`)
      if (!repRes.ok) throw new Error('Failed to load geolocated reports.')
      const repData = await repRes.json()
      setReports(repData.reports || [])

      // Fetch hotspot clusters
      const hotRes = await fetch(`/api/v1/analytics/hotspots?${params.toString()}`)
      if (!hotRes.ok) throw new Error('Failed to load hotspot clusters.')
      const hotData = await hotRes.json()
      setHotspotData(hotData)
    } catch (err) {
      setError(err.message || 'Error loading map data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMapData()
  }, [filterCategory, filterStatus, filterTimeRange])

  const pinIcons = useMemo(() => {
    const icons = {}
    CATEGORIES.forEach((cat) => {
      icons[cat] = createReportPinIcon(cat)
    })
    return icons
  }, [])

  return (
    <div className="map-explorer-container">
      {/* Top Header */}
      <div className="map-explorer-header">
        <div className="map-header-titles">
          <h2 className="map-title">Issues and Hotspots Explorer</h2>
          <p className="map-subtitle">
            Explore verified geolocated reports and spatial density clusters across the municipal service area.
          </p>
        </div>

        {/* Hotspot Toggle Button */}
        <button
          type="button"
          className={`map-hotspots-toggle ${showHotspots ? 'active' : ''}`}
          onClick={() => setShowHotspots((prev) => !prev)}
        >
          {showHotspots ? 'Hide Hotspots Layer' : 'Show Hotspots Layer'}
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className="map-toolbar">
        <div className="map-toolbar-group">
          <div className="map-select-wrapper">
            <label className="map-select-label">Category</label>
            <select
              className="map-filter-select"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="map-select-wrapper">
            <label className="map-select-label">Status</label>
            <select
              className="map-filter-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className="map-select-wrapper">
            <label className="map-select-label">Time Window</label>
            <select
              className="map-filter-select"
              value={filterTimeRange}
              onChange={(e) => setFilterTimeRange(e.target.value)}
            >
              <option value="all">All Time</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>
        </div>

        <div className="map-stats-summary">
          <span>Reports: <strong>{reports.length}</strong></span>
          {showHotspots && (
            <span>Clusters: <strong>{hotspotData.hotspots?.length || 0}</strong></span>
          )}
        </div>
      </div>

      {error && (
        <div className="ops-alert ops-alert-error" style={{ marginBottom: '16px' }}>
          {error}
          <button
            type="button"
            className="ops-btn-action ops-btn-inspect"
            style={{ marginLeft: '12px' }}
            onClick={fetchMapData}
          >
            Retry
          </button>
        </div>
      )}

      {/* Mandatory Hotspot Disclaimer Banner */}
      <div className="map-disclaimer-banner">
        <div className="map-disclaimer-text">
          <strong>Transparency Notice:</strong> Spatial clusters indicate geographic concentrations of submitted citizen reports,
          not verified ground danger, severity, or future risk.
        </div>
      </div>

      {/* Main Map Container */}
      <div className="map-viewport-wrapper">
        {loading && (
          <div className="map-loading-overlay">
            <span>Loading map data...</span>
          </div>
        )}

        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '560px', width: '100%', borderRadius: '4px' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapBoundsController reports={reports} />

          {/* LAYER 1: Hotspots (DBSCAN Clusters) */}
          {showHotspots &&
            hotspotData.hotspots?.map((hotspot) => (
              <React.Fragment key={hotspot.id}>
                {/* Translucent circular coverage boundary */}
                <Circle
                  center={[hotspot.centroid.latitude, hotspot.centroid.longitude]}
                  radius={hotspot.radius_meters}
                  pathOptions={{
                    color: '#991b1b',
                    fillColor: '#ef4444',
                    fillOpacity: 0.18,
                    weight: 2,
                    dashArray: '4, 4',
                  }}
                  eventHandlers={{
                    click: () => setInspectedHotspot(hotspot),
                  }}
                />

                {/* Hotspot Centroid Badge Marker */}
                <Marker
                  position={[hotspot.centroid.latitude, hotspot.centroid.longitude]}
                  icon={createHotspotCentroidIcon(hotspot.report_count)}
                  eventHandlers={{
                    click: () => setInspectedHotspot(hotspot),
                  }}
                >
                  <Popup>
                    <div className="map-hotspot-popup">
                      <h4 className="map-popup-title">
                        Cluster Concentration Area
                      </h4>
                      <p className="map-popup-desc">
                        <strong>{hotspot.report_count} citizen reports</strong> clustered within ~{Math.round(hotspot.radius_meters)}m.
                      </p>

                      <div style={{ marginBottom: '10px' }}>
                        <div className="map-popup-label">
                          Category Breakdown:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {Object.entries(hotspot.category_breakdown || {}).map(([cat, count]) => (
                            <span key={cat} className="map-cluster-pill">
                              {cat}: {count}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="map-popup-btn"
                        onClick={() => setInspectedHotspot(hotspot)}
                      >
                        Inspect Contributing Reports ({hotspot.report_count})
                      </button>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            ))}

          {/* LAYER 2: Individual Report Pins */}
          {reports.map((report) => {
            if (report.latitude === null || report.longitude === null) return null
            const icon = pinIcons[report.category] || createReportPinIcon(report.category)

            return (
              <Marker
                key={report.id}
                position={[Number(report.latitude), Number(report.longitude)]}
                icon={icon}
              >
                <Popup>
                  <div className="map-report-popup">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="map-popup-cat">
                        {report.category}
                      </span>
                      <span className={`status-badge ${getStatusClass(report.status)}`}>
                        {report.status}
                      </span>
                    </div>

                    {report.image_path && (
                      <img
                        src={report.image_path}
                        alt={report.category}
                        className="map-popup-thumb"
                      />
                    )}

                    <div className="map-popup-location">
                      {report.location_text}
                    </div>

                    <div className="map-popup-id">
                      Report #{report.id}
                    </div>

                    <button
                      type="button"
                      className="map-popup-btn"
                      onClick={() => onSelectReport(report.id)}
                    >
                      Inspect Report Details
                    </button>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>

      {/* MODAL / DRAWER: Inspect Contributing Reports in Hotspot */}
      {inspectedHotspot && (
        <div className="hotspot-inspect-modal">
          <div className="hotspot-inspect-backdrop" onClick={() => setInspectedHotspot(null)} />
          <div className="hotspot-inspect-card">
            <div className="hotspot-inspect-header">
              <div>
                <h3 className="hotspot-inspect-title">
                  Cluster Summary: {inspectedHotspot.id}
                </h3>
                <span className="hotspot-inspect-coords">
                  Centroid: {inspectedHotspot.centroid.latitude}, {inspectedHotspot.centroid.longitude} • Radius: ~{Math.round(inspectedHotspot.radius_meters)}m
                </span>
              </div>
              <button
                type="button"
                className="modal-close-text-btn"
                onClick={() => setInspectedHotspot(null)}
              >
                Close
              </button>
            </div>

            <div className="hotspot-summary-grid">
              <div className="hotspot-stat-box">
                <span className="stat-num">{inspectedHotspot.report_count}</span>
                <span className="stat-label">Total Reports</span>
              </div>
              <div className="hotspot-stat-box" style={{ gridColumn: '2 / -1' }}>
                <span className="stat-label" style={{ marginBottom: '6px' }}>Category Breakdown:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Object.entries(inspectedHotspot.category_breakdown || {}).map(([cat, count]) => (
                    <span key={cat} className="map-cluster-pill">
                      {cat}: <strong>{count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <h4 style={{ margin: '16px 0 8px 0', fontSize: '14px', color: '#163323', fontFamily: 'Georgia, serif' }}>
              Contributing Reports ({inspectedHotspot.sample_reports?.length || 0}):
            </h4>

            <div className="hotspot-reports-list">
              {inspectedHotspot.sample_reports?.map((r) => (
                <div key={r.id} className="hotspot-report-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: '#163323', fontSize: '13px' }}>
                      Report #{r.id} - {r.category}
                    </strong>
                    <span className={`status-badge ${getStatusClass(r.status)}`}>
                      {r.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#5c645d', margin: '4px 0' }}>
                    {r.location_text}
                  </div>
                  <button
                    type="button"
                    className="ops-btn-action ops-btn-inspect"
                    style={{ marginTop: '4px' }}
                    onClick={() => {
                      setInspectedHotspot(null)
                      onSelectReport(r.id)
                    }}
                  >
                    Inspect Details
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
