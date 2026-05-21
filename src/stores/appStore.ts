import { create } from 'zustand';
import type { CurrentPhoto, PhotoRecord } from '../types/photo';

export type LightLeakEdge = 'left' | 'right' | 'top' | 'random';

interface AppState {
  currentPhoto:      CurrentPhoto | null;
  currentFilter:     string | null;
  sliderValues:      Record<string, number>;
  hintsEnabled:      boolean;
  lightLeakEnabled:  boolean;
  lightLeakEdge:     LightLeakEdge;
  filmBorderEnabled: boolean;
  grainSeed:         number;
  activeMood:        string | null;
  moodStrength:      number;          /* 0..100 */
  dateStampEnabled:  boolean;
  dateStampSize:     number;          /* 0.3..1.5 multiplier */
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
    setFilmBorderEnabled: (enabled: boolean) => void;
    reseedGrain:          () => void;
    setActiveMood:        (id: string | null) => void;
    setMoodStrength:      (v: number) => void;
    setDateStampEnabled:  (b: boolean) => void;
    setDateStampSize:     (v: number) => void;
    setSavedPhotos:       (photos: PhotoRecord[]) => void;
    savePhoto:            (record: PhotoRecord) => void;
    deletePhoto:          (id: string) => void;
  };
}

export const useAppStore = create<AppState>((set) => ({
  currentPhoto:      null,
  currentFilter:     null,
  sliderValues:      {},
  hintsEnabled:      false,
  lightLeakEnabled:  false,
  lightLeakEdge:     'left',
  filmBorderEnabled: false,
  grainSeed:         Math.random() * 1000,
  activeMood:        null,
  moodStrength:      100,
  dateStampEnabled:  false,
  dateStampSize:     1.0,
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
    setFilmBorderEnabled: (enabled)    => set({ filmBorderEnabled: enabled }),
    reseedGrain:          ()           => set({ grainSeed: Math.random() * 1000 }),
    setActiveMood:        (id)         => set({ activeMood: id }),
    setMoodStrength:      (v)          => set({ moodStrength: v }),
    setDateStampEnabled:  (b)          => set({ dateStampEnabled: b }),
    setDateStampSize:     (v)          => set({ dateStampSize: v }),
    setSavedPhotos:       (photos)     => set({ savedPhotos: photos }),
    savePhoto:            (record)     => set((s) => ({ savedPhotos: [record, ...s.savedPhotos.filter((p) => p.id !== record.id)] })),
    deletePhoto:          (id)         => set((s) => ({ savedPhotos: s.savedPhotos.filter((p) => p.id !== id) })),
  },
}));

/* Subscribe to actions without re-rendering when state changes */
export const useAppActions = () => useAppStore((s) => s.actions);
