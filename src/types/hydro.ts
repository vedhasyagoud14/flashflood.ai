export type RiskTier = 'Nominal' | 'Advisory' | 'Watch' | 'Critical';

export type ForecastHorizon = '1h' | '3h' | '6h' | '12h';

export type RiverAvailabilityMode = 'available' | 'partial' | 'unavailable';

export type MapLayerMode = 'risk' | 'slope' | 'moisture' | 'elevation';

export interface RiverCondition {
  available: boolean;
  stationName?: string;
  stageM?: number;
  dangerStageM?: number;
  dischargeM3s?: number;
  riseRateCmHr?: number;
}

export interface VulnerableZone {
  id: string;
  name: string;
  type: 'Settlement' | 'Bridge Crossing' | 'Highway Corridor' | 'Check Dam' | 'Valley School';
  populationAtRisk: number;
  lat: number;
  lon: number;
  mapX: number; // 0..1000 SVG coordinate
  mapY: number; // 0..640 SVG coordinate
  elevationM: number;
  slopeDeg: number;
  aspect: string;
  catchmentAreaKm2: number;
  drainageDensityKmKm2: number;
  baseCurveNumber: number;
  baseRainfallMmHr: number;
  baseForecast6hMm: number;
  baseSoilMoisturePct: number;
  riverCondition: RiverCondition;
  evacuationRoute: string;
  nearestShelter: string;
}

export interface ContourPath {
  elevationM: number;
  d: string;
  labelX: number;
  labelY: number;
}

export interface RiverSegment {
  id: string;
  name: string;
  order: 'main' | 'tributary';
  d: string;
}

export interface BasinProfile {
  id: string;
  name: string;
  region: string;
  elevationRangeM: [number, number];
  centerLat: number;
  centerLon: number;
  description: string;
  contours: ContourPath[];
  rivers: RiverSegment[];
  zones: VulnerableZone[];
}

export interface ScenarioOverrides {
  rainfallMultiplier: number; // 0.3 .. 2.5
  forecast6hAddMm: number; // -20 .. +140
  soilMoistureOffsetPct: number; // -25 .. +35
  slopeSensitivity: number; // 0.8 .. 1.3
  horizon: ForecastHorizon;
  riverMode: RiverAvailabilityMode;
}

export interface FeatureContribution {
  factor: 'Rainfall' | 'Weather Forecast' | 'Elevation' | 'Slope' | 'Soil Moisture' | 'River Conditions';
  weightPct: number;
  rawValueLabel: string;
  available: boolean;
}

export interface ZonePrediction {
  zoneId: string;
  riskScore: number; // 0..100
  floodProbability: number; // 0..1
  riskTier: RiskTier;
  effectiveRainfallMmHr: number;
  effectiveForecastMm: number;
  effectiveSoilMoisturePct: number;
  runoffDepthMm: number;
  peakDischargeM3s: number;
  timeToPeakMin: number;
  confidencePct: number;
  riverDataUsed: boolean;
  inferredRiverIndex: number; // 0..100
  contributions: FeatureContribution[];
}

export interface HydroTimePoint {
  hourOffset: number; // -12 .. +12
  label: string;
  isForecast: boolean;
  rainfallMmHr: number;
  dischargeM3s: number;
  inferredRunoffIndex: number;
  criticalThresholdM3s: number;
}

export interface BasinPredictionResponse {
  basinId: string;
  generatedAt: string;
  overallRiskScore: number;
  overallTier: RiskTier;
  criticalZoneCount: number;
  watchZoneCount: number;
  earliestLeadTimeMin: number;
  totalPopulationExposed: number;
  predictions: ZonePrediction[];
  timeline: HydroTimePoint[];
}

export interface GeminiPreparednessBrief {
  executiveSummary: string;
  confidenceNote: string;
  physicalTriggerChain: string[];
  priorityZones: Array<{
    zoneName: string;
    riskTier: string;
    primaryDriver: string;
    leadTimeWindow: string;
    actionRequired: string;
  }>;
  preparednessActions: Array<{
    id: string;
    phase: 'Immediate (0-1h)' | 'Short-Term (1-3h)' | 'Pre-Staging (3-6h)';
    title: string;
    owner: string;
    detail: string;
  }>;
  riverDataGapAdvisory: string;
  publicAlertBulletin: string;
}

export interface LiveWeatherSync {
  fetchedAt: string;
  source: string;
  currentRainMmHr: number;
  forecast6hMm: number;
  soilMoisturePct: number;
  temperatureC: number;
  hourlyRainMm: number[];
}
