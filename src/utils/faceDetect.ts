/* ─── Face detection via MediaPipe Tasks Vision ───────────────────────────
   Detector is initialised lazily on first use. The .task model is fetched
   from Google's CDN on first call and cached by the browser thereafter, so
   subsequent runs are offline-friendly.

   To bundle the model fully offline, drop `blaze_face_short_range.task` into
   `public/models/` and set MODEL_URL to '/models/blaze_face_short_range.task'.
*/

import { FaceDetector, FilesetResolver, type Detection } from '@mediapipe/tasks-vision';

// Pinned to the installed @mediapipe/tasks-vision version so jsdelivr resolves
// the correct /wasm subpath. The model file uses the `.tflite` extension —
// the BlazeFace short-range model published by Google.
const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export interface FaceBox {
  x:      number;   // normalized 0..1
  y:      number;
  width:  number;
  height: number;
  score:  number;
}

let detectorPromise: Promise<FaceDetector> | null = null;
let detectorDelegate: 'GPU' | 'CPU' = 'GPU';

async function tryCreate(delegate: 'GPU' | 'CPU'): Promise<FaceDetector> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  return FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'IMAGE',
    minDetectionConfidence: 0.5,
  });
}

async function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const d = await tryCreate('GPU');
        detectorDelegate = 'GPU';
        return d;
      } catch (gpuErr) {
        // eslint-disable-next-line no-console
        console.warn('[faceDetect] GPU delegate failed, falling back to CPU:', gpuErr);
        const d = await tryCreate('CPU');
        detectorDelegate = 'CPU';
        return d;
      }
    })().catch((err) => {
      detectorPromise = null;
      // eslint-disable-next-line no-console
      console.error('[faceDetect] detector init failed:', err);
      throw err;
    });
  }
  return detectorPromise;
}

export function getDetectorDelegate(): 'GPU' | 'CPU' | 'unloaded' {
  return detectorPromise ? detectorDelegate : 'unloaded';
}

export async function detectFaces(blob: Blob): Promise<FaceBox[]> {
  let bmp: ImageBitmap;
  try {
    // Cap input at 1024px — detector accuracy is fine, and smaller is faster.
    bmp = await createImageBitmap(blob, { resizeWidth: 1024, resizeQuality: 'medium' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[faceDetect] createImageBitmap failed:', err);
    return [];
  }

  let detector: FaceDetector;
  try {
    detector = await getDetector();
  } catch {
    bmp.close?.();
    throw new Error('Face detector failed to initialise — check the network tab for the MediaPipe WASM/model fetch.');
  }

  const result = detector.detect(bmp);
  const w = bmp.width, h = bmp.height;
  bmp.close?.();

  // eslint-disable-next-line no-console
  console.log(`[faceDetect] detector=${detectorDelegate} detections=${result.detections?.length ?? 0}`);

  return (result.detections ?? [])
    .map((d: Detection): FaceBox | null => {
      const bb = d.boundingBox;
      const score = d.categories?.[0]?.score ?? 1;
      if (!bb) return null;
      return {
        x:      bb.originX / w,
        y:      bb.originY / h,
        width:  bb.width   / w,
        height: bb.height  / h,
        score,
      };
    })
    .filter((f): f is FaceBox => f !== null && f.score >= 0.5);
}

/** Build a soft elliptical mask from face boxes. Returns a w×h R8 array
 *  with 0..255 values, ready to upload as an r8unorm texture. */
export function buildFaceMask(faces: FaceBox[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (faces.length === 0) return mask;

  for (const f of faces) {
    // Expand the box ~15% so the mask covers cheeks/jaw, not just the
    // tight detector rectangle.
    const expand = 0.15;
    const cx = (f.x + f.width  / 2) * width;
    const cy = (f.y + f.height / 2) * height;
    const rx = (f.width  / 2) * (1 + expand) * width;
    const ry = (f.height / 2) * (1 + 2 * expand) * height;   // slightly taller

    const minX = Math.max(0, Math.floor(cx - rx));
    const maxX = Math.min(width  - 1, Math.ceil (cx + rx));
    const minY = Math.max(0, Math.floor(cy - ry));
    const maxY = Math.min(height - 1, Math.ceil (cy + ry));

    for (let y = minY; y <= maxY; y++) {
      const dy = (y - cy) / ry;
      for (let x = minX; x <= maxX; x++) {
        const dx = (x - cx) / rx;
        const d  = dx * dx + dy * dy;       // 0 at centre, 1 at ellipse edge
        if (d > 1.0) continue;
        const t  = 1.0 - d;
        const fall = t * t * (3 - 2 * t);   // smoothstep
        const v = Math.min(255, Math.round(fall * 255));
        const i = y * width + x;
        if (v > mask[i]) mask[i] = v;       // union of overlapping faces
      }
    }
  }
  return mask;
}
