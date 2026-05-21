// ─── Shared WGSL utility functions ──────────────────────────────────────────
// Prepended to every compute shader by pipeline.ts before compilation so that
// every filter shares the same colour-space helpers, noise, and interpolation.

const PI:  f32 = 3.14159265358979323846;
const TAU: f32 = 6.28318530717958647692;

fn srgb_to_linear(c: f32) -> f32 {
  if (c <= 0.04045) { return c / 12.92; }
  return pow((c + 0.055) / 1.055, 2.4);
}

fn linear_to_srgb(c: f32) -> f32 {
  if (c <= 0.0031308) { return c * 12.92; }
  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

fn luminance(rgb: vec3f) -> f32 {
  return dot(rgb, vec3f(0.299, 0.587, 0.114));
}

fn rgb_to_hsl(rgb: vec3f) -> vec3f {
  let hi = max(max(rgb.r, rgb.g), rgb.b);
  let lo = min(min(rgb.r, rgb.g), rgb.b);
  let d  = hi - lo;
  let l  = (hi + lo) * 0.5;
  if (d < 0.00001) {
    return vec3f(0.0, 0.0, l);
  }
  let s = select(d / (2.0 - hi - lo), d / (hi + lo), l < 0.5);
  var h: f32;
  if (hi == rgb.r) {
    h = ((rgb.g - rgb.b) / d) + select(0.0, 6.0, rgb.g < rgb.b);
  } else if (hi == rgb.g) {
    h = ((rgb.b - rgb.r) / d) + 2.0;
  } else {
    h = ((rgb.r - rgb.g) / d) + 4.0;
  }
  return vec3f(h / 6.0, s, l);
}

fn _hue_chan(p: f32, q: f32, t_in: f32) -> f32 {
  var t = fract(t_in + 1.0);
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 0.5)       { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}

fn hsl_to_rgb(hsl: vec3f) -> vec3f {
  let h = hsl.x;
  let s = hsl.y;
  let l = hsl.z;
  if (s < 0.00001) { return vec3f(l); }
  let q = select(l + s - l * s, l * (1.0 + s), l < 0.5);
  let p = 2.0 * l - q;
  return vec3f(
    _hue_chan(p, q, h + 1.0 / 3.0),
    _hue_chan(p, q, h),
    _hue_chan(p, q, h - 1.0 / 3.0),
  );
}

// Catmull-Rom cubic interpolation between p1 and p2 with p0, p3 as anchors.
// t in [0, 1].
fn cubic_interp(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
  let t2 = t * t;
  let t3 = t2 * t;
  let a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  let b =        p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
  let c = -0.5 * p0              + 0.5 * p2;
  let d =                  p1;
  return a * t3 + b * t2 + c * t + d;
}

// 1D hash — input float, output uniform in [0, 1].
fn hash(n: f32) -> f32 {
  return fract(sin(n) * 43758.5453123);
}

// 2D hash — input vec2f, output uniform in [0, 1].
fn hash2(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

// Smooth value noise on a 2D position (bilinear interp between corner hashes).
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash2(i);
  let b = hash2(i + vec2f(1.0, 0.0));
  let c = hash2(i + vec2f(0.0, 1.0));
  let d = hash2(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractional Brownian motion — sum of noise octaves with halving amplitude and
// doubling frequency. Returns roughly [0, 1].
fn fbm_noise(p_in: vec2f, octaves: i32) -> f32 {
  var p   = p_in;
  var sum = 0.0;
  var amp = 0.5;
  for (var i: i32 = 0; i < octaves; i = i + 1) {
    sum = sum + vnoise(p) * amp;
    p   = p * 2.03;
    amp = amp * 0.5;
  }
  return sum;
}
