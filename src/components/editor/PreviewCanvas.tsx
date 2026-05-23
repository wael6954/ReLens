import {
  useCallback, useEffect, useMemo, useRef, useState,
  type DragEvent, type WheelEvent, type MouseEvent,
} from 'react';
import { useAppStore, useAppActions, loadFreshPhoto } from '../../stores/appStore';
import { getFilterById } from '../../data/filters';
import { renderFilterToImageData } from '../../utils/thumbnails';
import { renderFilter, exportTexture, type FilterPipeline } from '../../utils/pipeline';
import type { SliderOverrides } from '../../types/filter';
import type { PhotoRecord } from '../../types/photo';
import { savePhoto as fsSavePhoto, exportPhoto as fsExportPhoto } from '../../utils/storage';
import { drawDateStamp } from '../../utils/dateStamp';
import { extractExifDate } from '../../utils/exif';
import { applyCropToBlob } from '../../utils/cropImage';
import CropOverlay from './CropOverlay';
import { detectFaces, buildFaceMask } from '../../utils/faceDetect';
import { injectExifFromOriginal } from '../../utils/exif';

/* ───────── Inline SVG icons ───────── */

function FilmFrameIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="1.4"
         strokeLinejoin="round" className={className} aria-hidden>
      <rect x="6" y="10" width="52" height="28" rx="1.5" />
      <rect x="2" y="14" width="2" height="2.5" fill="currentColor" stroke="none"/>
      <rect x="2" y="22" width="2" height="2.5" fill="currentColor" stroke="none"/>
      <rect x="2" y="30" width="2" height="2.5" fill="currentColor" stroke="none"/>
      <rect x="60" y="14" width="2" height="2.5" fill="currentColor" stroke="none"/>
      <rect x="60" y="22" width="2" height="2.5" fill="currentColor" stroke="none"/>
      <rect x="60" y="30" width="2" height="2.5" fill="currentColor" stroke="none"/>
      <circle cx="32" cy="24" r="6.5" />
      <circle cx="32" cy="24" r="3" />
    </svg>
  );
}
function ChevronLeft  () { return <svg viewBox="0 0 8 12" width="6" height="10" fill="currentColor" aria-hidden><path d="M6 0L0 6L6 12L6.8 11.2L2 6L6.8 0.8Z"/></svg>; }
function ChevronRight () { return <svg viewBox="0 0 8 12" width="6" height="10" fill="currentColor" aria-hidden><path d="M2 0L8 6L2 12L1.2 11.2L6 6L1.2 0.8Z"/></svg>; }

/* ───────── Helpers ───────── */

const MAX_PREVIEW_DIM = 1600;   // GPU-friendly preview cap (full-res used for save)
const MAX_SOURCE_DIM  = 4000;   // hard ceiling to keep readback under control

function fitDims(w: number, h: number, max: number): { w: number; h: number } {
  if (w <= max && h <= max) return { w, h };
  const r = w / h;
  return r > 1 ? { w: max, h: Math.round(max / r) }
               : { w: Math.round(max * r), h: max };
}

function humanSize(bytes: number): string {
  if (bytes < 1024)            return `${bytes} B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* ───────── Props ───────── */

interface PreviewCanvasProps {
  device:   GPUDevice      | null;
  pipeline: FilterPipeline | null;
}

/* ═══════════════════════════════════════════════════════════════
   PreviewCanvas — empty / loading / active states with A/B + zoom
═══════════════════════════════════════════════════════════════ */

export default function PreviewCanvas({ device, pipeline }: PreviewCanvasProps) {
  const currentPhoto     = useAppStore((s) => s.currentPhoto);
  const currentFilter    = useAppStore((s) => s.currentFilter);
  const sliderValues     = useAppStore((s) => s.sliderValues);
  const grainSeed        = useAppStore((s) => s.grainSeed);
  const dateStampEnabled = useAppStore((s) => s.dateStampEnabled);
  const dateStampSize    = useAppStore((s) => s.dateStampSize);
  const dateStampSource  = useAppStore((s) => s.dateStampSource);
  const dateStampCustom  = useAppStore((s) => s.dateStampCustom);
  const dateStampFormat  = useAppStore((s) => s.dateStampFormat);
  const dateStampColor   = useAppStore((s) => s.dateStampColor);
  const dateStampFont    = useAppStore((s) => s.dateStampFont);
  const dateStampPosition = useAppStore((s) => s.dateStampPosition);
  const leakEnabled      = useAppStore((s) => s.lightLeakEnabled);
  const leakEdge         = useAppStore((s) => s.lightLeakEdge);
  const leakStrength     = useAppStore((s) => s.lightLeakStrength);
  const leakColor        = useAppStore((s) => s.lightLeakColor);
  const wbPickerActive   = useAppStore((s) => s.wbPickerActive);
  const cropMode         = useAppStore((s) => s.cropMode);
  const cropBox          = useAppStore((s) => s.cropBox);
  const cropRotation     = useAppStore((s) => s.cropRotation);
  const referenceLUTs    = useAppStore((s) => s.referenceLUTs);
  const referenceStrength = useAppStore((s) => s.referenceStrength);
  const faces            = useAppStore((s) => s.faces);
  const facesPhotoId     = useAppStore((s) => s.facesPhotoId);
  const skinSmoothStrength = useAppStore((s) => s.skinSmoothStrength);
  const {
    setPhoto, reseedGrain, setSlider, setWbPickerActive,
    setCropMode, resetCrop, setFaces, setFaceDetectError,
  } = useAppActions();

  /* Convert the light-leak store fields into the override keys that
     `writeGradeParams` reads. Done once per state change rather than
     inside the render callback so the closure deps stay simple.        */
  const leakOverrides = useMemo<Record<string, number>>(() => {
    const COLOR_RGB: Record<string, [number, number, number]> = {
      amber:  [1.00, 0.72, 0.19],
      orange: [1.00, 0.47, 0.13],
      red:    [0.88, 0.19, 0.19],
      violet: [0.56, 0.25, 0.82],
      blue:   [0.13, 0.38, 0.88],
    };
    const EDGE_MAP: Record<string, number> = { left: 1, right: 2, top: 3, bottom: 4 };
    const [r, g, b] = COLOR_RGB[leakColor] ?? COLOR_RGB.amber;
    return {
      leakEdge:     leakEnabled ? (EDGE_MAP[leakEdge] ?? 1) : 0,
      leakStrength: leakEnabled ? Math.max(0, Math.min(1, leakStrength / 100)) * 0.85 : 0,
      leakColorR:   r, leakColorG: g, leakColorB: b,
      leakWidth:    0.30,
    };
  }, [leakEnabled, leakEdge, leakStrength, leakColor]);

  const containerRef = useRef<HTMLDivElement>(null);
  const origCanvasRef = useRef<HTMLCanvasElement>(null);
  const procCanvasRef = useRef<HTMLCanvasElement>(null);

  const bitmapRef     = useRef<ImageBitmap | null>(null);
  const sourceTexRef  = useRef<GPUTexture  | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);

  const [loading,   setLoading]   = useState(false);
  const [splitPos,  setSplitPos]  = useState(0.5);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [compareMode, setCompareMode] = useState<'split' | 'side'>('split');
  const [zoom, setZoom] = useState(1);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [sourceRev, setSourceRev] = useState(0);          /* bumps when sourceTex is uploaded */
  const [exifDate,  setExifDate]  = useState<Date | null>(null);

  /* ── Extract EXIF DateTimeOriginal once per photo ─────────────────────── */
  useEffect(() => {
    if (!currentPhoto) { setExifDate(null); return; }
    let cancelled = false;
    (async () => {
      const d = await extractExifDate(currentPhoto.blob);
      if (!cancelled) setExifDate(d);
    })();
    return () => { cancelled = true; };
  }, [currentPhoto]);

  // Resolve the date to actually draw, based on user choice + EXIF availability.
  const stampDate = useMemo(() => {
    if (dateStampSource === 'custom') {
      const d = new Date(dateStampCustom);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    return exifDate ?? new Date();
  }, [dateStampSource, dateStampCustom, exifDate]);

  const stampConfig = useMemo(() => ({
    date:       stampDate,
    formatId:   dateStampFormat,
    colorId:    dateStampColor,
    fontId:     dateStampFont,
    position:   dateStampPosition,
    sizeFactor: dateStampSize,
  }), [stampDate, dateStampFormat, dateStampColor, dateStampFont, dateStampPosition, dateStampSize]);

  /* ── Re-seed grain on filter change ONLY (slider drags must not flicker) ── */
  useEffect(() => { reseedGrain(); }, [reseedGrain, currentFilter]);

  /* ── Detect faces once per photo (cached in store) ───────────────────── */
  const photoId = currentPhoto
    ? `${currentPhoto.filename}|${currentPhoto.blob.size}|${currentPhoto.width}x${currentPhoto.height}`
    : '';
  useEffect(() => {
    if (!currentPhoto || facesPhotoId === photoId) return;
    let cancelled = false;
    // Clear stale state before kicking off detection so the UI shows "Detecting…"
    setFaces([], '');
    setFaceDetectError(null);
    (async () => {
      try {
        const result = await detectFaces(currentPhoto.blob);
        if (!cancelled) setFaces(result, photoId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[preview] face detection failed', err);
        if (!cancelled) {
          setFaces([], photoId);
          setFaceDetectError((err as Error)?.message ?? 'Face detection failed');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentPhoto, photoId, facesPhotoId, setFaces, setFaceDetectError]);

  /* ── Upload photo to GPU when it changes ──────────────────────────────── */
  useEffect(() => {
    if (!device || !currentPhoto) {
      sourceTexRef.current?.destroy();
      sourceTexRef.current = null;
      bitmapRef.current?.close?.();
      bitmapRef.current = null;
      return;
    }
    let cancelled = false;
    setLoading(true);
    reseedGrain();
    (async () => {
      try {
        // Downsample on decode if the source is larger than MAX_SOURCE_DIM so
        // we never hold a 100+MP texture for "full res" rendering.
        let full = await createImageBitmap(currentPhoto.blob);
        if (full.width > MAX_SOURCE_DIM || full.height > MAX_SOURCE_DIM) {
          const s = full.width > full.height
            ? { w: MAX_SOURCE_DIM, h: Math.round(MAX_SOURCE_DIM * full.height / full.width) }
            : { h: MAX_SOURCE_DIM, w: Math.round(MAX_SOURCE_DIM * full.width  / full.height) };
          const ds = await createImageBitmap(full, { resizeWidth: s.w, resizeHeight: s.h, resizeQuality: 'high' });
          full.close?.();
          full = ds;
        }
        if (cancelled) { full.close?.(); return; }
        bitmapRef.current?.close?.();
        bitmapRef.current = full;

        // Draw original to its 2D canvas at preview-fitted size
        const { w, h } = fitDims(full.width, full.height, MAX_PREVIEW_DIM);
        const origC = origCanvasRef.current;
        const procC = procCanvasRef.current;
        if (origC && procC) {
          origC.width = w; origC.height = h;
          procC.width = w; procC.height = h;
          const octx = origC.getContext('2d');
          if (octx) octx.drawImage(full, 0, 0, w, h);
        }

        // Upload a preview-sized source texture for the filter pipeline
        const previewBmp = (w === full.width && h === full.height)
          ? full
          : await createImageBitmap(full, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });

        const tex = device.createTexture({
          label: 'preview.source',
          size:  [w, h, 1],
          format: 'rgba8unorm',
          usage:  GPUTextureUsage.TEXTURE_BINDING
                | GPUTextureUsage.COPY_DST
                | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.copyExternalImageToTexture({ source: previewBmp }, { texture: tex }, [w, h]);

        sourceTexRef.current?.destroy();
        sourceTexRef.current = tex;
        if (cancelled) { tex.destroy(); return; }

        if (previewBmp !== full) previewBmp.close?.();

        /* Trigger a render now that the source texture is ready. The initial
           render fired before this upload completed and bailed out early. */
        setSourceRev((r) => r + 1);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [device, currentPhoto, reseedGrain]);

  /* ── Render the processed canvas when filter / sliders / source change ── */
  const renderPreview = useCallback(async () => {
    const tex = sourceTexRef.current;
    if (!device || !pipeline || !tex) return;
    const preset = currentFilter ? getFilterById(currentFilter) : null;
    const procC = procCanvasRef.current;
    if (!procC) return;

    // Abort any in-flight render — only the latest request matters
    renderAbortRef.current?.abort();
    const controller = new AbortController();
    renderAbortRef.current = controller;
    const { signal } = controller;

    // No filter selected → just copy the bitmap straight to processed canvas
    if (!preset) {
      const bmp = bitmapRef.current;
      if (bmp) {
        const ctx = procC.getContext('2d');
        if (ctx) ctx.drawImage(bmp, 0, 0, procC.width, procC.height);
      }
      return;
    }

    const overrides: SliderOverrides = { ...sliderValues, grainSeed, ...leakOverrides };
    const refOpt = referenceLUTs
      ? { R: referenceLUTs.R, G: referenceLUTs.G, B: referenceLUTs.B, strength: referenceStrength / 100 }
      : null;

    // Skin smoothing — build mask at preview size if faces detected & strength > 0
    let skinOpt: { mask: Uint8Array; maskW: number; maskH: number; strength: number } | null = null;
    if (skinSmoothStrength > 0 && faces.length > 0) {
      const mw = tex.width, mh = tex.height;
      skinOpt = { mask: buildFaceMask(faces, mw, mh), maskW: mw, maskH: mh, strength: skinSmoothStrength / 100 };
    }

    const t0 = performance.now();
    try {
      const img = await renderFilterToImageData(pipeline, device, tex, preset, overrides, signal, refOpt, skinOpt);
      if (signal.aborted) return;
      const ctx = procC.getContext('2d');
      if (!ctx) return;
      if (img.width !== procC.width || img.height !== procC.height) {
        procC.width = img.width;
        procC.height = img.height;
      }
      ctx.putImageData(img, 0, 0);
      if (dateStampEnabled) drawDateStamp(ctx, procC.width, procC.height, stampConfig);
      if (import.meta.env.DEV) setRenderMs(performance.now() - t0);
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        // eslint-disable-next-line no-console
        console.error('[preview] render failed', err);
        // Fallback: at least keep the original image visible
        const bmp = bitmapRef.current;
        const ctx = procC.getContext('2d');
        if (bmp && ctx) ctx.drawImage(bmp, 0, 0, procC.width, procC.height);
      }
    }
  }, [device, pipeline, currentFilter, sliderValues, grainSeed, leakOverrides, dateStampEnabled, stampConfig, referenceLUTs, referenceStrength, faces, skinSmoothStrength]);

  // Coalesce render calls to once-per-frame
  const renderPendingRef = useRef(false);
  const scheduleRender   = useCallback(() => {
    if (renderPendingRef.current) return;
    renderPendingRef.current = true;
    requestAnimationFrame(() => {
      renderPendingRef.current = false;
      void renderPreview();
    });
  }, [renderPreview]);

  useEffect(() => { scheduleRender(); }, [scheduleRender, currentPhoto, currentFilter, sliderValues, sourceRev, dateStampEnabled, stampConfig]);

  /* ═══════════════════════════════════════════════════════════════
     EMPTY-STATE FILE PICKER + DROP
  ═══════════════════════════════════════════════════════════════ */

  async function loadFile(file: File) {
    const bmp = await createImageBitmap(file);
    loadFreshPhoto({ blob: file, filename: file.name, width: bmp.width, height: bmp.height });
    bmp.close?.();
  }

  async function pickViaTauri() {
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
      const name  = path.split(/[\\/]/).pop() ?? 'photo';
      const ext   = name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mime  = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const blob  = new Blob([new Uint8Array(bytes)], { type: mime });
      const file  = new File([blob], name, { type: mime });
      await loadFile(file);
    } catch {
      // Fallback to <input type=file> for non-Tauri / dev browser
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => { const f = input.files?.[0]; if (f) await loadFile(f); };
      input.click();
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) void loadFile(f);
  }

  /* ═══════════════════════════════════════════════════════════════
     A/B SLIDER + ZOOM
  ═══════════════════════════════════════════════════════════════ */

  function onSplitPointerDown(e: MouseEvent) {
    e.preventDefault();
    setDraggingSplit(true);
  }
  useEffect(() => {
    if (!draggingSplit) return;
    function move(e: PointerEvent) {
      const c = containerRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      setSplitPos(Math.max(0, Math.min(1, x)));
    }
    function up() { setDraggingSplit(false); }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup',   up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup',   up);
    };
  }, [draggingSplit]);

  /* ── WB picker: sample neutral-gray click → set colorTemp + tint ──────── */
  function onCanvasClickForWB(e: MouseEvent) {
    if (!wbPickerActive) return;
    const orig = origCanvasRef.current;
    if (!orig) return;
    const rect = orig.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const xn = (e.clientX - rect.left) / rect.width;
    const yn = (e.clientY - rect.top)  / rect.height;
    if (xn < 0 || xn > 1 || yn < 0 || yn > 1) return;
    const px = Math.max(0, Math.min(orig.width  - 1, Math.floor(xn * orig.width)));
    const py = Math.max(0, Math.min(orig.height - 1, Math.floor(yn * orig.height)));
    const ctx = orig.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    // Average a 5×5 patch for stability
    const r0 = Math.max(0, px - 2), c0 = Math.max(0, py - 2);
    const rw = Math.min(5, orig.width  - r0);
    const ch = Math.min(5, orig.height - c0);
    const { data } = ctx.getImageData(r0, c0, rw, ch);
    let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      R += data[i]; G += data[i + 1]; B += data[i + 2]; n++;
    }
    if (!n) return;
    R /= n * 255; G /= n * 255; B /= n * 255;
    // Slider math: ct slider in [-100..100], cools (-) when raw is warm (R>B).
    const ctSlider   = Math.round((B - R) * 850);
    const tintSlider = Math.round(-(G - (R + B) / 2) * 1400);
    setSlider('colorTemp', Math.max(-100, Math.min(100, ctSlider)));
    setSlider('edittint',  Math.max(-100, Math.min(100, tintSlider)));
    setWbPickerActive(false);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom((z) => Math.max(1, Math.min(8, z * factor)));
  }
  function fitZoom()    { setZoom(1); }

  /* ═══════════════════════════════════════════════════════════════
     SAVE TO MY PHOTOS + DOWNLOAD
  ═══════════════════════════════════════════════════════════════ */

  async function renderFullResTexture(): Promise<{ tex: GPUTexture; w: number; h: number } | null> {
    if (!device || !pipeline || !currentPhoto) return null;
    const preset = currentFilter ? getFilterById(currentFilter) : null;

    const full = bitmapRef.current ?? await createImageBitmap(currentPhoto.blob);
    const w = full.width, h = full.height;
    const src = device.createTexture({
      label: 'save.source',
      size: [w, h, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: full }, { texture: src }, [w, h]);

    const overrides: SliderOverrides = { ...sliderValues, grainSeed, ...leakOverrides };
    const refOpt = referenceLUTs
      ? { R: referenceLUTs.R, G: referenceLUTs.G, B: referenceLUTs.B, strength: referenceStrength / 100 }
      : null;
    let skinOpt: { mask: Uint8Array; maskW: number; maskH: number; strength: number } | null = null;
    if (skinSmoothStrength > 0 && faces.length > 0) {
      skinOpt = { mask: buildFaceMask(faces, w, h), maskW: w, maskH: h, strength: skinSmoothStrength / 100 };
    }
    const tex = preset
      ? await renderFilter(pipeline, device, src, preset, overrides, refOpt, skinOpt)
      : src;        // no filter → caller exports the raw upload
    if (preset) src.destroy();
    return { tex, w, h };
  }

  const [exporting, setExporting] = useState(false);
  const [downloadMenu, setDownloadMenu] = useState(false);

  /* ── Apply destructive crop to the source blob ────────────────────────── */
  async function onApplyCrop() {
    if (!currentPhoto) return;
    try {
      const { blob, width, height } = await applyCropToBlob(
        currentPhoto.blob,
        { box: cropBox, rotation: cropRotation },
        currentPhoto.blob.type || 'image/jpeg',
        0.95,
      );
      const cropped = new File([blob], currentPhoto.filename, { type: blob.type });
      setPhoto({ blob: cropped, filename: currentPhoto.filename, width, height });
      resetCrop();
      setCropMode(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[preview] crop failed', err);
    }
  }

  /* ── Keyboard shortcut bridge from EditorPage (Cmd/Ctrl+S / +D) ─────── */
  useEffect(() => {
    function onSaveEvt()     { void onSaveToMyPhotos(); }
    function onDownloadEvt() { void onDownload('jpeg'); }
    window.addEventListener('app:save', onSaveEvt);
    window.addEventListener('app:download', onDownloadEvt);
    return () => {
      window.removeEventListener('app:save', onSaveEvt);
      window.removeEventListener('app:download', onDownloadEvt);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, pipeline, currentFilter, currentPhoto, sliderValues, grainSeed]);

  /** Wrap a JPEG/PNG blob with the LED date stamp burned in (if enabled). */
  async function maybeStampBlob(blob: Blob, w: number, h: number, mime: string, quality: number): Promise<Blob> {
    if (!dateStampEnabled) return blob;
    const bmp = await createImageBitmap(blob);
    const c   = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) { bmp.close?.(); return blob; }
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    drawDateStamp(ctx, w, h, stampConfig);
    return new Promise<Blob>((resolve, reject) => {
      c.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob null')),
               mime, mime === 'image/jpeg' ? quality : undefined);
    });
  }

  async function onSaveToMyPhotos() {
    if (!device || !currentPhoto) return;
    setExporting(true);
    try {
      const r = await renderFullResTexture();
      if (!r) return;
      let blob = await exportTexture(device, r.tex, r.w, r.h, 'image/jpeg', 0.95);
      r.tex.destroy();
      blob = await maybeStampBlob(blob, r.w, r.h, 'image/jpeg', 0.95);
      blob = await injectExifFromOriginal(currentPhoto.blob, blob);
      const filterName = currentFilter
        ? (getFilterById(currentFilter)?.name ?? 'Unfiltered')
        : 'Unfiltered';
      const record: PhotoRecord = {
        id:           crypto.randomUUID(),
        blob,
        filename:     currentPhoto.filename,
        filterName,
        sliderValues: { ...sliderValues },
        dateSaved:    new Date().toISOString(),
        width:        r.w,
        height:       r.h,
      };
      // Storage handles disk write + metadata.json + Zustand update
      await fsSavePhoto(record, blob);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[preview] save failed', err);
    } finally { setExporting(false); }
  }

  async function onDownload(format: 'jpeg' | 'png') {
    if (!device || !currentPhoto) return;
    setDownloadMenu(false);
    setExporting(true);
    try {
      const r = await renderFullResTexture();
      if (!r) return;
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      let blob = await exportTexture(device, r.tex, r.w, r.h, mime, 0.92);
      r.tex.destroy();
      blob = await maybeStampBlob(blob, r.w, r.h, mime, 0.92);
      if (mime === 'image/jpeg') {
        blob = await injectExifFromOriginal(currentPhoto.blob, blob);
      }
      const base = currentPhoto.filename.replace(/\.[^.]+$/, '');
      await fsExportPhoto(blob, `${base}-relens`, format);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[preview] download failed', err);
    } finally { setExporting(false); }
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════ */

  const hasPhoto = !!currentPhoto;
  const clipPath = useMemo(() =>
    compareMode === 'split'
      ? `inset(0 0 0 ${(splitPos * 100).toFixed(2)}%)`
      : 'none',
    [compareMode, splitPos],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ─── Canvas area ─────────────────────────────────────────────────── */}
      <div
        className={[
          'relative flex-1 min-h-0 flex items-center justify-center overflow-hidden bg-film-black',
          wbPickerActive && hasPhoto ? 'cursor-crosshair' : '',
        ].join(' ')}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={onDrop}
        onWheel={hasPhoto ? onWheel : undefined}
        onDoubleClick={hasPhoto ? () => setZoom(1) : undefined}
        onClick={hasPhoto && wbPickerActive ? onCanvasClickForWB : undefined}
      >
        {!hasPhoto ? (
          /* ─── EMPTY STATE ─── */
          <button
            type="button"
            onClick={pickViaTauri}
            className="m-6 px-12 py-16 flex flex-col items-center gap-4 border border-dashed border-film-border rounded-md text-film-text-dim hover:border-film-amber hover:text-film-amber transition-colors"
          >
            <FilmFrameIcon className="w-14 h-10" />
            <div className="font-serif text-2xl text-film-text">Drop a photo or click to browse</div>
            <div className="text-[11px] uppercase tracking-[0.28em] font-sans">JPG &middot; PNG &middot; WEBP</div>
          </button>
        ) : (
          /* ─── ACTIVE STATE ─── */
          <>
            {loading && (
              <div className="absolute inset-0 pointer-events-none animate-pulse bg-film-amber/[0.04]" />
            )}

            {wbPickerActive && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-sans bg-film-amber text-film-black rounded-sm shadow-lg pointer-events-none">
                Click a neutral-gray spot
              </div>
            )}

            {/* Crop toggle (top-left) */}
            <button
              type="button"
              onClick={() => setCropMode(!cropMode)}
              className={[
                'absolute top-3 left-3 z-30 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-sans rounded-sm border backdrop-blur-sm transition-colors',
                cropMode
                  ? 'bg-film-amber border-film-amber text-film-black'
                  : 'bg-film-surface/80 border-film-border text-film-text hover:border-film-amber hover:text-film-amber',
              ].join(' ')}
              title="Crop & rotate"
            >
              {cropMode ? 'Crop On' : 'Crop'}
            </button>

            {/* Compare-mode toggle (top-right) */}
            <button
              type="button"
              onClick={() => setCompareMode((m) => (m === 'split' ? 'side' : 'split'))}
              className="absolute top-3 right-3 z-30 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-sans bg-film-surface/80 border border-film-border text-film-text rounded-sm hover:border-film-amber hover:text-film-amber transition-colors backdrop-blur-sm"
              title="Toggle comparison mode"
            >
              {compareMode === 'split' ? 'A/B Slider' : 'Side by Side'}
            </button>

            {/* Fit button */}
            {zoom > 1.001 && (
              <button
                type="button"
                onClick={fitZoom}
                className="absolute top-3 right-[140px] z-30 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] font-sans bg-film-surface/80 border border-film-border text-film-text rounded-sm hover:border-film-amber hover:text-film-amber transition-colors backdrop-blur-sm"
                title="Reset zoom"
              >
                {`${Math.round(zoom * 100)}%  Fit`}
              </button>
            )}

            {compareMode === 'split' ? (
              <div
                ref={containerRef}
                className="relative inline-block max-w-full max-h-full"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              >
                <canvas
                  ref={origCanvasRef}
                  className="block max-w-full max-h-[calc(100vh-220px)] select-none pointer-events-none"
                />
                <canvas
                  ref={procCanvasRef}
                  className="block absolute top-0 left-0 w-full h-full select-none pointer-events-none"
                  style={{ clipPath }}
                />
                {/* Slider divider line */}
                <div
                  className="absolute top-0 bottom-0 pointer-events-none"
                  style={{ left: `${splitPos * 100}%`, transform: 'translateX(-1px)' }}
                >
                  <div className="w-[2px] h-full bg-film-amber/80 shadow-[0_0_10px_rgba(200,169,110,0.6)]" />
                </div>
                {/* Drag handle */}
                <div
                  onPointerDown={onSplitPointerDown}
                  className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 cursor-col-resize touch-none"
                  style={{ left: `${splitPos * 100}%` }}
                >
                  <div className="flex items-center justify-center gap-1.5 px-2 py-3 rounded-full bg-film-amber text-film-black shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                    <ChevronLeft /><ChevronRight />
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="flex gap-2 max-w-full max-h-full"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
              >
                <canvas ref={origCanvasRef} className="block max-w-[48%] max-h-[calc(100vh-220px)] border border-film-border" />
                <canvas ref={procCanvasRef} className="block max-w-[48%] max-h-[calc(100vh-220px)] border border-film-border" />
              </div>
            )}
          </>
        )}

        {cropMode && hasPhoto && (
          <CropOverlay
            getCanvasRect={() => procCanvasRef.current?.getBoundingClientRect() ?? null}
            onApply={onApplyCrop}
          />
        )}
      </div>

      {/* ─── Bottom bar ──────────────────────────────────────────────────── */}
      {hasPhoto && currentPhoto && (
        <div className="h-12 flex-shrink-0 flex items-center justify-between px-5 bg-film-surface border-t border-film-border">
          <div className="text-[11px] font-sans text-film-text-dim tracking-wide truncate">
            <span className="text-film-text">{currentPhoto.filename}</span>
            <span className="mx-2">·</span>
            {currentPhoto.width} × {currentPhoto.height}
            <span className="mx-2">·</span>
            {humanSize(currentPhoto.blob.size)}
            {import.meta.env.DEV && renderMs !== null && (
              <>
                <span className="mx-2">·</span>
                <span className="text-film-amber">{renderMs.toFixed(1)}ms</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 relative">
            <button
              type="button"
              onClick={onSaveToMyPhotos}
              disabled={exporting}
              className="px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] font-sans font-medium bg-film-amber text-film-black rounded-sm hover:bg-film-amber-dim transition-colors disabled:opacity-60"
            >
              {exporting ? 'Saving…' : 'Save to My Photos'}
            </button>
            <button
              type="button"
              onClick={() => setDownloadMenu((m) => !m)}
              disabled={exporting}
              className="px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-sans border border-film-border text-film-text rounded-sm hover:border-film-amber hover:text-film-amber transition-colors disabled:opacity-60"
            >
              Download ▾
            </button>
            {downloadMenu && (
              <div className="absolute right-0 bottom-full mb-2 bg-film-surface border border-film-border rounded-sm shadow-xl py-1 z-40 min-w-[140px]">
                <button onClick={() => onDownload('jpeg')} className="block w-full text-left px-3 py-1.5 text-[11px] text-film-text hover:bg-film-dark transition-colors">
                  JPEG <span className="text-film-text-dim">92%</span>
                </button>
                <button onClick={() => onDownload('png')} className="block w-full text-left px-3 py-1.5 text-[11px] text-film-text hover:bg-film-dark transition-colors">
                  PNG
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
