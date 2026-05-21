import {
  BaseDirectory,
  mkdir,
  writeFile,
  readFile,
  readTextFile,
  writeTextFile,
  remove,
  exists,
} from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';

import type { PhotoMetadata, PhotoRecord } from '../types/photo';
import { useAppStore } from '../stores/appStore';

/* ═══════════════════════════════════════════════════════════════
   Layout under {appDataDir}:
     FilmApp/
       photos/
         <id>.jpg
         …
       metadata.json
═══════════════════════════════════════════════════════════════ */

const APP_DIR    = 'FilmApp';
const PHOTOS_DIR = `${APP_DIR}/photos`;
const META_FILE  = `${APP_DIR}/metadata.json`;
const BASE       = { baseDir: BaseDirectory.AppData };

/* ─── Path helpers ─────────────────────────────────────────────────────── */

function photoPath(id: string): string {
  return `${PHOTOS_DIR}/${id}.jpg`;
}

async function ensureDirs(): Promise<void> {
  try {
    const has = await exists(PHOTOS_DIR, BASE);
    if (!has) await mkdir(PHOTOS_DIR, { ...BASE, recursive: true });
  } catch (err) {
    // mkdir is idempotent in spirit — log but don't blow up.
    // eslint-disable-next-line no-console
    console.warn('[storage] ensureDirs failed', err);
  }
}

/* ─── Metadata.json read / write ───────────────────────────────────────── */

async function readMetadata(): Promise<PhotoMetadata[]> {
  try {
    const has = await exists(META_FILE, BASE);
    if (!has) return [];
    const txt = await readTextFile(META_FILE, BASE);
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? (arr as PhotoMetadata[]) : [];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[storage] readMetadata failed', err);
    return [];
  }
}

async function writeMetadata(records: PhotoMetadata[]): Promise<void> {
  await ensureDirs();
  await writeTextFile(META_FILE, JSON.stringify(records, null, 2), BASE);
}

function stripBlob(record: PhotoRecord): PhotoMetadata {
  const { id, filename, filterName, sliderValues, dateSaved, width, height } = record;
  return { id, filename, filterName, sliderValues, dateSaved, width, height };
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC API
═══════════════════════════════════════════════════════════════ */

/**
 * Save a processed photo to disk + update metadata.json + push the record
 * into the Zustand store. The on-disk file is always JPEG named `{id}.jpg`.
 */
export async function savePhoto(record: PhotoRecord, processedBlob: Blob): Promise<void> {
  await ensureDirs();

  // 1. Write the JPEG bytes
  const bytes = new Uint8Array(await processedBlob.arrayBuffer());
  await writeFile(photoPath(record.id), bytes, BASE);

  // 2. Update metadata.json (dedupe by id, newest first)
  const meta     = stripBlob(record);
  const all      = await readMetadata();
  const filtered = all.filter((m) => m.id !== meta.id);
  filtered.unshift(meta);
  await writeMetadata(filtered);

  // 3. Update Zustand store — keep the blob in memory for immediate display
  useAppStore.getState().actions.savePhoto({ ...meta, blob: processedBlob });
}

/**
 * Load every saved photo's metadata from disk. Blobs are NOT loaded here —
 * call `loadPhotoBlob(id)` when you actually need to display or edit one.
 * Also pushes the metadata array into the Zustand store so the gallery
 * lights up immediately.
 */
export async function loadAllPhotos(): Promise<PhotoRecord[]> {
  const meta    = await readMetadata();
  const records = meta.map<PhotoRecord>((m) => ({ ...m }));   // blob: undefined
  useAppStore.getState().actions.setSavedPhotos(records);
  return records;
}

/**
 * Lazy-load the JPEG for a saved photo. Returned blob is typed `image/jpeg`.
 */
export async function loadPhotoBlob(id: string): Promise<Blob> {
  const bytes = await readFile(photoPath(id), BASE);
  return new Blob([bytes], { type: 'image/jpeg' });
}

/**
 * Delete one photo: its file on disk, its row in metadata.json, and its
 * entry in the Zustand store. Missing files are tolerated.
 */
export async function deletePhoto(id: string): Promise<void> {
  try {
    if (await exists(photoPath(id), BASE)) {
      await remove(photoPath(id), BASE);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[storage] remove file failed', err);
  }

  const all = await readMetadata();
  await writeMetadata(all.filter((m) => m.id !== id));

  useAppStore.getState().actions.deletePhoto(id);
}

/**
 * Open Tauri's save dialog filtered by `format` and write the blob's bytes
 * to the chosen path. Returns silently if the user cancels.
 */
export async function exportPhoto(
  blob: Blob,
  suggestedName: string,
  format: 'jpeg' | 'png',
): Promise<void> {
  const ext = format === 'png' ? 'png' : 'jpg';
  const path = await save({
    defaultPath: `${suggestedName}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (!path) return;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Absolute path — no baseDir
  await writeFile(path, bytes);
}
