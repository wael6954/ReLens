import { useEffect, useMemo, useRef, useState } from 'react';
import { useWebGPU } from '../../hooks/useWebGPU';
import { createPipeline } from '../../utils/pipeline';
import { useAppStore, useAppActions, undo, redo } from '../../stores/appStore';
import { FILTERS } from '../../data/filters';
import { initUserPresets } from '../../utils/presetStorage';
import TopBar from './TopBar';
import FilterPanel from './FilterPanel';
import PreviewCanvas from './PreviewCanvas';
import AdjustmentPanel from './AdjustmentPanel';
import BatchDialog from './BatchDialog';

/* ─── Compatibility / error banner ─── */

function CompatBanner({ message }: { message: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="bg-film-amber-dim border-b border-film-amber px-4 py-2 flex items-center justify-between gap-3 text-[11px] font-sans">
      <span className="text-film-text">{message}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-film-text-dim hover:text-film-text transition-colors text-[14px] leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

/* ─── Adjust floating button (mobile only) ─── */

function AdjustFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="md:hidden fixed bottom-4 right-4 z-30 px-5 py-3 rounded-full bg-film-amber text-film-black font-sans font-medium text-[11px] uppercase tracking-[0.18em] shadow-[0_4px_18px_rgba(0,0,0,0.5)]"
    >
      Adjust
    </button>
  );
}

/* ─── Bottom sheet (mobile) ─── */

function BottomSheet({ open, onClose, children }: {
  open: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function onTouchStart(e: React.TouchEvent) { dragStart.current = e.touches[0].clientY; }
  function onTouchMove(e: React.TouchEvent) {
    if (dragStart.current == null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    if (dy > 0) setDragY(dy);
  }
  function onTouchEnd() {
    if (dragStart.current == null) return;
    if (dragY > 90) onClose();
    setDragY(0);
    dragStart.current = null;
  }

  return (
    <>
      <div
        onClick={onClose}
        className={`md:hidden fixed inset-0 z-40 bg-film-black/60 transition-opacity ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        aria-hidden
      />
      <div
        className="md:hidden fixed left-0 right-0 bottom-0 z-50 bg-film-surface border-t border-film-border rounded-t-xl flex flex-col"
        style={{
          maxHeight: '78vh',
          transform: open ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: dragStart.current == null ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        }}
      >
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="py-3 flex justify-center cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-10 h-1 bg-film-border rounded-full" />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════ */

export default function EditorPage() {
  const initCanvasRef = useRef<HTMLCanvasElement>(null);
  const { device, isSupported, error } = useWebGPU(initCanvasRef);
  const pipeline = useMemo(() => (device ? createPipeline(device) : null), [device]);

  const currentFilter = useAppStore((s) => s.currentFilter);
  const { setFilter } = useAppActions();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  /* Load user presets from disk once on mount */
  useEffect(() => { void initUserPresets(); }, []);

  /* ─── Global keyboard shortcuts ───────────────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA';
      const isMod   = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+S → save to My Photos
      if (isMod && (e.key === 's' || e.key === 'S') && !inField) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app:save'));
        return;
      }
      // Cmd/Ctrl+D → download
      if (isMod && (e.key === 'd' || e.key === 'D') && !inField) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app:download'));
        return;
      }
      // Cmd/Ctrl+Z → undo, Cmd/Ctrl+Shift+Z (or Ctrl+Y) → redo
      if (isMod && (e.key === 'z' || e.key === 'Z') && !inField) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (isMod && (e.key === 'y' || e.key === 'Y') && !inField) {
        e.preventDefault();
        redo();
        return;
      }
      // Escape → close sheet, or deselect filter
      if (e.key === 'Escape') {
        if (sheetOpen) { setSheetOpen(false); return; }
        if (currentFilter) { setFilter(null); return; }
      }
      // Left/Right arrows → cycle filters (outside input fields)
      if (!inField && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const i = currentFilter ? FILTERS.findIndex((f) => f.id === currentFilter) : -1;
        const next = e.key === 'ArrowRight'
          ? (i + 1 + FILTERS.length) % FILTERS.length
          : (i - 1 + FILTERS.length) % FILTERS.length;
        setFilter(FILTERS[next].id);
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentFilter, setFilter, sheetOpen]);

  return (
    <div className="h-screen w-full flex flex-col bg-film-black text-film-text overflow-hidden">
      {!isSupported && (
        <CompatBanner message="Running in compatibility mode (WebGL). Some effects may render differently." />
      )}
      {isSupported && error && (
        <CompatBanner message={`WebGPU reported an error: ${error}. Open the dev console for details.`} />
      )}

      <TopBar onBatchClick={() => setBatchOpen(true)} />

      <div className="flex flex-1 flex-col md:flex-row min-h-0">
        {/* ─── Left: filter panel ─────────────────────────────────────────── */}
        <aside className="w-full md:w-[280px] flex-shrink-0 bg-film-surface md:border-r md:border-t-0 border-t border-film-border overflow-y-auto md:order-1 order-2 md:h-auto h-[140px]">
          <FilterPanel device={device} pipeline={pipeline} />
        </aside>

        {/* ─── Centre: preview canvas (empty / loading / active) ─────────── */}
        <main className="flex-1 min-w-0 relative flex flex-col bg-film-black md:order-2 order-1">
          {isSupported ? (
            <PreviewCanvas device={device} pipeline={pipeline} />
          ) : (
            <div className="flex-1 flex items-center justify-center px-6 text-center text-film-text-dim text-sm font-sans">
              <div>
                <p className="font-serif text-2xl text-film-text mb-2">WebGPU unavailable</p>
                <p>{error ?? 'WebGPU not supported in this environment'}</p>
              </div>
            </div>
          )}
        </main>

        {/* ─── Right: adjustments — desktop side panel only ─────────────── */}
        <aside className="hidden md:flex md:order-3 w-[260px] flex-shrink-0 bg-film-surface border-l border-film-border overflow-y-auto flex-col">
          <AdjustmentPanel />
        </aside>
      </div>

      {/* ─── Mobile: floating Adjust button + bottom sheet ─────────────────── */}
      {currentFilter && <AdjustFab onClick={() => setSheetOpen(true)} />}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <AdjustmentPanel />
      </BottomSheet>

      <BatchDialog
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        device={device}
        pipeline={pipeline}
      />

      {/* Hidden bootstrap canvas — WebGPU context lives here, never displayed */}
      <canvas ref={initCanvasRef} className="hidden" width={1} height={1} aria-hidden />
    </div>
  );
}
