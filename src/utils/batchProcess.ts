/* ─── Batch process a folder of images ─────────────────────────────────────
   Iterates over every JPG/PNG/WEBP in the source directory, runs the GPU
   pipeline with the supplied filter + slider state, and writes JPEGs into
   the output directory. Reports progress and supports cancellation.
*/

import { open } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';

import type { FilterPreset, SliderOverrides } from '../types/filter';
import { renderFilter, exportTexture, type FilterPipeline, type ReferenceLUTOption } from './pipeline';
import { injectExifFromOriginal } from './exif';

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

export interface BatchProgress {
  total:        number;
  done:         number;
  currentName:  string;
  failed:       string[];
}

export interface BatchOptions {
  device:        GPUDevice;
  pipeline:      FilterPipeline;
  preset:        FilterPreset | null;
  overrides:     SliderOverrides;
  referenceLUT?: ReferenceLUTOption | null;
  quality?:      number;            /* JPEG quality 0..1, default 0.92 */
  suffix?:       string;            /* output filename suffix, default '-relens' */
  onProgress?:   (p: BatchProgress) => void;
  signal?:       AbortSignal;
}

export async function pickInputDir(): Promise<string | null> {
  const r = await open({ directory: true, multiple: false, title: 'Pick a folder of photos' });
  if (!r) return null;
  return Array.isArray(r) ? r[0] : r;
}

export async function pickOutputDir(defaultPath?: string): Promise<string | null> {
  const r = await open({
    directory: true, multiple: false,
    title: 'Pick a destination folder',
    defaultPath,
  });
  if (!r) return null;
  return Array.isArray(r) ? r[0] : r;
}

async function listImageFiles(dir: string): Promise<string[]> {
  const entries = await readDir(dir);
  const sep = dir.includes('\\') ? '\\' : '/';
  return entries
    .filter((e) => e.isFile && !!e.name)
    .map((e) => e.name as string)
    .filter((name) => {
      const dot = name.lastIndexOf('.');
      if (dot < 0) return false;
      return IMAGE_EXTS.includes(name.slice(dot + 1).toLowerCase());
    })
    .map((name) => `${dir}${sep}${name}`)
    .sort();
}

function joinPath(dir: string, file: string): string {
  const sep = dir.includes('\\') ? '\\' : '/';
  return `${dir}${sep}${file}`;
}

function baseName(path: string): string {
  const sep = path.includes('\\') ? '\\' : '/';
  return path.split(sep).pop() ?? path;
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? name : name.slice(0, i);
}

export async function runBatch(
  inputDir:  string,
  outputDir: string,
  opts:      BatchOptions,
): Promise<BatchProgress> {
  const quality = opts.quality ?? 0.92;
  const suffix  = opts.suffix  ?? '-relens';

  // Make sure output exists
  if (!(await exists(outputDir))) {
    await mkdir(outputDir, { recursive: true });
  }

  const files = await listImageFiles(inputDir);
  const progress: BatchProgress = { total: files.length, done: 0, currentName: '', failed: [] };
  opts.onProgress?.(progress);

  for (const path of files) {
    if (opts.signal?.aborted) return progress;

    const name = baseName(path);
    progress.currentName = name;
    opts.onProgress?.({ ...progress });

    try {
      const bytes = await readFile(path);
      const blob  = new Blob([new Uint8Array(bytes)]);
      const bmp   = await createImageBitmap(blob);

      // Hard ceiling on source size — match the editor's behavior.
      const MAX = 4000;
      let useBmp = bmp;
      if (bmp.width > MAX || bmp.height > MAX) {
        const s = bmp.width > bmp.height
          ? { w: MAX, h: Math.round(MAX * bmp.height / bmp.width) }
          : { h: MAX, w: Math.round(MAX * bmp.width  / bmp.height) };
        useBmp = await createImageBitmap(bmp, { resizeWidth: s.w, resizeHeight: s.h, resizeQuality: 'high' });
        bmp.close?.();
      }

      const src = opts.device.createTexture({
        label:  'batch.src',
        size:   [useBmp.width, useBmp.height, 1],
        format: 'rgba8unorm',
        usage:  GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      opts.device.queue.copyExternalImageToTexture({ source: useBmp }, { texture: src }, [useBmp.width, useBmp.height]);
      useBmp.close?.();

      const out = opts.preset
        ? await renderFilter(opts.pipeline, opts.device, src, opts.preset, opts.overrides, opts.referenceLUT)
        : src;

      const outBlob = await exportTexture(opts.device, out, out.width, out.height, 'image/jpeg', quality);
      if (out !== src) out.destroy();
      src.destroy();

      const withExif = await injectExifFromOriginal(blob, outBlob);
      const outName = `${stripExt(name)}${suffix}.jpg`;
      const outPath = joinPath(outputDir, outName);
      const outBytes = new Uint8Array(await withExif.arrayBuffer());
      await writeFile(outPath, outBytes);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[batch] failed', name, err);
      progress.failed.push(name);
    }

    progress.done += 1;
    opts.onProgress?.({ ...progress });
  }

  progress.currentName = '';
  opts.onProgress?.({ ...progress });
  return progress;
}
