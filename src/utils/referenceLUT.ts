/* ─── Per-channel histogram-matching LUT ───────────────────────────────────
   Given a source photo and a reference (style) photo, build three 256-entry
   LUTs that remap the source's R/G/B channels so their cumulative
   distributions match the reference. This captures the reference image's
   color cast, contrast, and tonal balance with a single GPU table lookup.

   Output values are in the 0..255 range so they compose with the existing
   filter LUTs produced by `buildLUT`.
*/

const SAMPLE_DIM = 96;   // 96×96 = ~9k samples — fast and stable

export interface ReferenceLUTs {
  R: Float32Array;   // length 256, values in 0..255
  G: Float32Array;
  B: Float32Array;
}

async function sampleChannels(blob: Blob): Promise<{ R: Uint32Array; G: Uint32Array; B: Uint32Array; total: number } | null> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, {
      resizeWidth:  SAMPLE_DIM,
      resizeHeight: SAMPLE_DIM,
      resizeQuality: 'medium',
    });
  } catch {
    return null;
  }
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) { bmp.close?.(); return null; }
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const R = new Uint32Array(256);
  const G = new Uint32Array(256);
  const B = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    R[data[i]]++; G[data[i + 1]]++; B[data[i + 2]]++;
  }
  return { R, G, B, total: c.width * c.height };
}

function cdfFromHist(hist: Uint32Array, total: number): Float32Array {
  const cdf = new Float32Array(256);
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    cdf[i] = acc / total;
  }
  return cdf;
}

function matchChannel(srcHist: Uint32Array, srcTotal: number, refHist: Uint32Array, refTotal: number): Float32Array {
  const srcCDF = cdfFromHist(srcHist, srcTotal);
  const refCDF = cdfFromHist(refHist, refTotal);
  const lut = new Float32Array(256);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    const target = srcCDF[i];
    while (j < 255 && refCDF[j] < target) j++;
    lut[i] = j;
  }
  return lut;
}

export async function computeReferenceLUTs(sourceBlob: Blob, referenceBlob: Blob): Promise<ReferenceLUTs | null> {
  const [src, ref] = await Promise.all([
    sampleChannels(sourceBlob),
    sampleChannels(referenceBlob),
  ]);
  if (!src || !ref) return null;
  return {
    R: matchChannel(src.R, src.total, ref.R, ref.total),
    G: matchChannel(src.G, src.total, ref.G, ref.total),
    B: matchChannel(src.B, src.total, ref.B, ref.total),
  };
}

/** Compose a reference LUT into a filter LUT at a given 0..1 strength. */
export function composeLUT(filterLUT: Float32Array, refLUT: Float32Array, strength: number): Float32Array {
  if (strength <= 0.001) return filterLUT;
  const out = new Float32Array(256);
  const s = Math.max(0, Math.min(1, strength));
  for (let x = 0; x < 256; x++) {
    const m = refLUT[x];                       // 0..255
    const i0 = Math.floor(m);
    const i1 = Math.min(255, i0 + 1);
    const t  = m - i0;
    const composed = filterLUT[i0] * (1 - t) + filterLUT[i1] * t;
    out[x] = filterLUT[x] * (1 - s) + composed * s;
  }
  return out;
}
