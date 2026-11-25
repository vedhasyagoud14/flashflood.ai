import React, { useState } from 'react';
import type { HydroTimePoint, RiverAvailabilityMode } from '../types/hydro';

interface HydrographChartProps {
  timeline: HydroTimePoint[];
  riverMode: RiverAvailabilityMode;
  basinName: string;
}

export const HydrographChart: React.FC<HydrographChartProps> = ({
  timeline,
  riverMode,
  basinName,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (timeline.length === 0) return null;

  const W = 760;
  const H = 250;
  const padL = 52;
  const padR = 52;
  const padT = 22;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxRain = Math.max(80, ...timeline.map((t) => t.rainfallMmHr)) * 1.15;
  const maxQ = Math.max(
    400,
    ...timeline.map((t) => Math.max(t.dischargeM3s, t.criticalThresholdM3s))
  ) * 1.15;

  const xForIdx = (i: number) => padL + (i / Math.max(1, timeline.length - 1)) * plotW;
  const yForQ = (q: number) => padT + plotH - (q / maxQ) * plotH;
  const yForRain = (r: number) => padT + plotH - (r / maxRain) * (plotH * 0.55);

  const nowIndex = timeline.findIndex((t) => t.hourOffset === 0);
  const nowX = nowIndex >= 0 ? xForIdx(nowIndex) : padL + plotW * 0.5;

  const qPath = timeline
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xForIdx(i).toFixed(1)} ${yForQ(pt.dischargeM3s).toFixed(1)}`)
    .join(' ');

  const qAreaPath = `${qPath} L ${xForIdx(timeline.length - 1).toFixed(1)} ${padT + plotH} L ${padL} ${padT + plotH} Z`;
  const thresholdY = yForQ(timeline[0].criticalThresholdM3s);

  const hovered = hoverIdx !== null ? timeline[hoverIdx] : null;

  return (
    <section
      id="hydrograph"
      aria-label="Multi-Source Hydrograph and Rainfall Forecast"
      className="bg-white border border-slate-200 rounded-lg p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Observed &amp; Forecast Hydrograph
          </h2>
          <p className="text-xs text-slate-500">
            {basinName} · {riverMode === 'unavailable' ? 'Terrain-Inferred Runoff Discharge' : 'Rainfall Intensity vs. Channel Discharge'} (-8h to +8h)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2 bg-sky-500/75 rounded-xs" /> Rainfall (mm/h)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-blue-700" /> {riverMode === 'unavailable' ? 'Inferred Flow (m³/s)' : 'Channel Flow (m³/s)'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-red-600" /> Flash Flood Threshold
          </span>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block cursor-crosshair"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Forecast shading */}
          <rect
            x={nowX}
            y={padT}
            width={padL + plotW - nowX}
            height={plotH}
            fill="#F8FAFC"
          />

          {/* Horizontal Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padT + plotH * (1 - frac);
            const qVal = Math.round(maxQ * frac);
            const rVal = Math.round((maxRain / 0.55) * frac * 0.55);
            return (
              <g key={frac}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + plotW}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeWidth={1}
                />
                <text
                  x={padL - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="#64748B"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {qVal}
                </text>
                {frac <= 0.6 && (
                  <text
                    x={padL + plotW + 8}
                    y={y + 3.5}
                    textAnchor="start"
                    fill="#0284C7"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {rVal}
                  </text>
                )}
              </g>
            );
          })}

          {/* Axis Units */}
          <text
            x={padL - 8}
            y={padT - 8}
            textAnchor="end"
            fill="#475569"
            fontSize="9.5"
            fontFamily="JetBrains Mono, monospace"
          >
            m³/s
          </text>
          <text
            x={padL + plotW + 8}
            y={padT - 8}
            textAnchor="start"
            fill="#0284C7"
            fontSize="9.5"
            fontFamily="JetBrains Mono, monospace"
          >
            mm/h
          </text>

          {/* Rainfall Hyetograph Bars */}
          {timeline.map((pt, i) => {
            const cx = xForIdx(i);
            const barW = Math.max(10, plotW / timeline.length - 10);
            const barTop = yForRain(pt.rainfallMmHr);
            const barH = Math.max(2, padT + plotH - barTop);
            return (
              <rect
                key={`rain-${pt.hourOffset}`}
                x={cx - barW / 2}
                y={barTop}
                width={barW}
                height={barH}
                rx={2}
                fill={pt.isForecast ? '#38BDF8' : '#0284C7'}
                opacity={pt.isForecast ? 0.45 : 0.68}
              />
            );
          })}

          {/* Discharge Area & Curve */}
          <path d={qAreaPath} fill="#2563EB" opacity={0.08} />
          <path
            d={qPath}
            fill="none"
            stroke="#1D4ED8"
            strokeWidth={2.25}
            strokeLinejoin="round"
          />

          {/* Critical Flash Flood Threshold */}
          <line
            x1={padL}
            y1={thresholdY}
            x2={padL + plotW}
            y2={thresholdY}
            stroke="#DC2626"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
          <text
            x={padL + 6}
            y={thresholdY - 5}
            fill="#DC2626"
            fontSize="9.5"
            fontWeight="600"
            fontFamily="JetBrains Mono, monospace"
          >
            Danger Threshold ({timeline[0].criticalThresholdM3s} m³/s)
          </text>

          {/* Present Time Marker */}
          <line
            x1={nowX}
            y1={padT}
            x2={nowX}
            y2={padT + plotH}
            stroke="#0F172A"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text
            x={nowX + 4}
            y={padT + 11}
            fill="#0F172A"
            fontSize="9.5"
            fontWeight="600"
            fontFamily="JetBrains Mono, monospace"
          >
            NOW → Forecast
          </text>

          {/* X-axis Labels */}
          {timeline.map((pt, i) => {
            if (i % 2 !== 0 && pt.hourOffset !== 0) return null;
            return (
              <text
                key={`xl-${pt.hourOffset}`}
                x={xForIdx(i)}
                y={H - 10}
                textAnchor="middle"
                fill={pt.hourOffset === 0 ? '#0F172A' : '#64748B'}
                fontWeight={pt.hourOffset === 0 ? '700' : '400'}
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {pt.label}
              </text>
            );
          })}

          {/* Hover Crosshair & Interactive Hit Targets */}
          {hoverIdx !== null && (
            <g pointerEvents="none">
              <line
                x1={xForIdx(hoverIdx)}
                y1={padT}
                x2={xForIdx(hoverIdx)}
                y2={padT + plotH}
                stroke="#475569"
                strokeWidth={1}
              />
              <circle
                cx={xForIdx(hoverIdx)}
                cy={yForQ(timeline[hoverIdx].dischargeM3s)}
                r={4.5}
                fill="#1D4ED8"
                stroke="#FFFFFF"
                strokeWidth={2}
              />
            </g>
          )}

          {timeline.map((pt, i) => {
            const sliceW = plotW / timeline.length;
            return (
              <rect
                key={`hit-${pt.hourOffset}`}
                x={xForIdx(i) - sliceW / 2}
                y={padT}
                width={sliceW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
            );
          })}
        </svg>

        {hovered && (
          <div className="mt-2 px-3 py-1.5 bg-slate-900 text-slate-100 rounded text-xs font-mono tabular-nums flex flex-wrap items-center justify-between gap-4">
            <span>
              Window: <strong>{hovered.label}</strong> ({hovered.isForecast ? 'Forecast' : 'Observed'})
            </span>
            <span>Rainfall: {hovered.rainfallMmHr} mm/h</span>
            <span>
              {riverMode === 'unavailable' ? 'Inferred Runoff Flow' : 'Channel Discharge'}:{' '}
              {hovered.dischargeM3s} m³/s
            </span>
            <span>Threshold: {hovered.criticalThresholdM3s} m³/s</span>
          </div>
        )}
      </div>
    </section>
  );
};
