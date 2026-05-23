import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { useAppStore, useAppActions } from '../../stores/appStore';

interface CropOverlayProps {
  /** Bounding-rect getter for the underlying display canvas. */
  getCanvasRect: () => DOMRect | null;
  /** Called when user clicks Apply — caller performs the destructive crop. */
  onApply:       () => void;
}

type HandleId = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'move';

const ASPECTS: { label: string; value: number | null }[] = [
  { label: 'Free',   value: null   },
  { label: '1:1',    value: 1      },
  { label: '4:5',    value: 4 / 5  },
  { label: '9:16',   value: 9 / 16 },
  { label: '16:9',   value: 16 / 9 },
];

export default function CropOverlay({ getCanvasRect, onApply }: CropOverlayProps) {
  const box      = useAppStore((s) => s.cropBox);
  const rotation = useAppStore((s) => s.cropRotation);
  const aspect   = useAppStore((s) => s.cropAspect);
  const {
    setCropBox, setCropRotation, setCropAspect,
    setCropMode, resetCrop,
  } = useAppActions();

  // Snap an arbitrary box to the locked aspect ratio (if any).
  function clampBox(b: { x: number; y: number; w: number; h: number }): typeof b {
    let { x, y, w, h } = b;
    w = Math.max(0.05, Math.min(1, w));
    h = Math.max(0.05, Math.min(1, h));
    if (aspect != null) {
      // Fit the box to the canvas frame using aspect = w/h in *frame* coords.
      const rect = getCanvasRect();
      const frameAR = rect ? rect.width / rect.height : 1;
      // Convert frame-space aspect to normalized-box aspect.
      const targetBoxAR = aspect / frameAR;
      // Reshape around the centre, preserving area roughly.
      const cx = x + w / 2, cy = y + h / 2;
      if (w / h > targetBoxAR) w = h * targetBoxAR;
      else                     h = w / targetBoxAR;
      x = cx - w / 2; y = cy - h / 2;
    }
    x = Math.max(0, Math.min(1 - w, x));
    y = Math.max(0, Math.min(1 - h, y));
    return { x, y, w, h };
  }

  // Re-snap whenever aspect changes
  useEffect(() => {
    setCropBox(clampBox(box));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect]);

  /* ── Drag handling ────────────────────────────────────────────────────── */
  const dragRef = useRef<{
    handle: HandleId;
    startMouse: { x: number; y: number };
    startBox:   typeof box;
  } | null>(null);

  function startDrag(handle: HandleId) {
    return (e: RPE) => {
      e.preventDefault(); e.stopPropagation();
      const rect = getCanvasRect();
      if (!rect) return;
      dragRef.current = {
        handle,
        startMouse: { x: e.clientX, y: e.clientY },
        startBox:   { ...box },
      };
    };
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const rect = getCanvasRect();
      if (!rect || rect.width < 1 || rect.height < 1) return;
      const dx = (e.clientX - d.startMouse.x) / rect.width;
      const dy = (e.clientY - d.startMouse.y) / rect.height;
      let { x, y, w, h } = d.startBox;
      switch (d.handle) {
        case 'move': x += dx;       y += dy;       break;
        case 'tl':   x += dx;       y += dy;       w -= dx; h -= dy; break;
        case 'tr':   y += dy;       w += dx;       h -= dy; break;
        case 'bl':   x += dx;       w -= dx;       h += dy; break;
        case 'br':   w += dx;       h += dy;                break;
        case 't':    y += dy;       h -= dy;                break;
        case 'b':    h += dy;                                break;
        case 'l':    x += dx;       w -= dx;                break;
        case 'r':    w += dx;                                break;
      }
      setCropBox(clampBox({ x, y, w, h }));
    }
    function up() { dragRef.current = null; }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup',   up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup',   up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect]);

  /* ── Visual layout ────────────────────────────────────────────────────── */
  const [rect, setRect] = useState<DOMRect | null>(getCanvasRect());
  useEffect(() => {
    function refresh() { setRect(getCanvasRect()); }
    refresh();
    window.addEventListener('resize', refresh);
    const id = setInterval(refresh, 250);   // pick up zoom/layout changes
    return () => { window.removeEventListener('resize', refresh); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rect) return null;

  const overlayLeft = rect.left + box.x * rect.width;
  const overlayTop  = rect.top  + box.y * rect.height;
  const overlayW    = box.w * rect.width;
  const overlayH    = box.h * rect.height;

  return (
    <>
      {/* Dim mask: 4 strips around the crop window */}
      <div className="fixed pointer-events-none z-40 bg-black/60"
           style={{ left: rect.left, top: rect.top, width: rect.width, height: overlayTop - rect.top }} />
      <div className="fixed pointer-events-none z-40 bg-black/60"
           style={{ left: rect.left, top: overlayTop + overlayH,
                    width: rect.width, height: rect.top + rect.height - (overlayTop + overlayH) }} />
      <div className="fixed pointer-events-none z-40 bg-black/60"
           style={{ left: rect.left, top: overlayTop,
                    width: overlayLeft - rect.left, height: overlayH }} />
      <div className="fixed pointer-events-none z-40 bg-black/60"
           style={{ left: overlayLeft + overlayW, top: overlayTop,
                    width: rect.left + rect.width - (overlayLeft + overlayW), height: overlayH }} />

      {/* Crop window */}
      <div
        className="fixed z-40 border border-film-amber pointer-events-auto cursor-move touch-none"
        style={{ left: overlayLeft, top: overlayTop, width: overlayW, height: overlayH }}
        onPointerDown={startDrag('move')}
      >
        {/* Rule-of-thirds grid */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 bottom-0 border-l border-film-amber/40" style={{ left: '33.3333%' }} />
          <div className="absolute top-0 bottom-0 border-l border-film-amber/40" style={{ left: '66.6667%' }} />
          <div className="absolute left-0 right-0 border-t border-film-amber/40" style={{ top: '33.3333%' }} />
          <div className="absolute left-0 right-0 border-t border-film-amber/40" style={{ top: '66.6667%' }} />
        </div>

        {/* 8 handles */}
        {([
          ['tl', '-top-1.5 -left-1.5 cursor-nwse-resize'],
          ['tr', '-top-1.5 -right-1.5 cursor-nesw-resize'],
          ['bl', '-bottom-1.5 -left-1.5 cursor-nesw-resize'],
          ['br', '-bottom-1.5 -right-1.5 cursor-nwse-resize'],
          ['t',  '-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize'],
          ['b',  '-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize'],
          ['l',  'top-1/2 -translate-y-1/2 -left-1.5 cursor-ew-resize'],
          ['r',  'top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize'],
        ] as [HandleId, string][]).map(([h, cls]) => (
          <div
            key={h}
            onPointerDown={startDrag(h)}
            className={`absolute w-3 h-3 bg-film-amber border border-film-black ${cls} touch-none`}
          />
        ))}
      </div>

      {/* Toolbar (bottom of screen, above bottom bar) */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 bg-film-surface border border-film-border rounded shadow-2xl">
        {ASPECTS.map((a) => {
          const active = aspect === a.value;
          return (
            <button
              key={a.label}
              type="button"
              onClick={() => setCropAspect(a.value)}
              className={[
                'px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] font-sans rounded-sm border transition-colors',
                active
                  ? 'border-film-amber text-film-amber bg-film-amber/[0.07]'
                  : 'border-film-border text-film-text-dim hover:border-film-muted hover:text-film-text',
              ].join(' ')}
            >
              {a.label}
            </button>
          );
        })}
        <div className="w-px h-5 bg-film-border mx-1" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-film-text-dim">Rotate</span>
          <input
            type="range"
            min={-180} max={180} step={1}
            value={rotation}
            onChange={(e) => setCropRotation(+e.target.value)}
            className="custom-range w-32"
            aria-label="Crop rotation"
          />
          <span className="text-[10px] text-film-amber tabular-nums w-9 text-right">{rotation}°</span>
        </div>
        <div className="w-px h-5 bg-film-border mx-1" />
        <button
          type="button"
          onClick={resetCrop}
          className="px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-sans rounded-sm border border-film-border text-film-text-dim hover:border-film-muted hover:text-film-text transition-colors"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => setCropMode(false)}
          className="px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-sans rounded-sm border border-film-border text-film-text-dim hover:border-film-muted hover:text-film-text transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          className="px-3 py-1 text-[10px] uppercase tracking-[0.18em] font-sans font-medium bg-film-amber text-film-black rounded-sm hover:bg-film-amber-dim transition-colors"
        >
          Apply
        </button>
      </div>
    </>
  );
}
