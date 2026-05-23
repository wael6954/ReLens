// ─── Skin smoothing compute pass ────────────────────────────────────────────
// 5×5 bilateral filter, masked by a soft face-region mask. The bilateral
// kernel weights each neighbour by both spatial distance AND luminance
// similarity, so edges (eyes, lips, nostrils, hair line) survive while
// flat skin gets averaged. Outside the mask the pixel is left untouched.

struct SkinParams {
  strength:    f32,   /* 0..1 — slider 0..100 mapped on CPU */
  similarity:  f32,   /* gaussian sigma in luminance space (small = preserve more edges) */
  _pad0:       f32,
  _pad1:       f32,
};

@group(0) @binding(0) var inputTex:  texture_2d<f32>;
@group(0) @binding(1) var samp:      sampler;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var maskTex:   texture_2d<f32>;
@group(0) @binding(4) var<uniform> params: SkinParams;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(outputTex);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let uv = (vec2f(f32(gid.x), f32(gid.y)) + vec2f(0.5)) / vec2f(dim);
  let centre = textureSampleLevel(inputTex, samp, uv, 0.0).rgb;

  // Mask is single-channel r8unorm — sample via .r
  let maskDim = textureDimensions(maskTex);
  let muv     = uv;
  let mask    = textureSampleLevel(maskTex, samp, muv, 0.0).r;
  let effectiveStrength = mask * params.strength;
  if (effectiveStrength < 0.005) {
    textureStore(outputTex, vec2i(i32(gid.x), i32(gid.y)), vec4f(centre, 1.0));
    return;
  }

  let ts        = 1.0 / vec2f(dim);
  let lumC      = luminance(centre);
  let sigmaL    = max(params.similarity, 0.01);
  let invTwoSL  = 1.0 / (2.0 * sigmaL * sigmaL);

  // Spatial gaussian (5x5, sigma ~= 1.4)
  // Precomputed for performance — relative weights of the 25 taps.
  var accum: vec3f = vec3f(0.0);
  var totalW: f32  = 0.0;

  for (var dy: i32 = -2; dy <= 2; dy = dy + 1) {
    for (var dx: i32 = -2; dx <= 2; dx = dx + 1) {
      let d2     = f32(dx * dx + dy * dy);
      let spatW  = exp(-d2 / 8.0);                 // sigma^2 ~= 4
      let nuv    = uv + vec2f(f32(dx), f32(dy)) * ts;
      let n      = textureSampleLevel(inputTex, samp, nuv, 0.0).rgb;
      let lumN   = luminance(n);
      let dl     = lumN - lumC;
      let rangeW = exp(-dl * dl * invTwoSL);
      let w      = spatW * rangeW;
      accum  = accum  + n * w;
      totalW = totalW + w;
    }
  }

  let smoothed = accum / max(totalW, 0.0001);
  let result   = mix(centre, smoothed, effectiveStrength);
  textureStore(outputTex, vec2i(i32(gid.x), i32(gid.y)), vec4f(clamp(result, vec3f(0.0), vec3f(1.0)), 1.0));
}
