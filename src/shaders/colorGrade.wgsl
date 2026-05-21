// ─── Color Grade compute pass ───────────────────────────────────────────────
// Order of operations (matches the historical CPU pipeline):
//   1. 3x3 color matrix
//   2. RGB additive shift
//   3. Six per-hue rotation bands in HSL
//   4. Split-tone blend (shadow / midtone / highlight zones)

struct HueBand {
  center:  f32,
  width:   f32,
  rot:     f32,   // hue rotation in [0, 1] (1 = 360°)
  sat_mul: f32,
};

struct SplitZone {
  hue:      f32,  // normalized 0..1
  sat:      f32,  // 0..1
  lum_shift: f32, // -1..1
  _pad:     f32,
};

struct GradeParams {
  color_matrix: mat3x3f,
  rgb_shift:    vec3f,    _pad0: f32,
  hue_bands:    array<HueBand, 6>,
  split_shadow: SplitZone,
  split_mid:    SplitZone,
  split_high:   SplitZone,
  split_balance: f32,
  split_str:     f32,
  _pad1:         vec2f,
};

@group(0) @binding(0) var inputTex:  texture_2d<f32>;
@group(0) @binding(1) var samp:      sampler;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: GradeParams;

// Smooth band weight around `center` with half-width `halfW`. Handles 0/1 wrap.
fn hue_band_blend(hue: f32, center: f32, half_w: f32) -> f32 {
  if (half_w < 0.00001) { return 0.0; }
  let d = abs(((hue - center + 0.5) - floor(hue - center + 0.5)) - 0.5);
  let t = clamp(1.0 - d / half_w, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(outputTex);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let uv  = (vec2f(f32(gid.x), f32(gid.y)) + vec2f(0.5)) / vec2f(dim);
  var c   = textureSampleLevel(inputTex, samp, uv, 0.0).rgb;

  // 1. 3x3 colour matrix
  c = clamp(params.color_matrix * c, vec3f(0.0), vec3f(1.0));

  // 2. RGB additive shift
  c = clamp(c + params.rgb_shift, vec3f(0.0), vec3f(1.0));

  // 3. Per-hue rotation in HSL
  var hsl = rgb_to_hsl(c);
  var rot:  f32 = 0.0;
  var dsat: f32 = 0.0;
  for (var i: i32 = 0; i < 6; i = i + 1) {
    let band = params.hue_bands[i];
    let w    = hue_band_blend(hsl.x, band.center, band.width);
    rot      = rot  + band.rot * w;
    dsat     = dsat + (band.sat_mul - 1.0) * w;
  }
  hsl.x = fract(hsl.x + rot + 1.0);
  hsl.y = clamp(hsl.y * (1.0 + dsat), 0.0, 1.0);
  c     = hsl_to_rgb(hsl);

  // 4. Split-tone color grading
  if (params.split_str > 0.001) {
    var stHsl = rgb_to_hsl(c);
    let lm    = stHsl.z;
    let sB    = clamp(0.35 + params.split_balance * 0.10, 0.05, 0.95);
    let hB    = clamp(0.65 + params.split_balance * 0.10, 0.05, 0.95);
    var sw    = max(0.0, 1.0 - lm / sB);  sw = sw * sw;
    var hw    = max(0.0, (lm - hB) / max(1.0 - hB, 0.001));  hw = hw * hw;
    let mw    = max(0.0, 1.0 - sw - hw);
    let wS = sw * params.split_shadow.sat;
    let wM = mw * params.split_mid.sat;
    let wH = hw * params.split_high.sat;
    let wT = wS + wM + wH;
    if (wT > 0.001) {
      let tHue = (params.split_shadow.hue * wS
                + params.split_mid.hue    * wM
                + params.split_high.hue   * wH) / wT;
      var dh = tHue - stHsl.x;
      if      (dh >  0.5) { dh = dh - 1.0; }
      else if (dh < -0.5) { dh = dh + 1.0; }
      stHsl.x = fract(stHsl.x + dh * wT * params.split_str * 0.65 + 1.0);
      stHsl.y = clamp(stHsl.y + wT * 0.18 * params.split_str, 0.0, 1.0);
    }
    stHsl.z = clamp(stHsl.z + (sw * params.split_shadow.lum_shift
                             + mw * params.split_mid.lum_shift
                             + hw * params.split_high.lum_shift) * 0.15 * params.split_str,
                    0.0, 1.0);
    c = hsl_to_rgb(stHsl);
  }

  textureStore(outputTex, vec2i(i32(gid.x), i32(gid.y)), vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0));
}
