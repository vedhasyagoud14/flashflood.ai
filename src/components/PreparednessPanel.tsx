import React, { useState } from 'react';
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  Send,
  AlertCircle,
  CheckSquare,
  Square,
} from 'lucide-react';
import type { GeminiPreparednessBrief } from '../types/hydro';

interface PreparednessPanelProps {
  brief: GeminiPreparednessBrief | null;
  isLoading: boolean;
  error: string | null;
  onGenerateBrief: (customQuestion?: string) => void;
  checkedActions: Record<string, boolean>;
  onToggleAction: (actionId: string) => void;
}

export const PreparednessPanel: React.FC<PreparednessPanelProps> = ({
  brief,
  isLoading,
  error,
  onGenerateBrief,
  checkedActions,
  onToggleAction,
}) => {
  const [question, setQuestion] = useState('');
  const [copiedBulletin, setCopiedBulletin] = useState(false);

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;
    onGenerateBrief(question.trim());
  };

  const handleCopyBulletin = async () => {
    if (!brief?.publicAlertBulletin) return;
    try {
      await navigator.clipboard.writeText(brief.publicAlertBulletin);
      setCopiedBulletin(true);
      setTimeout(() => setCopiedBulletin(false), 1800);
    } catch {
      // Fallback ignored in sandboxed clipboard restrictions
    }
  };

  return (
    <section
      id="preparedness"
      aria-label="Early Preparedness and AI Risk Synthesis"
      className="bg-white border border-slate-200 rounded-lg p-5 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            Early Preparedness &amp; Hydrological Decision Support
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            AI synthesis combining rainfall forecasts, hillslope geometry, soil saturation, and active river gauges
          </p>
        </div>

        <button
          type="button"
          onClick={() => onGenerateBrief()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors cursor-pointer whitespace-nowrap"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>{brief ? 'Refresh AI Preparedness Plan' : 'Generate AI Preparedness Plan'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-semibold">AI Risk Synthesis Unavailable</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {!brief && !isLoading && !error && (
        <div className="py-8 px-4 bg-slate-50 border border-dashed border-slate-300 rounded-md text-center space-y-2">
          <p className="text-sm font-medium text-slate-800">
            Ready to synthesize watershed telemetry into an early preparedness plan
          </p>
          <p className="text-xs text-slate-500 max-w-xl mx-auto">
            Click <strong>Run AI Forecast</strong> in the top bar or{' '}
            <strong>Generate AI Preparedness Plan</strong> above to produce zone-specific evacuation
            windows, physical trigger chains, and community alert bulletins grounded in your current
            simulation parameters.
          </p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3 py-4" aria-busy="true">
          <div className="h-4 bg-slate-100 rounded w-3/4 animate-pulse" />
          <div className="h-4 bg-slate-100 rounded w-1/2 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="h-24 bg-slate-100 rounded animate-pulse" />
            <div className="h-24 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
      )}

      {brief && !isLoading && (
        <div className="space-y-5">
          {/* Executive Risk Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 space-y-3">
              <p className="text-sm text-slate-800 leading-relaxed">{brief.executiveSummary}</p>
              <p className="text-xs text-slate-600 leading-relaxed">{brief.confidenceNote}</p>

              {/* Physical Trigger Chain */}
              <div className="pt-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Physical Trigger Chain
                </h3>
                <ol className="space-y-1.5 text-xs text-slate-700">
                  {brief.physicalTriggerChain.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="font-mono tabular-nums font-semibold text-blue-700 shrink-0">
                        0{idx + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Public Alert Bulletin & River Data Gap */}
            <div className="lg:col-span-4 space-y-3">
              <div className="bg-slate-900 text-slate-100 rounded-md p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    Dispatch Bulletin (SMS / Radio)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyBulletin}
                    className="inline-flex items-center gap-1 text-[11px] text-sky-300 hover:text-white cursor-pointer"
                  >
                    {copiedBulletin ? (
                      <>
                        <Check className="w-3 h-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs leading-relaxed font-mono text-slate-100">
                  {brief.publicAlertBulletin}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-700">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  River Telemetry Coverage Note
                </span>
                <p className="leading-relaxed">{brief.riverDataGapAdvisory}</p>
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-200" />

          {/* Preparedness Readiness Checklist */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Actionable Preparedness Checklist
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {brief.preparednessActions.map((act) => {
                const done = !!checkedActions[act.id];
                return (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => onToggleAction(act.id)}
                    className={`text-left p-3 rounded-md border transition-colors cursor-pointer flex items-start gap-2.5 ${
                      done
                        ? 'bg-emerald-50/50 border-emerald-200 text-slate-500'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                    }`}
                  >
                    {done ? (
                      <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mb-0.5">
                        <span className="font-mono font-semibold text-blue-700">{act.phase}</span>
                        <span aria-hidden="true">·</span>
                        <span>{act.owner}</span>
                      </div>
                      <div className={`text-xs font-semibold ${done ? 'line-through' : ''}`}>
                        {act.title}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-snug">{act.detail}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Custom Hydrologist Follow-Up Query */}
      <form onSubmit={handleAsk} className="pt-3 border-t border-slate-100 flex flex-wrap gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about specific culvert bottlenecks, road closures, or ungauged tributaries..."
          aria-label="Ask hydrological preparedness question"
          className="flex-1 min-w-[240px] px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        />
        <button
          type="submit"
          disabled={isLoading || !question.trim()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-md transition-colors cursor-pointer whitespace-nowrap"
        >
          <Send className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Analyze Query</span>
        </button>
      </form>
    </section>
  );
};
