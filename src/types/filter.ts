/* ═══════════════════════════════════════════════════════════════
   Filter parameter types — every system fully typed, `null` for
   unused systems on a preset.
═══════════════════════════════════════════════════════════════ */

export type ToneAnchor = [number, number];

export interface ToneCurveParams {
  composite: ToneAnchor[];
  red:       ToneAnchor[];
  green:     ToneAnchor[];
  blue:      ToneAnchor[];
}

export type ColorMatrix = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export type Vec3 = [number, number, number];

export interface GrainPassParams {
  intensity: number;
  size:      number;
  chroma:    number;
  colorBias: Vec3;
}

export interface GrainParams {
  pass1: GrainPassParams;
  pass2: GrainPassParams | null;
}

export interface VignetteParams {
  strength: number;
  power:    number;
}

export interface HalationParams {
  threshold:  number;
  tint:       Vec3;
  strength:   number;
  blurRadius: number;
}

export interface FlashParams {
  center:           [number, number];
  falloffScale:     number;
  falloffPower:     number;
  darkFloor:        number;
  brightCeiling:    number;
  strength:         number;
  castColor:        Vec3;
  castStrength:     number;
  ambientColor:     Vec3;
  ambientStrength:  number;
  ambientThreshold: number;
  caStrength:       number;
  caRadial:         boolean;
  clipThreshold:    number;
  clipHardness:     number;
}

export interface HueRotationBand {
  center:        number;  // normalized 0..1 (1 = 360°)
  width:         number;  // half-width
  rotation:      number;  // -1..1 (1 = 360°)
  satMultiplier: number;  // 0..2
}

export interface HueRotationParams {
  bands: HueRotationBand[];
}

export interface SplitToneZone {
  hue:      number;   // normalized 0..1
  sat:      number;   // 0..1
  lumShift: number;   // -1..1
}

export interface SplitToneParams {
  shadow:    SplitToneZone;
  midtone:   SplitToneZone;
  highlight: SplitToneZone;
  balance:   number;   // -1..1
  strength:  number;   // 0..1
}

export interface HSLBand {
  hueShift: number;   // degrees, -30..30
  satShift: number;   // -1..1
  lumShift: number;   // -1..1
}

export interface HSLParams {
  reds:    HSLBand;
  oranges: HSLBand;
  yellows: HSLBand;
  greens:  HSLBand;
  blues:   HSLBand;
  purples: HSLBand;
}

export interface FilterParams {
  toneCurve:   ToneCurveParams;
  colorMatrix: ColorMatrix;
  rgbShift:    Vec3;                    // integer values in 0..255 space; pipeline divides by 255
  saturation:  number;                  // -1..1 (0 = unchanged)
  grain:       GrainParams;
  vignette:    VignetteParams    | null;
  halation:    HalationParams    | null;
  flash:       FlashParams       | null;
  hueRotation: HueRotationParams | null;
  splitTone:   SplitToneParams   | null;
  hsl:         HSLParams         | null;
}

export interface FilterPreset {
  id:       string;
  name:     string;
  category: string;
  hintText: string;
  iso?:     string;
  params:   FilterParams;
}

/* ═══════════════════════════════════════════════════════════════
   Filter categories
═══════════════════════════════════════════════════════════════ */

export interface FilterCategory {
  id:       string;
  name:     string;
  subtitle: string;
}

/* ═══════════════════════════════════════════════════════════════
   Slider configs
═══════════════════════════════════════════════════════════════ */

export interface SliderConfig {
  id:       string;
  label:    string;
  min:      number;
  max:      number;
  default:  number;
  step?:    number;
  hintText: string;
}

/* Runtime overrides keyed by slider id */
export type SliderOverrides = Record<string, number>;
