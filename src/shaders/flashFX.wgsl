// ─── Flash FX compute pass ──────────────────────────────────────────────────
// All flash-specific effects in one pass:
//   • ISL falloff      — radial brightness based on distance from flash centre
//   • Shadow color cast — push dark pixels toward a target colour
//   • Ambient light reconstruction — push dark areas toward an ambient colour
//   • Chromatic aberration — per-channel offset sample (horizontal or radial)
//   • Hard highlight clipping — soft rolloff lerped with hard clamp

struct FlashParams {
  isl_center:        vec2f,
  isl_falloff_scale: f32,
  isl_falloff_power: f32,
  isl_dark_floor:    f32,
  isl_bright_ceiling: f32,
  isl_strength:      f32,
  _pad0:             f32,

  cast_color:        vec3f,
  cast_strength:     f32,

  ambient_color:     vec3f,
  ambient_strength:  f32,

  ambient_threshold: f32,
  ca_strength:       f32,
  ca_radial:         u32,

  clip_threshold:    f32,
  clip_hardness:     f32,
};

@group(0) @binding(0) var inputTex:  texture_2d<f32>;
@group(0) @binding(1) var samp:      sampler;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: FlashParams;

fn soft_clip(x: f32, th: f32) -> f32 {
  if (x <= th) { return x; }
  let a = max(1.0 - th, 0.001);
  return th + a * (1.0 - exp(-(x - th) / a));
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(outputTex);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let dims = vec2f(dim);
  let uv   = (vec2f(f32(gid.x), f32(gid.y)) + vec2f(0.5)) / dims;
  var c: vec3f;

  // ── Chromatic aberration sample ────────────────────────────────────────────
  if (params.ca_strength > 0.001) {
    let ca_px = params.ca_strength * 3.0;
    var dir: vec2f = vec2f(1.0, 0.0);
    if (params.ca_radial != 0u) {
      let fc = uv - vec2f(0.5);
      let lc = length(fc);
      if (lc > 0.0001) { dir = fc / lc; }
    }
    let ofs = vec2f(dir.x * ca_px / dims.x, dir.y * ca_px / dims.y);
    let r = textureSampleLevel(inputTex, samp, uv + ofs, 0.0).r;
    let g = textureSampleLevel(inputTex, samp, uv,         0.0).g;
    let b = textureSampleLevel(inputTex, samp, uv - ofs, 0.0).b;
    c = vec3f(r, g, b);
  } else {
    c = textureSampleLevel(inputTex, samp, uv, 0.0).rgb;
  }

  // ── ISL spatial falloff ───────────────────────────────────────────────────
  if (params.isl_strength > 0.001) {
    let fd   = uv - params.isl_center;
    let dist = length(fd);
    let fi   = clamp(1.0 / max(pow(dist * params.isl_falloff_scale, params.isl_falloff_power), 0.05),
                     0.0, 2.5);
    let mult = mix(params.isl_dark_floor, params.isl_bright_ceiling, fi);
    c = c * mix(1.0, mult, params.isl_strength);
  }

  // ── Shadow colour cast — darker pixels lifted toward cast_color ──────────
  if (params.cast_strength > 0.001) {
    let lm = luminance(c);
    let am = max(0.0, (0.25 - lm) / 0.25) * params.cast_strength;
    c = mix(c, c * params.cast_color, clamp(am, 0.0, 1.0));
  }

  // ── Ambient light reconstruction — sodium / tungsten ambient fill ───────
  if (params.ambient_strength > 0.001 && params.ambient_threshold > 0.001) {
    let lm = luminance(c);
    if (lm < params.ambient_threshold) {
      let a = (params.ambient_threshold - lm) / params.ambient_threshold * params.ambient_strength;
      c = mix(c, c * params.ambient_color, clamp(a, 0.0, 1.0));
    }
  }

  // ── Hard highlight clipping (lerp soft rolloff ↔ hard clamp) ────────────
  if (params.clip_threshold < 0.999) {
    let soft = vec3f(soft_clip(c.r, params.clip_threshold),
                     soft_clip(c.g, params.clip_threshold),
                     soft_clip(c.b, params.clip_threshold));
    let hard = clamp(c, vec3f(0.0), vec3f(1.0));
    c = mix(soft, hard, clamp(params.clip_hardness, 0.0, 1.0));
  }

  textureStore(outputTex, vec2i(i32(gid.x), i32(gid.y)), vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0));
}
