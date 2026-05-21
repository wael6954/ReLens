import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { zipSync } from 'fflate';

import { useAppStore, useAppActions } from '../../stores/appStore';
import { FILTERS } from '../../data/filters';
import { loadPhotoBlob, deletePhoto as fsDelete, exportPhoto } from '../../utils/storage';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import type { PhotoRecord } from '../../types/photo';
import GalleryCard from './GalleryCard';

/* ─── Empty-state film-frame illustration ──────────────────────────────── */

function EmptyFilmFrame() {
  return (
    <svg viewBox="0 0 96 72" width="96" height="72" fill="none" stroke="currentColor"
         strokeWidth="1.2" strokeLinejoin="round" aria-hidden>
      <rect x="8" y="14" width="80" height="44" rx="2"/>
      <circle cx="48" cy="36" r="11"/>
      <circle cx="48" cy="36" r="5"/>
      <rect x="3" y="20" width="3" height="4" fill="currentColor" stroke="none" opacity="0.6"/>
      <rect x="3" y="28" width="3" height="4" fill="currentColor" stroke="none" opacity="0.6"/>
      <rect x="3" y="36" width="3" height="4" fill="currentColor" stroke="none" opacity="0.6"/>
      <rect x="3" y="44" width="3" height="4" fill="currentColor" stroke="none" opacity="0.6"/>
      <rect x="90" y="20" width="3" height="4" fill="currentColor" stroke="none" opacity="0.6"/>
      <rect x="90" y="28" width="3" height="4" fill="currentColor" stroke="none" opacity="0.6"/>
      <rect x="90" y="36" width="3" height="4" fill="currentColor" stroke="none" opacity="0.6"/>
      <rect x="90" y="44" width="3" height="4" fill="currentColor" stroke="none" opacity="0.6"/>
    </svg>
  );
}

/* ─── Top bar ─────────────────────────────────────────────────────────── */

interface GalleryTopBarProps {
  selectMode:   boolean;
  hasPhotos:    boolean;
  onToggleSelect: () => void;
}

function GalleryTopBar({ selectMode, hasPhotos, onToggleSelect }: GalleryTopBarProps) {
  const navigate = useNavigate();
  return (
    <header className="h-[52px] flex-shrink-0 flex items-center justify-between px-5 bg-film-surface border-b border-film-border">
      <Link
        to="/"
        state={{ fromHome: true }}
        className="font-serif text-[20px] leading-none text-film-text hover:text-film-amber transition-colors"
      >
        ReLens
      </Link>
      <div className="flex items-center gap-3">
        {hasPhotos && (
          <button
            type="button"
            onClick={onToggleSelect}
            className={[
              'px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-sans font-medium border rounded-sm transition-colors',
              selectMode
                ? 'bg-film-amber-dim border-film-amber text-film-amber'
                : 'border-film-border text-film-text hover:border-film-amber hover:text-film-amber',
            ].join(' ')}
          >
            {selectMode ? 'Done' : 'Select'}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/editor')}
          className="px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-sans font-medium bg-film-amber text-film-black rounded-sm hover:bg-film-amber-dim transition-colors"
        >
          New Photo
        </button>
      </div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GalleryPage
═══════════════════════════════════════════════════════════════ */

export default function GalleryPage() {
  const navigate     = useNavigate();
  const savedPhotos  = useAppStore((s) => s.savedPhotos);
  const { setPhoto, setFilter, setSliders } = useAppActions();

  const [selectMode,  setSelectMode]  = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy,        setBusy]        = useState(false);

  /* ── Escape exits select mode ─────────────────────────────────────── */
  useEffect(() => {
    if (!selectMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode]);

  function toggleSelectMode() {
    setSelectMode((m) => !m);
    setSelectedIds(new Set());
  }

  function toggleSelectId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /* ── Single-card actions ──────────────────────────────────────────── */

  async function handleEdit(photo: PhotoRecord) {
    try {
      const blob = photo.blob ?? await loadPhotoBlob(photo.id);
      // Hydrate the editor: photo, filter, sliders
      setPhoto({ blob, filename: photo.filename, width: photo.width, height: photo.height });
      const filterId = FILTERS.find((f) => f.name === photo.filterName)?.id ?? null;
      setFilter(filterId);
      setSliders(photo.sliderValues ?? {});
      navigate('/editor');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[gallery] edit failed', err);
    }
  }

  async function handleDownload(photo: PhotoRecord) {
    try {
      const blob = photo.blob ?? await loadPhotoBlob(photo.id);
      const safeName = photo.filterName.replace(/[^a-z0-9\- _]/gi, '_').replace(/\s+/g, '-').toLowerCase();
      await exportPhoto(blob, `${safeName || 'photo'}-${photo.id.slice(0, 6)}`, 'jpeg');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[gallery] download failed', err);
    }
  }

  async function handleDelete(photo: PhotoRecord) {
    setBusy(true);
    try { await fsDelete(photo.id); }
    finally { setBusy(false); }
  }

  /* ── Bulk actions ─────────────────────────────────────────────────── */

  const selectedPhotos = useMemo(
    () => savedPhotos.filter((p) => selectedIds.has(p.id)),
    [savedPhotos, selectedIds],
  );

  async function handleBulkDownload() {
    if (!selectedPhotos.length) return;
    setBusy(true);
    try {
      const entries: Record<string, Uint8Array> = {};
      for (const p of selectedPhotos) {
        const blob  = p.blob ?? await loadPhotoBlob(p.id);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const safe  = p.filterName.replace(/[^a-z0-9\- _]/gi, '_').replace(/\s+/g, '-').toLowerCase();
        entries[`${safe || 'photo'}-${p.id.slice(0, 6)}.jpg`] = bytes;
      }
      const zipBytes = zipSync(entries);

      const path = await save({
        defaultPath: `relens-photos-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });
      if (!path) return;
      await writeFile(path, zipBytes);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[gallery] bulk download failed', err);
    } finally { setBusy(false); }
  }

  async function handleBulkDelete() {
    if (!selectedPhotos.length) return;
    const n = selectedPhotos.length;
    const ok = window.confirm(`Delete ${n} photo${n > 1 ? 's' : ''}? This can't be undone.`);
    if (!ok) return;
    setBusy(true);
    try {
      for (const p of selectedPhotos) await fsDelete(p.id);
      setSelectedIds(new Set());
      setSelectMode(false);
    } finally { setBusy(false); }
  }

  /* ── Render ───────────────────────────────────────────────────────── */

  const hasPhotos = savedPhotos.length > 0;

  return (
    <div className="h-screen w-full flex flex-col bg-film-black text-film-text overflow-hidden">
      <GalleryTopBar
        selectMode={selectMode}
        hasPhotos={hasPhotos}
        onToggleSelect={toggleSelectMode}
      />

      <main className="flex-1 overflow-y-auto">
        {!hasPhotos ? (
          /* ─── EMPTY STATE ─── */
          <div className="h-full flex flex-col items-center justify-center px-6 py-16 text-center gap-5">
            <div className="text-film-text-dim opacity-70">
              <EmptyFilmFrame />
            </div>
            <h1 className="font-serif text-3xl text-film-text">No photos yet</h1>
            <p className="font-sans text-sm text-film-text-dim max-w-xs leading-relaxed">
              Develop a photo in the editor, then save it here so you can come back to it.
            </p>
            <button
              type="button"
              onClick={() => navigate('/editor')}
              className="mt-2 px-5 py-2.5 text-[11px] uppercase tracking-[0.22em] font-sans font-medium bg-film-amber text-film-black rounded-sm hover:bg-film-amber-dim transition-colors"
            >
              Make your first photo
            </button>
          </div>
        ) : (
          /* ─── GRID ─── */
          <div
            className="px-4 py-5 columns-2 lg:columns-3 gap-3"
            style={{ columnFill: 'balance' }}
          >
            {savedPhotos.map((p) => (
              <GalleryCard
                key={p.id}
                photo={p}
                selectMode={selectMode}
                selected={selectedIds.has(p.id)}
                onToggleSelect={toggleSelectId}
                onEdit={handleEdit}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {/* ─── Bottom action bar (select mode) ───────────────────────────── */}
      {selectMode && hasPhotos && (
        <div className="flex-shrink-0 bg-film-surface border-t border-film-border px-5 py-3 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.22em] text-film-text-dim font-sans">
            {selectedIds.size === 0
              ? 'No photos selected'
              : `${selectedIds.size} selected`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBulkDownload}
              disabled={!selectedIds.size || busy}
              className="px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-sans border border-film-border text-film-text rounded-sm hover:border-film-amber hover:text-film-amber transition-colors disabled:opacity-40 disabled:hover:border-film-border disabled:hover:text-film-text"
            >
              Download All
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={!selectedIds.size || busy}
              className="px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] font-sans border border-film-border text-film-text rounded-sm hover:border-film-red hover:text-film-red transition-colors disabled:opacity-40 disabled:hover:border-film-border disabled:hover:text-film-text"
            >
              Delete All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
