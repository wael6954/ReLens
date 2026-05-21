import { useEffect, useRef, useState } from 'react';
import type { FilterPreset } from '../types/filter';
import type { CurrentPhoto } from '../types/photo';
import type { FilterPipeline } from '../utils/pipeline';
import { renderFilterToImageData } from '../utils/thumbnails';

const THUMB_W = 120;
const THUMB_H = 80;
const BATCH   = 4;

interface State {
  thumbs:   Map<string, ImageData>;
  // photoId tracks "which photo are these thumbs for" so a late-arriving
  // render from a previous photo doesn't poison the new photo's state.
  photoTag: string;
}

/**
 * Renders preset thumbnails for the current photo, batched at {@link BATCH}
 * at a time so the GPU never has dozens of jobs in flight at once. Returns
 * a stable Map<filterId, ImageData> that grows as renders complete. The
 * map is reset and re-populated whenever the photo changes.
 *
 * Thumbnails always use preset defaults — never slider overrides — so the
 * map is NOT invalidated when sliders change.
 */
export function useFilterThumbnails(
  device:   GPUDevice | null,
  pipeline: FilterPipeline | null,
  photo:    CurrentPhoto | null,
  filters:  FilterPreset[],
): Map<string, ImageData> {
  const [state, setState] = useState<State>({ thumbs: new Map(), photoTag: '' });
  const sourceRef = useRef<{ tex: GPUTexture; tag: string } | null>(null);

  // ── Upload the photo to a single shared source texture ─────────────────
  useEffect(() => {
    if (!device || !photo) {
      sourceRef.current?.tex.destroy();
      sourceRef.current = null;
      setState({ thumbs: new Map(), photoTag: '' });
      return;
    }
    let cancelled = false;
    const tag = `${photo.filename}:${photo.width}x${photo.height}:${Date.now()}`;

    (async () => {
      const bitmap = await createImageBitmap(photo.blob, {
        resizeWidth:  THUMB_W,
        resizeHeight: THUMB_H,
        resizeQuality: 'high',
      });
      if (cancelled) { bitmap.close?.(); return; }

      const tex = device.createTexture({
        label: 'thumb.source',
        size:  [bitmap.width, bitmap.height, 1],
        format: 'rgba8unorm',
        usage:  GPUTextureUsage.TEXTURE_BINDING
              | GPUTextureUsage.COPY_DST
              | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: tex },
        [bitmap.width, bitmap.height],
      );
      bitmap.close?.();

      sourceRef.current?.tex.destroy();
      sourceRef.current = { tex, tag };
      setState({ thumbs: new Map(), photoTag: tag });
    })();

    return () => { cancelled = true; };
  }, [device, photo]);

  // ── Drive the render queue in batches of 4 ──────────────────────────────
  useEffect(() => {
    const source = sourceRef.current;
    if (!device || !pipeline || !source) return;
    const tag = source.tag;

    const controller = new AbortController();
    const queue = filters.filter((f) => !state.thumbs.has(f.id));

    (async () => {
      while (queue.length && !controller.signal.aborted) {
        if (sourceRef.current?.tag !== tag) return;

        const batch = queue.splice(0, BATCH);
        const renders = await Promise.all(batch.map(async (f) => {
          try {
            const img = await renderFilterToImageData(pipeline, device, source.tex, f, {}, controller.signal);
            return [f.id, img] as const;
          } catch (err) {
            if ((err as DOMException)?.name === 'AbortError') return null;
            // eslint-disable-next-line no-console
            console.error('[thumbnails] render failed for', f.id, err);
            return null;
          }
        }));

        if (controller.signal.aborted || sourceRef.current?.tag !== tag) return;

        setState((prev) => {
          if (prev.photoTag !== tag) return prev;
          const next = new Map(prev.thumbs);
          for (const r of renders) { if (r) next.set(r[0], r[1]); }
          return { thumbs: next, photoTag: tag };
        });

        // Yield a frame so React can paint the new cards before the next batch
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    })();

    return () => { controller.abort(); };
    // Intentionally re-run when the photo tag changes (handled via state.photoTag)
    // and when the filters list reference changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, pipeline, state.photoTag, filters]);

  return state.thumbs;
}
