import type {
  BasinPredictionResponse,
  BasinProfile,
  FeatureContribution,
  HydroTimePoint,
  RiskTier,
  ScenarioOverrides,
  VulnerableZone,
  ZonePrediction,
} from '../src/types/hydro.ts';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function horizonFactor(horizon: ScenarioOverrides['horizon']): number {
  switch (horizon) {
    case '1h':
      return 0.78;
    case '3h':
      return 0.94;
    case '6h':
      return 1.08;
    case '12h':
      return 1.18;
  }
}

function computeRiskTier(score: number): RiskTier {
  if (score >= 76) return 'Critical';
  if (score >= 54) return 'Watch';
  if (score >= 32) return 'Advisory';
  return 'Nominal';
}

/**
 * Modified SCS-CN + Kirpich-Bransby Time of Concentration + Logistic Ensemble
 * Evaluates multi-source inputs:
 * - Observed rainfall intensity (mm/hr)
 * - Short-range weather forecast accumulation (mm)
 * - Terrain elevation & orographic relief (m)
 * - Hillslope gradient (degrees)
 * - Antecedent soil moisture saturation (%)
 * - River stage & rise rate (when gauge telemetry is available)
 */
export function predictZoneFloodRisk(
  zone: VulnerableZone,
  basin: BasinProfile,
  overrides: ScenarioOverrides
): ZonePrediction {
  const effectiveRainfallMmHr = clamp(
    Number((zone.baseRainfallMmHr * overrides.rainfallMultiplier).toFixed(1)),
    0,
    240
  );

  const effectiveForecastMm = clamp(
    Math.round((zone.baseForecast6hMm + overrides.forecast6hAddMm) * horizonFactor(overrides.horizon)),
    0,
    450
  );

  const effectiveSoilMoisturePct = clamp(
    Math.round(zone.baseSoilMoisturePct + overrides.soilMoistureOffsetPct),
    15,
    100
  );

  const effectiveSlopeDeg = clamp(zone.slopeDeg * overrides.slopeSensitivity, 8, 60);

  // Determine whether river gauge data is available under current operational mode
  const hasRiverData =
    overrides.riverMode === 'unavailable'
      ? false
      : overrides.riverMode === 'available'
      ? zone.riverCondition.available
      : zone.riverCondition.available && zone.type !== 'Highway Corridor';

  // 1. Antecedent Moisture Condition adjustment to SCS Curve Number (CN)
  const moistureFactor = (effectiveSoilMoisturePct - 50) / 50; // -0.7 .. +1.0
  const slopeAdjustedCN = clamp(
    zone.baseCurveNumber + moistureFactor * 9.5 + (effectiveSlopeDeg - 30) * 0.14,
    52,
    97
  );
  const potentialRetentionMm = (25400 / slopeAdjustedCN) - 254;
  const stormPrecipMm = effectiveRainfallMmHr * 1.8 + effectiveForecastMm * 0.55;
  const initialAbstraction = 0.15 * potentialRetentionMm;
  const runoffDepthMm =
    stormPrecipMm > initialAbstraction
      ? Math.pow(stormPrecipMm - initialAbstraction, 2) /
        (stormPrecipMm - initialAbstraction + potentialRetentionMm)
      : 0;

  // 2. Kirpich-style hilly catchment time-of-concentration (minutes)
  const channelLengthKm = Math.sqrt(zone.catchmentAreaKm2) * 1.35;
  const slopeRatio = Math.tan((effectiveSlopeDeg * Math.PI) / 180);
  const rawTcMin = 18 * Math.pow(channelLengthKm, 0.77) / Math.pow(Math.max(slopeRatio, 0.08), 0.385);
  const saturationSpeedup = 1 - ((effectiveSoilMoisturePct - 50) / 220);
  const rainIntensitySpeedup = 1 - Math.min(effectiveRainfallMmHr / 260, 0.35);
  const timeToPeakMin = Math.round(clamp(rawTcMin * saturationSpeedup * rainIntensitySpeedup, 18, 240));

  // 3. Peak discharge estimation (Rational / SCS Peak proxy in m3/s)
  const baseFlow = zone.riverCondition.available && zone.riverCondition.dischargeM3s
    ? zone.riverCondition.dischargeM3s * (0.75 + overrides.rainfallMultiplier * 0.25)
    : zone.catchmentAreaKm2 * 2.1 * (effectiveSoilMoisturePct / 75);
  const stormRunoffM3s = (runoffDepthMm * zone.catchmentAreaKm2 * 0.278) / Math.max(timeToPeakMin / 60, 0.45);
  const peakDischargeM3s = Math.round(baseFlow + stormRunoffM3s);

  // 4. Normalized component sub-scores (0..1)
  const sRainfall = clamp(effectiveRainfallMmHr / 85, 0, 1.25);
  const sForecast = clamp(effectiveForecastMm / 185, 0, 1.25);
  const sSoil = clamp((effectiveSoilMoisturePct - 35) / 62, 0, 1.15);
  const sSlope = clamp((effectiveSlopeDeg - 15) / 34, 0, 1.15);

  // Elevation relief factor: mid-lower gorge constriction zones amplify convergence
  const [minElev, maxElev] = basin.elevationRangeM;
  const relElev = clamp((zone.elevationM - minElev) / Math.max(maxElev - minElev, 1), 0, 1);
  // Lower valley constrictions receive upslope accumulation, while very high steep chutes accelerate debris
  const sElevation = clamp(0.45 + (1 - relElev) * 0.42 + (zone.drainageDensityKmKm2 - 3.0) * 0.08, 0.2, 1.1);

  let sRiver = 0;
  let inferredRiverIndex = Math.round(clamp((sRainfall * 0.42 + sSoil * 0.34 + sSlope * 0.24) * 86, 8, 98));

  if (hasRiverData && zone.riverCondition.stageM !== undefined && zone.riverCondition.dangerStageM !== undefined) {
    const adjustedStage =
      zone.riverCondition.stageM * (0.72 + overrides.rainfallMultiplier * 0.28) +
      (overrides.forecast6hAddMm / 250);
    const stageRatio = adjustedStage / zone.riverCondition.dangerStageM;
    const riseFactor = clamp((zone.riverCondition.riseRateCmHr ?? 15) * overrides.rainfallMultiplier / 45, 0, 1.2);
    sRiver = clamp(stageRatio * 0.72 + riseFactor * 0.32, 0, 1.25);
    inferredRiverIndex = Math.round(clamp(sRiver * 85, 5, 99));
  }

  // 5. Gradient-boosted nonlinear interaction terms (saturated soil + cloudburst + steep slope)
  const saturationSynergy = sRainfall * sSoil * 0.26;
  const geomorphicSynergy = sSlope * sForecast * 0.18;

  let rawLogit: number;
  let rawWeights: Record<FeatureContribution['factor'], number>;

  if (hasRiverData) {
    rawWeights = {
      'Rainfall': sRainfall * 0.27 + saturationSynergy * 0.5,
      'Weather Forecast': sForecast * 0.20 + geomorphicSynergy * 0.5,
      'Soil Moisture': sSoil * 0.18 + saturationSynergy * 0.5,
      'Slope': sSlope * 0.14 + geomorphicSynergy * 0.5,
      'Elevation': sElevation * 0.08,
      'River Conditions': sRiver * 0.23,
    };
    rawLogit =
      (rawWeights['Rainfall'] +
        rawWeights['Weather Forecast'] +
        rawWeights['Soil Moisture'] +
        rawWeights['Slope'] +
        rawWeights['Elevation'] +
        rawWeights['River Conditions']) *
        3.2 -
      1.68;
  } else {
    // Ungauged / river telemetry unavailable: re-weight to terrain-hydrological inference
    rawWeights = {
      'Rainfall': sRainfall * 0.33 + saturationSynergy * 0.55,
      'Weather Forecast': sForecast * 0.24 + geomorphicSynergy * 0.5,
      'Soil Moisture': sSoil * 0.23 + saturationSynergy * 0.45,
      'Slope': sSlope * 0.19 + geomorphicSynergy * 0.5,
      'Elevation': sElevation * 0.12,
      'River Conditions': 0,
    };
    rawLogit =
      (rawWeights['Rainfall'] +
        rawWeights['Weather Forecast'] +
        rawWeights['Soil Moisture'] +
        rawWeights['Slope'] +
        rawWeights['Elevation']) *
        3.1 -
      1.64;
  }

  const floodProbability = clamp(1 / (1 + Math.exp(-rawLogit)), 0.02, 0.98);
  const riskScore = Math.round(floodProbability * 100);
  const riskTier = computeRiskTier(riskScore);

  const confidencePct = hasRiverData
    ? Math.round(clamp(91 - Math.abs(overrides.rainfallMultiplier - 1) * 4, 84, 96))
    : Math.round(clamp(79 - Math.abs(overrides.rainfallMultiplier - 1) * 5, 68, 83));

  // Normalize SHAP-style attributions to sum to 100%
  const totalWeight = Object.values(rawWeights).reduce((acc, v) => acc + v, 0) || 1;
  const contributions: FeatureContribution[] = [
    {
      factor: 'Rainfall',
      weightPct: Math.round((rawWeights['Rainfall'] / totalWeight) * 100),
      rawValueLabel: `${effectiveRainfallMmHr} mm/h`,
      available: true,
    },
    {
      factor: 'Weather Forecast',
      weightPct: Math.round((rawWeights['Weather Forecast'] / totalWeight) * 100),
      rawValueLabel: `${effectiveForecastMm} mm (${overrides.horizon})`,
      available: true,
    },
    {
      factor: 'Soil Moisture',
      weightPct: Math.round((rawWeights['Soil Moisture'] / totalWeight) * 100),
      rawValueLabel: `${effectiveSoilMoisturePct}% sat.`,
      available: true,
    },
    {
      factor: 'Slope',
      weightPct: Math.round((rawWeights['Slope'] / totalWeight) * 100),
      rawValueLabel: `${effectiveSlopeDeg.toFixed(1)}°`,
      available: true,
    },
    {
      factor: 'Elevation',
      weightPct: Math.round((rawWeights['Elevation'] / totalWeight) * 100),
      rawValueLabel: `${zone.elevationM} m`,
      available: true,
    },
    {
      factor: 'River Conditions',
      weightPct: hasRiverData ? Math.round((rawWeights['River Conditions'] / totalWeight) * 100) : 0,
      rawValueLabel:
        hasRiverData && zone.riverCondition.stageM !== undefined
          ? `${(zone.riverCondition.stageM * (0.72 + overrides.rainfallMultiplier * 0.28)).toFixed(2)}m / ${zone.riverCondition.dangerStageM}m`
          : 'Gauge unavailable (inferred)',
      available: hasRiverData,
    },
  ];

  // Fix rounding drift so percentages sum to 100
  const sumPct = contributions.reduce((acc, c) => acc + c.weightPct, 0);
  if (sumPct !== 100 && contributions.length > 0) {
    contributions[0].weightPct += 100 - sumPct;
  }

  return {
    zoneId: zone.id,
    riskScore,
    floodProbability: Number(floodProbability.toFixed(3)),
    riskTier,
    effectiveRainfallMmHr,
    effectiveForecastMm,
    effectiveSoilMoisturePct,
    runoffDepthMm: Number(runoffDepthMm.toFixed(1)),
    peakDischargeM3s,
    timeToPeakMin,
    confidencePct,
    riverDataUsed: hasRiverData,
    inferredRiverIndex,
    contributions,
  };
}

export function buildBasinTimeline(
  basin: BasinProfile,
  predictions: ZonePrediction[],
  overrides: ScenarioOverrides
): HydroTimePoint[] {
  const peakPred = [...predictions].sort((a, b) => b.riskScore - a.riskScore)[0];
  const peakZone = basin.zones.find((z) => z.id === peakPred?.zoneId) ?? basin.zones[0];

  const baseRain = peakPred?.effectiveRainfallMmHr ?? peakZone.baseRainfallMmHr;
  const peakQ = peakPred?.peakDischargeM3s ?? 420;
  const criticalQ = Math.round(
    (peakZone.riverCondition.dischargeM3s ?? 320) * 1.38
  );

  const points: HydroTimePoint[] = [];
  for (let h = -8; h <= 8; h++) {
    const isForecast = h > 0;
    const label = h === 0 ? 'Now' : h > 0 ? `+${h}h` : `${h}h`;

    // Synthetic storm hyetograph peaking around +1h..+3h
    const rainBell =
      h <= 0
        ? Math.exp(-Math.pow((h + 1) / 4.2, 2)) * 0.85
        : Math.exp(-Math.pow((h - 2) / 3.4, 2)) * (0.95 + overrides.forecast6hAddMm / 220);

    const rainfallMmHr = Number(clamp(baseRain * rainBell, 2, 210).toFixed(1));

    // Lagged catchment hydrograph response peaking 1-2h after peak rainfall
    const hydroBell = Math.exp(-Math.pow((h - 2.4) / 4.0, 2));
    const baseFlow = peakQ * 0.34;
    const dischargeM3s = Math.round(baseFlow + (peakQ - baseFlow) * hydroBell);
    const inferredRunoffIndex = Math.round(clamp((dischargeM3s / Math.max(criticalQ, 1)) * 78, 8, 99));

    points.push({
      hourOffset: h,
      label,
      isForecast,
      rainfallMmHr,
      dischargeM3s,
      inferredRunoffIndex,
      criticalThresholdM3s: criticalQ,
    });
  }
  return points;
}

export function predictBasin(
  basin: BasinProfile,
  overrides: ScenarioOverrides
): BasinPredictionResponse {
  const predictions = basin.zones.map((zone) => predictZoneFloodRisk(zone, basin, overrides));
  const sortedByRisk = [...predictions].sort((a, b) => b.riskScore - a.riskScore);
  const highestScore = sortedByRisk[0]?.riskScore ?? 0;
  const avgTopTwo =
    sortedByRisk.length >= 2
      ? Math.round((sortedByRisk[0].riskScore * 0.65 + sortedByRisk[1].riskScore * 0.35))
      : highestScore;

  const criticalZoneCount = predictions.filter((p) => p.riskTier === 'Critical').length;
  const watchZoneCount = predictions.filter((p) => p.riskTier === 'Watch').length;
  const earliestLeadTimeMin = Math.min(...predictions.map((p) => p.timeToPeakMin));

  const exposedZoneIds = new Set(
    predictions.filter((p) => p.riskTier === 'Critical' || p.riskTier === 'Watch').map((p) => p.zoneId)
  );
  const totalPopulationExposed = basin.zones
    .filter((z) => exposedZoneIds.has(z.id))
    .reduce((sum, z) => sum + z.populationAtRisk, 0);

  return {
    basinId: basin.id,
    generatedAt: new Date().toISOString(),
    overallRiskScore: avgTopTwo,
    overallTier: computeRiskTier(avgTopTwo),
    criticalZoneCount,
    watchZoneCount,
    earliestLeadTimeMin,
    totalPopulationExposed,
    predictions,
    timeline: buildBasinTimeline(basin, predictions, overrides),
  };
}
