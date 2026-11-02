import { useEffect, useRef } from 'react';
import { MOODS, getMoodById, SLIDER_CONFIGS, getFilterById } from '../../data/filters';
import { useAppStore, useAppActions } from '../../stores/appStore';
import { useFilterThumbnails } from '../../hooks/useFilterThumbnails';
import type { FilterPipeline } from '../../utils/pipeline';
import { FILTERS } from '../../data/filters';

interface MoodTilesProps {
  device:   GPUDevice      | null;
  pipeline: FilterPipeline | null;
}

/* Apply a mood at a given strength (0..100). Each slider lerps from the
   current value (baseline = preset default after applyPreset, or 0) toward
   the mood's target. At strength=0 nothing changes; at 100 the mood's
   slider config is fully applied. */
function useApplyMood() {
  const { setFilter, setSlider, setActiveMood } = useAppActions();
  return (moodId: string, strength: number) => {
    const mood = getMoodById(moodId);
    if (!mood) return;
    setFilter(mood.preset);
    setActiveMood(moodId);
    const s = Math.max(0, Math.min(1, strength / 100));
    // Reset edit-tab sliders first so previous mood doesn't bleed in
    ['exposure','contrast','highlights','shadows','sharpness','edittint'].forEach((k) => {
      const target = (mood.sliders[k] ?? 0) * s;
      setSlider(k, Math.round(target));
    });
    // For film-tab sliders, lerp from each slider's CONFIG default (the
    // "neutral" baseline) toward the mood's target.
    Object.entries(mood.sliders).forEach(([k, target]) => {
      const cfg = SLIDER_CONFIGS[k];
      if (!cfg) return;
      const base  = cfg.default;
      const final = Math.round(base + (target - base) * s);
      setSlider(k, Math.max(cfg.min, Math.min(cfg.max, final)));
    });
  };
}

export default function MoodTiles({ device, pipeline }: MoodTilesProps) {
  const currentPhoto = useAppStore((s) => s.currentPhoto);
  const activeMood   = useAppStore((s) => s.activeMood);
  const moodStrength = useAppStore((s) => s.moodStrength);
  const { setMoodStrength, setActiveMood, setFilter, resetSliders } = useAppActions();
  const applyMood = useApplyMood();

  // Use the preset thumbnails as proxies — same render path, much smaller
  // visual difference than re-rendering 8 separate mood combinations.
  const thumbs = useFilterThumbnails(device, pipeline, currentPhoto, FILTERS);

  const lastAppliedRef = useRef<{ id: string; s: number } | null>(null);

  // Re-apply the active mood when strength changes
  useEffect(() => {
    if (!activeMood) return;
    if (lastAppliedRef.current?.id === activeMood
        && lastAppliedRef.current?.s === moodStrength) return;
    lastAppliedRef.current = { id: activeMood, s: moodStrength };
    applyMood(activeMood, moodStrength);
  }, [activeMood, moodStrength, applyMood]);

  function onTileClick(id: string) {
    if (activeMood === id) {
      // Toggle off — revert to baseline portra-400 with neutral sliders
      setActiveMood(null);
      setFilter('portra-400');
      resetSliders();
      lastAppliedRef.current = null;
      return;
    }
    setActiveMood(id);
    lastAppliedRef.current = { id, s: moodStrength };
    applyMood(id, moodStrength);
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-[12px] uppercase tracking-[0.22em] text-film-text">Moods</h3>
      <div className="grid grid-cols-2 gap-2">
        {MOODS.map((m) => {
          const preset = getFilterById(m.preset);
          const thumb  = thumbs.get(m.preset);
          const isActive = activeMood === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onTileClick(m.id)}
              className={[
                'relative aspect-[3/2] rounded-sm overflow-hidden text-left transition-all duration-150 border',
                isActive
                  ? 'border-film-amber shadow-[0_0_0_1px_var(--color-film-amber)]'
                  : 'border-film-border hover:border-film-muted',
              ].join(' ')}
              title={preset?.name ?? m.label}
            >
              <MoodThumb thumb={thumb} />
              <span className="absolute top-1.5 left-1.5 text-[14px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {m.emoji}
              </span>
              <span className={[
                'absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[10px] font-sans font-medium uppercase tracking-[0.14em] bg-gradient-to-t from-black/85 to-transparent',
                isActive ? 'text-film-amber' : 'text-film-text',
              ].join(' ')}>
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Strength slider — only meaningful when a mood is active */}
      {activeMood && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-film-text-dim shrink-0">Strength</span>
          <input
            type="range"
            min={0} max={100} step={1}
            value={moodStrength}
            onChange={(e) => setMoodStrength(+e.target.value)}
            className="custom-range flex-1"
            aria-label="Mood strength"
          />
          <span className="text-[10px] text-film-amber tabular-nums shrink-0 w-7 text-right">{moodStrength}</span>
        </div>
      )}
    </div>
  );
}

/* Inline mini-canvas that paints the preset thumbnail when available */
function MoodThumb({ thumb }: { thumb: ImageData | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    if (thumb) {
      if (c.width !== thumb.width || c.height !== thumb.height) {
        c.width = thumb.width; c.height = thumb.height;
      }
      ctx.putImageData(thumb, 0, 0);
    } else {
      c.width = 120; c.height = 80;
      const g = ctx.createLinearGradient(0, 0, 120, 80);
      g.addColorStop(0, '#1a1816'); g.addColorStop(1, '#3a3632');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 120, 80);
    }
  }, [thumb]);
  return <canvas ref={ref} width={120} height={80} className="block w-full h-full object-cover" />;
}
