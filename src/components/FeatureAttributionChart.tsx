import React from 'react';
import type { VulnerableZone, ZonePrediction } from '../types/hydro';

interface FeatureAttributionChartProps {
  zone: VulnerableZone;
  prediction: ZonePrediction;
}

function tierDisplayStyle(tier: ZonePrediction['riskTier']) {
  switch (tier) {
    case 'Critical':
      return { glyph: '✖', textClass: 'text-red-700' };
    case 'Watch':
      return { glyph: '■', textClass: 'text-amber-700' };
    case 'Advisory':
      return { glyph: '▲', textClass: 'text-sky-700' };
    default:
      return { glyph: '●', textClass: 'text-emerald-700' };
  }
}

export const FeatureAttributionChart: React.FC<FeatureAttributionChartProps> = ({
  zone,
  prediction,
}) => {
  const tierMeta = tierDisplayStyle(prediction.riskTier);

  // Spider / Radar vertices for 6 multi-source predictors (normalized 0..1)
  const radarSize = 210;
  const cx = radarSize / 2;
  const cy = radarSize / 2;
  const rMax = 72;

  const radarAxes = [
    { label: 'RAIN', norm: Math.min(1, prediction.effectiveRainfallMmHr / 90) },
    { label: 'FCST', norm: Math.min(1, prediction.effectiveForecastMm / 190) },
    { label: 'SOIL', norm: Math.min(1, prediction.effectiveSoilMoisturePct / 100) },
    { label: 'SLOPE', norm: Math.min(1, zone.slopeDeg / 50) },
    { label: 'RELIEF', norm: Math.min(1, 1 - (zone.elevationM - 600) / 3000 + 0.2) },
    {
      label: prediction.riverDataUsed ? 'RIVER' : 'PROXY',
      norm: Math.min(1, prediction.inferredRiverIndex / 100),
    },
  ];

  const angleFor = (idx: number) => (-Math.PI / 2) + (idx * 2 * Math.PI) / radarAxes.length;

  const polygonPoints = radarAxes
    .map((axis, i) => {
      const a = angleFor(i);
      const r = Math.max(0.12, axis.norm) * rMax;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    })
    .join(' ');

  return (
    <section
      aria-label="Selected Location Risk Attribution"
      className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-4"
    >
      {/* Selected Zone Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{zone.type}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{zone.elevationM}m elev</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{zone.slopeDeg}° {zone.aspect}</span>
          </div>
          <h3 className="font-display text-base font-semibold text-slate-900 mt-0.5">
            {zone.name}
          </h3>
        </div>

        <div className="text-right">
          <div className={`text-xs font-semibold ${tierMeta.textClass}`}>
            {tierMeta.glyph} {prediction.riskTier}
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {prediction.riskScore}
            <span className="text-xs font-normal text-slate-500 ml-1">/ 100</span>
          </div>
        </div>
      </div>

      {/* Key Hydrological Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-50 border border-slate-200/80 rounded p-2.5">
          <span className="block text-[11px] text-slate-500">Time-to-Peak</span>
          <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
            {prediction.timeToPeakMin} min
          </span>
        </div>
        <div className="bg-slate-50 border border-slate-200/80 rounded p-2.5">
          <span className="block text-[11px] text-slate-500">Est. Peak Flow</span>
          <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
            {prediction.peakDischargeM3s} m³/s
          </span>
        </div>
        <div className="bg-slate-50 border border-slate-200/80 rounded p-2.5">
          <span className="block text-[11px] text-slate-500">SCS Runoff Depth</span>
          <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
            {prediction.runoffDepthMm} mm
          </span>
        </div>
        <div className="bg-slate-50 border border-slate-200/80 rounded p-2.5">
          <span className="block text-[11px] text-slate-500">Model Confidence</span>
          <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
            {prediction.confidencePct}%
          </span>
        </div>
      </div>

      {/* Attribution Bars + Radar Polygon */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        <div className="md:col-span-7 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">
              Multi-Source Risk Attribution
            </span>
            <span className="text-[11px] text-slate-500">
              {prediction.riverDataUsed ? 'Gauge-Fused' : 'Terrain-Inferred'}
            </span>
          </div>

          {prediction.contributions.map((item) => (
            <div key={item.factor} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 font-medium">{item.factor}</span>
                <span className="font-mono tabular-nums text-[11px] text-slate-600">
                  {item.rawValueLabel} · <strong>{item.weightPct}%</strong>
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    !item.available
                      ? 'bg-slate-300'
                      : item.factor === 'Rainfall' || item.factor === 'Weather Forecast'
                      ? 'bg-blue-600'
                      : item.factor === 'Soil Moisture'
                      ? 'bg-cyan-600'
                      : item.factor === 'River Conditions'
                      ? 'bg-indigo-600'
                      : 'bg-amber-600'
                  }`}
                  style={{ width: `${Math.max(item.available ? 4 : 0, item.weightPct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Scientific Spider / Radar Calibration Chart */}
        <div className="md:col-span-5 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-3">
          <svg
            width={radarSize}
            height={radarSize}
            viewBox={`0 0 ${radarSize} ${radarSize}`}
            aria-label="Multi-factor hazard profile radar"
          >
            {[0.33, 0.66, 1].map((ring) => {
              const pts = radarAxes
                .map((_, i) => {
                  const a = angleFor(i);
                  const r = ring * rMax;
                  return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
                })
                .join(' ');
              return (
                <polygon
                  key={ring}
                  points={pts}
                  fill="none"
                  stroke="#CBD5E1"
                  strokeWidth={1}
                />
              );
            })}

            {radarAxes.map((axis, i) => {
              const a = angleFor(i);
              const x2 = cx + rMax * Math.cos(a);
              const y2 = cy + rMax * Math.sin(a);
              const lx = cx + (rMax + 18) * Math.cos(a);
              const ly = cy + (rMax + 18) * Math.sin(a);
              return (
                <g key={axis.label}>
                  <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#E2E8F0" strokeWidth={1} />
                  <text
                    x={lx}
                    y={ly + 3}
                    textAnchor="middle"
                    fill="#475569"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {axis.label}
                  </text>
                </g>
              );
            })}

            <polygon
              points={polygonPoints}
              fill="rgba(37, 99, 235, 0.18)"
              stroke="#2563EB"
              strokeWidth={2}
            />
          </svg>
          <span className="text-[11px] text-slate-500 text-center">
            Evacuation: <strong className="text-slate-700">{zone.evacuationRoute}</strong>
          </span>
        </div>
      </div>
    </section>
  );
};
