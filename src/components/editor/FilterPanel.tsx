import { useMemo, useState } from 'react';
import FilterCard from './FilterCard';
import { useAppStore, useAppActions } from '../../stores/appStore';
import {
  FILTERS,
  FILTER_CATEGORIES,
  SLIDER_CONFIGS,
} from '../../data/filters';
import { useFilterThumbnails } from '../../hooks/useFilterThumbnails';
import type { FilterPipeline } from '../../utils/pipeline';
import MoodTiles from './MoodTiles';

interface FilterPanelProps {
  device:   GPUDevice      | null;
  pipeline: FilterPipeline | null;
}

export default function FilterPanel({ device, pipeline }: FilterPanelProps) {
  const [query, setQuery] = useState('');

  const currentFilter = useAppStore((s) => s.currentFilter);
  const hintsEnabled  = useAppStore((s) => s.hintsEnabled);
  const currentPhoto  = useAppStore((s) => s.currentPhoto);
  const { setFilter, setSlider } = useAppActions();

  // Render thumbnails for ALL presets (not the search-filtered subset)
  // so a clear-search doesn't trigger re-renders for cached cards.
  const thumbs = useFilterThumbnails(device, pipeline, currentPhoto, FILTERS);

  const q = query.trim().toLowerCase();
  const visiblePresetIds = useMemo(() => {
    if (!q) return new Set(FILTERS.map((f) => f.id));
    return new Set(FILTERS.filter((f) => f.name.toLowerCase().includes(q)).map((f) => f.id));
  }, [q]);

  function applySurprise() {
    const f = FILTERS[Math.floor(Math.random() * FILTERS.length)];
    setFilter(f.id);
    for (const cfg of Object.values(SLIDER_CONFIGS)) {
      const range     = cfg.max - cfg.min;
      const variation = (Math.random() * 2 - 1) * 0.15 * range;
      const next      = Math.max(cfg.min, Math.min(cfg.max, cfg.default + variation));
      setSlider(cfg.id, Math.round(next));
    }
  }

  /* On narrow viewports the panel renders as a horizontal scroll strip
     without search / categories — visible filters are flattened into one row */
  const flatVisible = FILTERS.filter((f) => visiblePresetIds.has(f.id));

  return (
    <>
      {/* ─── Mobile: horizontal scroll strip ─────────────────────────────── */}
      <div className="md:hidden flex items-stretch gap-2 px-3 py-2 overflow-x-auto h-full">
        <button
          type="button"
          onClick={applySurprise}
          className="flex-shrink-0 px-3 my-1 text-[9px] uppercase tracking-[0.18em] font-sans text-film-text border border-film-border rounded-sm hover:border-film-amber hover:text-film-amber transition-colors"
        >
          Surprise
        </button>
        {flatVisible.map((f) => (
          <div key={f.id} className="flex-shrink-0 w-[88px]">
            <FilterCard
              filter={f}
              selected={currentFilter === f.id}
              thumbnail={thumbs.get(f.id)}
              loading={!thumbs.has(f.id) && currentPhoto !== null}
              hintsEnabled={false}
              onClick={() => setFilter(f.id)}
            />
          </div>
        ))}
      </div>

      {/* ─── Desktop: full panel ─────────────────────────────────────────── */}
      <div className="hidden md:flex md:flex-col gap-3 px-3 pt-3 pb-6">
        <MoodTiles device={device} pipeline={pipeline} />
        <div className="h-px bg-film-border my-1" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search filters"
          className="w-full px-3 py-2 bg-film-dark border border-film-border rounded-sm text-sm font-sans text-film-text placeholder:text-film-text-dim focus:outline-none focus:border-film-amber transition-colors"
        />
        <button
          type="button"
          onClick={applySurprise}
          className="w-full py-2 text-xs uppercase tracking-[0.22em] font-sans font-medium text-film-text border border-film-border rounded-sm hover:border-film-amber hover:text-film-amber transition-colors"
        >
          Surprise Me
        </button>

        <div className="flex flex-col gap-5 mt-1">
          {FILTER_CATEGORIES.map((cat) => {
            const presetsInCat = FILTERS.filter(
              (f) => f.category === cat.id && visiblePresetIds.has(f.id),
            );
            if (!presetsInCat.length) return null;

            return (
              <section key={cat.id} className="flex flex-col gap-2">
                <header>
                  <h3 className="font-serif text-[12px] uppercase tracking-[0.22em] text-film-text">
                    {cat.name}
                  </h3>
                  {hintsEnabled && (
                    <p className="text-[11px] italic text-film-text-dim mt-1 leading-snug">
                      {cat.subtitle}
                    </p>
                  )}
                </header>
                <div className="grid grid-cols-2 gap-2">
                  {presetsInCat.map((f) => (
                    <FilterCard
                      key={f.id}
                      filter={f}
                      selected={currentFilter === f.id}
                      thumbnail={thumbs.get(f.id)}
                      loading={!thumbs.has(f.id) && currentPhoto !== null}
                      hintsEnabled={hintsEnabled}
                      onClick={() => setFilter(f.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
