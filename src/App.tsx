import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Download } from 'lucide-react';
import { BASIN_PROFILES } from './data/basins';
import { TopBar, type ActiveSection } from './components/TopBar';
import { ScenarioControls } from './components/ScenarioControls';
import { WatershedMap } from './components/WatershedMap';
import { HydrographChart } from './components/HydrographChart';
import { FeatureAttributionChart } from './components/FeatureAttributionChart';
import { VulnerabilityTable } from './components/VulnerabilityTable';
import { PreparednessPanel } from './components/PreparednessPanel';
import type {
  BasinPredictionResponse,
  BasinProfile,
  GeminiPreparednessBrief,
  LiveWeatherSync,
  RiskTier,
  ScenarioOverrides,
  VulnerableZone,
  ZonePrediction,
} from './types/hydro';

const DEFAULT_OVERRIDES: ScenarioOverrides = {
  rainfallMultiplier: 1.0,
  forecast6hAddMm: 0,
  soilMoistureOffsetPct: 0,
  slopeSensitivity: 1.0,
  horizon: '6h',
  riverMode: 'available',
};

function tierStatusText(tier: RiskTier) {
  switch (tier) {
    case 'Critical':
      return { glyph: '✖', cls: 'text-red-700' };
    case 'Watch':
      return { glyph: '■', cls: 'text-amber-700' };
    case 'Advisory':
      return { glyph: '▲', cls: 'text-sky-700' };
    default:
      return { glyph: '●', cls: 'text-emerald-700' };
  }
}

export default function App() {
  const [basins, setBasins] = useState<BasinProfile[]>(BASIN_PROFILES);
  const [selectedBasinId, setSelectedBasinId] = useState<string>(BASIN_PROFILES[0].id);
  const [overrides, setOverrides] = useState<ScenarioOverrides>(DEFAULT_OVERRIDES);
  const [selectedZoneId, setSelectedZoneId] = useState<string>(BASIN_PROFILES[0].zones[0].id);
  const [activeSection, setActiveSection] = useState<ActiveSection>('map');
  const [prediction, setPrediction] = useState<BasinPredictionResponse | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [weatherSync, setWeatherSync] = useState<LiveWeatherSync | null>(null);
  const [isSyncingWeather, setIsSyncingWeather] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [aiBrief, setAiBrief] = useState<GeminiPreparednessBrief | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [checkedActions, setCheckedActions] = useState<Record<string, boolean>>({});
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const activeBasin = useMemo(
    () => basins.find((b: BasinProfile) => b.id === selectedBasinId) ?? basins[0],
    [basins, selectedBasinId]
  );

  useEffect(() => {
    if (!activeBasin.zones.some((z: VulnerableZone) => z.id === selectedZoneId)) {
      setSelectedZoneId(activeBasin.zones[0].id);
    }
  }, [activeBasin, selectedZoneId]);

  useEffect(() => {
    setWeatherSync(null);
    setWeatherError(null);
    setAiBrief(null);
    setAiError(null);
  }, [selectedBasinId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsPredicting(true);
      try {
        const res = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ basinId: activeBasin.id, overrides, customBasin: activeBasin }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Prediction request failed');
        const data = (await res.json()) as BasinPredictionResponse;
        setPrediction(data);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error(err);
      } finally {
        setIsPredicting(false);
      }
    }, 60);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeBasin, overrides]);

  const handleUpdateOverrides = useCallback((patch: Partial<ScenarioOverrides>) => {
    setOverrides((prev: ScenarioOverrides) => ({ ...prev, ...patch }));
  }, []);

  const handleResetOverrides = useCallback(() => {
    setOverrides(DEFAULT_OVERRIDES);
    setBasins(BASIN_PROFILES);
    setImportFeedback(null);
  }, []);

  const handleSyncWeather = useCallback(async () => {
    setIsSyncingWeather(true);
    setWeatherError(null);
    try {
      const res = await fetch(
        `/api/weather?lat=${activeBasin.centerLat}&lon=${activeBasin.centerLon}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to sync mountain forecast');
      const sync = data as LiveWeatherSync;
      setWeatherSync(sync);

      const rainMult = sync.currentRainMmHr > 1
        ? Math.min(2.2, Math.max(0.5, Number((sync.currentRainMmHr / 35).toFixed(2))))
        : 0.65;
      const forecastDelta = Math.max(-35, Math.min(130, sync.forecast6hMm - 80));
      const soilOffset = Math.max(-25, Math.min(20, sync.soilMoisturePct - 78));
      setOverrides((prev: ScenarioOverrides) => ({
        ...prev,
        rainfallMultiplier: rainMult,
        forecast6hAddMm: forecastDelta,
        soilMoistureOffsetPct: soilOffset,
      }));
    } catch (err) {
      setWeatherError(err instanceof Error ? err.message : 'Weather sync error');
    } finally {
      setIsSyncingWeather(false);
    }
  }, [activeBasin]);

  const handleImportCsvTelemetry = useCallback(
    (csvText: string) => {
      const lines = csvText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        setImportFeedback('No telemetry rows found.');
        return;
      }

      let updatedCount = 0;
      setBasins((prev: BasinProfile[]) =>
        prev.map((b: BasinProfile) => {
          if (b.id !== activeBasin.id) return b;
          const nextZones = b.zones.map((zone: VulnerableZone) => {
            const matchLine = lines.find((line) => line.startsWith(`${zone.id},`));
            if (!matchLine) return zone;
            const parts = matchLine.split(',').map((s) => s.trim());
            const rain = parseFloat(parts[1]);
            const fcst = parseFloat(parts[2]);
            const soil = parseFloat(parts[3]);
            const stage = parts[4] ? parseFloat(parts[4]) : NaN;

            updatedCount++;
            return {
              ...zone,
              baseRainfallMmHr: Number.isFinite(rain) ? rain : zone.baseRainfallMmHr,
              baseForecast6hMm: Number.isFinite(fcst) ? fcst : zone.baseForecast6hMm,
              baseSoilMoisturePct: Number.isFinite(soil) ? soil : zone.baseSoilMoisturePct,
              riverCondition: Number.isFinite(stage)
                ? {
                    ...zone.riverCondition,
                    available: true,
                    stationName: zone.riverCondition.stationName ?? 'Imported Gauge',
                    stageM: stage,
                    dangerStageM: zone.riverCondition.dangerStageM ?? 5.5,
                  }
                : zone.riverCondition,
            };
          });
          return { ...b, zones: nextZones };
        })
      );

      setImportFeedback(
        updatedCount > 0
          ? `Applied telemetry updates to ${updatedCount} monitoring zone(s).`
          : 'No matching zoneId rows found in current basin.'
      );
    },
    [activeBasin.id]
  );

  const handleRunAiForecast = useCallback(
    async (customQuestion?: string) => {
      if (!prediction) return;
      setIsAnalyzingAi(true);
      setAiError(null);
      if (!customQuestion) {
        setActiveSection('preparedness');
        document.getElementById('preparedness')?.scrollIntoView({ behavior: 'smooth' });
      }
      try {
        const res = await fetch('/api/analyze-risk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            basin: activeBasin,
            prediction,
            overrides,
            customQuestion,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'AI synthesis failed');
        }
        setAiBrief(data as GeminiPreparednessBrief);
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'Unable to reach AI analysis service');
      } finally {
        setIsAnalyzingAi(false);
      }
    },
    [activeBasin, prediction, overrides]
  );

  const handleExportReport = useCallback(() => {
    if (!prediction) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      basin: {
        id: activeBasin.id,
        name: activeBasin.name,
        region: activeBasin.region,
      },
      scenarioOverrides: overrides,
      prediction,
      preparednessBrief: aiBrief,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crestline-${activeBasin.id}-forecast.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeBasin, overrides, prediction, aiBrief]);

  const handleSelectSection = (section: ActiveSection) => {
    setActiveSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectedZone = useMemo(
    () => activeBasin.zones.find((z: VulnerableZone) => z.id === selectedZoneId) ?? activeBasin.zones[0],
    [activeBasin, selectedZoneId]
  );

  const selectedZonePrediction = useMemo(
    () =>
      prediction?.predictions.find((p: ZonePrediction) => p.zoneId === selectedZone.id) ??
      prediction?.predictions[0],
    [prediction, selectedZone]
  );

  const overallTierMeta = tierStatusText(prediction?.overallTier ?? 'Nominal');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <TopBar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        onRunAiForecast={() => handleRunAiForecast()}
        isAnalyzingAi={isAnalyzingAi}
      />

      {/* Basin Telemetry KPI Strip */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-5 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 flex-1 min-w-[280px]">
            <div>
              <span className="block text-[11px] font-medium text-slate-500">
                Basin Risk Index
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-mono tabular-nums text-xl font-bold text-slate-900">
                  {prediction ? `${prediction.overallRiskScore}/100` : '--'}
                </span>
                <span className={`text-xs ${overallTierMeta.cls}`}>
                  {overallTierMeta.glyph} {prediction?.overallTier ?? 'Loading'}
                </span>
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-medium text-slate-500">
                Earliest Lead Time
              </span>
              <div className="font-mono tabular-nums text-xl font-bold text-slate-900 mt-0.5">
                {prediction ? `${prediction.earliestLeadTimeMin} min` : '--'}
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-medium text-slate-500">
                Watch / Critical Sites
              </span>
              <div className="font-mono tabular-nums text-xl font-bold text-slate-900 mt-0.5">
                {prediction
                  ? `${prediction.criticalZoneCount} Crit · ${prediction.watchZoneCount} Watch`
                  : '--'}
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-medium text-slate-500">
                Population Exposed
              </span>
              <div className="font-mono tabular-nums text-xl font-bold text-slate-900 mt-0.5">
                {prediction ? prediction.totalPopulationExposed.toLocaleString() : '--'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-500 font-mono tabular-nums hidden xl:inline">
              {isPredicting ? 'Recalculating ensemble...' : `Horizon +${overrides.horizon}`}
            </span>
            <button
              type="button"
              onClick={handleExportReport}
              disabled={!prediction}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Snapshot</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Workspace */}
      <main className="max-w-[1600px] w-full mx-auto px-5 py-5 flex flex-col lg:flex-row gap-5 items-start flex-1">
        <ScenarioControls
          basins={basins}
          selectedBasinId={selectedBasinId}
          onSelectBasin={setSelectedBasinId}
          overrides={overrides}
          onUpdateOverrides={handleUpdateOverrides}
          onResetOverrides={handleResetOverrides}
          onSyncWeather={handleSyncWeather}
          isSyncingWeather={isSyncingWeather}
          weatherSync={weatherSync}
          weatherError={weatherError}
          onImportCsvTelemetry={handleImportCsvTelemetry}
          importFeedback={importFeedback}
        />

        <div className="flex-1 min-w-0 w-full space-y-5">
          {/* Primary Topographic Vulnerability Map */}
          <WatershedMap
            basin={activeBasin}
            predictions={prediction?.predictions ?? []}
            selectedZoneId={selectedZone.id}
            onSelectZone={setSelectedZoneId}
          />

          {/* Hydrograph & Selected Zone Attribution */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
            <div className="xl:col-span-7">
              <HydrographChart
                timeline={prediction?.timeline ?? []}
                riverMode={overrides.riverMode}
                basinName={activeBasin.name}
              />
            </div>
            <div className="xl:col-span-5">
              {selectedZonePrediction && (
                <FeatureAttributionChart
                  zone={selectedZone}
                  prediction={selectedZonePrediction}
                />
              )}
            </div>
          </div>

          {/* Vulnerable Locations Triage Table */}
          <VulnerabilityTable
            zones={activeBasin.zones}
            predictions={prediction?.predictions ?? []}
            selectedZoneId={selectedZone.id}
            onSelectZone={setSelectedZoneId}
          />

          {/* Gemini AI Early Preparedness Panel */}
          <PreparednessPanel
            brief={aiBrief}
            isLoading={isAnalyzingAi}
            error={aiError}
            onGenerateBrief={handleRunAiForecast}
            checkedActions={checkedActions}
            onToggleAction={(id: string) =>
              setCheckedActions((prev: Record<string, boolean>) => ({ ...prev, [id]: !prev[id] }))
            }
          />
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-6">
        <div className="max-w-[1600px] mx-auto px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>Crestline Hydro · Mountain Watershed Flash Flood Early Warning</span>
          <span>Multi-source SCS-CN &amp; Kirpich Ensemble · River telemetry fused where available</span>
        </div>
      </footer>
    </div>
  );
}
