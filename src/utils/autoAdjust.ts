/* ─── Auto-adjust: histogram analysis → slider values ───────────────────────
   Decodes the source blob at a small scale, builds a luminance histogram,
   and derives exposure / contrast / highlights / shadows values to push the
   black point near 0, the white point near 1, and the median near 0.5.
*/

export interface AutoResult {
  exposure:   number;   // slider scale (-50..+50)
  contrast:   number;   // slider scale (-50..+50)
  highlights: number;   // slider scale (-50..+50)
  shadows:    number;   // slider scale (-50..+50)
}

/** Sample at most ~64×64 of the source to compute the histogram. */
async function sampleLuminance(blob: Blob): Promise<Uint8Array | null> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { resizeWidth: 64, resizeHeight: 64, resizeQuality: 'low' });
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
  const out = new Uint8Array(c.width * c.height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    out[j] = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  }
  return out;
}

function percentile(hist: Uint32Array, total: number, p: number): number {
  const target = total * p;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return 255;
}

export async function computeAutoAdjust(blob: Blob): Promise<AutoResult | null> {
  const lum = await sampleLuminance(blob);
  if (!lum) return null;

  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) hist[lum[i]]++;

  const total = lum.length;
  const black  = percentile(hist, total, 0.01);    // 1st percentile
  const white  = percentile(hist, total, 0.99);    // 99th percentile
  const median = percentile(hist, total, 0.50);

  // Convert to 0..1
  const b = black  / 255;
  const w = white  / 255;
  const m = median / 255;

  // Exposure: nudge median toward 0.5. Shader uses `exposure` as a multiplier
  // (1.0 = no change) and the slider 0..100 maps roughly to ×0.5..×2.0 in
  // writeToneParams. We compute the desired multiplier then back-solve.
  // Shader: exposure multiplier = 2^(slider / 50). Target median ≈ 0.5.
  const targetMul = m > 0.02 ? Math.min(2.0, Math.max(0.5, 0.5 / m)) : 1.0;
  const expSlider = Math.round(50 * Math.log2(targetMul));

  // Contrast: tonal range below ~0.85 means flat → push contrast up.
  const range    = Math.max(0.05, w - b);
  const contrast = Math.round(Math.max(-30, Math.min(40, (0.85 - range) * 80)));

  // Highlights: if white point clips above 0.95, pull highlights down.
  // If it's well under (<0.85), open them up.
  const highlights = Math.round(w > 0.95 ? -((w - 0.95) * 600)
                              : w < 0.80 ? ((0.80 - w) * 200)
                              : 0);

  // Shadows: if blacks are crushed (b < 0.04), lift; if floating (>0.10), drop.
  const shadows = Math.round(b < 0.04 ? ((0.04 - b) * 500)
                            : b > 0.10 ? -((b - 0.10) * 200)
                            : 0);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    exposure:   clamp(expSlider, -50, 50),
    contrast:   clamp(contrast,  -50, 50),
    highlights: clamp(highlights,-50, 50),
    shadows:    clamp(shadows,   -50, 50),
  };
}
