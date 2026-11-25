import React, { useState, useRef } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Layers } from 'lucide-react';
import type {
  BasinProfile,
  MapLayerMode,
  RiskTier,
  VulnerableZone,
  ZonePrediction,
} from '../types/hydro';

interface WatershedMapProps {
  basin: BasinProfile;
  predictions: ZonePrediction[];
  selectedZoneId: string;
  onSelectZone: (zoneId: string) => void;
}

const LAYER_OPTIONS: Array<{ id: MapLayerMode; label: string }> = [
  { id: 'risk', label: 'Flood Risk' },
  { id: 'slope', label: 'Slope Angle' },
  { id: 'moisture', label: 'Soil Moisture' },
  { id: 'elevation', label: 'Elevation DEM' },
];

function tierColor(tier: RiskTier): { fill: string; stroke: string; text: string } {
  switch (tier) {
    case 'Critical':
      return { fill: '#DC2626', stroke: '#FCA5A5', text: '#DC2626' };
    case 'Watch':
      return { fill: '#D97706', stroke: '#FCD34D', text: '#D97706' };
    case 'Advisory':
      return { fill: '#0284C7', stroke: '#7DD3FC', text: '#0284C7' };
    default:
      return { fill: '#059669', stroke: '#6EE7B7', text: '#059669' };
  }
}

function layerZoneColor(
  mode: MapLayerMode,
  zone: VulnerableZone,
  pred: ZonePrediction | undefined
): string {
  if (mode === 'risk') {
    return tierColor(pred?.riskTier ?? 'Nominal').fill;
  }
  if (mode === 'slope') {
    if (zone.slopeDeg >= 40) return '#DC2626';
    if (zone.slopeDeg >= 34) return '#D97706';
    if (zone.slopeDeg >= 28) return '#0284C7';
    return '#059669';
  }
  if (mode === 'moisture') {
    const m = pred?.effectiveSoilMoisturePct ?? zone.baseSoilMoisturePct;
    if (m >= 88) return '#2563EB';
    if (m >= 75) return '#0891B2';
    if (m >= 60) return '#14B8A6';
    return '#64748B';
  }
  // elevation
  if (zone.elevationM >= 2200) return '#6366F1';
  if (zone.elevationM >= 1500) return '#0EA5E9';
  return '#10B981';
}

export const WatershedMap: React.FC<WatershedMapProps> = ({
  basin,
  predictions,
  selectedZoneId,
  onSelectZone,
}) => {
  const [layerMode, setLayerMode] = useState<MapLayerMode>('risk');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number; elev: number } | null>(
    null
  );

  const svgRef = useRef<SVGSVGElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: Math.max(-220, Math.min(220, dragStartRef.current.panX + dx)),
        y: Math.max(-160, Math.min(160, dragStartRef.current.panY + dy)),
      });
      return;
    }

    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;

    const lat = basin.centerLat + (0.5 - normY) * 0.42;
    const lon = basin.centerLon + (normX - 0.5) * 0.54;
    const [minE, maxE] = basin.elevationRangeM;
    const elev = Math.round(maxE - normY * (maxE - minE));
    setCursorCoords({ lat, lon, elev });
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).closest('[data-zone-node="true"]')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <section
      id="map"
      aria-label="Topographic Watershed Vulnerability Map"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      {/* Map Header Controls */}
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Topographic Watershed &amp; Vulnerability Map
          </h2>
          <p className="text-xs text-slate-500">
            {basin.name} · DEM Contour Relief &amp; Sub-Catchment Hazard Overlay
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            <Layers className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-0.5" aria-hidden="true" />
            {LAYER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLayerMode(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  layerMode === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center border border-slate-200 rounded-md bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.2).toFixed(1))))}
              aria-label="Zoom in"
              className="p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-r border-slate-200 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.8, Number((z - 0.2).toFixed(1))))}
              aria-label="Zoom out"
              className="p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-r border-slate-200 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={resetView}
              aria-label="Reset map view"
              className="p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Cartographic Canvas */}
      <div className="relative bg-[#0E1726] select-none overflow-hidden">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 580"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            handleMouseUp();
            setCursorCoords(null);
          }}
          className={`w-full h-[380px] sm:h-[440px] block ${
            isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
          }`}
        >
          <defs>
            <pattern id="demGrid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                stroke="#1E293B"
                strokeWidth="0.75"
              />
            </pattern>
            <radialGradient id="reliefShade" cx="50%" cy="22%" r="75%">
              <stop offset="0%" stopColor="#1E293B" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#090F1A" stopOpacity="0.95" />
            </radialGradient>
          </defs>

          <rect width="1000" height="580" fill="url(#reliefShade)" />
          <rect width="1000" height="580" fill="url(#demGrid)" />

          <g
            transform={`translate(${500 + pan.x}, ${290 + pan.y}) scale(${zoom}) translate(-500, -290)`}
          >
            {/* Elevation Contour Lines */}
            {basin.contours.map((c) => (
              <g key={c.elevationM}>
                <path
                  d={c.d}
                  fill="none"
                  stroke={layerMode === 'elevation' ? '#38BDF8' : '#334155'}
                  strokeWidth={layerMode === 'elevation' ? 1.5 : 1}
                  strokeDasharray={layerMode === 'elevation' ? undefined : '5 4'}
                  opacity={layerMode === 'elevation' ? 0.72 : 0.65}
                />
                <text
                  x={c.labelX}
                  y={c.labelY}
                  fill="#94A3B8"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {c.elevationM}m
                </text>
              </g>
            ))}

            {/* Vulnerable Sub-Catchment Heatmap Halos */}
            {basin.zones.map((zone) => {
              const pred = predictions.find((p) => p.zoneId === zone.id);
              const nodeColor = layerZoneColor(layerMode, zone, pred);
              const radius =
                layerMode === 'risk'
                  ? 44 + ((pred?.riskScore ?? 30) / 100) * 46
                  : 56;
              return (
                <circle
                  key={`halo-${zone.id}`}
                  cx={zone.mapX}
                  cy={zone.mapY}
                  r={radius}
                  fill={nodeColor}
                  opacity={selectedZoneId === zone.id ? 0.24 : 0.14}
                />
              );
            })}

            {/* River Network Channels */}
            {basin.rivers.map((river) => (
              <g key={river.id}>
                <path
                  d={river.d}
                  fill="none"
                  stroke="#0EA5E9"
                  strokeWidth={river.order === 'main' ? 5.5 : 2.8}
                  strokeLinecap="round"
                  opacity={0.28}
                />
                <path
                  d={river.d}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth={river.order === 'main' ? 2.4 : 1.4}
                  strokeLinecap="round"
                  opacity={0.92}
                />
              </g>
            ))}

            {/* Vulnerable Zone Markers */}
            {basin.zones.map((zone) => {
              const pred = predictions.find((p) => p.zoneId === zone.id);
              const isSelected = selectedZoneId === zone.id;
              const color = layerZoneColor(layerMode, zone, pred);
              const score = pred?.riskScore ?? 0;

              let metricText = `${score}%`;
              if (layerMode === 'slope') metricText = `${zone.slopeDeg}°`;
              if (layerMode === 'moisture')
                metricText = `${pred?.effectiveSoilMoisturePct ?? zone.baseSoilMoisturePct}%`;
              if (layerMode === 'elevation') metricText = `${zone.elevationM}m`;

              return (
                <g
                  key={zone.id}
                  data-zone-node="true"
                  onClick={() => onSelectZone(zone.id)}
                  className="cursor-pointer"
                >
                  {isSelected && (
                    <circle
                      cx={zone.mapX}
                      cy={zone.mapY}
                      r={24}
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth={1.75}
                      strokeDasharray="3 3"
                    />
                  )}
                  <circle
                    cx={zone.mapX}
                    cy={zone.mapY}
                    r={14}
                    fill="#0F172A"
                    stroke={color}
                    strokeWidth={3}
                  />
                  <text
                    x={zone.mapX}
                    y={zone.mapY + 3.5}
                    textAnchor="middle"
                    fill="#F8FAFC"
                    fontSize="9.5"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {metricText}
                  </text>

                  {/* Zone Label */}
                  <g transform={`translate(${zone.mapX + 20}, ${zone.mapY - 11})`}>
                    <rect
                      x={0}
                      y={0}
                      width={Math.min(185, zone.name.length * 6.5 + 18)}
                      height={22}
                      rx={4}
                      fill="#0F172A"
                      fillOpacity={isSelected ? 0.96 : 0.84}
                      stroke={isSelected ? '#FFFFFF' : '#334155'}
                      strokeWidth={1}
                    />
                    <text
                      x={8}
                      y={14}
                      fill="#F8FAFC"
                      fontSize="10.5"
                      fontWeight={isSelected ? '600' : '500'}
                      fontFamily="IBM Plex Sans, sans-serif"
                    >
                      {zone.name}
                    </text>
                  </g>

                  {/* River Gauge Indicator Badge (only when gauge unavailable) */}
                  {!pred?.riverDataUsed && (
                    <text
                      x={zone.mapX + 20}
                      y={zone.mapY + 23}
                      fill="#94A3B8"
                      fontSize="9.5"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      Ungauged · Terrain Proxy
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Corner Coordinate Crosshair HUD */}
        <div className="absolute bottom-3 left-3 bg-slate-950/85 border border-slate-700/80 rounded px-2.5 py-1.5 text-[11px] font-mono tabular-nums text-slate-200 pointer-events-none">
          {cursorCoords
            ? `${cursorCoords.lat.toFixed(3)}°N, ${cursorCoords.lon.toFixed(3)}°E · DEM ~${cursorCoords.elev}m`
            : `${basin.centerLat.toFixed(3)}°N, ${basin.centerLon.toFixed(3)}°E · Click any location node to inspect`}
        </div>

        {/* Map Legend */}
        <div className="absolute bottom-3 right-3 bg-slate-950/85 border border-slate-700/80 rounded px-3 py-1.5 flex items-center gap-3 text-[11px] text-slate-200">
          {layerMode === 'risk' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Nominal
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-600" /> Advisory
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600" /> Watch
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600" /> Critical
              </span>
            </>
          ) : layerMode === 'slope' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> &lt;28°
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-600" /> 28–34°
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600" /> 34–40°
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600" /> &gt;40° Steep
              </span>
            </>
          ) : layerMode === 'moisture' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500" /> 60–75%
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-600" /> 75–88%
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> &gt;88% Saturated
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Valley (&lt;1500m)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Mid (1500–2200m)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Alpine (&gt;2200m)
              </span>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
