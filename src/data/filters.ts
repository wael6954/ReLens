import type {
  FilterPreset,
  FilterCategory,
  FilterParams,
  GrainParams,
  GrainPassParams,
  HalationParams,
  FlashParams,
  ColorMatrix,
  Vec3,
  SliderConfig,
} from '../types/filter';

/* ═══════════════════════════════════════════════════════════════
   SHARED DEFAULTS — referenced by presets so we never inline numbers
   that mean "neutral / off / identity"
═══════════════════════════════════════════════════════════════ */

const IDENTITY_MATRIX: ColorMatrix = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const ZERO_VEC3: Vec3       = [0, 0, 0];
const IDENTITY_CURVE        = [[0, 0], [255, 255]] as [number, number][];
const BW_CHANNEL_CURVE      = [[0, 0], [255, 255]] as [number, number][];

const grainOf = (intensity: number, size: number, chroma: number,
                 colorBias: Vec3 = ZERO_VEC3): GrainPassParams =>
  ({ intensity, size, chroma, colorBias });

const grainSingle = (p: GrainPassParams): GrainParams => ({ pass1: p, pass2: null });
const grainDual   = (p1: GrainPassParams, p2: GrainPassParams): GrainParams => ({ pass1: p1, pass2: p2 });

const halRed = (strength: number, threshold = 0.72, blurRadius = 12): HalationParams =>
  ({ threshold, tint: [1.0, 0.3, 0.1], strength, blurRadius });

const halCineStill = (strength: number): HalationParams =>
  ({ threshold: 0.78, tint: [1.0, 0.25, 0.08], strength, blurRadius: 16 });

const noFlash = null as FlashParams | null;

/* Convenience: build a FilterParams with sensible defaults so each preset
   only overrides what it actually uses. */
function buildParams(overrides: Partial<FilterParams> & {
  toneCurve: FilterParams['toneCurve'];
  grain:     FilterParams['grain'];
}): FilterParams {
  return {
    colorMatrix: IDENTITY_MATRIX,
    rgbShift:    ZERO_VEC3,
    saturation:  0,
    vignette:    null,
    halation:    null,
    flash:       noFlash,
    hueRotation: null,
    splitTone:   null,
    hsl:         null,
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════════════════
   FILTERS — 25 originals + 3 flash = 28 total
═══════════════════════════════════════════════════════════════ */

export const FILTERS: FilterPreset[] = [

  /* ─── Color Negative ─────────────────────────────────────────────────── */

  {
    id: 'portra-400',
    name: 'Kodak Portra 400',
    category: 'color-negative',
    iso: '400',
    hintText: 'Warm, natural tones. Great for portraits.',
    params: buildParams({
      toneCurve: {
        composite: [[0,12],[64,72],[128,132],[192,196],[255,248]],
        red:   [[0,10],[128,134],[255,250]],
        green: [[0, 8],[128,128],[255,252]],
        blue:  [[0,14],[128,122],[255,245]],
      },
      rgbShift:   [4, 1, -2],
      saturation: -0.05,
      grain:      grainSingle(grainOf(0.05, 1.4, 0.08)),
      vignette:   { strength: 0.12, power: 2.0 },
    }),
  },

  {
    id: 'gold-200',
    name: 'Kodak Gold 200',
    category: 'color-negative',
    iso: '200',
    hintText: 'Sunny and warm. Classic holiday feel.',
    params: buildParams({
      toneCurve: {
        composite: [[0, 8],[64,74],[128,136],[192,200],[255,252]],
        red:   [[0,12],[128,140],[255,255]],
        green: [[0, 8],[128,130],[255,250]],
        blue:  [[0, 6],[128,118],[255,235]],
      },
      rgbShift:   [10, 4, -12],
      saturation: 0.08,
      grain:      grainSingle(grainOf(0.03, 1.0, 0.12)),
      vignette:   { strength: 0.10, power: 1.8 },
    }),
  },

  {
    id: 'ultramax-400',
    name: 'Kodak UltraMax 400',
    category: 'color-negative',
    iso: '400',
    hintText: 'Vivid and versatile. Good for everything.',
    params: buildParams({
      toneCurve: {
        composite: [[0, 6],[64,70],[128,133],[192,198],[255,253]],
        red:   [[0, 8],[128,136],[192,202],[255,255]],
        green: [[0, 6],[128,128],[255,250]],
        blue:  [[0,12],[64, 72],[128,124],[255,248]],
      },
      rgbShift:   [6, 0, 4],
      saturation: 0.10,
      grain:      grainSingle(grainOf(0.056, 1.4, 0.15)),
      vignette:   { strength: 0.08, power: 1.8 },
    }),
  },

  {
    id: 'superia-400',
    name: 'Fuji Superia 400',
    category: 'color-negative',
    iso: '400',
    hintText: 'Cool and crisp. Sharp colors.',
    params: buildParams({
      toneCurve: {
        composite: [[0, 5],[64,68],[128,132],[192,200],[255,252]],
        red:   [[0, 4],[128,126],[255,248]],
        green: [[0,10],[64, 74],[128,132],[255,252]],
        blue:  [[0, 8],[128,120],[255,240]],
      },
      rgbShift:   [-4, 8, -6],
      saturation: 0.06,
      grain:      grainSingle(grainOf(0.052, 1.4, 0.18)),
      vignette:   { strength: 0.10, power: 2.0 },
    }),
  },

  {
    id: 'ektar-100',
    name: 'Kodak Ektar 100',
    category: 'color-negative',
    iso: '100',
    hintText: 'Maximum color punch. Fine grain.',
    params: buildParams({
      toneCurve: {
        composite: [[0,2],[64,60],[128,130],[192,202],[255,255]],
        red:   [[0,0],[128,138],[255,255]],
        green: [[0,0],[128,130],[255,252]],
        blue:  [[0,4],[128,122],[255,250]],
      },
      rgbShift:   [8, 2, -6],
      saturation: 0.20,
      grain:      grainSingle(grainOf(0.012, 0.8, 0.05)),
      vignette:   { strength: 0.06, power: 2.0 },
    }),
  },

  {
    id: 'cinestill-800t',
    name: 'CineStill 800T',
    category: 'color-negative',
    iso: '800',
    hintText: 'City lights glow red-orange. Cinematic.',
    params: buildParams({
      toneCurve: {
        composite: [[0,10],[64,68],[128,130],[192,195],[255,248]],
        red:   [[0, 8],[128,118],[255,228]],
        green: [[0,10],[128,126],[255,240]],
        blue:  [[0,18],[64, 82],[128,148],[255,255]],
      },
      rgbShift:   [-18, -6, 24],
      saturation: -0.08,
      grain:      grainSingle(grainOf(0.084, 2.0, 0.20)),
      vignette:   { strength: 0.15, power: 2.2 },
      halation:   halCineStill(0.55),
    }),
  },

  {
    id: 'pro-400h',
    name: 'Fuji Pro 400H',
    category: 'color-negative',
    iso: '400',
    hintText: 'Soft and pastel. Overcast day look.',
    params: buildParams({
      toneCurve: {
        composite: [[0,14],[64,72],[128,128],[192,192],[255,244]],
        red:   [[0,10],[128,124],[255,242]],
        green: [[0,12],[128,128],[255,248]],
        blue:  [[0,16],[128,130],[255,252]],
      },
      rgbShift:   [-6, 2, 8],
      saturation: -0.12,
      grain:      grainSingle(grainOf(0.04, 1.4, 0.08)),
      vignette:   { strength: 0.08, power: 1.6 },
    }),
  },

  {
    id: 'colorplus-200',
    name: 'Kodak ColorPlus 200',
    category: 'color-negative',
    iso: '200',
    hintText: 'Warm and casual. Budget film character.',
    params: buildParams({
      toneCurve: {
        composite: [[0,16],[64,76],[128,134],[192,196],[255,246]],
        red:   [[0,14],[128,136],[255,248]],
        green: [[0,10],[128,128],[255,244]],
        blue:  [[0, 8],[128,116],[255,230]],
      },
      rgbShift:   [8, 2, -14],
      saturation: -0.05,
      grain:      grainSingle(grainOf(0.04, 1.0, 0.14)),
      vignette:   { strength: 0.14, power: 2.0 },
    }),
  },

  /* ─── Slide / Reversal ───────────────────────────────────────────────── */

  {
    id: 'velvia-50',
    name: 'Fuji Velvia 50',
    category: 'slide-reversal',
    iso: '50',
    hintText: 'Maximum saturation and punch. Landscapes explode.',
    params: buildParams({
      toneCurve: {
        composite: [[0,0],[48,40],[128,140],[208,220],[255,255]],
        red:   [[0,0],[128,126],[255,255]],
        green: [[0,0],[128,136],[255,255]],
        blue:  [[0,2],[128,130],[255,255]],
      },
      rgbShift:   [2, 4, 0],
      saturation: 0.30,
      grain:      grainSingle(grainOf(0.016, 0.7, 0.12)),
      vignette:   { strength: 0.12, power: 2.0 },
    }),
  },

  {
    id: 'provia-100f',
    name: 'Fuji Provia 100F',
    category: 'slide-reversal',
    iso: '100',
    hintText: 'Accurate, neutral colors. Fine grain slide.',
    params: buildParams({
      toneCurve: {
        composite: [[0,0],[56,48],[128,136],[200,210],[255,255]],
        red:   [[0,0],[128,126],[255,253]],
        green: [[0,0],[128,128],[255,253]],
        blue:  [[0,2],[128,132],[255,255]],
      },
      rgbShift:   [-2, 0, 4],
      saturation: 0.10,
      grain:      grainSingle(grainOf(0.014, 0.7, 0.08)),
      vignette:   { strength: 0.07, power: 2.0 },
    }),
  },

  {
    id: 'ektachrome-e100',
    name: 'Kodak Ektachrome E100',
    category: 'slide-reversal',
    iso: '100',
    hintText: 'Cool and clean. Classic blue-sky slide look.',
    params: buildParams({
      toneCurve: {
        composite: [[0,0],[56,46],[128,136],[204,213],[255,255]],
        red:   [[0,0],[128,125],[255,253]],
        green: [[0,2],[128,130],[255,254]],
        blue:  [[0,4],[128,134],[255,255]],
      },
      rgbShift:   [-2, 1, 6],
      saturation: 0.14,
      grain:      grainSingle(grainOf(0.014, 0.6, 0.10)),
      vignette:   { strength: 0.09, power: 2.0 },
    }),
  },

  {
    id: 'vision3-500t',
    name: 'Kodak Vision3 500T',
    category: 'slide-reversal',
    iso: '500',
    hintText: 'Cinema motion picture. Tungsten-balanced, cinematic shadow.',
    params: buildParams({
      toneCurve: {
        composite: [[0, 8],[64,66],[128,128],[192,194],[255,246]],
        red:   [[0, 4],[128,124],[255,248]],
        green: [[0, 6],[128,130],[255,252]],
        blue:  [[0,12],[128,138],[255,255]],
      },
      rgbShift:   [-5, 0, 14],
      saturation: -0.04,
      grain:      grainSingle(grainOf(0.07, 1.5, 0.22)),
      vignette:   { strength: 0.15, power: 2.2 },
      halation:   halRed(0.14),
    }),
  },

  /* ─── Lomography Originals ──────────────────────────────────────────── */

  {
    id: 'lomo-purple',
    name: 'Lomochrome Purple',
    category: 'lomography',
    iso: '100',
    hintText: 'Greens turn purple. Plants go wild.',
    params: buildParams({
      toneCurve: {
        composite: [[0,10],[64,68],[128,130],[192,196],[255,252]],
        red:   IDENTITY_CURVE,
        green: IDENTITY_CURVE,
        blue:  IDENTITY_CURVE,
      },
      saturation: 0.15,
      grain:      grainSingle(grainOf(0.06, 1.4, 0.20)),
      vignette:   { strength: 0.17, power: 2.2 },
      hueRotation: {
        bands: [
          { center: 120/360, width:  40/360, rotation:  150/360, satMultiplier: 1.3 },
          { center: 62.5/360, width: 17.5/360, rotation: 120/360, satMultiplier: 1.2 },
          { center: 230/360, width:  30/360, rotation:  -40/360, satMultiplier: 1.0 },
          { center: 0,       width:  20/360, rotation:    0,      satMultiplier: 1.05 },
        ],
      },
    }),
  },

  {
    id: 'lomo-turquoise',
    name: 'Lomochrome Turquoise',
    category: 'lomography',
    iso: '100',
    hintText: 'Blue sky turns amber. Colors invert.',
    params: buildParams({
      toneCurve: {
        composite: [[0,8],[64,70],[128,132],[192,198],[255,252]],
        red:   IDENTITY_CURVE,
        green: IDENTITY_CURVE,
        blue:  IDENTITY_CURVE,
      },
      saturation: 0.20,
      grain:      grainSingle(grainOf(0.06, 1.4, 0.22)),
      vignette:   { strength: 0.15, power: 2.0 },
      hueRotation: {
        bands: [
          { center: 220/360, width: 40/360, rotation:  160/360, satMultiplier: 1.4 },
          { center:  25/360, width: 25/360, rotation:  160/360, satMultiplier: 1.3 },
          { center: 120/360, width: 40/360, rotation:  -20/360, satMultiplier: 1.2 },
          { center: 0,       width:  0,      rotation:  0,        satMultiplier: 1.0 },
        ],
      },
    }),
  },

  {
    id: 'lomo-metropolis',
    name: 'Metropolis',
    category: 'lomography',
    iso: '400',
    hintText: 'Faded city look. Reds pop through grey.',
    params: buildParams({
      toneCurve: {
        composite: [[0,0],[64,56],[128,128],[192,206],[255,255]],
        red:   [[0,0],[128,136],[192,210],[255,255]],
        green: [[0,0],[128,118],[255,240]],
        blue:  [[0,0],[128,112],[255,230]],
      },
      rgbShift:   [12, -8, -10],
      saturation: -0.35,
      grain:      grainSingle(grainOf(0.06, 1.4, 0.12)),
      vignette:   { strength: 0.20, power: 2.5 },
    }),
  },

  {
    id: 'lomo-redscale',
    name: 'Redscale XR',
    category: 'lomography',
    iso: '—',
    hintText: 'Everything turns red and orange.',
    params: buildParams({
      toneCurve: {
        composite: [[0,0],[64,50],[128,130],[192,210],[255,255]],
        red:   IDENTITY_CURVE,
        green: IDENTITY_CURVE,
        blue:  IDENTITY_CURVE,
      },
      colorMatrix: [
        [1.4, 0.3, 0.0],
        [0.5, 0.2, 0.0],
        [0.1, 0.0, 0.0],
      ],
      saturation: 0,
      grain:      grainSingle(grainOf(0.09, 2.0, 0.25)),
      vignette:   { strength: 0.24, power: 2.5 },
    }),
  },

  {
    id: 'lomo-color92',
    name: 'Color 92',
    category: 'lomography',
    iso: '400',
    hintText: '90s pastel warmth. Slightly faded.',
    params: buildParams({
      toneCurve: {
        composite: [[0,18],[64,76],[128,132],[192,196],[255,244]],
        red:   [[0,14],[128,132],[255,248]],
        green: [[0,12],[128,128],[255,246]],
        blue:  [[0,16],[128,120],[255,238]],
      },
      rgbShift:   [6, 4, -8],
      saturation: -0.08,
      grain:      grainSingle(grainOf(0.036, 1.0, 0.12)),
      vignette:   { strength: 0.12, power: 1.8 },
    }),
  },

  /* ─── Black & White ───────────────────────────────────────────────── */

  {
    id: 'trix-400',
    name: 'Kodak Tri-X 400',
    category: 'bw',
    iso: '400',
    hintText: 'Bold black and white. Gritty grain.',
    params: buildParams({
      toneCurve: {
        composite: [[0,0],[64,52],[128,132],[192,212],[255,255]],
        red:   BW_CHANNEL_CURVE,
        green: BW_CHANNEL_CURVE,
        blue:  BW_CHANNEL_CURVE,
      },
      colorMatrix: [
        [0.299, 0.587, 0.114],
        [0.299, 0.587, 0.114],
        [0.299, 0.587, 0.114],
      ],
      saturation: -1.0,
      grain:      grainSingle(grainOf(0.18, 1.6, 0.0)),
      vignette:   { strength: 0.20, power: 2.2 },
    }),
  },

  {
    id: 'hp5-plus',
    name: 'Ilford HP5 Plus',
    category: 'bw',
    iso: '400',
    hintText: 'Soft black and white. Holds shadow detail.',
    params: buildParams({
      toneCurve: {
        composite: [[0,4],[64,60],[128,128],[192,196],[255,252]],
        red:   BW_CHANNEL_CURVE,
        green: BW_CHANNEL_CURVE,
        blue:  BW_CHANNEL_CURVE,
      },
      colorMatrix: [
        [0.27, 0.63, 0.10],
        [0.27, 0.63, 0.10],
        [0.27, 0.63, 0.10],
      ],
      saturation: -1.0,
      grain:      grainSingle(grainOf(0.14, 1.3, 0.0)),
      vignette:   { strength: 0.14, power: 2.0 },
    }),
  },

  {
    id: 'tmax-400',
    name: 'Kodak T-Max 400',
    category: 'bw',
    iso: '400',
    hintText: 'Clean black and white. Fine grain.',
    params: buildParams({
      toneCurve: {
        composite: [[0,2],[64,62],[128,128],[192,194],[255,254]],
        red:   BW_CHANNEL_CURVE,
        green: BW_CHANNEL_CURVE,
        blue:  BW_CHANNEL_CURVE,
      },
      colorMatrix: [
        [0.299, 0.587, 0.114],
        [0.299, 0.587, 0.114],
        [0.299, 0.587, 0.114],
      ],
      saturation: -1.0,
      grain:      grainSingle(grainOf(0.10, 1.0, 0.0)),
      vignette:   { strength: 0.08, power: 1.8 },
    }),
  },

  {
    id: 'delta-3200',
    name: 'Ilford Delta 3200',
    category: 'bw',
    iso: '3200',
    hintText: 'Extreme grain. Low light character.',
    params: buildParams({
      toneCurve: {
        composite: [[0,0],[48,30],[128,134],[200,220],[255,255]],
        red:   BW_CHANNEL_CURVE,
        green: BW_CHANNEL_CURVE,
        blue:  BW_CHANNEL_CURVE,
      },
      colorMatrix: [
        [0.299, 0.587, 0.114],
        [0.299, 0.587, 0.114],
        [0.299, 0.587, 0.114],
      ],
      saturation: -1.0,
      grain:      grainDual(
        grainOf(0.20, 3.0, 0.0),
        grainOf(0.08, 7.0, 0.0),
      ),
      vignette:   { strength: 0.22, power: 2.5 },
    }),
  },

  {
    id: 'acros-100',
    name: 'Fuji Neopan Acros 100',
    category: 'bw',
    iso: '100',
    hintText: 'Smooth, rich black and white.',
    params: buildParams({
      toneCurve: {
        composite: [[0,0],[64,58],[128,126],[192,198],[255,255]],
        red:   BW_CHANNEL_CURVE,
        green: BW_CHANNEL_CURVE,
        blue:  BW_CHANNEL_CURVE,
      },
      colorMatrix: [
        [0.28, 0.55, 0.17],
        [0.28, 0.55, 0.17],
        [0.28, 0.55, 0.17],
      ],
      saturation: -1.0,
      grain:      grainSingle(grainOf(0.03, 0.7, 0.0)),
      vignette:   { strength: 0.10, power: 1.8 },
    }),
  },

  /* ─── Camera Signatures (curated 5) ──────────────────────────────────── */

  {
    id: 'lca',
    name: 'LOMO LC-A+',
    category: 'camera-sig',
    iso: '400',
    hintText: 'Heavy dark corners. Saturated center.',
    params: buildParams({
      toneCurve: {
        composite: [[0,5],[64,68],[128,132],[192,200],[255,252]],
        red:   [[0, 4],[128,126],[255,248]],
        green: [[0,10],[64, 74],[128,132],[255,252]],
        blue:  [[0, 8],[128,120],[255,240]],
      },
      rgbShift:   [-4, 8, -6],
      saturation: 0.18,
      grain:      grainSingle(grainOf(0.052, 1.4, 0.18)),
      vignette:   { strength: 0.54, power: 3.5 },
    }),
  },

  {
    id: 'diana-f',
    name: 'Diana F+',
    category: 'camera-sig',
    iso: '—',
    hintText: 'Dreamy soft focus. Light leaks.',
    params: buildParams({
      toneCurve: {
        composite: [[0,12],[64,72],[128,132],[192,196],[255,248]],
        red:   [[0,10],[128,130],[255,246]],
        green: [[0,10],[128,128],[255,250]],
        blue:  [[0,15],[128,126],[255,250]],
      },
      rgbShift:   [-1, 2, 3],
      saturation: -0.09,
      grain:      grainSingle(grainOf(0.044, 1.4, 0.08)),
      vignette:   { strength: 0.34, power: 2.0 },
    }),
  },

  {
    id: 'holga',
    name: 'Holga 120',
    category: 'camera-sig',
    iso: '400',
    hintText: 'Plastic lens softness. Black and white.',
    params: buildParams({
      toneCurve: {
        composite: [[0,4],[64,60],[128,128],[192,196],[255,252]],
        red:   BW_CHANNEL_CURVE,
        green: BW_CHANNEL_CURVE,
        blue:  BW_CHANNEL_CURVE,
      },
      colorMatrix: [
        [0.27, 0.63, 0.10],
        [0.27, 0.63, 0.10],
        [0.27, 0.63, 0.10],
      ],
      saturation: -1.0,
      grain:      grainSingle(grainOf(0.14, 1.3, 0.0)),
      vignette:   { strength: 0.43, power: 2.8 },
    }),
  },

  {
    id: 'l35af',
    name: 'Nikon L35AF',
    category: 'camera-sig',
    iso: '400',
    hintText: 'Warm Nikkor rendering. The quintessential 80s compact.',
    params: buildParams({
      toneCurve: {
        composite: [[0,6],[64,72],[128,136],[192,200],[255,248]],
        red:   [[0,10],[128,136],[255,254]],
        green: [[0, 6],[128,130],[255,248]],
        blue:  [[0, 2],[128,112],[255,224]],
      },
      rgbShift:   [10, 4, -18],
      saturation: 0.06,
      grain:      grainSingle(grainOf(0.04, 1.1, 0.14)),
      vignette:   { strength: 0.20, power: 2.0 },
      halation:   halRed(0.18),
    }),
  },

  {
    id: 'contax-t2',
    name: 'Contax T2',
    category: 'camera-sig',
    iso: '400',
    hintText: 'Zeiss T* glass. Rich, dimensional shadows.',
    params: buildParams({
      toneCurve: {
        composite: [[0,0],[64,62],[128,138],[192,210],[255,254]],
        red:   [[0, 4],[128,132],[255,252]],
        green: [[0, 2],[128,130],[255,250]],
        blue:  [[0, 0],[128,120],[255,238]],
      },
      rgbShift:   [4, 0, -8],
      saturation: 0.05,
      grain:      grainSingle(grainOf(0.04, 1.0, 0.10)),
      vignette:   { strength: 0.14, power: 1.8 },
      halation:   halRed(0.08),
    }),
  },

  {
    id: 'minox-35',
    name: 'Minox 35',
    category: 'camera-sig',
    iso: '200',
    hintText: 'Warm German glass. Contrasty and precise.',
    params: buildParams({
      toneCurve: {
        composite: [[0,8],[64,72],[128,138],[192,204],[255,250]],
        red:   [[0, 8],[128,132],[255,252]],
        green: [[0, 4],[128,130],[255,250]],
        blue:  [[0, 2],[128,118],[255,232]],
      },
      rgbShift:   [6, 2, -12],
      saturation: 0.08,
      grain:      grainSingle(grainOf(0.036, 1.0, 0.12)),
      vignette:   { strength: 0.24, power: 2.2 },
      halation:   halRed(0.05),
    }),
  },

  {
    id: 'olympus-stylus',
    name: 'Olympus Stylus',
    category: 'camera-sig',
    iso: '400',
    hintText: 'Clean 90s snapshot. Slightly cool and honest.',
    params: buildParams({
      toneCurve: {
        composite: [[0,4],[64,68],[128,130],[192,196],[255,252]],
        red:   [[0, 0],[128,124],[255,244]],
        green: [[0, 2],[128,128],[255,250]],
        blue:  [[0, 6],[128,136],[255,254]],
      },
      rgbShift:   [-6, 0, 8],
      saturation: -0.05,
      grain:      grainSingle(grainOf(0.044, 1.2, 0.16)),
      vignette:   { strength: 0.15, power: 1.8 },
      halation:   halRed(0.12),
    }),
  },

  {
    id: 'nikon-zoom-300',
    name: 'Nikon Zoom 300',
    category: 'camera-sig',
    iso: '400',
    hintText: 'Consumer zoom softness. Warm family-album feel.',
    params: buildParams({
      toneCurve: {
        composite: [[0,12],[64,74],[128,134],[192,198],[255,246]],
        red:   [[0, 8],[128,132],[255,248]],
        green: [[0, 6],[128,128],[255,244]],
        blue:  [[0, 4],[128,114],[255,226]],
      },
      rgbShift:   [8, 2, -14],
      saturation: -0.08,
      grain:      grainSingle(grainOf(0.048, 1.2, 0.16)),
      vignette:   { strength: 0.19, power: 2.0 },
      halation:   halRed(0.08),
    }),
  },

  /* ─── Experimental ─────────────────────────────────────────────────── */

  {
    id: 'cross-process',
    name: 'Cross-Process',
    category: 'experimental',
    iso: '—',
    hintText: 'Surreal color inversion.',
    params: buildParams({
      toneCurve: {
        composite: [[0,0],[255,255]],
        red:   [[0,40],[128,100],[200,220],[255,255]],
        green: [[0, 0],[100,120],[160,170],[255,200]],
        blue:  [[0,80],[128, 60],[200, 40],[255, 30]],
      },
      saturation: 0.35,
      grain:      grainSingle(grainOf(0.16, 1.4, 0.30)),
      vignette:   { strength: 0.20, power: 2.0 },
    }),
  },

  {
    id: 'expired-35mm',
    name: 'Expired 35mm',
    category: 'experimental',
    iso: '—',
    hintText: 'Faded and foggy. Unpredictable.',
    params: buildParams({
      toneCurve: {
        composite: [[0,28],[64,80],[128,128],[192,186],[255,238]],
        red:   IDENTITY_CURVE,
        green: IDENTITY_CURVE,
        blue:  IDENTITY_CURVE,
      },
      rgbShift:   [-4, 8, -6],
      saturation: -0.08,
      grain:      grainDual(
        grainOf(0.13, 1.4, 0.28),
        grainOf(0.09, 4.0, 0.20),
      ),
      vignette:   { strength: 0.28, power: 2.2 },
    }),
  },

  /* ─── Flash (3 presets) ─────────────────────────────────────────────── */

  {
    id: 'disposable',
    name: 'Disposable Camera',
    category: 'flash',
    iso: '400',
    hintText: 'Party photos, wedding tables, Y2K. Warm, blown highlights, dark backgrounds.',
    params: buildParams({
      toneCurve: {
        composite: [[0,18],[64,80],[128,138],[192,202],[255,254]],
        red:   [[0,14],[128,144],[255,255]],
        green: [[0,10],[128,132],[255,252]],
        blue:  [[0, 8],[128,118],[255,234]],
      },
      rgbShift:   [14, 4, -8],
      saturation: 0.10,
      grain:      grainDual(
        grainOf(0.16, 1.2, 0.45, [-0.04,  0.12, -0.06]),
        grainOf(0.08, 3.5, 0.60, [ 0.08, -0.06,  0.04]),
      ),
      vignette:   { strength: 0.28, power: 2.2 },
      halation:   { threshold: 0.93, tint: [1.0, 0.294, 0.098], strength: 0.40, blurRadius: 18 },
      flash: {
        center:           [0.5, 0.48],
        falloffScale:     4.6,
        falloffPower:     2.0,
        darkFloor:        0.28,
        brightCeiling:    1.30,
        strength:         1.0,
        castColor:        [0.86, 0.94, 1.25],
        castStrength:     0.35,
        ambientColor:     [0.85, 0.90, 1.10],
        ambientStrength:  0.28,
        ambientThreshold: 0.30,
        caStrength:       0.45,
        caRadial:         true,
        clipThreshold:    0.88,
        clipHardness:     0.80,
      },
    }),
  },

  {
    id: 'y2k-flash',
    name: 'Y2K Night Flash',
    category: 'flash',
    iso: '400',
    hintText: 'Nightclub, paparazzi, blown-out subject. Background goes black.',
    params: buildParams({
      toneCurve: {
        composite: [[0, 6],[60, 48],[128,135],[185,215],[255,255]],
        red:   [[0, 8],[128,138],[255,255]],
        green: [[0, 4],[128,128],[255,248]],
        blue:  [[0, 6],[128,120],[255,238]],
      },
      rgbShift:   [10, 2, -10],
      saturation: 0.16,
      grain:      grainDual(
        grainOf(0.18, 1.6, 0.40, [-0.03,  0.10, -0.05]),
        grainOf(0.10, 4.0, 0.55, [ 0.07, -0.05,  0.03]),
      ),
      vignette:   { strength: 0.38, power: 2.8 },
      halation:   { threshold: 0.93, tint: [1.0, 0.196, 0.059], strength: 0.50, blurRadius: 20 },
      flash: {
        center:           [0.5, 0.44],
        falloffScale:     5.6,
        falloffPower:     2.6,
        darkFloor:        0.08,
        brightCeiling:    1.75,
        strength:         1.0,
        castColor:        [1.20, 1.05, 0.70],
        castStrength:     0.30,
        ambientColor:     [1.15, 1.05, 0.72],
        ambientStrength:  0.35,
        ambientThreshold: 0.35,
        caStrength:       0.0,
        caRadial:         true,
        clipThreshold:    0.84,
        clipHardness:     0.95,
      },
    }),
  },

  {
    id: 'natural-fill-flash',
    name: 'Natural Fill Flash',
    category: 'flash',
    iso: '400',
    hintText: 'Soft fill light. Flattens shadows, evens the face. Portrait and wedding look.',
    params: buildParams({
      toneCurve: {
        composite: [[0,18],[64,74],[128,130],[192,194],[255,250]],
        red:   [[0,10],[128,134],[255,250]],
        green: [[0, 8],[128,128],[255,252]],
        blue:  [[0,14],[128,122],[255,245]],
      },
      rgbShift:   [2, 1, 3],
      saturation: -0.03,
      grain:      grainSingle(grainOf(0.11, 1.3, 0.08)),
      vignette:   { strength: 0.07, power: 1.6 },
      flash: {
        center:           [0.5, 0.45],
        falloffScale:     3.4,
        falloffPower:     1.7,
        darkFloor:        0.62,
        brightCeiling:    1.14,
        strength:         0.35,
        castColor:        [1.0, 1.0, 1.0],
        castStrength:     0,
        ambientColor:     [1.0, 1.0, 1.0],
        ambientStrength:  0,
        ambientThreshold: 0,
        caStrength:       0.0,
        caRadial:         false,
        clipThreshold:    0.93,
        clipHardness:     0.15,
      },
    }),
  },

];

/* ═══════════════════════════════════════════════════════════════
   FILTER CATEGORIES — order = display order in the sidebar
═══════════════════════════════════════════════════════════════ */

export const FILTER_CATEGORIES: FilterCategory[] = [
  { id: 'color-negative', name: 'Color Negative',
    subtitle: 'Standard film stocks. Warm, natural, or vivid.' },
  { id: 'slide-reversal', name: 'Slide / Reversal',
    subtitle: 'Transparency films — high contrast, rich color, no latitude.' },
  { id: 'lomography',     name: 'Lomography Originals',
    subtitle: "Experimental emulsions with color shifts that don't exist in nature." },
  { id: 'bw',             name: 'Black & White',
    subtitle: 'Desaturated with different grain and contrast characters.' },
  { id: 'camera-sig',     name: 'Camera Signatures',
    subtitle: 'Simulates a specific camera body and lens, not just the film.' },
  { id: 'flash',          name: 'Flash',
    subtitle: 'On-camera flash physics simulation.' },
  { id: 'night-flash',    name: 'Night Flash',
    subtitle: 'The developed and scanned disposable camera look.' },
  { id: 'experimental',   name: 'Experimental',
    subtitle: 'Cross-processing, expired film, and surreal effects.' },
];

/* ═══════════════════════════════════════════════════════════════
   SLIDER CONFIGS — every right-panel slider, fully described.
   `flashPositionH` and `flashPositionV` are only rendered when the
   active filter's category is 'flash'.
═══════════════════════════════════════════════════════════════ */

export const SLIDER_CONFIGS: Record<string, SliderConfig> = {
  grain: {
    id: 'grain',
    label: 'Grain',
    min: 0, max: 100, default: 33, step: 1,
    hintText: 'The sandy texture seen in film. More = more vintage.',
  },
  vignette: {
    id: 'vignette',
    label: 'Vignette',
    min: 0, max: 100, default: 0, step: 1,
    hintText: 'Darkens the corners of the image.',
  },
  fade: {
    id: 'fade',
    label: 'Fade',
    min: 0, max: 100, default: 0, step: 1,
    hintText: 'Lifts blacks so shadows look washed out instead of pure black.',
  },
  colorTemp: {
    id: 'colorTemp',
    label: 'Color Temp',
    min: -100, max: 100, default: 0, step: 1,
    hintText: 'Shifts the overall image warm (orange) or cool (blue).',
  },
  saturation: {
    id: 'saturation',
    label: 'Saturation',
    min: -100, max: 100, default: 0, step: 1,
    hintText: 'How intense the colors are.',
  },
  halation: {
    id: 'halation',
    label: 'Halation',
    min: 0, max: 100, default: 0, step: 1,
    hintText: 'Glow that bleeds around bright lights. Signature of CineStill.',
  },
  flashStrength: {
    id: 'flashStrength',
    label: 'Flash Strength',
    min: 0, max: 100, default: 100, step: 1,
    hintText: 'How strong the flash effect is. 0 = no flash, 100 = full preset intensity.',
  },
  flashPositionH: {
    id: 'flashPositionH',
    label: 'Flash Position H',
    min: 0, max: 100, default: 50, step: 1,
    hintText: 'Where the flash light is brightest (horizontal). Drag to match where your subject is.',
  },
  flashPositionV: {
    id: 'flashPositionV',
    label: 'Flash Position V',
    min: 0, max: 100, default: 48, step: 1,
    hintText: 'Where the flash light is brightest (vertical). Drag to match where your subject is.',
  },

  /* ─── Edit-tab sliders ─────────────────────────────────────────────────── */
  exposure: {
    id: 'exposure',
    label: 'Exposure',
    min: -100, max: 100, default: 0, step: 1,
    hintText: 'Brightens or darkens the overall image (±2 stops).',
  },
  contrast: {
    id: 'contrast',
    label: 'Contrast',
    min: -100, max: 100, default: 0, step: 1,
    hintText: 'Increases or decreases the difference between light and dark.',
  },
  highlights: {
    id: 'highlights',
    label: 'Highlights',
    min: -100, max: 100, default: 0, step: 1,
    hintText: 'Recovers (−) or boosts (+) bright areas of the image.',
  },
  shadows: {
    id: 'shadows',
    label: 'Shadows',
    min: -100, max: 100, default: 0, step: 1,
    hintText: 'Lifts (+) or crushes (−) dark areas of the image.',
  },
  sharpness: {
    id: 'sharpness',
    label: 'Sharpness',
    min: 0, max: 100, default: 0, step: 1,
    hintText: 'Increases edge detail via an unsharp mask.',
  },
  edittint: {
    id: 'edittint',
    label: 'Tint',
    min: -100, max: 100, default: 0, step: 1,
    hintText: 'Green (+) or Magenta (−) color cast.',
  },
};

/* ═══════════════════════════════════════════════════════════════
   MOODS — eight curated one-tap looks. Each bundles a film preset
   plus a set of slider overrides. The Mood Strength slider lerps
   from the preset's baseline toward `sliders` at user-chosen %.
═══════════════════════════════════════════════════════════════ */

export interface MoodConfig {
  id:      string;
  label:   string;
  emoji:   string;
  preset:  string;   /* must be a key in FILTERS */
  sliders: Record<string, number>;
}

export const MOODS: MoodConfig[] = [
  { id: 'soft',    label: 'Soft',    emoji: '✨', preset: 'portra-400',
    sliders: { grain: 28, vignette: 10, fade: 14, colorTemp: 5, saturation: -8, halation: 12,
               exposure: 4, contrast: -8, highlights: -10, shadows: 8 } },
  { id: 'golden',  label: 'Golden',  emoji: '🌅', preset: 'gold-200',
    sliders: { grain: 38, vignette: 22, fade: 8, colorTemp: 18, saturation: 10, halation: 24,
               exposure: 6, contrast: 4, highlights: -6, shadows: 12 } },
  { id: 'moody',   label: 'Moody',   emoji: '🌃', preset: 'cinestill-800t',
    sliders: { grain: 60, vignette: 28, fade: 4, colorTemp: -8, saturation: -6, halation: 70,
               exposure: -8, contrast: 18, highlights: -22, shadows: -10 } },
  { id: 'vintage', label: 'Vintage', emoji: '🎞', preset: 'pro-400h',
    sliders: { grain: 50, vignette: 30, fade: 26, colorTemp: 6, saturation: -16, halation: 16,
               exposure: 2, contrast: -6, highlights: -8, shadows: 16 } },
  { id: 'vibrant', label: 'Vibrant', emoji: '🍓', preset: 'ektar-100',
    sliders: { grain: 18, vignette: 12, fade: 0, colorTemp: 4, saturation: 20, halation: 6,
               exposure: 4, contrast: 12, highlights: -4, shadows: 4, sharpness: 18 } },
  { id: 'cinema',  label: 'Cinema',  emoji: '🎬', preset: 'contax-t2',
    sliders: { grain: 32, vignette: 18, fade: 6, colorTemp: -6, saturation: -2, halation: 14,
               exposure: -2, contrast: 8, highlights: -14, shadows: 6 } },
  { id: 'y2k',     label: 'Y2K',     emoji: '💌', preset: 'disposable',
    sliders: { grain: 80, vignette: 32, fade: 0, colorTemp: 8, saturation: 12, halation: 38,
               flashPositionH: 50, flashPositionV: 48 } },
  { id: 'cool',    label: 'Cool',    emoji: '🌊', preset: 'colorplus-200',
    sliders: { grain: 22, vignette: 14, fade: 4, colorTemp: -10, saturation: -4, halation: 10,
               exposure: 2, contrast: 6, highlights: -8, shadows: 6 } },
];

const moodsById = new Map<string, MoodConfig>(MOODS.map((m) => [m.id, m]));
export function getMoodById(id: string): MoodConfig | undefined { return moodsById.get(id); }

/* ═══════════════════════════════════════════════════════════════
   HELPERS — convenient lookups
═══════════════════════════════════════════════════════════════ */

const filtersById: Map<string, FilterPreset> = new Map(FILTERS.map((f) => [f.id, f]));

export function getFilterById(id: string): FilterPreset | undefined {
  return filtersById.get(id);
}

export function getFiltersByCategory(categoryId: string): FilterPreset[] {
  return FILTERS.filter((f) => f.category === categoryId);
}

/* Sanity assertions in dev — surface preset/category mismatches early */
if (import.meta.env.DEV) {
  const validCategories = new Set(FILTER_CATEGORIES.map((c) => c.id));
  for (const f of FILTERS) {
    if (!validCategories.has(f.category)) {
      // eslint-disable-next-line no-console
      console.warn(`[filters] preset "${f.id}" has unknown category "${f.category}"`);
    }
  }
  const ids = new Set<string>();
  for (const f of FILTERS) {
    if (ids.has(f.id)) {
      // eslint-disable-next-line no-console
      console.warn(`[filters] duplicate preset id "${f.id}"`);
    }
    ids.add(f.id);
  }
  // eslint-disable-next-line no-console
  console.log(`[filters] loaded ${FILTERS.length} presets across ${FILTER_CATEGORIES.length} categories`);
}
