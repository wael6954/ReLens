// ─── Grain compute pass ─────────────────────────────────────────────────────
// Two independent fbm-based grain layers, each with its own intensity, size,
// chroma blend, and color bias. Grain is weighted by sin(luma * PI) so it
// peaks at midtones (where film silver-halide density variance is highest).

struct GrainParams {
  intensity1:   f32,
  size1:        f32,
  chroma1:      f32,
  seed1:        f32,
  color_bias1:  vec3f, _pad0: f32,

  intensity2:   f32,
  size2:        f32,
  chroma2:      f32,
  seed2:        f32,
  color_bias2:  vec3f, _pad1: f32,
};

@group(0) @binding(0) var inputTex:  texture_2d<f32>;
@group(0) @binding(1) var samp:      sampler;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: GrainParams;

fn grain_layer(px: vec2f, sz: f32, ch: f32, sd: f32) -> vec3f {
  let off = vec2f(sd * 7.3, sd * 3.1);
  let p1  = px / max(sz, 0.001) + off;
  let luma = fbm_noise(p1, 3) * 2.0 - 1.0;
  let cr   = fbm_noise(p1 + vec2f(17.3,  5.1), 2) * 2.0 - 1.0;
  let cg   = fbm_noise(p1 + vec2f( 3.7, 43.7), 2) * 2.0 - 1.0;
  let cb   = fbm_noise(p1 + vec2f(71.9, 13.1), 2) * 2.0 - 1.0;
  return mix(vec3f(luma), vec3f(cr, cg, cb), ch);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(outputTex);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let uv  = (vec2f(f32(gid.x), f32(gid.y)) + vec2f(0.5)) / vec2f(dim);
  let px  = vec2f(f32(gid.x), f32(gid.y));
  var c   = textureSampleLevel(inputTex, samp, uv, 0.0).rgb;

  // Midtone-weighted mask: sin(luma * PI) peaks at 0.5
  let lum  = luminance(c);
  let mask = sin(clamp(lum, 0.0, 1.0) * PI);

  // ── Edge-aware modulation ──────────────────────────────────────────────
  // Real silver-halide grain clumps along density boundaries — it's more
  // visible in detailed regions than on smooth gradients. Estimate the
  // local luma gradient with a 4-tap stencil and use it to push grain
  // intensity toward 1.5× on edges and 0.55× on flat areas.
  let ts   = 1.0 / vec2f(dim);
  let lN   = luminance(textureSampleLevel(inputTex, samp, uv + vec2f(0.0,  ts.y), 0.0).rgb);
  let lS   = luminance(textureSampleLevel(inputTex, samp, uv - vec2f(0.0,  ts.y), 0.0).rgb);
  let lE   = luminance(textureSampleLevel(inputTex, samp, uv + vec2f(ts.x, 0.0), 0.0).rgb);
  let lW   = luminance(textureSampleLevel(inputTex, samp, uv - vec2f(ts.x, 0.0), 0.0).rgb);
  let grad = length(vec2f(lE - lW, lN - lS));
  let edgeWeight = 0.55 + 0.95 * smoothstep(0.0, 0.18, grad);

  let m = mask * edgeWeight;

  // Pass 1
  if (params.intensity1 > 0.001) {
    let g = grain_layer(px, params.size1, params.chroma1, params.seed1);
    c = c + g * (vec3f(1.0) + params.color_bias1) * params.intensity1 * m;
  }
  // Pass 2 — independent seed
  if (params.intensity2 > 0.001) {
    let g = grain_layer(px, params.size2, params.chroma2, params.seed2);
    c = c + g * (vec3f(1.0) + params.color_bias2) * params.intensity2 * m;
  }

  textureStore(outputTex, vec2i(i32(gid.x), i32(gid.y)), vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0));
}
