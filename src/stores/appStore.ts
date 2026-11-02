import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { temporal } from 'zundo';
import type { CurrentPhoto, PhotoRecord } from '../types/photo';
import type { ReferenceLUTs } from '../utils/referenceLUT';
import type { FaceBox } from '../utils/faceDetect';
import type { UserPreset } from '../utils/presetStorage';
import type { DateStampPosition } from '../utils/dateStamp';

export type LightLeakEdge  = 'left' | 'right' | 'top' | 'bottom';
export type LightLeakColor = 'amber' | 'orange' | 'red' | 'violet' | 'blue';

interface AppState {
  currentPhoto:      CurrentPhoto | null;
  currentFilter:     string | null;
  sliderValues:      Record<string, number>;
  hintsEnabled:      boolean;
  lightLeakEnabled:  boolean;
  lightLeakEdge:     LightLeakEdge;
  lightLeakStrength: number;          /* 0..100 */
  lightLeakColor:    LightLeakColor;
  filmBorderEnabled: boolean;
  grainSeed:         number;
  activeMood:        string | null;
  moodStrength:      number;          /* 0..100 */
  dateStampEnabled:  boolean;
  dateStampSize:     number;          /* 0.3..1.5 multiplier */
  dateStampSource:   'auto' | 'custom';   /* auto = EXIF date or today's date */
  dateStampCustom:   string;          /* ISO date string when source='custom' */
  dateStampFormat:   string;
  dateStampColor:    string;
  dateStampFont:     string;
  dateStampPosition: DateStampPosition;
  wbPickerActive:    boolean;
  cropMode:          boolean;
  cropBox:           { x: number; y: number; w: number; h: number };   /* normalized 0..1 */
  cropRotation:      number;          /* degrees, -180..180 */
  cropAspect:        number | null;   /* w/h, null = free */
  referenceBlob:     Blob | null;
  referenceLUTs:     ReferenceLUTs | null;
  referenceName:     string;
  referenceStrength: number;          /* 0..100 */
  faces:             FaceBox[];        /* detected for currentPhoto */
  facesPhotoId:      string;           /* identity key to invalidate */
  skinSmoothStrength: number;          /* 0..100 */
  faceDetectError:   string | null;
  userPresets:       UserPreset[];
  savedPhotos:       PhotoRecord[];
  actions: {
    setPhoto:             (photo: CurrentPhoto | null) => void;
    setFilter:            (key: string | null) => void;
    setSlider:            (key: string, value: number) => void;
    setSliders:           (values: Record<string, number>) => void;
    resetSliders:         () => void;
    toggleHints:          () => void;
    setLightLeakEnabled:  (enabled: boolean) => void;
    setLightLeakEdge:     (edge: LightLeakEdge) => void;
    setLightLeakStrength: (v: number) => void;
    setLightLeakColor:    (color: LightLeakColor) => void;
    setFilmBorderEnabled: (enabled: boolean) => void;
    reseedGrain:          () => void;
    setActiveMood:        (id: string | null) => void;
    setMoodStrength:      (v: number) => void;
    setDateStampEnabled:  (b: boolean) => void;
    setDateStampSize:     (v: number) => void;
    setDateStampSource:   (src: 'auto' | 'custom') => void;
    setDateStampCustom:   (iso: string) => void;
    setDateStampFormat:   (id: string) => void;
    setDateStampColor:    (id: string) => void;
    setDateStampFont:     (id: string) => void;
    setDateStampPosition: (pos: DateStampPosition) => void;
    setWbPickerActive:    (b: boolean) => void;
    setCropMode:          (b: boolean) => void;
    setCropBox:           (box: { x: number; y: number; w: number; h: number }) => void;
    setCropRotation:      (deg: number) => void;
    setCropAspect:        (ar: number | null) => void;
    resetCrop:            () => void;
    setReference:         (blob: Blob | null, luts: ReferenceLUTs | null, name: string) => void;
    setReferenceStrength: (v: number) => void;
    clearReference:       () => void;
    setFaces:             (faces: FaceBox[], photoId: string) => void;
    setSkinSmoothStrength:(v: number) => void;
    setFaceDetectError:   (msg: string | null) => void;
    setUserPresets:       (presets: UserPreset[]) => void;
    setSavedPhotos:       (photos: PhotoRecord[]) => void;
    savePhoto:            (record: PhotoRecord) => void;
    deletePhoto:          (id: string) => void;
  };
}

/* ─── Undo/Redo: which fields are part of the edit history ──────────────────
   Only edit state goes into history. Transient UI (cropMode, wbPickerActive,
   sheetOpen…), async results (faces, referenceLUTs), and persisted
   collections (savedPhotos, userPresets) are excluded so Undo doesn't
   step over things the user wouldn't expect.
*/
const HISTORY_KEYS = [
  'currentPhoto',
  'currentFilter',
  'sliderValues',
  'lightLeakEnabled', 'lightLeakEdge', 'lightLeakStrength', 'lightLeakColor',
  'filmBorderEnabled',
  'grainSeed',
  'activeMood', 'moodStrength',
  'dateStampEnabled', 'dateStampSize',
  'dateStampSource', 'dateStampCustom', 'dateStampFormat',
  'dateStampColor', 'dateStampFont', 'dateStampPosition',
  'cropBox', 'cropRotation', 'cropAspect',
  'referenceStrength',
  'skinSmoothStrength',
] as const;

function partializeHistory(state: AppState): Partial<AppState> {
  const out: Record<string, unknown> = {};
  for (const k of HISTORY_KEYS) out[k] = (state as unknown as Record<string, unknown>)[k];
  return out as Partial<AppState>;
}

/** Leading-edge throttle: fires immediately on the first call, then ignores
 *  subsequent calls for `ms`. Used by zundo so a slider drag becomes ONE
 *  undo step (captured at the start of the drag) rather than dozens. */
function throttleLeading<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let lockedUntil = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now < lockedUntil) return;
    lockedUntil = now + ms;
    fn(...args);
  }) as T;
}

export const useAppStore = create<AppState>()(temporal((set) => ({
  currentPhoto:      null,
  currentFilter:     null,
  sliderValues:      {},
  hintsEnabled:      false,
  lightLeakEnabled:  false,
  lightLeakEdge:     'left',
  lightLeakStrength: 50,
  lightLeakColor:    'amber',
  filmBorderEnabled: false,
  grainSeed:         Math.random() * 1000,
  activeMood:        null,
  moodStrength:      100,
  dateStampEnabled:  false,
  dateStampSize:     1.0,
  dateStampSource:   'auto',
  dateStampCustom:   new Date().toISOString().slice(0, 10),
  dateStampFormat:   'yymmdd-tick',
  dateStampColor:    'orange',
  dateStampFont:     'led',
  dateStampPosition: 'br',
  wbPickerActive:    false,
  cropMode:          false,
  cropBox:           { x: 0, y: 0, w: 1, h: 1 },
  cropRotation:      0,
  cropAspect:        null,
  referenceBlob:     null,
  referenceLUTs:     null,
  referenceName:     '',
  referenceStrength: 70,
  faces:             [],
  facesPhotoId:      '',
  skinSmoothStrength: 0,
  faceDetectError:   null,
  userPresets:       [],
  savedPhotos:       [],
  actions: {
    setPhoto:             (photo)      => set({ currentPhoto: photo }),
    setFilter:            (key)        => set({ currentFilter: key }),
    setSlider:            (key, value) => set((s) => ({ sliderValues: { ...s.sliderValues, [key]: value } })),
    setSliders:           (values)     => set({ sliderValues: { ...values } }),
    resetSliders:         ()           => set({ sliderValues: {}, lightLeakEnabled: false, filmBorderEnabled: false }),
    toggleHints:          ()           => set((s) => ({ hintsEnabled: !s.hintsEnabled })),
    setLightLeakEnabled:  (enabled)    => set({ lightLeakEnabled: enabled }),
    setLightLeakEdge:     (edge)       => set({ lightLeakEdge: edge }),
    setLightLeakStrength: (v)          => set({ lightLeakStrength: v }),
    setLightLeakColor:    (color)      => set({ lightLeakColor: color }),
    setFilmBorderEnabled: (enabled)    => set({ filmBorderEnabled: enabled }),
    reseedGrain:          ()           => set({ grainSeed: Math.random() * 1000 }),
    setActiveMood:        (id)         => set({ activeMood: id }),
    setMoodStrength:      (v)          => set({ moodStrength: v }),
    setDateStampEnabled:  (b)          => set({ dateStampEnabled: b }),
    setDateStampSize:     (v)          => set({ dateStampSize: v }),
    setDateStampSource:   (src)        => set({ dateStampSource: src }),
    setDateStampCustom:   (iso)        => set({ dateStampCustom: iso }),
    setDateStampFormat:   (id)         => set({ dateStampFormat: id }),
    setDateStampColor:    (id)         => set({ dateStampColor: id }),
    setDateStampFont:     (id)         => set({ dateStampFont: id }),
    setDateStampPosition: (pos)        => set({ dateStampPosition: pos }),
    setWbPickerActive:    (b)          => set({ wbPickerActive: b }),
    setCropMode:          (b)          => set({ cropMode: b }),
    setCropBox:           (box)        => set({ cropBox: box }),
    setCropRotation:      (deg)        => set({ cropRotation: deg }),
    setCropAspect:        (ar)         => set({ cropAspect: ar }),
    resetCrop:            ()           => set({ cropBox: { x: 0, y: 0, w: 1, h: 1 }, cropRotation: 0, cropAspect: null }),
    setReference:         (blob, luts, name) => set({ referenceBlob: blob, referenceLUTs: luts, referenceName: name }),
    setReferenceStrength: (v)          => set({ referenceStrength: v }),
    clearReference:       ()           => set({ referenceBlob: null, referenceLUTs: null, referenceName: '' }),
    setFaces:             (faces, id)  => set({ faces, facesPhotoId: id }),
    setSkinSmoothStrength:(v)          => set({ skinSmoothStrength: v }),
    setFaceDetectError:   (msg)        => set({ faceDetectError: msg }),
    setUserPresets:       (presets)    => set({ userPresets: presets }),
    setSavedPhotos:       (photos)     => set({ savedPhotos: photos }),
    savePhoto:            (record)     => set((s) => ({ savedPhotos: [record, ...s.savedPhotos.filter((p) => p.id !== record.id)] })),
    deletePhoto:          (id)         => set((s) => ({ savedPhotos: s.savedPhotos.filter((p) => p.id !== id) })),
  },
}), {
  partialize: partializeHistory,
  limit:      80,
  handleSet:  (handleSet) => throttleLeading(handleSet, 220),
}));

/* Subscribe to actions without re-rendering when state changes */
export const useAppActions = () => useAppStore((s) => s.actions);

/* ─── Undo / Redo helpers ───────────────────────────────────────────────── */

export function undo()        { useAppStore.temporal.getState().undo();  }
export function redo()        { useAppStore.temporal.getState().redo();  }
export function clearHistory(){ useAppStore.temporal.getState().clear(); }

/** Hook returning current undo/redo availability. Re-renders only when those
 *  flags flip, not on every history push. */
export function useTemporalAvailability(): { canUndo: boolean; canRedo: boolean } {
  // Subscribe to the temporal store via React's external store via
  // the underlying zundo API. We use a tiny manual subscription so we don't
  // need to depend on zustand's `useStore` for the sub-store directly.
  const [state, setState] = useState(() => ({
    canUndo: useAppStore.temporal.getState().pastStates.length   > 0,
    canRedo: useAppStore.temporal.getState().futureStates.length > 0,
  }));
  useEffect(() => {
    const unsub = useAppStore.temporal.subscribe((s) => {
      setState({
        canUndo: s.pastStates.length   > 0,
        canRedo: s.futureStates.length > 0,
      });
    });
    return unsub;
  }, []);
  return state;
}

/** Load a brand-new photo and reset undo history — used by the photo picker,
 *  drop handler, and the New Photo button. Crop-apply does NOT use this so
 *  that undoing a crop reverts the photo state. */
export function loadFreshPhoto(photo: CurrentPhoto | null): void {
  useAppStore.getState().actions.setPhoto(photo);
  clearHistory();
}

