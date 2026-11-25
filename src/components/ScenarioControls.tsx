import React, { useState } from 'react';
import {
  CloudRain,
  RotateCcw,
  RefreshCw,
  Upload,
  ChevronDown,
  ChevronUp,
  Check,
  AlertTriangle,
} from 'lucide-react';
import type {
  BasinProfile,
  ForecastHorizon,
  LiveWeatherSync,
  RiverAvailabilityMode,
  ScenarioOverrides,
} from '../types/hydro';

interface ScenarioControlsProps {
  basins: BasinProfile[];
  selectedBasinId: string;
  onSelectBasin: (id: string) => void;
  overrides: ScenarioOverrides;
  onUpdateOverrides: (patch: Partial<ScenarioOverrides>) => void;
  onResetOverrides: () => void;
  onSyncWeather: () => void;
  isSyncingWeather: boolean;
  weatherSync: LiveWeatherSync | null;
  weatherError: string | null;
  onImportCsvTelemetry: (csvText: string) => void;
  importFeedback: string | null;
}

const HORIZONS: ForecastHorizon[] = ['1h', '3h', '6h', '12h'];

const RIVER_MODES: Array<{ id: RiverAvailabilityMode; label: string }> = [
  { id: 'available', label: 'Available' },
  { id: 'partial', label: 'Partial' },
  { id: 'unavailable', label: 'Ungauged' },
];

const SAMPLE_CSV = `zoneId,rainfallMmHr,forecast6hMm,soilMoisturePct,riverStageM
dikchu-confluence,78,165,94,5.35
melli-bridge,54,120,86,6.32
rangit-bazaar,82,175,92,`;

export const ScenarioControls: React.FC<ScenarioControlsProps> = ({
  basins,
  selectedBasinId,
  onSelectBasin,
  overrides,
  onUpdateOverrides,
  onResetOverrides,
  onSyncWeather,
  isSyncingWeather,
  weatherSync,
  weatherError,
  onImportCsvTelemetry,
  importFeedback,
}) => {
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvDraft, setCsvDraft] = useState(SAMPLE_CSV);
  const [expandedGroup, setExpandedGroup] = useState<'meteorology' | 'terrain' | 'all'>('all');

  const activeBasin = basins.find((b) => b.id === selectedBasinId) ?? basins[0];

  const applyPreset = (preset: 'baseline' | 'cloudburst' | 'saturated' | 'ungauged') => {
    if (preset === 'baseline') {
      onResetOverrides();
    } else if (preset === 'cloudburst') {
      onUpdateOverrides({
        rainfallMultiplier: 1.85,
        forecast6hAddMm: 75,
        soilMoistureOffsetPct: 12,
        slopeSensitivity: 1.08,
        horizon: '3h',
      });
    } else if (preset === 'saturated') {
      onUpdateOverrides({
        rainfallMultiplier: 1.35,
        forecast6hAddMm: 45,
        soilMoistureOffsetPct: 24,
        slopeSensitivity: 1.15,
        horizon: '6h',
      });
    } else if (preset === 'ungauged') {
      onUpdateOverrides({
        rainfallMultiplier: 1.45,
        forecast6hAddMm: 40,
        soilMoistureOffsetPct: 14,
        riverMode: 'unavailable',
      });
    }
  };

  return (
    <aside className="w-full lg:w-[340px] shrink-0 bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-5">
      {/* Watershed Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="basin-select"
            className="text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Target Watershed
          </label>
          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
            {activeBasin.elevationRangeM[0]}–{activeBasin.elevationRangeM[1]}m
          </span>
        </div>
        <select
          id="basin-select"
          value={selectedBasinId}
          onChange={(e) => onSelectBasin(e.target.value)}
          className="w-full px-3 py-2 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {basins.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-slate-600 leading-relaxed">{activeBasin.description}</p>
      </div>

      <div className="h-px bg-slate-100" />

      {/* Live Mountain Weather Sync */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Weather Telemetry
          </span>
          <button
            type="button"
            onClick={onSyncWeather}
            disabled={isSyncingWeather}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3 h-3 ${isSyncingWeather ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{isSyncingWeather ? 'Syncing...' : 'Sync Open-Meteo'}</span>
          </button>
        </div>

        {weatherSync ? (
          <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs space-y-1">
            <div className="flex items-center justify-between text-slate-700">
              <span className="font-medium flex items-center gap-1.5">
                <CloudRain className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                Live Basin Feed
              </span>
              <span className="font-mono tabular-nums text-slate-500">
                {weatherSync.temperatureC}°C
              </span>
            </div>
            <div className="flex items-center justify-between font-mono tabular-nums text-[11px] text-slate-600">
              <span>Now: {weatherSync.currentRainMmHr} mm/h</span>
              <span>6h: {weatherSync.forecast6hMm} mm</span>
              <span>Soil: {weatherSync.soilMoisturePct}%</span>
            </div>
          </div>
        ) : weatherError ? (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-2.5 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{weatherError}</span>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Using calibrated basin sensor baseline ({activeBasin.centerLat.toFixed(2)}°N,{' '}
            {activeBasin.centerLon.toFixed(2)}°E). Sync live mountain forecast above.
          </p>
        )}
      </div>

      <div className="h-px bg-slate-100" />

      {/* Forecast Horizon & River Availability */}
      <div className="space-y-4">
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Forecast Horizon
          </span>
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-md">
            {HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onUpdateOverrides({ horizon: h })}
                className={`py-1.5 text-xs font-mono font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  overrides.horizon === h
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                +{h}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              River Gauge Telemetry
            </span>
            <span className="text-[11px] text-slate-500">Where available</span>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md">
            {RIVER_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onUpdateOverrides({ riverMode: m.id })}
                className={`py-1.5 px-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  overrides.riverMode === m.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 leading-snug">
            {overrides.riverMode === 'unavailable'
              ? 'All river gauges masked: ML switches to terrain + soil moisture + rainfall runoff proxy.'
              : overrides.riverMode === 'partial'
              ? 'Highway culverts & ungauged spurs use terrain runoff inference.'
              : 'Active weir stages fused directly with rainfall & terrain predictors.'}
          </p>
        </div>
      </div>

      <div className="h-px bg-slate-100" />

      {/* Multi-Source Sensitivity Scrubbers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Model Input Simulation
          </span>
          <button
            type="button"
            onClick={() =>
              setExpandedGroup((prev) => (prev === 'all' ? 'meteorology' : 'all'))
            }
            className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>{expandedGroup === 'all' ? 'Compact' : 'Expand'}</span>
            {expandedGroup === 'all' ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Rainfall Multiplier */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label htmlFor="rain-slider" className="font-medium text-slate-700">
              Rainfall Intensity Multiplier
            </label>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {overrides.rainfallMultiplier.toFixed(2)}×
            </span>
          </div>
          <input
            id="rain-slider"
            type="range"
            min={0.4}
            max={2.4}
            step={0.05}
            value={overrides.rainfallMultiplier}
            onChange={(e) =>
              onUpdateOverrides({ rainfallMultiplier: parseFloat(e.target.value) })
            }
            className="w-full hydro-slider"
          />
        </div>

        {/* Forecast Anomaly */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label htmlFor="forecast-slider" className="font-medium text-slate-700">
              Forecast Rainfall Anomaly
            </label>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {overrides.forecast6hAddMm >= 0 ? '+' : ''}
              {overrides.forecast6hAddMm} mm
            </span>
          </div>
          <input
            id="forecast-slider"
            type="range"
            min={-40}
            max={140}
            step={5}
            value={overrides.forecast6hAddMm}
            onChange={(e) =>
              onUpdateOverrides({ forecast6hAddMm: parseInt(e.target.value, 10) })
            }
            className="w-full hydro-slider"
          />
        </div>

        {/* Soil Moisture */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label htmlFor="soil-slider" className="font-medium text-slate-700">
              Soil Moisture Offset
            </label>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {overrides.soilMoistureOffsetPct >= 0 ? '+' : ''}
              {overrides.soilMoistureOffsetPct}%
            </span>
          </div>
          <input
            id="soil-slider"
            type="range"
            min={-30}
            max={25}
            step={1}
            value={overrides.soilMoistureOffsetPct}
            onChange={(e) =>
              onUpdateOverrides({ soilMoistureOffsetPct: parseInt(e.target.value, 10) })
            }
            className="w-full hydro-slider"
          />
        </div>

        {expandedGroup === 'all' && (
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="slope-slider" className="font-medium text-slate-700">
                Slope Runoff Weighting
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {overrides.slopeSensitivity.toFixed(2)}×
              </span>
            </div>
            <input
              id="slope-slider"
              type="range"
              min={0.8}
              max={1.3}
              step={0.02}
              value={overrides.slopeSensitivity}
              onChange={(e) =>
                onUpdateOverrides({ slopeSensitivity: parseFloat(e.target.value) })
              }
              className="w-full hydro-slider"
            />
          </div>
        )}
      </div>

      {/* Stress Test Presets */}
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Scenario Stress Tests
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => applyPreset('cloudburst')}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer text-left truncate"
          >
            Cloudburst Event
          </button>
          <button
            type="button"
            onClick={() => applyPreset('saturated')}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer text-left truncate"
          >
            Saturated Monsoon
          </button>
          <button
            type="button"
            onClick={() => applyPreset('ungauged')}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded hover:border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer text-left truncate"
          >
            Ungauged Surge
          </button>
          <button
            type="button"
            onClick={() => applyPreset('baseline')}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>Reset Baseline</span>
          </button>
        </div>
      </div>

      {/* Custom Telemetry CSV Ingest */}
      <div className="pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setShowCsvModal((v) => !v)}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{showCsvModal ? 'Close CSV Telemetry Import' : 'Import Sensor CSV Batch'}</span>
        </button>

        {importFeedback && (
          <p className="mt-2 text-xs text-emerald-700 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{importFeedback}</span>
          </p>
        )}

        {showCsvModal && (
          <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
            <label
              htmlFor="csv-telemetry-input"
              className="block text-[11px] font-medium text-slate-600"
            >
              Paste CSV rows (`zoneId,rainfallMmHr,forecast6hMm,soilMoisturePct,riverStageM`)
            </label>
            <textarea
              id="csv-telemetry-input"
              rows={4}
              value={csvDraft}
              onChange={(e) => setCsvDraft(e.target.value)}
              className="w-full p-2 text-[11px] font-mono bg-white border border-slate-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onImportCsvTelemetry(csvDraft);
                  setShowCsvModal(false);
                }}
                className="px-3 py-1 text-xs font-medium text-white bg-slate-900 rounded hover:bg-blue-700 cursor-pointer"
              >
                Apply Readings
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
