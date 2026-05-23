import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { getFilterById } from '../../data/filters';
import {
  pickInputDir, pickOutputDir, runBatch,
  type BatchProgress,
} from '../../utils/batchProcess';
import type { FilterPipeline } from '../../utils/pipeline';
import type { SliderOverrides } from '../../types/filter';

interface BatchDialogProps {
  open:     boolean;
  onClose:  () => void;
  device:   GPUDevice      | null;
  pipeline: FilterPipeline | null;
}

export default function BatchDialog({ open, onClose, device, pipeline }: BatchDialogProps) {
  const currentFilter     = useAppStore((s) => s.currentFilter);
  const sliderValues      = useAppStore((s) => s.sliderValues);
  const grainSeed         = useAppStore((s) => s.grainSeed);
  const referenceLUTs     = useAppStore((s) => s.referenceLUTs);
  const referenceStrength = useAppStore((s) => s.referenceStrength);
  const lightLeakEnabled  = useAppStore((s) => s.lightLeakEnabled);
  const lightLeakEdge     = useAppStore((s) => s.lightLeakEdge);
  const lightLeakStrength = useAppStore((s) => s.lightLeakStrength);
  const lightLeakColor    = useAppStore((s) => s.lightLeakColor);

  const [inputDir,  setInputDir]  = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [running,   setRunning]   = useState(false);
  const [progress,  setProgress]  = useState<BatchProgress>({ total: 0, done: 0, currentName: '', failed: [] });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setInputDir(null); setOutputDir(null);
      setRunning(false); setProgress({ total: 0, done: 0, currentName: '', failed: [] });
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  const preset = currentFilter ? getFilterById(currentFilter) ?? null : null;

  const EDGE_MAP: Record<string, number> = { left: 1, right: 2, top: 3, bottom: 4 };
  const COLOR_RGB: Record<string, [number, number, number]> = {
    amber:  [1.00, 0.72, 0.19],
    orange: [1.00, 0.47, 0.13],
    red:    [0.88, 0.19, 0.19],
    violet: [0.56, 0.25, 0.82],
    blue:   [0.13, 0.38, 0.88],
  };
  const [lr, lg, lb] = COLOR_RGB[lightLeakColor] ?? COLOR_RGB.amber;
  const leakOverrides = {
    leakEdge:     lightLeakEnabled ? (EDGE_MAP[lightLeakEdge] ?? 1) : 0,
    leakStrength: lightLeakEnabled ? Math.max(0, Math.min(1, lightLeakStrength / 100)) * 0.85 : 0,
    leakColorR:   lr, leakColorG: lg, leakColorB: lb,
    leakWidth:    0.30,
  };
  const overrides: SliderOverrides = { ...sliderValues, grainSeed, ...leakOverrides };
  const refOpt = referenceLUTs
    ? { R: referenceLUTs.R, G: referenceLUTs.G, B: referenceLUTs.B, strength: referenceStrength / 100 }
    : null;

  async function pickIn()  { const d = await pickInputDir();  if (d) setInputDir(d); }
  async function pickOut() { const d = await pickOutputDir(inputDir ?? undefined); if (d) setOutputDir(d); }

  async function start() {
    if (!device || !pipeline || !inputDir || !outputDir) return;
    setRunning(true);
    abortRef.current = new AbortController();
    try {
      await runBatch(inputDir, outputDir, {
        device, pipeline,
        preset, overrides,
        referenceLUT: refOpt,
        onProgress:   (p) => setProgress({ ...p }),
        signal:       abortRef.current.signal,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[batch] aborted/failed', err);
    } finally {
      setRunning(false);
    }
  }

  const ready  = !!inputDir && !!outputDir && !running;
  const finishedAll = !running && progress.total > 0 && progress.done >= progress.total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-film-black/70 backdrop-blur-sm">
      <div className="w-[480px] max-w-[92vw] bg-film-surface border border-film-border rounded shadow-2xl">
        <header className="px-5 py-3 flex items-center justify-between border-b border-film-border">
          <h2 className="font-serif text-lg text-film-text">Batch Process</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="text-film-text-dim hover:text-film-text disabled:opacity-50 text-[18px] leading-none"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-[11px] text-film-text-dim leading-snug">
            Applies the current filter and edit settings to every JPG / PNG / WEBP in the source folder and writes JPEGs into the destination.
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={running}
              onClick={pickIn}
              className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] font-sans border border-film-border text-film-text rounded-sm hover:border-film-amber hover:text-film-amber transition-colors disabled:opacity-50 text-left"
            >
              {inputDir ? <span className="text-film-amber">Source: </span> : null}
              <span className="font-mono normal-case tracking-normal text-[11px] break-all">{inputDir ?? 'Pick source folder'}</span>
            </button>
            <button
              type="button"
              disabled={running || !inputDir}
              onClick={pickOut}
              className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] font-sans border border-film-border text-film-text rounded-sm hover:border-film-amber hover:text-film-amber transition-colors disabled:opacity-50 text-left"
            >
              {outputDir ? <span className="text-film-amber">Output: </span> : null}
              <span className="font-mono normal-case tracking-normal text-[11px] break-all">{outputDir ?? 'Pick output folder'}</span>
            </button>
          </div>

          <div className="text-[10px] uppercase tracking-[0.18em] text-film-text-dim">
            Filter: <span className="text-film-text">{preset?.name ?? 'None (passthrough)'}</span>
          </div>

          {(running || progress.total > 0) && (
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex justify-between text-[10px] text-film-text-dim">
                <span>{progress.done}/{progress.total}</span>
                <span className="truncate ml-2 max-w-[60%]">{progress.currentName}</span>
              </div>
              <div className="h-1.5 bg-film-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-film-amber transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              {progress.failed.length > 0 && (
                <p className="text-[10px] text-red-400">
                  {progress.failed.length} failed: {progress.failed.slice(0, 3).join(', ')}{progress.failed.length > 3 ? '…' : ''}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 flex items-center justify-end gap-2 border-t border-film-border">
          {running ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] font-sans border border-film-border text-film-text rounded-sm hover:border-red-400 hover:text-red-400 transition-colors"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] font-sans border border-film-border text-film-text rounded-sm hover:border-film-muted transition-colors"
              >
                {finishedAll ? 'Done' : 'Close'}
              </button>
              <button
                type="button"
                onClick={start}
                disabled={!ready}
                className="px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] font-sans font-medium bg-film-amber text-film-black rounded-sm hover:bg-film-amber-dim transition-colors disabled:opacity-50"
              >
                {finishedAll ? 'Run again' : 'Start'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
