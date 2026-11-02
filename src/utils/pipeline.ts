import type { FilterPreset, SliderOverrides } from '../types/filter';
import { composeLUT } from './referenceLUT';

import commonWgsl     from '../shaders/common.wgsl?raw';
import toneCurveWgsl  from '../shaders/toneCurve.wgsl?raw';
import colorGradeWgsl from '../shaders/colorGrade.wgsl?raw';
import grainWgsl      from '../shaders/grain.wgsl?raw';
import vignetteWgsl   from '../shaders/vignette.wgsl?raw';
import flashFXWgsl    from '../shaders/flashFX.wgsl?raw';
import skinSmoothWgsl from '../shaders/skinSmooth.wgsl?raw';

/* ═══════════════════════════════════════════════════════════════
   LUT BUILDER — cubic spline through anchor points → 256 entries
═══════════════════════════════════════════════════════════════ */

/**
 * Build a 256-entry tone curve LUT by fitting a natural cubic spline through
 * the provided anchor points. Anchors are in [0..255, 0..255] space; the
 * returned values are normalized 0..1.
 */
export function buildLUT(anchors: Array<[number, number]>): Float32Array {
  const pts = [...anchors].sort((a, b) => a[0] - b[0]);
  const out = new Float32Array(256);

  if (pts.length === 0) {
    for (let i = 0; i < 256; i++) out[i] = i / 255;
    return out;
  }
  if (pts.length === 1) {
    const v = clamp01(pts[0][1] / 255);
    out.fill(v);
    return out;
  }
  if (pts.length === 2) {
    const k = (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]);
    for (let i = 0; i < 256; i++) {
      const y = i <= pts[0][0]
        ? pts[0][1]
        : i >= pts[1][0]
          ? pts[1][1]
          : pts[0][1] + k * (i - pts[0][0]);
      out[i] = clamp01(y / 255);
    }
    return out;
  }

  // ── Natural cubic spline (interior 2nd-derivatives via Thomas algorithm) ──
  const n  = pts.length - 1;            // number of intervals
  const h: number[] = new Array(n);
  for (let i = 0; i < n; i++) h[i] = pts[i + 1][0] - pts[i][0];

  const m = n - 1;                      // interior unknowns
  const dg  = new Array<number>(m);
  const off = new Array<number>(Math.max(0, m - 1));
  const rhs = new Array<number>(m);
  for (let i = 0; i < m; i++) {
    const k = i + 1;
    dg[i]  = 2 * (h[k - 1] + h[k]);
    rhs[i] = 6 * ((pts[k + 1][1] - pts[k][1]) / h[k]
                - (pts[k][1] - pts[k - 1][1]) / h[k - 1]);
  }
  for (let i = 0; i < m - 1; i++) off[i] = h[i + 1];

  const dg2 = dg.slice();
  const d   = rhs.slice();
  for (let i = 1; i < m; i++) {
    const f = off[i - 1] / dg2[i - 1];
    dg2[i] -= f * off[i - 1];
    d[i]   -= f * d[i - 1];
  }
  const c = new Array<number>(m);
  if (m > 0) {
    c[m - 1] = d[m - 1] / dg2[m - 1];
    for (let i = m - 2; i >= 0; i--) c[i] = (d[i] - off[i] * c[i + 1]) / dg2[i];
  }
  const M = [0, ...c, 0];

  for (let xi = 0; xi < 256; xi++) {
    let y: number;
    if (xi <= pts[0][0]) {
      y = pts[0][1];
    } else if (xi >= pts[n][0]) {
      y = pts[n][1];
    } else {
      let lo = 0, hi = n - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (xi < pts[mid + 1][0]) hi = mid; else lo = mid;
      }
      const i   = lo;
      const dt  = xi - pts[i][0];
      const du  = pts[i + 1][0] - xi;
      const hi2 = h[i];
      y = M[i]     / (6 * hi2) * du * du * du
        + M[i + 1] / (6 * hi2) * dt * dt * dt
        + (pts[i][1]     / hi2 - M[i]     * hi2 / 6) * du
        + (pts[i + 1][1] / hi2 - M[i + 1] * hi2 / 6) * dt;
    }
    out[xi] = clamp01(y / 255);
  }
  return out;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/* ═══════════════════════════════════════════════════════════════
   FILTER PIPELINE — compute-shader plumbing
═══════════════════════════════════════════════════════════════ */

export type PassName = 'colorGrade' | 'toneCurve' | 'flashFX' | 'vignette' | 'grain' | 'skinSmooth';

export interface FilterPipeline {
  device:   GPUDevice;
  sampler:  GPUSampler;
  pipelines: Record<PassName, GPUComputePipeline>;
  layouts:   Record<PassName, GPUBindGroupLayout>;
}

/** Concatenate shared utilities with a per-pass shader source. */
function buildModule(device: GPUDevice, label: string, src: string): GPUShaderModule {
  return device.createShaderModule({ label, code: `${commonWgsl}\n${src}` });
}

/** Layout shared by every pass: input texture + sampler + storage output texture + (one or more) uniforms. */
function makeLayout(
  device: GPUDevice,
  label: string,
  extra: GPUBindGroupLayoutEntry[],
): GPUBindGroupLayout {
  const baseEntries: GPUBindGroupLayoutEntry[] = [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE,
      storageTexture: { access: 'write-only', format: 'rgba8unorm', viewDimension: '2d' } },
  ];
  return device.createBindGroupLayout({ label, entries: [...baseEntries, ...extra] });
}

/**
 * Build all compute pipelines, bind-group layouts, and the shared sampler.
 * Called once per device — the returned object is reused for every render.
 */
export function createPipeline(device: GPUDevice): FilterPipeline {
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // ── Layouts ───────────────────────────────────────────────────────────────
  const layoutColorGrade = makeLayout(device, 'colorGrade.layout', [
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
  ]);
  const layoutToneCurve  = makeLayout(device, 'toneCurve.layout', [
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
  ]);
  const layoutFlashFX   = makeLayout(device, 'flashFX.layout', [
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
  ]);
  const layoutVignette  = makeLayout(device, 'vignette.layout', [
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
  ]);
  const layoutGrain     = makeLayout(device, 'grain.layout', [
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
  ]);
  const layoutSkinSmooth = makeLayout(device, 'skinSmooth.layout', [
    { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
    { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer:  { type: 'uniform' } },
  ]);

  // ── Pipelines ─────────────────────────────────────────────────────────────
  const compile = (label: string, src: string, layout: GPUBindGroupLayout): GPUComputePipeline =>
    device.createComputePipeline({
      label,
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module: buildModule(device, `${label}.module`, src), entryPoint: 'main' },
    });

  return {
    device,
    sampler,
    pipelines: {
      colorGrade: compile('colorGrade', colorGradeWgsl, layoutColorGrade),
      toneCurve:  compile('toneCurve',  toneCurveWgsl,  layoutToneCurve),
      flashFX:    compile('flashFX',    flashFXWgsl,    layoutFlashFX),
      vignette:   compile('vignette',   vignetteWgsl,   layoutVignette),
      grain:      compile('grain',      grainWgsl,      layoutGrain),
      skinSmooth: compile('skinSmooth', skinSmoothWgsl, layoutSkinSmooth),
    },
    layouts: {
      colorGrade: layoutColorGrade,
      toneCurve:  layoutToneCurve,
      flashFX:    layoutFlashFX,
      vignette:   layoutVignette,
      grain:      layoutGrain,
      skinSmooth: layoutSkinSmooth,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   UNIFORM PACKING helpers — std140-ish alignment for WGSL uniform buffers
═══════════════════════════════════════════════════════════════ */

function alignedBuffer(device: GPUDevice, sizeBytes: number, label: string): GPUBuffer {
  const size = Math.max(16, Math.ceil(sizeBytes / 16) * 16);
  return device.createBuffer({ label, size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
}

function makeStorageF32(device: GPUDevice, data: Float32Array, label: string): GPUBuffer {
  const buf = device.createBuffer({
    label,
    size: Math.max(16, data.byteLength),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data);
  return buf;
}

/* ─── Tone curve uniform: 8 floats = 32 bytes (4-byte aligned) ─────────── */
function writeToneParams(
  device:    GPUDevice,
  buf:       GPUBuffer,
  preset:    FilterPreset,
  overrides: SliderOverrides,
) {
  const fade        = (overrides.fade ?? 0) / 100;
  // saturation combines preset bias (-1..1) and user slider (-100..100 → -1..1).
  const userSat     = (overrides.saturation ?? 0) / 100;
  const saturation  = Math.max(0, 1 + preset.params.saturation + userSat);
  // Edit-tab sliders: exposure -100..100 → 0.25x .. 4x ; contrast/hl/shadows/tint  -100..100 → -1..1
  const exposure    = Math.pow(2.0, (overrides.exposure   ?? 0) / 50);
  const contrast    = (overrides.contrast   ?? 0) / 100;
  const highlights  = (overrides.highlights ?? 0) / 100;
  const shadows     = (overrides.shadows    ?? 0) / 100;
  const sharpness   = Math.max(0, (overrides.sharpness  ?? 0) / 100);
  const editTint    = (overrides.edittint   ?? 0) / 100;

  const pushPull   = Math.max(-2, Math.min(2, overrides.pushPull ?? 0));
  const data = new Float32Array([
    fade, saturation, exposure, contrast,
    highlights, shadows, sharpness, editTint,
    pushPull, 0, 0, 0,
  ]);
  device.queue.writeBuffer(buf, 0, data);
}

/* ─── ColorGrade uniform layout ──────────────────────────────────────────── */
function writeGradeParams(
  device:    GPUDevice,
  buf:       GPUBuffer,
  preset:    FilterPreset,
  overrides: SliderOverrides,
) {
  // mat3x3f (48) + vec3f + pad (16) + array<HueBand,6> (96) + 3*SplitZone (48) + vec4 trailing
  const arr = new Float32Array(64);  // 256 bytes
  let o = 0;
  const M = preset.params.colorMatrix;
  // column-major mat3x3 packed as 3x vec4
  arr[o + 0] = M[0][0]; arr[o + 1] = M[1][0]; arr[o + 2]  = M[2][0]; arr[o + 3]  = 0;
  arr[o + 4] = M[0][1]; arr[o + 5] = M[1][1]; arr[o + 6]  = M[2][1]; arr[o + 7]  = 0;
  arr[o + 8] = M[0][2]; arr[o + 9] = M[1][2]; arr[o + 10] = M[2][2]; arr[o + 11] = 0;
  o += 12;

  // rgbShift is in 0..255 space; the shader expects normalized 0..1.
  // The Color Temp slider (-100..100) adds a balanced warm/cool offset on top:
  // positive (+) → more red & a touch of green, less blue. Range matches the
  // original HTML pipeline (±15/255 at slider extremes).
  const shift = preset.params.rgbShift;
  const ct    = ((overrides.colorTemp ?? 0) / 100) * 15;       /* in 0..255 space */
  arr[o++] = (shift[0] + ct)        / 255;
  arr[o++] = (shift[1] + ct * 0.25) / 255;
  arr[o++] = (shift[2] - ct)        / 255;
  arr[o++] = 0;

  // 6 hue bands, each 4 floats. The user-facing HSL panel layers six
  // canonical bands on top of the preset's bands (matched by nearest centre).
  const HSL_CENTERS: { key: string; c: number }[] = [
    { key: 'reds',    c:   0 / 360 },
    { key: 'oranges', c:  30 / 360 },
    { key: 'yellows', c:  60 / 360 },
    { key: 'greens',  c: 120 / 360 },
    { key: 'blues',   c: 240 / 360 },
    { key: 'purples', c: 290 / 360 },
  ];
  const presetBands = preset.params.hueRotation?.bands ?? [];
  const presetUsed  = new Uint8Array(presetBands.length);
  for (let i = 0; i < 6; i++) {
    const slot = HSL_CENTERS[i];
    // Find an unused preset band whose centre is close to this canonical centre.
    let matchIdx = -1, bestDist = 0.08;       // ~28° max gap
    for (let j = 0; j < presetBands.length; j++) {
      if (presetUsed[j]) continue;
      const d0 = Math.abs(presetBands[j].center - slot.c);
      const d  = Math.min(d0, 1 - d0);        // hue wraps
      if (d < bestDist) { bestDist = d; matchIdx = j; }
    }
    const baseCenter = matchIdx >= 0 ? presetBands[matchIdx].center        : slot.c;
    const baseWidth  = matchIdx >= 0 ? presetBands[matchIdx].width         : 0.083;
    const baseRot    = matchIdx >= 0 ? presetBands[matchIdx].rotation      : 0;
    const baseSatMul = matchIdx >= 0 ? presetBands[matchIdx].satMultiplier : 1;
    if (matchIdx >= 0) presetUsed[matchIdx] = 1;

    // User overrides: hue in degrees -30..30, sat in slider scale -100..100
    const uHueDeg = overrides[`hslHue_${slot.key}`] ?? 0;
    const uSat    = overrides[`hslSat_${slot.key}`] ?? 0;
    const userRot = uHueDeg / 360;
    const userSat = uSat / 100;                /* -1..1 → +/- 100% */

    arr[o++] = baseCenter;
    arr[o++] = baseWidth;
    arr[o++] = baseRot + userRot;
    arr[o++] = baseSatMul + userSat;
  }

  // 3 split zones, each 4 floats
  const st = preset.params.splitTone;
  if (st) {
    arr[o++] = st.shadow.hue;    arr[o++] = st.shadow.sat;    arr[o++] = st.shadow.lumShift;    arr[o++] = 0;
    arr[o++] = st.midtone.hue;   arr[o++] = st.midtone.sat;   arr[o++] = st.midtone.lumShift;   arr[o++] = 0;
    arr[o++] = st.highlight.hue; arr[o++] = st.highlight.sat; arr[o++] = st.highlight.lumShift; arr[o++] = 0;
  } else {
    for (let i = 0; i < 12; i++) arr[o++] = 0;
  }

  arr[o++] = st?.balance  ?? 0;
  arr[o++] = st?.strength ?? 0;
  arr[o++] = 0; arr[o++] = 0;

  // Light leak — fields packed at the tail of GradeParams.
  // Default off; PreviewCanvas injects leak* into overrides when enabled.
  const lr = overrides.leakColorR ?? 1.0;
  const lg = overrides.leakColorG ?? 0.5;
  const lb = overrides.leakColorB ?? 0.2;
  arr[o++] = lr; arr[o++] = lg; arr[o++] = lb;
  arr[o++] = overrides.leakStrength ?? 0;
  const u32 = new Uint32Array(arr.buffer, arr.byteOffset, arr.length);
  u32[o]   = (overrides.leakEdge ?? 0) | 0;     o++;
  arr[o++] = overrides.leakWidth ?? 0.30;
  arr[o++] = 0; arr[o++] = 0;                   /* trailing pad to 256 */

  device.queue.writeBuffer(buf, 0, arr);
}

/* ─── Grain uniform layout ───────────────────────────────────────────────── */
function writeGrainParams(device: GPUDevice, buf: GPUBuffer,
                          preset: FilterPreset, overrides: SliderOverrides) {
  const seed1 = (overrides.grainSeed ?? Math.random() * 1000);
  const seed2 = seed1 + 17.9;
  const g1 = preset.params.grain.pass1;
  const g2 = preset.params.grain.pass2;
  // Grain slider: default 33 = 1× preset baseline. 0 = no grain, 100 = ~3×.
  // Push/Pull stop also multiplies grain (1.4^stops) so pushed film looks grainier.
  const grainMult = Math.max(0, (overrides.grain ?? 33) / 33);
  const pushBoost = Math.pow(1.4, overrides.pushPull ?? 0);
  const finalMult = grainMult * pushBoost;

  const arr = new Float32Array(16);   // 64 bytes
  let o = 0;
  arr[o++] = g1.intensity * finalMult;
  arr[o++] = g1.size;
  arr[o++] = g1.chroma;
  arr[o++] = seed1;
  arr[o++] = g1.colorBias[0]; arr[o++] = g1.colorBias[1]; arr[o++] = g1.colorBias[2]; arr[o++] = 0;

  if (g2) {
    arr[o++] = g2.intensity * finalMult;
    arr[o++] = g2.size; arr[o++] = g2.chroma; arr[o++] = seed2;
    arr[o++] = g2.colorBias[0]; arr[o++] = g2.colorBias[1]; arr[o++] = g2.colorBias[2]; arr[o++] = 0;
  } else {
    arr[o++] = 0; arr[o++] = 1; arr[o++] = 0; arr[o++] = seed2;
    arr[o++] = 0; arr[o++] = 0; arr[o++] = 0; arr[o++] = 0;
  }

  device.queue.writeBuffer(buf, 0, arr);
}

/* ─── Vignette uniform layout ────────────────────────────────────────────── */
function writeVignetteParams(device: GPUDevice, buf: GPUBuffer,
                              preset: FilterPreset, overrides: SliderOverrides, aspect: number) {
  const v = preset.params.vignette;
  const h = preset.params.halation;
  // Vignette slider adds on top of preset strength: 0..100 → +0..+0.6
  const userVig = Math.max(0, (overrides.vignette ?? 0) / 100) * 0.6;
  // Halation slider adds on top of preset strength: 0..100 → +0..+1.0
  const userHal = Math.max(0, (overrides.halation ?? 0) / 100);

  const arr = new Float32Array(12);    // 48 bytes
  arr[0] = (v?.strength ?? 0) + userVig;
  arr[1] = v?.power    ?? 2;
  arr[2] = aspect;
  arr[3] = h?.threshold ?? 0.72;
  const t = h?.tint ?? [1, 0.3, 0.1];
  arr[4] = t[0]; arr[5] = t[1]; arr[6] = t[2];
  arr[7] = (h?.strength ?? 0) + userHal;
  arr[8] = h?.blurRadius ?? 12;
  arr[9] = 0; arr[10] = 0; arr[11] = 0;
  device.queue.writeBuffer(buf, 0, arr);
}

/* ─── FlashFX uniform layout ─────────────────────────────────────────────── */
function writeFlashParams(
  device:    GPUDevice,
  buf:       GPUBuffer,
  preset:    FilterPreset,
  overrides: SliderOverrides,
) {
  const f = preset.params.flash;
  if (!f) return;
  // Flash Position H/V sliders are 0..100 → 0..1 UV space
  const cx = overrides.flashPositionH != null ? overrides.flashPositionH / 100 : f.center[0];
  const cy = overrides.flashPositionV != null ? overrides.flashPositionV / 100 : f.center[1];
  // Flash Strength slider 0..100 → 0..1 multiplier (default 1 = preset's full intensity).
  // Scales every "amount" knob in the flash pass so the whole effect breathes together.
  const flashAmt = Math.max(0, Math.min(1, (overrides.flashStrength ?? 100) / 100));
  const arr = new Float32Array(24);   // 96 bytes
  arr[0]  = cx;                    arr[1]  = cy;
  arr[2]  = f.falloffScale;        arr[3]  = f.falloffPower;
  arr[4]  = f.darkFloor;           arr[5]  = f.brightCeiling;
  arr[6]  = f.strength * flashAmt; arr[7]  = 0;                  /* _pad0 */

  arr[8]  = f.castColor[0];        arr[9]  = f.castColor[1];     arr[10] = f.castColor[2];   arr[11] = f.castStrength    * flashAmt;
  arr[12] = f.ambientColor[0];     arr[13] = f.ambientColor[1];  arr[14] = f.ambientColor[2]; arr[15] = f.ambientStrength * flashAmt;

  arr[16] = f.ambientThreshold;
  arr[17] = f.caStrength;
  const u32 = new Uint32Array(arr.buffer, arr.byteOffset, arr.length);
  u32[18] = f.caRadial ? 1 : 0;
  arr[19] = f.clipThreshold;
  arr[20] = f.clipHardness;
  arr[21] = 0; arr[22] = 0; arr[23] = 0;                          /* trailing pad to round struct to 96 */

  device.queue.writeBuffer(buf, 0, arr);
}

/* ═══════════════════════════════════════════════════════════════
   RENDER — runs every pass in order, ping-ponging textures
═══════════════════════════════════════════════════════════════ */

function makeStorageTex(device: GPUDevice, w: number, h: number, label: string): GPUTexture {
  return device.createTexture({
    label, size: [w, h, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING
         | GPUTextureUsage.STORAGE_BINDING
         | GPUTextureUsage.COPY_SRC
         | GPUTextureUsage.COPY_DST,
  });
}

function bindFor(pl: FilterPipeline, name: PassName,
                 inputView: GPUTextureView, outputView: GPUTextureView,
                 extra: GPUBindGroupEntry[]): GPUBindGroup {
  return pl.device.createBindGroup({
    layout: pl.layouts[name],
    entries: [
      { binding: 0, resource: inputView },
      { binding: 1, resource: pl.sampler },
      { binding: 2, resource: outputView },
      ...extra,
    ],
  });
}

/**
 * Run all enabled passes on `sourceTexture` and return the final result.
 *
 * Passes execute in this order, ping-ponging between two intermediate
 * storage textures:
 *   1. colorGrade   (always)
 *   2. toneCurve    (always)
 *   3. flashFX      (only if preset.flash is set)
 *   4. vignette     (always — even if both vignette & halation strengths are 0,
 *                   it's a cheap no-op)
 *   5. grain        (always)
 */
export interface ReferenceLUTOption {
  R:        Float32Array;
  G:        Float32Array;
  B:        Float32Array;
  strength: number;     /* 0..1 */
}

export interface SkinSmoothOption {
  mask:     Uint8Array;   /* r8 mask, length = maskW * maskH */
  maskW:    number;
  maskH:    number;
  strength: number;       /* 0..1 */
}

export async function renderFilter(
  pipeline:        FilterPipeline,
  device:          GPUDevice,
  sourceTexture:   GPUTexture,
  preset:          FilterPreset,
  sliderOverrides: SliderOverrides,
  referenceLUT?:   ReferenceLUTOption | null,
  skinSmooth?:     SkinSmoothOption | null,
): Promise<GPUTexture> {
  const w = sourceTexture.width;
  const h = sourceTexture.height;
  const aspect = w / h;

  // Ping-pong storage textures
  const texA = makeStorageTex(device, w, h, 'pipeline.A');
  const texB = makeStorageTex(device, w, h, 'pipeline.B');

  // Uniform buffers (long-lived for the duration of this render)
  const ubGrade = alignedBuffer(device, 256, 'ub.colorGrade');
  const ubTone  = alignedBuffer(device, 48,  'ub.tone');
  const ubFlash = alignedBuffer(device, 96,  'ub.flash');
  const ubVig   = alignedBuffer(device, 48,  'ub.vignette');
  const ubGrain = alignedBuffer(device, 64,  'ub.grain');

  writeGradeParams(device, ubGrade, preset, sliderOverrides);
  writeToneParams(device, ubTone, preset, sliderOverrides);
  if (preset.params.flash) writeFlashParams(device, ubFlash, preset, sliderOverrides);
  writeVignetteParams(device, ubVig, preset, sliderOverrides, aspect);
  writeGrainParams(device, ubGrain, preset, sliderOverrides);

  // LUT storage buffers — compose with reference-photo histogram match if any
  const tc = preset.params.toneCurve;
  let baseR = buildLUT(combineCurves(tc.composite, tc.red));
  let baseG = buildLUT(combineCurves(tc.composite, tc.green));
  let baseB = buildLUT(combineCurves(tc.composite, tc.blue));
  if (referenceLUT && referenceLUT.strength > 0.001) {
    baseR = composeLUT(baseR, referenceLUT.R, referenceLUT.strength);
    baseG = composeLUT(baseG, referenceLUT.G, referenceLUT.strength);
    baseB = composeLUT(baseB, referenceLUT.B, referenceLUT.strength);
  }
  const lutR = makeStorageF32(device, baseR, 'lut.R');
  const lutG = makeStorageF32(device, baseG, 'lut.G');
  const lutB = makeStorageF32(device, baseB, 'lut.B');

  const srcView = sourceTexture.createView();
  const aView   = texA.createView();
  const bView   = texB.createView();

  const encoder = device.createCommandEncoder({ label: 'filter.encoder' });
  const wgX = Math.ceil(w / 8);
  const wgY = Math.ceil(h / 8);

  function pass(name: PassName, inputView: GPUTextureView, outputView: GPUTextureView,
                extra: GPUBindGroupEntry[]) {
    const bg = bindFor(pipeline, name, inputView, outputView, extra);
    const enc = encoder.beginComputePass({ label: `pass.${name}` });
    enc.setPipeline(pipeline.pipelines[name]);
    enc.setBindGroup(0, bg);
    enc.dispatchWorkgroups(wgX, wgY, 1);
    enc.end();
  }

  // 1. colorGrade : src → A
  pass('colorGrade', srcView, aView,
       [{ binding: 3, resource: { buffer: ubGrade } }]);

  // 2. toneCurve : A → B
  pass('toneCurve', aView, bView, [
    { binding: 3, resource: { buffer: lutR } },
    { binding: 4, resource: { buffer: lutG } },
    { binding: 5, resource: { buffer: lutB } },
    { binding: 6, resource: { buffer: ubTone } },
  ]);

  // 3. skinSmooth (optional, masked) : B → A
  let lastOut = texB;
  let lastView = bView;
  let maskTex: GPUTexture | null = null;
  let ubSkin:  GPUBuffer  | null = null;
  if (skinSmooth && skinSmooth.strength > 0.001 && skinSmooth.mask.length === skinSmooth.maskW * skinSmooth.maskH) {
    maskTex = device.createTexture({
      label: 'skin.mask',
      size:  [skinSmooth.maskW, skinSmooth.maskH, 1],
      format: 'r8unorm',
      usage:  GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: maskTex },
      skinSmooth.mask,
      { bytesPerRow: skinSmooth.maskW, rowsPerImage: skinSmooth.maskH },
      { width: skinSmooth.maskW, height: skinSmooth.maskH, depthOrArrayLayers: 1 },
    );
    ubSkin = alignedBuffer(device, 16, 'ub.skin');
    device.queue.writeBuffer(ubSkin, 0, new Float32Array([
      Math.max(0, Math.min(1, skinSmooth.strength)),
      0.08,    // similarity sigma — small = preserve edges
      0, 0,
    ]));
    pass('skinSmooth', bView, aView, [
      { binding: 3, resource: maskTex.createView() },
      { binding: 4, resource: { buffer: ubSkin } },
    ]);
    lastOut = texA; lastView = aView;
  }

  // 4. flashFX (optional) : lastView → other
  if (preset.params.flash) {
    const flashIn  = lastView;
    const flashOut = lastOut === texA ? texB : texA;
    const flashOutView = lastView === aView ? bView : aView;
    pass('flashFX', flashIn, flashOutView, [{ binding: 3, resource: { buffer: ubFlash } }]);
    lastOut = flashOut; lastView = flashOutView;
  }

  // 4. vignette : lastView → other
  const vigInView  = lastView;
  const vigOut     = lastOut === texA ? texB : texA;
  const vigOutView = lastView === aView ? bView : aView;
  pass('vignette', vigInView, vigOutView, [{ binding: 3, resource: { buffer: ubVig } }]);

  // 5. grain : vigOutView → other
  const grainOut     = vigOut === texA ? texB : texA;
  const grainOutView = vigOutView === aView ? bView : aView;
  pass('grain', vigOutView, grainOutView, [{ binding: 3, resource: { buffer: ubGrain } }]);

  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  // Free intermediates we don't return
  if (grainOut !== texA) texA.destroy();
  if (grainOut !== texB) texB.destroy();
  lutR.destroy(); lutG.destroy(); lutB.destroy();
  ubGrade.destroy(); ubTone.destroy(); ubFlash.destroy(); ubVig.destroy(); ubGrain.destroy();
  maskTex?.destroy(); ubSkin?.destroy();

  return grainOut;
}

/** Compose composite + per-channel curves into a single anchor set used by buildLUT. */
function combineCurves(
  comp:    Array<[number, number]>,
  channel: Array<[number, number]>,
): Array<[number, number]> {
  const compFn = makeSplineFn(comp);
  const chFn   = makeSplineFn(channel);
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= 16; i++) {
    const xv = (i / 16) * 255;
    out.push([xv, clamp01(chFn(compFn(xv)) / 255) * 255]);
  }
  return out;
}

function makeSplineFn(pts: Array<[number, number]>): (x: number) => number {
  const sorted = [...pts].sort((a, b) => a[0] - b[0]);
  if (sorted.length === 2) {
    const k = (sorted[1][1] - sorted[0][1]) / (sorted[1][0] - sorted[0][0]);
    return (t) => t <= sorted[0][0] ? sorted[0][1]
                 : t >= sorted[1][0] ? sorted[1][1]
                 : sorted[0][1] + k * (t - sorted[0][0]);
  }
  // Reuse buildLUT for a 256-sample table, then linearly interpolate
  const tbl = buildLUT(sorted);
  return (t) => {
    const x = Math.max(0, Math.min(255, t));
    const i = Math.floor(x);
    const f = x - i;
    const a = tbl[i] * 255;
    const b = tbl[Math.min(255, i + 1)] * 255;
    return a + (b - a) * f;
  };
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT — texture → JPEG Blob at 92% quality
═══════════════════════════════════════════════════════════════ */

/**
 * Read a GPU texture back to CPU and encode it as a blob. Defaults to
 * JPEG at quality 0.92; pass `mime` = "image/png" to get a lossless PNG.
 * Buffer copy obeys WebGPU's 256-byte row alignment rule and unpadding is
 * done on the CPU side before pushing pixels into a 2D canvas.
 */
export async function exportTexture(
  device:  GPUDevice,
  texture: GPUTexture,
  width:   number,
  height:  number,
  mime:    string = 'image/jpeg',
  quality: number = 0.92,
): Promise<Blob> {
  const bytesPerPixel = 4;
  const unpaddedRow   = width * bytesPerPixel;
  const paddedRow     = Math.ceil(unpaddedRow / 256) * 256;
  const bufSize       = paddedRow * height;

  const readBuf = device.createBuffer({
    label: 'export.readback',
    size:  bufSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const enc = device.createCommandEncoder({ label: 'export.encoder' });
  enc.copyTextureToBuffer(
    { texture },
    { buffer: readBuf, bytesPerRow: paddedRow, rowsPerImage: height },
    { width, height, depthOrArrayLayers: 1 },
  );
  device.queue.submit([enc.finish()]);

  await readBuf.mapAsync(GPUMapMode.READ);
  const padded = new Uint8Array(readBuf.getMappedRange().slice(0));
  readBuf.unmap();
  readBuf.destroy();

  // Strip padding row by row
  const out = new Uint8ClampedArray(unpaddedRow * height);
  for (let y = 0; y < height; y++) {
    out.set(padded.subarray(y * paddedRow, y * paddedRow + unpaddedRow), y * unpaddedRow);
  }

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imageData = new ImageData(out, width, height);
  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else   reject(new Error('canvas.toBlob returned null'));
    }, mime, mime === 'image/jpeg' ? quality : undefined);
  });
}

/* ═══════════════════════════════════════════════════════════════
   UNIT-LEVEL TESTS (dev only)
   These run on import in dev mode and console.assert any failures.
═══════════════════════════════════════════════════════════════ */

if (import.meta.env.DEV) {
  // ── buildLUT identity ─────────────────────────────────────────────────────
  const identity = buildLUT([[0, 0], [255, 255]]);
  console.assert(identity.length === 256,             '[pipeline] LUT length === 256');
  console.assert(Math.abs(identity[0]   -   0 / 255) < 0.001, '[pipeline] identity LUT[0]');
  console.assert(Math.abs(identity[128] - 128 / 255) < 0.005, '[pipeline] identity LUT[128]');
  console.assert(Math.abs(identity[255] - 255 / 255) < 0.001, '[pipeline] identity LUT[255]');

  // ── Inverted ──────────────────────────────────────────────────────────────
  const inv = buildLUT([[0, 255], [255, 0]]);
  console.assert(Math.abs(inv[0]   - 1.0) < 0.001, '[pipeline] inverted LUT[0]=1.0');
  console.assert(Math.abs(inv[255] - 0.0) < 0.001, '[pipeline] inverted LUT[255]=0.0');
  console.assert(Math.abs(inv[128] - 0.5) < 0.01,  '[pipeline] inverted LUT[128]≈0.5');

  // ── Midtone boost (anchor at midtone, output lifted) ──────────────────────
  const boost = buildLUT([[0, 0], [128, 200], [255, 255]]);
  console.assert(boost[128] > 0.70 && boost[128] < 0.82, '[pipeline] midtone boost LUT[128]≈200/255');
  console.assert(boost[0]   < 0.05, '[pipeline] midtone boost LUT[0]≈0');
  console.assert(boost[255] > 0.95, '[pipeline] midtone boost LUT[255]≈1');

  // ── Single point → constant LUT ───────────────────────────────────────────
  const single = buildLUT([[128, 64]]);
  console.assert(Math.abs(single[0]   - 64 / 255) < 0.001, '[pipeline] single-point LUT constant @ 0');
  console.assert(Math.abs(single[255] - 64 / 255) < 0.001, '[pipeline] single-point LUT constant @ 255');

  // ── Monotonic increasing anchors stay monotonic ───────────────────────────
  const mono = buildLUT([[0, 10], [64, 80], [128, 140], [192, 200], [255, 250]]);
  let monoOk = true;
  for (let i = 1; i < 256; i++) {
    if (mono[i] + 1e-6 < mono[i - 1]) { monoOk = false; break; }
  }
  console.assert(monoOk, '[pipeline] monotonic-input LUT stays non-decreasing');

  // ── Empty anchor list falls back to identity ──────────────────────────────
  const empty = buildLUT([]);
  console.assert(Math.abs(empty[128] - 128 / 255) < 0.001, '[pipeline] empty LUT is identity');

  // eslint-disable-next-line no-console
  console.log('[pipeline] LUT unit tests passed');
}
