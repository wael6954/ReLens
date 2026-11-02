import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAppStore, useAppActions, type LightLeakEdge, type LightLeakColor } from '../../stores/appStore';
import { getFilterById, FILTER_CATEGORIES, SLIDER_CONFIGS } from '../../data/filters';
import type { SliderConfig } from '../../types/filter';
import Tooltip from '../shared/Tooltip';
import { computeAutoAdjust } from '../../utils/autoAdjust';
import { computeReferenceLUTs } from '../../utils/referenceLUT';
import { saveUserPreset, snapshotPreset } from '../../utils/presetStorage';
import {
  DATE_STAMP_COLORS, DATE_STAMP_FONTS, DATE_STAMP_FORMATS, formatStamp,
  type DateStampPosition,
} from '../../utils/dateStamp';

/* ─── Slider id sequences (Halation OR Flash Position depending on category) ── */

const BASE_SLIDER_IDS = [
  'grain', 'vignette', 'fade', 'colorTemp', 'saturation', 'halation',
] as const;

const FLASH_SLIDER_IDS = [
  'grain', 'vignette', 'fade', 'colorTemp', 'saturation',
  'flashStrength', 'flashPositionH', 'flashPositionV',
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

/* ─── HSL panel ──────────────────────────────────────────────────────────── */

const HSL_BANDS: { key: string; label: string; swatch: string }[] = [
  { key: 'reds',    label: 'Red',    swatch: '#e54040' },
  { key: 'oranges', label: 'Orange', swatch: '#f08030' },
  { key: 'yellows', label: 'Yellow', swatch: '#e8c640' },
  { key: 'greens',  label: 'Green',  swatch: '#4caf50' },
  { key: 'blues',   label: 'Blue',   swatch: '#3070d8' },
  { key: 'purples', label: 'Purple', swatch: '#9050c8' },
];

interface MiniSliderProps {
  value:    number;
  min:      number;
  max:      number;
  onChange: (v: number) => void;
  ariaLabel: string;
}
function MiniSlider({ value, min, max, onChange, ariaLabel }: MiniSliderProps) {
  return (
    <input
      type="range"
      min={min} max={max} step={1}
      value={value}
      onChange={(e) => onChange(+e.target.value)}
      className="custom-range flex-1 h-3"
      aria-label={ariaLabel}
    />
  );
}

interface HSLPanelProps {
  values:    Record<string, number>;
  setSlider: (key: string, v: number) => void;
}
function HSLPanel({ values, setSlider }: HSLPanelProps) {
  const [open, setOpen] = useState(false);
  const anyActive = HSL_BANDS.some((b) =>
    (values[`hslHue_${b.key}`] ?? 0) !== 0 || (values[`hslSat_${b.key}`] ?? 0) !== 0,
  );

  function resetAll() {
    HSL_BANDS.forEach((b) => {
      setSlider(`hslHue_${b.key}`, 0);
      setSlider(`hslSat_${b.key}`, 0);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full"
      >
        <h3 className="text-[10px] uppercase tracking-[0.22em] text-film-text-dim font-sans">
          HSL {anyActive && <span className="ml-1 text-film-amber">•</span>}
        </h3>
        <span className="text-[10px] text-film-text-dim">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <>
          <div className="grid grid-cols-[14px_auto_1fr_1fr] gap-x-2 gap-y-1.5 items-center text-[10px]">
            <span />
            <span />
            <span className="text-film-text-dim uppercase tracking-[0.14em]">Hue</span>
            <span className="text-film-text-dim uppercase tracking-[0.14em]">Sat</span>
            {HSL_BANDS.map((b) => {
              const hKey = `hslHue_${b.key}`;
              const sKey = `hslSat_${b.key}`;
              return (
                <Fragment key={b.key}>
                  <span className="w-3 h-3 rounded-full" style={{ background: b.swatch }} />
                  <span className="text-film-text font-sans truncate">{b.label}</span>
                  <MiniSlider
                    value={values[hKey] ?? 0} min={-30} max={30}
                    onChange={(v) => setSlider(hKey, v)} ariaLabel={`${b.label} hue`}
                  />
                  <MiniSlider
                    value={values[sKey] ?? 0} min={-100} max={100}
                    onChange={(v) => setSlider(sKey, v)} ariaLabel={`${b.label} saturation`}
                  />
                </Fragment>
              );
            })}
          </div>
          {anyActive && (
            <button
              type="button"
              onClick={resetAll}
              className="self-start text-[10px] uppercase tracking-[0.18em] text-film-text-dim hover:text-film-amber transition-colors"
            >
              Reset HSL
            </button>
          )}
        </>
      )}
    </section>
  );
}

/* ─── Portrait — skin smoothing (face-mask bilateral) ────────────────────── */

function PortraitPanel() {
  const currentPhoto         = useAppStore((s) => s.currentPhoto);
  const faces                = useAppStore((s) => s.faces);
  const skinSmoothStrength   = useAppStore((s) => s.skinSmoothStrength);
  const { setSkinSmoothStrength } = useAppActions();
  const facesPhotoId         = useAppStore((s) => s.facesPhotoId);
  const faceDetectError      = useAppStore((s) => s.faceDetectError);

  const detecting = !!currentPhoto && facesPhotoId === '' && !faceDetectError;
  const failed    = !!faceDetectError;
  const noFaces   = !!currentPhoto && !detecting && !failed && faces.length === 0;
  const disabled  = failed || noFaces || !currentPhoto;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-[0.22em] text-film-text-dim font-sans">
          Portrait {faces.length > 0 && <span className="ml-1 text-film-amber">• {faces.length}</span>}
        </h3>
        <span className={`text-[10px] ${failed ? 'text-red-400' : 'text-film-text-dim'}`}>
          {detecting ? 'Detecting…' : failed ? 'Init failed' : noFaces ? 'No faces' : ''}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim shrink-0">Skin</span>
        <input
          type="range"
          min={0} max={100} step={1}
          value={skinSmoothStrength}
          onChange={(e) => setSkinSmoothStrength(+e.target.value)}
          disabled={disabled}
          className="custom-range flex-1"
          aria-label="Skin smoothing strength"
        />
        <span className="text-[10px] text-film-amber tabular-nums w-7 text-right">{skinSmoothStrength}</span>
      </div>
      {failed && (
        <p className="text-[10px] italic text-red-400 leading-snug break-words">
          {faceDetectError}. Check DevTools console for details (right-click → Inspect).
        </p>
      )}
      {noFaces && (
        <p className="text-[10px] italic text-film-text-dim leading-snug">
          No faces detected in this photo. Smoothing only applies inside detected face regions.
        </p>
      )}
    </section>
  );
}

/* ─── Style Match (reference-photo LUT) ──────────────────────────────────── */

function StyleMatchPanel() {
  const currentPhoto      = useAppStore((s) => s.currentPhoto);
  const referenceBlob     = useAppStore((s) => s.referenceBlob);
  const referenceName     = useAppStore((s) => s.referenceName);
  const referenceStrength = useAppStore((s) => s.referenceStrength);
  const { setReference, setReferenceStrength, clearReference } = useAppActions();
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);

  // Thumbnail preview URL
  useEffect(() => {
    if (!referenceBlob) { setThumbUrl(null); return; }
    const url = URL.createObjectURL(referenceBlob);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [referenceBlob]);

  // Recompute LUTs whenever the source photo or reference changes.
  useEffect(() => {
    if (!referenceBlob || !currentPhoto) return;
    let cancelled = false;
    setComputing(true);
    (async () => {
      const luts = await computeReferenceLUTs(currentPhoto.blob, referenceBlob);
      if (!cancelled) {
        setReference(referenceBlob, luts, referenceName);
        setComputing(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceBlob, currentPhoto]);

  async function pick() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const result = await open({
        multiple: false, directory: false,
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      });
      if (!result) return;
      const path = Array.isArray(result) ? result[0] : result;
      if (!path) return;
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const bytes = await readFile(path);
      const name  = path.split(/[\\/]/).pop() ?? 'reference';
      const ext   = name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mime  = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const blob  = new Blob([new Uint8Array(bytes)], { type: mime });
      setReference(blob, null, name);
    } catch {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (f) setReference(f, null, f.name);
      };
      input.click();
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[10px] uppercase tracking-[0.22em] text-film-text-dim font-sans">
        Style Match {referenceBlob && <span className="ml-1 text-film-amber">•</span>}
      </h3>
      {!referenceBlob ? (
        <button
          type="button"
          onClick={pick}
          disabled={!currentPhoto}
          className={[
            'flex items-center justify-center gap-2 py-4 border border-dashed rounded-sm text-[11px] uppercase tracking-[0.18em] font-sans transition-colors',
            !currentPhoto
              ? 'border-film-border text-film-text-dim opacity-50 cursor-not-allowed'
              : 'border-film-border text-film-text-dim hover:border-film-amber hover:text-film-amber',
          ].join(' ')}
        >
          Pick a reference photo
        </button>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {thumbUrl && (
              <img
                src={thumbUrl}
                alt="Reference"
                className="w-14 h-14 object-cover rounded-sm border border-film-border shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-film-text font-sans truncate">{referenceName || 'reference'}</div>
              <div className="text-[10px] text-film-text-dim mt-0.5">
                {computing ? 'Analyzing…' : 'Histogram matched'}
              </div>
            </div>
            <button
              type="button"
              onClick={clearReference}
              title="Clear reference"
              className="text-[10px] uppercase tracking-[0.18em] text-film-text-dim hover:text-film-amber transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim shrink-0">Strength</span>
            <input
              type="range"
              min={0} max={100} step={1}
              value={referenceStrength}
              onChange={(e) => setReferenceStrength(+e.target.value)}
              className="custom-range flex-1"
              aria-label="Style match strength"
            />
            <span className="text-[10px] text-film-amber tabular-nums w-7 text-right">{referenceStrength}</span>
          </div>
        </>
      )}
    </section>
  );
}

/* ─── Auto-adjust button (histogram-driven) ─────────────────────────────── */

interface AutoButtonProps {
  blob:    Blob | null;
  onApply: (vals: { exposure: number; contrast: number; highlights: number; shadows: number }) => void;
}

function AutoButton({ blob, onApply }: AutoButtonProps) {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!blob || busy) return;
    setBusy(true);
    try {
      const r = await computeAutoAdjust(blob);
      if (r) onApply(r);
    } finally {
      setBusy(false);
    }
  }

  const disabled = !blob || busy;
  return (
    <button
      type="button"
      onClick={run}
      disabled={disabled}
      className={[
        'px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-sans rounded-sm border transition-colors',
        disabled
          ? 'border-film-border text-film-text-dim opacity-50 cursor-not-allowed'
          : 'border-film-border text-film-text-dim hover:border-film-amber hover:text-film-amber',
      ].join(' ')}
      title="Analyze the photo and set exposure / contrast / highlights / shadows automatically"
    >
      {busy ? 'Auto…' : 'Auto'}
    </button>
  );
}

/* ─── Light-leak edge picker ─────────────────────────────────────────────── */

const LEAK_EDGES: { value: LightLeakEdge; label: string }[] = [
  { value: 'left',   label: 'Left'   },
  { value: 'right',  label: 'Right'  },
  { value: 'top',    label: 'Top'    },
  { value: 'bottom', label: 'Bottom' },
];

const LEAK_COLORS: { value: LightLeakColor; swatch: string }[] = [
  { value: 'amber',  swatch: '#ffb830' },
  { value: 'orange', swatch: '#ff7820' },
  { value: 'red',    swatch: '#e03030' },
  { value: 'violet', swatch: '#9040d0' },
  { value: 'blue',   swatch: '#2060e0' },
];

/* ═══════════════════════════════════════════════════════════════
   AdjustmentPanel
═══════════════════════════════════════════════════════════════ */

export default function AdjustmentPanel() {
  const currentPhoto      = useAppStore((s) => s.currentPhoto);
  const currentFilter     = useAppStore((s) => s.currentFilter);
  const sliderValues      = useAppStore((s) => s.sliderValues);
  const hintsEnabled      = useAppStore((s) => s.hintsEnabled);
  const lightLeakEnabled  = useAppStore((s) => s.lightLeakEnabled);
  const lightLeakEdge     = useAppStore((s) => s.lightLeakEdge);
  const lightLeakStrength = useAppStore((s) => s.lightLeakStrength);
  const lightLeakColor    = useAppStore((s) => s.lightLeakColor);
  const filmBorderEnabled = useAppStore((s) => s.filmBorderEnabled);
  const wbPickerActive    = useAppStore((s) => s.wbPickerActive);
  const {
    setSlider, resetSliders,
    setLightLeakEnabled, setLightLeakEdge,
    setLightLeakStrength, setLightLeakColor,
    setFilmBorderEnabled, reseedGrain,
    setWbPickerActive,
  } = useAppActions();

  const filter = currentFilter ? getFilterById(currentFilter) : null;

  function applyAuto(vals: { exposure: number; contrast: number; highlights: number; shadows: number }) {
    setSlider('exposure',   vals.exposure);
    setSlider('contrast',   vals.contrast);
    setSlider('highlights', vals.highlights);
    setSlider('shadows',    vals.shadows);
  }

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
  const showLeak    = true;       /* Light leak is now available on every preset */
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
        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={resetSliders}
            className="text-[10px] uppercase tracking-[0.22em] text-film-text-dim hover:text-film-amber transition-colors"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={async () => {
              const name = window.prompt('Name this preset:', filter?.name ? `${filter.name} Custom` : 'My Preset');
              if (!name) return;
              const snap = snapshotPreset(name);
              if (!snap) return;
              try { await saveUserPreset(snap); }
              catch (err) { console.error('[presets] save failed', err); }
            }}
            className="text-[10px] uppercase tracking-[0.22em] text-film-text-dim hover:text-film-amber transition-colors"
          >
            Save as Preset
          </button>
        </div>
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
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] uppercase tracking-[0.22em] text-film-text-dim font-sans">Edit</h3>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setWbPickerActive(!wbPickerActive)}
              disabled={!currentPhoto}
              title="Click a neutral-gray spot in the photo to set white balance"
              className={[
                'px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-sans rounded-sm border transition-colors',
                !currentPhoto
                  ? 'border-film-border text-film-text-dim opacity-50 cursor-not-allowed'
                  : wbPickerActive
                    ? 'border-film-amber bg-film-amber/[0.07] text-film-amber'
                    : 'border-film-border text-film-text-dim hover:border-film-amber hover:text-film-amber',
              ].join(' ')}
            >
              WB
            </button>
            <AutoButton blob={currentPhoto?.blob ?? null} onApply={applyAuto} />
          </div>
        </div>
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

        {/* Push / Pull — 5 stops as a button row */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-sans font-medium tracking-wide text-film-text">Push / Pull</span>
            {hintsEnabled && (
              <Tooltip content="Simulates over- (+) or under- (−) developing the film. Push = more contrast & grain. Pull = flatter.">
                <span className="text-[10px] leading-none w-3.5 h-3.5 inline-flex items-center justify-center rounded-full border border-film-border text-film-text-dim">i</span>
              </Tooltip>
            )}
          </div>
          <div className="flex gap-1">
            {[-2, -1, 0, 1, 2].map((stop) => {
              const active = (sliderValues.pushPull ?? 0) === stop;
              return (
                <button
                  key={stop}
                  type="button"
                  onClick={() => setSlider('pushPull', stop)}
                  className={[
                    'flex-1 py-1.5 text-[10px] font-sans rounded-sm border transition-colors',
                    active
                      ? 'border-film-amber bg-film-amber/[0.07] text-film-amber'
                      : 'border-film-border text-film-text-dim hover:border-film-muted hover:text-film-text',
                  ].join(' ')}
                >
                  {stop > 0 ? `+${stop}` : `${stop}`}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="h-px bg-film-border" />

      {/* ─── 2c. STYLE MATCH ─────────────────────────────────────────────── */}
      <StyleMatchPanel />

      <div className="h-px bg-film-border" />

      {/* ─── 2d. HSL PANEL ───────────────────────────────────────────────── */}
      <HSLPanel values={sliderValues} setSlider={setSlider} />

      <div className="h-px bg-film-border" />

      {/* ─── 2e. PORTRAIT (skin smoothing) ───────────────────────────────── */}
      <PortraitPanel />

      {/* ─── 3. LIGHT LEAK ───────────────────────────────────────────────── */}
      {showLeak && (
        <>
          <div className="h-px bg-film-border" />
          <section className="flex flex-col gap-3">
            <Toggle
              label="Light Leak"
              checked={lightLeakEnabled}
              onChange={setLightLeakEnabled}
            />
            {lightLeakEnabled && (
              <>
                {/* Edge selector — 4 buttons */}
                <div className="grid grid-cols-4 gap-1">
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

                {/* Intensity slider */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim shrink-0">
                    Intensity
                  </span>
                  <input
                    type="range"
                    min={0} max={100} step={1}
                    value={lightLeakStrength}
                    onChange={(e) => setLightLeakStrength(+e.target.value)}
                    className="custom-range flex-1"
                    aria-label="Light leak intensity"
                  />
                  <span className="text-[10px] text-film-amber tabular-nums shrink-0 w-7 text-right">
                    {lightLeakStrength}
                  </span>
                </div>

                {/* Color swatches */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim shrink-0">
                    Color
                  </span>
                  <div className="flex gap-1.5">
                    {LEAK_COLORS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setLightLeakColor(opt.value)}
                        title={opt.value}
                        className={[
                          'w-5 h-5 rounded-full transition-all',
                          lightLeakColor === opt.value
                            ? 'ring-2 ring-film-amber ring-offset-1 ring-offset-film-surface scale-110'
                            : 'hover:scale-110',
                        ].join(' ')}
                        style={{ background: opt.swatch }}
                        aria-label={`Light leak ${opt.value}`}
                      />
                    ))}
                  </div>
                </div>
              </>
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
      <DateStampSection />
    </div>
  );
}

/* ─── Date Stamp customization section ───────────────────────────────────── */

const POSITION_OPTIONS: { value: DateStampPosition; label: string }[] = [
  { value: 'tl', label: '↖' },
  { value: 'tr', label: '↗' },
  { value: 'bl', label: '↙' },
  { value: 'br', label: '↘' },
];

function DateStampSection() {
  const hintsEnabled = useAppStore((s) => s.hintsEnabled);
  const enabled      = useAppStore((s) => s.dateStampEnabled);
  const size         = useAppStore((s) => s.dateStampSize);
  const source       = useAppStore((s) => s.dateStampSource);
  const custom       = useAppStore((s) => s.dateStampCustom);
  const formatId     = useAppStore((s) => s.dateStampFormat);
  const colorId      = useAppStore((s) => s.dateStampColor);
  const fontId       = useAppStore((s) => s.dateStampFont);
  const position     = useAppStore((s) => s.dateStampPosition);
  const {
    setDateStampEnabled, setDateStampSize,
    setDateStampSource, setDateStampCustom,
    setDateStampFormat, setDateStampColor,
    setDateStampFont,   setDateStampPosition,
  } = useAppActions();

  const previewDate = source === 'custom'
    ? (() => { const d = new Date(custom); return isNaN(d.getTime()) ? new Date() : d; })()
    : new Date();
  const previewText = formatStamp(previewDate, formatId);
  const previewColor = DATE_STAMP_COLORS.find((c) => c.id === colorId) ?? DATE_STAMP_COLORS[0];
  const previewFont  = DATE_STAMP_FONTS.find((f) => f.id === fontId) ?? DATE_STAMP_FONTS[0];

  return (
    <section className="flex flex-col gap-3">
      <Toggle
        label="Date Stamp"
        checked={enabled}
        onChange={setDateStampEnabled}
      />

      {enabled && (
        <>
          {/* Live preview chip */}
          <div className="flex items-center justify-center py-2 bg-film-black rounded-sm border border-film-border">
            <span
              style={{
                fontFamily: previewFont.css,
                color:      previewColor.core,
                textShadow: `0 0 6px ${previewColor.halo}, 0 0 12px ${previewColor.halo}`,
                fontSize:   '15px',
                letterSpacing: '0.05em',
              }}
            >
              {previewText}
            </span>
          </div>

          {/* Date source */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim">Date</span>
            <div className="grid grid-cols-2 gap-1">
              {(['auto', 'custom'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDateStampSource(s)}
                  className={[
                    'py-1.5 text-[10px] uppercase tracking-[0.14em] font-sans rounded-sm border transition-colors',
                    source === s
                      ? 'border-film-amber text-film-amber bg-film-amber/[0.07]'
                      : 'border-film-border text-film-text-dim hover:border-film-muted hover:text-film-text',
                  ].join(' ')}
                >
                  {s === 'auto' ? 'Auto (EXIF)' : 'Custom'}
                </button>
              ))}
            </div>
            {source === 'custom' && (
              <input
                type="date"
                value={custom}
                onChange={(e) => setDateStampCustom(e.target.value)}
                className="mt-1 px-2 py-1.5 bg-film-dark border border-film-border rounded-sm text-[11px] text-film-text font-sans focus:outline-none focus:border-film-amber"
              />
            )}
          </div>

          {/* Format */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim">Format</span>
            <select
              value={formatId}
              onChange={(e) => setDateStampFormat(e.target.value)}
              className="px-2 py-1.5 bg-film-dark border border-film-border rounded-sm text-[11px] text-film-text font-sans focus:outline-none focus:border-film-amber"
            >
              {DATE_STAMP_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>{f.label} — {f.fn(previewDate)}</option>
              ))}
            </select>
          </div>

          {/* Font */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim">Font</span>
            <div className="grid grid-cols-2 gap-1">
              {DATE_STAMP_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDateStampFont(f.id)}
                  className={[
                    'py-1.5 text-[10px] rounded-sm border transition-colors',
                    fontId === f.id
                      ? 'border-film-amber text-film-amber bg-film-amber/[0.07]'
                      : 'border-film-border text-film-text-dim hover:border-film-muted hover:text-film-text',
                  ].join(' ')}
                >
                  <span style={{ fontFamily: f.css }}>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Color swatches */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim">Color</span>
            <div className="flex flex-wrap gap-1.5">
              {DATE_STAMP_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setDateStampColor(c.id)}
                  title={c.label}
                  className={[
                    'w-6 h-6 rounded-full transition-all',
                    colorId === c.id
                      ? 'ring-2 ring-film-amber ring-offset-1 ring-offset-film-surface scale-110'
                      : 'hover:scale-110',
                  ].join(' ')}
                  style={{ background: c.bg, boxShadow: `0 0 8px ${c.halo}aa` }}
                  aria-label={`Date stamp ${c.label}`}
                />
              ))}
            </div>
          </div>

          {/* Position */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim">Position</span>
            <div className="grid grid-cols-4 gap-1">
              {POSITION_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDateStampPosition(p.value)}
                  className={[
                    'py-1.5 text-base leading-none rounded-sm border transition-colors',
                    position === p.value
                      ? 'border-film-amber text-film-amber bg-film-amber/[0.07]'
                      : 'border-film-border text-film-text-dim hover:border-film-muted hover:text-film-text',
                  ].join(' ')}
                  aria-label={`Position ${p.value}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim shrink-0">Size</span>
            <input
              type="range"
              min={30} max={150} step={1}
              value={Math.round(size * 100)}
              onChange={(e) => setDateStampSize(+e.target.value / 100)}
              className="custom-range flex-1"
              aria-label="Date stamp size"
            />
            <span className="text-[10px] text-film-amber tabular-nums shrink-0 w-9 text-right">
              {Math.round(size * 100)}%
            </span>
          </div>

          {hintsEnabled && (
            <p className="text-[11px] italic text-film-text-dim leading-snug">
              Auto uses the photo's EXIF capture date when available, else today.
              Custom lets you set any date — useful for backdating a digital shot.
            </p>
          )}
        </>
      )}
    </section>
  );
}
