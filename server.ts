import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { BASIN_PROFILES } from './src/data/basins.ts';
import { predictBasin } from './server/hydroModel.ts';
import type {
  BasinProfile,
  GeminiPreparednessBrief,
  LiveWeatherSync,
  ScenarioOverrides,
} from './src/types/hydro.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// POST /api/predict — Run physics-informed ML ensemble for basin & scenario overrides
app.post('/api/predict', (req, res) => {
  try {
    const { basinId, overrides, customBasin } = req.body as {
      basinId?: string;
      overrides?: ScenarioOverrides;
      customBasin?: BasinProfile;
    };

    const basin = customBasin ?? BASIN_PROFILES.find((b) => b.id === basinId) ?? BASIN_PROFILES[0];
    const safeOverrides: ScenarioOverrides = {
      rainfallMultiplier: overrides?.rainfallMultiplier ?? 1,
      forecast6hAddMm: overrides?.forecast6hAddMm ?? 0,
      soilMoistureOffsetPct: overrides?.soilMoistureOffsetPct ?? 0,
      slopeSensitivity: overrides?.slopeSensitivity ?? 1,
      horizon: overrides?.horizon ?? '6h',
      riverMode: overrides?.riverMode ?? 'available',
    };

    const result = predictBasin(basin, safeOverrides);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Prediction computation failed';
    res.status(400).json({ error: message });
  }
});

// GET /api/weather?lat=...&lon=... — Fetch live Open-Meteo mountain weather & soil moisture
app.get('/api/weather', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'Valid lat and lon query parameters are required.' });
    return;
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,precipitation,rain` +
      `&hourly=precipitation,soil_moisture_0_to_7cm` +
      `&forecast_days=1&timezone=auto`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const upstream = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!upstream.ok) {
      res.status(502).json({ error: `Open-Meteo returned status ${upstream.status}` });
      return;
    }

    const data = (await upstream.json()) as {
      current?: { precipitation?: number; rain?: number; temperature_2m?: number };
      hourly?: { precipitation?: number[]; soil_moisture_0_to_7cm?: number[] };
    };

    const hourlyRain = (data.hourly?.precipitation ?? []).slice(0, 12);
    const forecast6hMm = Math.round(
      hourlyRain.slice(0, 6).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0)
    );
    const rawMoisture = data.hourly?.soil_moisture_0_to_7cm?.[0] ?? 0.34;
    // Volumetric water content (0.05..0.50 m3/m3) mapped to % field saturation
    const soilMoisturePct = Math.round(Math.min(100, Math.max(20, (rawMoisture / 0.45) * 100)));

    const payload: LiveWeatherSync = {
      fetchedAt: new Date().toISOString(),
      source: 'Open-Meteo Mountain Forecast',
      currentRainMmHr: Number((data.current?.precipitation ?? data.current?.rain ?? 0).toFixed(1)),
      forecast6hMm,
      soilMoisturePct,
      temperatureC: Number((data.current?.temperature_2m ?? 14).toFixed(1)),
      hourlyRainMm: hourlyRain,
    };

    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reach Open-Meteo weather service';
    res.status(502).json({ error: message });
  }
});

// POST /api/analyze-risk — Gemini hydrological risk & early preparedness synthesis
app.post('/api/analyze-risk', async (req, res) => {
  try {
    const { basin, prediction, overrides, customQuestion } = req.body as {
      basin: BasinProfile;
      prediction: ReturnType<typeof predictBasin>;
      overrides: ScenarioOverrides;
      customQuestion?: string;
    };

    if (!basin || !prediction) {
      res.status(400).json({ error: 'Basin profile and prediction state are required.' });
      return;
    }

    const ai = getGeminiClient();

    const zoneSummary = basin.zones.map((z) => {
      const p = prediction.predictions.find((item) => item.zoneId === z.id);
      return {
        name: z.name,
        type: z.type,
        populationAtRisk: z.populationAtRisk,
        elevationM: z.elevationM,
        slopeDeg: z.slopeDeg,
        aspect: z.aspect,
        evacuationRoute: z.evacuationRoute,
        nearestShelter: z.nearestShelter,
        riskScore: p?.riskScore,
        riskTier: p?.riskTier,
        rainfallMmHr: p?.effectiveRainfallMmHr,
        forecastAccumMm: p?.effectiveForecastMm,
        soilMoisturePct: p?.effectiveSoilMoisturePct,
        peakDischargeM3s: p?.peakDischargeM3s,
        timeToPeakMin: p?.timeToPeakMin,
        riverDataAvailable: p?.riverDataUsed,
        riverStation: z.riverCondition.stationName ?? 'Unavailable',
        confidencePct: p?.confidencePct,
      };
    });

    const prompt = [
      `Analyze the flash flood risk and generate an actionable early-preparedness decision brief for this hilly watershed.`,
      `Basin: ${basin.name} (${basin.region}), elevation ${basin.elevationRangeM[0]}m - ${basin.elevationRangeM[1]}m.`,
      `Scenario Controls: Horizon=${overrides.horizon}, River Gauge Availability=${overrides.riverMode}, Overall Basin Risk=${prediction.overallRiskScore}/100 (${prediction.overallTier}), Earliest Time-to-Peak=${prediction.earliestLeadTimeMin} min, Population in Watch/Critical Zones=${prediction.totalPopulationExposed}.`,
      customQuestion ? `Hydrologist Specific Question: ${customQuestion}` : '',
      `Zone Telemetry & ML Ensemble Predictions:\n${JSON.stringify(zoneSummary, null, 2)}`,
      `Rules: Ground every claim strictly in the provided numbers, slopes, elevations, lead times, and evacuation routes. Explicitly address zones where river gauge telemetry is unavailable (ungauged tributaries) and explain how terrain + soil moisture + rainfall inference covers that gap.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a senior mountain hydrologist and disaster-preparedness advisor. Provide concise, operational, scientifically grounded flash flood risk assessments and early preparedness actions. Keep prose crisp and direct.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: {
              type: Type.STRING,
              description: '2-3 sentence operational summary of the current basin flood threat and primary meteorological/terrain drivers.',
            },
            confidenceNote: {
              type: Type.STRING,
              description: 'Brief explanation of model confidence, highlighting gauge coverage vs terrain-inferred ungauged estimates.',
            },
            physicalTriggerChain: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3-4 concise steps explaining how antecedent soil saturation, steep slope runoff, rainfall, and river convergence interact.',
            },
            priorityZones: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  zoneName: { type: Type.STRING },
                  riskTier: { type: Type.STRING },
                  primaryDriver: { type: Type.STRING },
                  leadTimeWindow: { type: Type.STRING },
                  actionRequired: { type: Type.STRING },
                },
                required: ['zoneName', 'riskTier', 'primaryDriver', 'leadTimeWindow', 'actionRequired'],
              },
            },
            preparednessActions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  phase: {
                    type: Type.STRING,
                    description: 'Must be one of: Immediate (0-1h), Short-Term (1-3h), Pre-Staging (3-6h)',
                  },
                  title: { type: Type.STRING },
                  owner: { type: Type.STRING },
                  detail: { type: Type.STRING },
                },
                required: ['id', 'phase', 'title', 'owner', 'detail'],
              },
            },
            riverDataGapAdvisory: {
              type: Type.STRING,
              description: 'Guidance for sub-catchments missing live river gauge readings, or confirmation that all gauges are active.',
            },
            publicAlertBulletin: {
              type: Type.STRING,
              description: 'Ready-to-dispatch SMS/radio early warning bulletin (under 55 words) naming specific evacuation routes and shelters.',
            },
          },
          required: [
            'executiveSummary',
            'confidenceNote',
            'physicalTriggerChain',
            'priorityZones',
            'preparednessActions',
            'riverDataGapAdvisory',
            'publicAlertBulletin',
          ],
        },
      },
    });

    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      res.status(502).json({ error: 'Gemini returned an empty response.' });
      return;
    }

    const parsed = JSON.parse(rawText) as GeminiPreparednessBrief;
    res.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI risk synthesis failed.';
    const status = message.includes('403') || message.includes('PERMISSION_DENIED')
      ? 403
      : message.includes('429')
      ? 429
      : 500;
    res.status(status).json({ error: message });
  }
});

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Crestline Hydro server listening on http://localhost:${PORT}`);
  });
}

startServer();
