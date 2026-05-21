import { useEffect, useRef, useState } from 'react';
import type { PhotoRecord } from '../../types/photo';
import { loadPhotoBlob } from '../../utils/storage';

/* ─── Inline icon SVGs ─────────────────────────────────────────────────── */

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden {...stroke}>
      <path d="M2.5 13.5 L3.5 11 L11 3.5 L12.5 5 L5 12.5 L2.5 13.5 Z" />
      <path d="M10 4.5 L11.5 6" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden {...stroke}>
      <path d="M8 2 V10.5" />
      <path d="M4.5 7.5 L8 11 L11.5 7.5" />
      <path d="M3 13.5 H13" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden {...stroke}>
      <path d="M3 4 H13" />
      <path d="M5 4 V13.5 Q5 14.5 6 14.5 H10 Q11 14.5 11 13.5 V4" />
      <path d="M6.5 4 V2.8 Q6.5 2 7.3 2 H8.7 Q9.5 2 9.5 2.8 V4" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8 L7 12 L13 4" />
    </svg>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/* ─── Card props ───────────────────────────────────────────────────────── */

export interface GalleryCardProps {
  photo:           PhotoRecord;
  selectMode:      boolean;
  selected:        boolean;
  onToggleSelect:  (id: string) => void;
  onEdit:          (photo: PhotoRecord) => void;
  onDownload:      (photo: PhotoRecord) => void;
  onDelete:        (photo: PhotoRecord) => void;
}

/* ═══════════════════════════════════════════════════════════════
   GalleryCard
═══════════════════════════════════════════════════════════════ */

export default function GalleryCard({
  photo, selectMode, selected,
  onToggleSelect, onEdit, onDownload, onDelete,
}: GalleryCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /* ── Lazy reveal via IntersectionObserver ────────────────────────────── */
  useEffect(() => {
    if (visible) return;
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '300px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  /* ── Load blob once card is visible ─────────────────────────────────── */
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const blob = photo.blob ?? await loadPhotoBlob(photo.id);
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        createdUrl = u;
        setThumbUrl(u);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[GalleryCard] failed to load blob', photo.id, err);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [visible, photo.id, photo.blob]);

  function handleCardClick() {
    if (selectMode) onToggleSelect(photo.id);
  }

  return (
    <div
      ref={cardRef}
      onClick={handleCardClick}
      className={[
        'group relative w-full block bg-film-dark border rounded-sm overflow-hidden mb-3 transition-all',
        selected ? 'border-film-amber shadow-[0_0_0_1px_var(--color-film-amber)]' : 'border-film-border',
        selectMode ? 'cursor-pointer' : '',
      ].join(' ')}
      style={{ breakInside: 'avoid' }}
    >
      {/* ── Thumbnail ─────────────────────────────────────────────────── */}
      <div className="relative bg-film-black" style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={photo.filterName}
            className="block w-full h-full object-cover select-none"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 shimmer" />
        )}

        {/* ── Select-mode checkbox ─────────────────────────────────── */}
        {selectMode && (
          <div className="absolute top-2 left-2 z-10">
            <div className={[
              'w-5 h-5 rounded-sm flex items-center justify-center border transition-colors',
              selected
                ? 'bg-film-amber border-film-amber text-film-black'
                : 'bg-film-black/70 border-film-border text-transparent',
            ].join(' ')}>
              <CheckIcon />
            </div>
          </div>
        )}

        {/* ── Hover overlay (only when NOT in select mode) ────────── */}
        {!selectMode && !confirmingDelete && (
          <div className="absolute inset-0 bg-film-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center gap-2 pointer-events-none">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(photo); }}
              className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full bg-film-surface/90 border border-film-border text-film-text hover:border-film-amber hover:text-film-amber transition-colors backdrop-blur-sm"
              title="Edit"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDownload(photo); }}
              className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full bg-film-surface/90 border border-film-border text-film-text hover:border-film-amber hover:text-film-amber transition-colors backdrop-blur-sm"
              title="Download"
            >
              <DownloadIcon />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true); }}
              className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full bg-film-surface/90 border border-film-border text-film-text hover:border-film-red hover:text-film-red transition-colors backdrop-blur-sm"
              title="Delete"
            >
              <TrashIcon />
            </button>
          </div>
        )}

        {/* ── Delete confirmation popover ─────────────────────────── */}
        {confirmingDelete && (
          <div className="absolute inset-0 bg-film-black/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
            <p className="text-[12px] text-film-text text-center">
              Delete this photo? <br /><span className="text-film-text-dim text-[11px]">This can't be undone.</span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); }}
                className="px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] border border-film-border text-film-text rounded-sm hover:border-film-text-dim"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); onDelete(photo); }}
                className="px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] bg-film-red text-film-text rounded-sm hover:brightness-110"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Caption ───────────────────────────────────────────────────── */}
      <div className="px-3 py-2.5">
        <div className="font-serif text-[14px] leading-snug text-film-text truncate">
          {photo.filterName}
        </div>
        <div className="font-sans text-[11px] text-film-text-dim mt-0.5">
          {formatDate(photo.dateSaved)}
        </div>
      </div>
    </div>
  );
}
