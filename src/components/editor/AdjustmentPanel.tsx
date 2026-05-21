import { useMemo } from 'react';
import { useAppStore, useAppActions, type LightLeakEdge } from '../../stores/appStore';
import { getFilterById, FILTER_CATEGORIES, SLIDER_CONFIGS } from '../../data/filters';
import type { SliderConfig } from '../../types/filter';
import Tooltip from '../shared/Tooltip';

/* ─── Slider id sequences (Halation OR Flash Position depending on category) ── */

const BASE_SLIDER_IDS = [
  'grain', 'vignette', 'fade', 'colorTemp', 'saturation', 'halation',
] as const;

const FLASH_SLIDER_IDS = [
  'grain', 'vignette', 'fade', 'colorTemp', 'saturation',
  'flashPositionH', 'flashPositionV',
] as const;

const EDIT_SLIDER_IDS = [
  'exposure', 'contrast', 'highlights', 'shadows', 'sharpness', 'edittint',
] as const;

/* ─── Value formatting per slider id ─────────────────────────────────────── */

function formatValue(id: string, value: number): string {
  if (id === 'colorTemp')   return `${value > 0 ? '+' : ''}${value}°`;
  if (id === 'saturation')  return `${value > 0 ? '+' : ''}${value}`;
  return `${value}`;
}

/* ─── Custom Slider ──────────────────────────────────────────────────────── */

function DiceIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"
         strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <circle cx="5.5" cy="5.5" r="0.6" fill="currentColor" />
      <circle cx="10.5" cy="5.5" r="0.6" fill="currentColor" />
      <circle cx="8" cy="8" r="0.6" fill="currentColor" />
      <circle cx="5.5" cy="10.5" r="0.6" fill="currentColor" />
      <circle cx="10.5" cy="10.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

interface SliderProps {
  config:       SliderConfig;
  value:        number;
  hintsEnabled: boolean;
  onChange:     (v: number) => void;
  onAuxAction?: () => void;          // small icon button to the right of the label
  auxIcon?:     React.ReactNode;
  auxTitle?:    string;
}

function Slider({ config, value, hintsEnabled, onChange, onAuxAction, auxIcon, auxTitle }: SliderProps) {
  const { id, label, min, max, step, hintText } = config;
  const range = max - min;

  // For signed sliders (min < 0), fill from the centre outward toward `value`.
  // For 0+ sliders, fill from the left edge.
  const { fillLeftPct, fillWidthPct } = useMemo(() => {
    if (min < 0) {
      const zeroPct  = (-min / range) * 100;
      const valuePct = ((value - min) / range) * 100;
      if (value >= 0) {
        return { fillLeftPct: zeroPct,  fillWidthPct: valuePct - zeroPct };
      }
      return   { fillLeftPct: valuePct, fillWidthPct: zeroPct  - valuePct };
    }
    const pct = ((value - min) / range) * 100;
    return { fillLeftPct: 0, fillWidthPct: pct };
  }, [value, min, range]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-sans font-medium tracking-wide text-film-text truncate">
            {label}
          </span>
          {hintsEnabled && (
            <Tooltip content={hintText}>
              <span className="text-[10px] leading-none w-3.5 h-3.5 inline-flex items-center justify-center rounded-full border border-film-border text-film-text-dim">
                i
              </span>
            </Tooltip>
          )}
          {onAuxAction && auxIcon && (
            <button
              type="button"
              onClick={onAuxAction}
              title={auxTitle}
              className="w-4 h-4 inline-flex items-center justify-center text-film-text-dim hover:text-film-amber transition-colors"
            >
              {auxIcon}
            </button>
          )}
        </div>
        <span className="text-[11px] text-film-amber font-medium tabular-nums shrink-0">
          {formatValue(id, value)}
        </span>
      </div>
      <div className="relative h-4">
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[3px] bg-film-border rounded-full pointer-events-none" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[3px] bg-film-amber rounded-full pointer-events-none"
          style={{ left: `${fillLeftPct}%`, width: `${fillWidthPct}%` }}
        />
        <input
          type="range"
          className="custom-range absolute inset-0"
          min={min} max={max} step={step ?? 1}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
          aria-label={label}
        />
      </div>
    </div>
  );
}

/* ─── Toggle Switch ──────────────────────────────────────────────────────── */

interface ToggleProps {
  label:    string;
  checked:  boolean;
  onChange: (next: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full py-1.5"
      aria-pressed={checked}
    >
      <span className="text-[11px] font-sans font-medium tracking-wide text-film-text">{label}</span>
      <span className={[
        'relative w-9 h-[18px] rounded-full transition-colors',
        checked ? 'bg-film-amber-dim' : 'bg-film-border',
      ].join(' ')}>
        <span className={[
          'absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all',
          checked ? 'left-[20px] bg-film-amber' : 'left-[2px] bg-film-text-dim',
        ].join(' ')} />
      </span>
    </button>
  );
}

/* ─── Light-leak edge picker ─────────────────────────────────────────────── */

const LEAK_EDGES: { value: LightLeakEdge; label: string }[] = [
  { value: 'left',   label: 'Left'   },
  { value: 'right',  label: 'Right'  },
  { value: 'top',    label: 'Top'    },
  { value: 'random', label: 'Random' },
];

/* ═══════════════════════════════════════════════════════════════
   AdjustmentPanel
═══════════════════════════════════════════════════════════════ */

export default function AdjustmentPanel() {
  const currentFilter     = useAppStore((s) => s.currentFilter);
  const sliderValues      = useAppStore((s) => s.sliderValues);
  const hintsEnabled      = useAppStore((s) => s.hintsEnabled);
  const lightLeakEnabled  = useAppStore((s) => s.lightLeakEnabled);
  const lightLeakEdge     = useAppStore((s) => s.lightLeakEdge);
  const filmBorderEnabled = useAppStore((s) => s.filmBorderEnabled);
  const dateStampEnabled  = useAppStore((s) => s.dateStampEnabled);
  const dateStampSize     = useAppStore((s) => s.dateStampSize);
  const {
    setSlider, resetSliders,
    setLightLeakEnabled, setLightLeakEdge,
    setFilmBorderEnabled, reseedGrain,
    setDateStampEnabled, setDateStampSize,
  } = useAppActions();

  const filter = currentFilter ? getFilterById(currentFilter) : null;

  /* ─── Empty state ──────────────────────────────────────────────────────── */
  if (!filter) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-10 text-center">
        <p className="font-serif text-base text-film-text-dim leading-snug">
          Select a film stock to begin
        </p>
      </div>
    );
  }

  const category    = FILTER_CATEGORIES.find((c) => c.id === filter.category);
  const sliderIds   = filter.category === 'flash' ? FLASH_SLIDER_IDS : BASE_SLIDER_IDS;
  const showLeak    = filter.id === 'diana-f' || filter.id === 'holga';
  const showBorder  = filter.id === 'sprocket-rocket';
  const valOr       = (id: string) => sliderValues[id] ?? SLIDER_CONFIGS[id]?.default ?? 0;

  return (
    <div className="flex flex-col gap-6 px-4 py-5">

      {/* ─── 1. PRESET INFO ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-1.5">
        <h2 className="font-serif text-[22px] leading-tight text-film-text">{filter.name}</h2>
        <div className="text-[10px] uppercase tracking-[0.22em] text-film-text-dim font-sans">
          {category?.name ?? filter.category}
          {filter.iso ? <span className="ml-2">ISO {filter.iso}</span> : null}
        </div>
        {hintsEnabled && (
          <p className="mt-1 text-[12px] italic text-film-text-dim leading-snug">
            {filter.hintText}
          </p>
        )}
        <button
          type="button"
          onClick={resetSliders}
          className="self-start mt-2 text-[10px] uppercase tracking-[0.22em] text-film-text-dim hover:text-film-amber transition-colors"
        >
          Reset to Defaults
        </button>
      </section>

      <div className="h-px bg-film-border" />

      {/* ─── 2a. FILM ADJUSTMENTS ────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h3 className="text-[10px] uppercase tracking-[0.22em] text-film-text-dim font-sans">Film</h3>
        {sliderIds.map((id) => {
          const cfg = SLIDER_CONFIGS[id];
          if (!cfg) return null;
          const isGrain = id === 'grain';
          return (
            <Slider
              key={id}
              config={cfg}
              value={valOr(id)}
              hintsEnabled={hintsEnabled}
              onChange={(v) => setSlider(id, v)}
              onAuxAction={isGrain ? reseedGrain : undefined}
              auxIcon={isGrain ? <DiceIcon /> : undefined}
              auxTitle={isGrain ? 'Re-roll grain' : undefined}
            />
          );
        })}
      </section>

      <div className="h-px bg-film-border" />

      {/* ─── 2b. EDIT ADJUSTMENTS ────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h3 className="text-[10px] uppercase tracking-[0.22em] text-film-text-dim font-sans">Edit</h3>
        {EDIT_SLIDER_IDS.map((id) => {
          const cfg = SLIDER_CONFIGS[id];
          if (!cfg) return null;
          return (
            <Slider
              key={id}
              config={cfg}
              value={valOr(id)}
              hintsEnabled={hintsEnabled}
              onChange={(v) => setSlider(id, v)}
            />
          );
        })}
      </section>

      {/* ─── 3. LIGHT LEAK ───────────────────────────────────────────────── */}
      {showLeak && (
        <>
          <div className="h-px bg-film-border" />
          <section className="flex flex-col gap-2">
            <Toggle
              label="Light Leak"
              checked={lightLeakEnabled}
              onChange={setLightLeakEnabled}
            />
            {lightLeakEnabled && (
              <div className="mt-1 grid grid-cols-4 gap-1">
                {LEAK_EDGES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLightLeakEdge(opt.value)}
                    className={[
                      'py-1.5 text-[10px] uppercase tracking-[0.14em] font-sans rounded-sm border transition-colors',
                      lightLeakEdge === opt.value
                        ? 'border-film-amber text-film-amber bg-film-amber/[0.07]'
                        : 'border-film-border text-film-text-dim hover:border-film-muted hover:text-film-text',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ─── 4. FILM BORDER ──────────────────────────────────────────────── */}
      {showBorder && (
        <>
          <div className="h-px bg-film-border" />
          <section>
            <Toggle
              label="Show Film Border"
              checked={filmBorderEnabled}
              onChange={setFilmBorderEnabled}
            />
          </section>
        </>
      )}

      {/* ─── 5. DATE STAMP ────────────────────────────────────────────────── */}
      <div className="h-px bg-film-border" />
      <section className="flex flex-col gap-3">
        <Toggle
          label="Date Stamp"
          checked={dateStampEnabled}
          onChange={setDateStampEnabled}
        />
        {dateStampEnabled && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim shrink-0">
              Size
            </span>
            <input
              type="range"
              min={30} max={150} step={1}
              value={Math.round(dateStampSize * 100)}
              onChange={(e) => setDateStampSize(+e.target.value / 100)}
              className="custom-range flex-1"
              aria-label="Date stamp size"
            />
            <span className="text-[10px] text-film-amber tabular-nums shrink-0 w-9 text-right">
              {Math.round(dateStampSize * 100)}%
            </span>
          </div>
        )}
        {dateStampEnabled && hintsEnabled && (
          <p className="text-[11px] italic text-film-text-dim leading-snug">
            Burns an LED-style date in the bottom-right corner. Matches old film
            cameras with the data-back option turned on.
          </p>
        )}
      </section>
    </div>
  );
}
