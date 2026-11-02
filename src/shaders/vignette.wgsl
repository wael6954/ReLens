// ─── Vignette + Halation compute pass ───────────────────────────────────────
// Combined pass — radial vignette darkening + halation bloom around bright
// highlights. Halation uses an 8-tap spiral neighbourhood sample as a cheap
// single-pass approximation of a Gaussian blur on the brightness mask.

struct VigParams {
  strength:       f32,
  power:          f32,
  aspect:         f32,
  halo_threshold: f32,
  halo_tint:      vec3f,
  halo_strength:  f32,
  blur_radius:    f32,
};

@group(0) @binding(0) var inputTex:  texture_2d<f32>;
@group(0) @binding(1) var samp:      sampler;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: VigParams;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(outputTex);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let dims = vec2f(dim);
  let uv   = (vec2f(f32(gid.x), f32(gid.y)) + vec2f(0.5)) / dims;
  var c    = textureSampleLevel(inputTex, samp, uv, 0.0).rgb;

  // ── Vignette ──────────────────────────────────────────────────────────────
  if (params.strength > 0.001) {
    let vc   = (uv - vec2f(0.5)) * vec2f(params.aspect, 1.0);
    let maxD = sqrt(0.25 * params.aspect * params.aspect + 0.25);
    let dist = length(vc) / maxD;
    let vig  = 1.0 - params.strength * pow(clamp(dist, 0.0, 1.0), params.power);
    c = c * clamp(vig, 0.0, 1.0);
  }

  // ── Halation — 8-tap spiral sample of bright-mask, tinted and added ──────
  if (params.halo_strength > 0.001) {
    let r_px = params.blur_radius;
    let texel = vec2f(1.0) / dims;
    var hi_sum = 0.0;
    var samples = 9.0;          // 8 spiral taps + centre
    // Centre tap
    let lc = luminance(c);
    hi_sum = hi_sum + max(0.0, lc - params.halo_threshold);
    // 8-tap spiral
    for (var i: i32 = 0; i < 8; i = i + 1) {
      let ang = f32(i) * TAU / 8.0;
      let off = vec2f(cos(ang), sin(ang)) * r_px * texel;
      let s   = textureSampleLevel(inputTex, samp, uv + off, 0.0).rgb;
      hi_sum  = hi_sum + max(0.0, luminance(s) - params.halo_threshold);
    }
    let hi_avg = hi_sum / samples;
    let bloom  = params.halo_tint * (hi_avg * hi_avg) * params.halo_strength * 4.0;
    c = c + bloom;
  }

  textureStore(outputTex, vec2i(i32(gid.x), i32(gid.y)), vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0));
}
