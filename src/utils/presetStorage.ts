/* ─── User preset persistence ──────────────────────────────────────────────
   Stored as `{appDataDir}/FilmApp/presets.json`. Each entry references an
   existing base filter by id and stores the current slider state plus a few
   global toggles (mood, light leak, date stamp) so the look is recreated
   exactly when applied.
*/

import {
  BaseDirectory, mkdir, writeTextFile, readTextFile, exists,
} from '@tauri-apps/plugin-fs';

import { useAppStore, type LightLeakEdge, type LightLeakColor } from '../stores/appStore';
import type { DateStampPosition } from './dateStamp';

const APP_DIR     = 'FilmApp';
const PRESET_FILE = `${APP_DIR}/presets.json`;
const BASE        = { baseDir: BaseDirectory.AppData };

export interface UserPreset {
  id:                string;
  name:              string;
  baseFilterId:      string;
  sliderValues:      Record<string, number>;
  activeMood:        string | null;
  moodStrength:      number;
  lightLeakEnabled:  boolean;
  lightLeakEdge:     LightLeakEdge;
  lightLeakStrength: number;
  lightLeakColor:    LightLeakColor;
  dateStampEnabled:  boolean;
  dateStampSize:     number;
  /* Date-stamp customisation — optional on legacy presets */
  dateStampSource?:   'auto' | 'custom';
  dateStampCustom?:   string;
  dateStampFormat?:   string;
  dateStampColor?:    string;
  dateStampFont?:     string;
  dateStampPosition?: DateStampPosition;
  dateCreated:       string;
}

async function ensureDir(): Promise<void> {
  try {
    const has = await exists(APP_DIR, BASE);
    if (!has) await mkdir(APP_DIR, { ...BASE, recursive: true });
  } catch { /* idempotent */ }
}

export async function loadUserPresets(): Promise<UserPreset[]> {
  try {
    const has = await exists(PRESET_FILE, BASE);
    if (!has) return [];
    const txt = await readTextFile(PRESET_FILE, BASE);
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? (arr as UserPreset[]) : [];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[presets] loadUserPresets failed', err);
    return [];
  }
}

async function writeAll(presets: UserPreset[]): Promise<void> {
  await ensureDir();
  await writeTextFile(PRESET_FILE, JSON.stringify(presets, null, 2), BASE);
}

export async function saveUserPreset(preset: UserPreset): Promise<void> {
  const all = await loadUserPresets();
  const filtered = all.filter((p) => p.id !== preset.id);
  filtered.unshift(preset);
  await writeAll(filtered);
  useAppStore.getState().actions.setUserPresets(filtered);
}

export async function deleteUserPreset(id: string): Promise<void> {
  const all = await loadUserPresets();
  const next = all.filter((p) => p.id !== id);
  await writeAll(next);
  useAppStore.getState().actions.setUserPresets(next);
}

export async function initUserPresets(): Promise<void> {
  const all = await loadUserPresets();
  useAppStore.getState().actions.setUserPresets(all);
}

/** Snapshot the current editor state into a UserPreset payload. */
export function snapshotPreset(name: string): UserPreset | null {
  const s = useAppStore.getState();
  if (!s.currentFilter) return null;
  return {
    id:                crypto.randomUUID(),
    name:              name.trim() || 'Untitled',
    baseFilterId:      s.currentFilter,
    sliderValues:      { ...s.sliderValues },
    activeMood:        s.activeMood,
    moodStrength:      s.moodStrength,
    lightLeakEnabled:  s.lightLeakEnabled,
    lightLeakEdge:     s.lightLeakEdge,
    lightLeakStrength: s.lightLeakStrength,
    lightLeakColor:    s.lightLeakColor,
    dateStampEnabled:  s.dateStampEnabled,
    dateStampSize:     s.dateStampSize,
    dateStampSource:   s.dateStampSource,
    dateStampCustom:   s.dateStampCustom,
    dateStampFormat:   s.dateStampFormat,
    dateStampColor:    s.dateStampColor,
    dateStampFont:     s.dateStampFont,
    dateStampPosition: s.dateStampPosition,
    dateCreated:       new Date().toISOString(),
  };
}

/** Apply a user preset onto the editor state. */
export function applyUserPreset(preset: UserPreset): void {
  const a = useAppStore.getState().actions;
  a.setFilter(preset.baseFilterId);
  a.setSliders(preset.sliderValues);
  a.setActiveMood(preset.activeMood);
  a.setMoodStrength(preset.moodStrength);
  a.setLightLeakEnabled(preset.lightLeakEnabled);
  a.setLightLeakEdge(preset.lightLeakEdge);
  a.setLightLeakStrength(preset.lightLeakStrength);
  a.setLightLeakColor(preset.lightLeakColor);
  a.setDateStampEnabled(preset.dateStampEnabled);
  a.setDateStampSize(preset.dateStampSize);
  if (preset.dateStampSource)   a.setDateStampSource(preset.dateStampSource);
  if (preset.dateStampCustom)   a.setDateStampCustom(preset.dateStampCustom);
  if (preset.dateStampFormat)   a.setDateStampFormat(preset.dateStampFormat);
  if (preset.dateStampColor)    a.setDateStampColor(preset.dateStampColor);
  if (preset.dateStampFont)     a.setDateStampFont(preset.dateStampFont);
  if (preset.dateStampPosition) a.setDateStampPosition(preset.dateStampPosition);
}
