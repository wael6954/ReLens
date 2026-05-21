// ─── Tone Curve compute pass ────────────────────────────────────────────────
// Applies the three per-channel LUTs (composite + R/G/B baked in by the CPU),
// shadow lift, global saturation, and the six user-facing edit-tab knobs:
//   exposure, contrast, highlights, shadows, sharpness, edit-tint.
//
// All edit-tab values are normalised on the CPU side:
//   exposure:   multiplicative (1.0 = no change)
//   contrast:   -1..1 (S-curve around 0.5)
//   highlights: -1..1
//   shadows:    -1..1
//   sharpness:   0..1 (unsharp-mask amount)
//   edit_tint:  -1..1 (green/+, magenta/-)

struct ToneParams {
  shadow_lift: f32,
  saturation:  f32,
  exposure:    f32,
  contrast:    f32,
  highlights:  f32,
  shadows:     f32,
  sharpness:   f32,
  edit_tint:   f32,
};

@group(0) @binding(0) var inputTex:  texture_2d<f32>;
@group(0) @binding(1) var samp:      sampler;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<storage, read> lutR: array<f32, 256>;
@group(0) @binding(4) var<storage, read> lutG: array<f32, 256>;
@group(0) @binding(5) var<storage, read> lutB: array<f32, 256>;
@group(0) @binding(6) var<uniform> params: ToneParams;

fn lut_sample(lut: ptr<storage, array<f32, 256>, read>, x: f32) -> f32 {
  let xc = clamp(x, 0.0, 1.0) * 255.0;
  let i0 = i32(floor(xc));
  let i1 = min(i0 + 1, 255);
  let t  = xc - f32(i0);
  return mix((*lut)[i0], (*lut)[i1], t);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(outputTex);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let uv  = (vec2f(f32(gid.x), f32(gid.y)) + vec2f(0.5)) / vec2f(dim);
  var c   = textureSampleLevel(inputTex, samp, uv, 0.0).rgb;

  // Sharpness — unsharp mask via Laplacian of 4 neighbours
  if (params.sharpness > 0.001) {
    let ts = 1.0 / vec2f(dim);
    let n  = textureSampleLevel(inputTex, samp, uv + vec2f(0.0, ts.y), 0.0).rgb;
    let s  = textureSampleLevel(inputTex, samp, uv - vec2f(0.0, ts.y), 0.0).rgb;
    let e  = textureSampleLevel(inputTex, samp, uv + vec2f(ts.x, 0.0), 0.0).rgb;
    let w  = textureSampleLevel(inputTex, samp, uv - vec2f(ts.x, 0.0), 0.0).rgb;
    let lap = c - (n + s + e + w) * 0.25;
    c = clamp(c + params.sharpness * lap * 1.8, vec3f(0.0), vec3f(1.0));
  }

  // Shadow lift — soft amount on dark pixels
  let shadow = (vec3f(1.0) - c) * (vec3f(1.0) - c);
  c = c + params.shadow_lift * shadow * 0.157;
  c = clamp(c, vec3f(0.0), vec3f(1.0));

  // Per-channel LUT (composite + per-channel baked together)
  let cR = lut_sample(&lutR, c.r);
  let cG = lut_sample(&lutG, c.g);
  let cB = lut_sample(&lutB, c.b);
  c = vec3f(cR, cG, cB);

  // Exposure (linear multiplier)
  if (abs(params.exposure - 1.0) > 0.001) {
    c = clamp(c * params.exposure, vec3f(0.0), vec3f(1.0));
  }

  // Contrast — S-curve centred at 0.5
  if (abs(params.contrast) > 0.001) {
    c = clamp(mix(vec3f(0.5), c, 1.0 + params.contrast), vec3f(0.0), vec3f(1.0));
  }

  // Highlights — selective lift/crush of bright pixels
  if (abs(params.highlights) > 0.001) {
    let hl    = luminance(c);
    let hmask = smoothstep(0.5, 1.0, hl);
    c = clamp(mix(c, c * (1.0 + params.highlights * 0.6), hmask), vec3f(0.0), vec3f(1.0));
  }

  // Shadows — selective lift/crush of dark pixels
  if (abs(params.shadows) > 0.001) {
    let sl    = luminance(c);
    let smask = 1.0 - smoothstep(0.0, 0.5, sl);
    c = clamp(mix(c, c + vec3f(params.shadows * 0.35), smask), vec3f(0.0), vec3f(1.0));
  }

  // Edit Tint — green (+) / magenta (-)
  if (abs(params.edit_tint) > 0.001) {
    c.g = clamp(c.g + params.edit_tint * 0.05, 0.0, 1.0);
    c.r = clamp(c.r - params.edit_tint * 0.02, 0.0, 1.0);
    c.b = clamp(c.b - params.edit_tint * 0.02, 0.0, 1.0);
  }

  // Global saturation (combines preset + slider)
  let lum = luminance(c);
  c = mix(vec3f(lum), c, params.saturation);

  textureStore(outputTex, vec2i(i32(gid.x), i32(gid.y)), vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0));
}
