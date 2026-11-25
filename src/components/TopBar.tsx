import React from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

export type ActiveSection = 'map' | 'hydrograph' | 'locations' | 'preparedness';

interface TopBarProps {
  activeSection: ActiveSection;
  onSelectSection: (section: ActiveSection) => void;
  onRunAiForecast: () => void;
  isAnalyzingAi: boolean;
}

const NAV_ITEMS: Array<{ id: ActiveSection; label: string }> = [
  { id: 'map', label: 'Basin Map' },
  { id: 'hydrograph', label: 'Hydrograph' },
  { id: 'locations', label: 'Vulnerable Sites' },
  { id: 'preparedness', label: 'Preparedness' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onSelectSection,
  onRunAiForecast,
  isAnalyzingAi,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-[1600px] mx-auto px-5 h-14 flex items-center justify-between gap-8">
        <a
          href="#map"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection('map');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          Crestline Hydro
        </a>

        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`text-sm font-medium py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isActive
                    ? 'text-slate-900 border-blue-600'
                    : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onRunAiForecast}
            disabled={isAnalyzingAi}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            {isAnalyzingAi ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{isAnalyzingAi ? 'Synthesizing...' : 'Run AI Forecast'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
