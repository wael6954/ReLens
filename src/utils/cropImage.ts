/* ─── Apply crop + rotation to a Blob, return a new JPEG/PNG Blob ────────
   Rotation is applied around the centre of the cropped region. The source
   pixels are sampled from the rotated source frame so the crop box is
   defined in *post-rotation* normalized coordinates (matches what the user
   sees in the overlay).
*/

export interface CropTransform {
  box:      { x: number; y: number; w: number; h: number };   // normalized 0..1
  rotation: number;                                            // degrees
}

export async function applyCropToBlob(
  blob:      Blob,
  transform: CropTransform,
  mime:      string  = 'image/jpeg',
  quality:   number  = 0.95,
): Promise<{ blob: Blob; width: number; height: number }> {
  const src = await createImageBitmap(blob);
  const sw = src.width, sh = src.height;
  const rad = (transform.rotation * Math.PI) / 180;

  // Rotate the source onto an oversized canvas, then crop from that.
  // Compute the rotated bounding box.
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rW  = Math.ceil(sw * cos + sh * sin);
  const rH  = Math.ceil(sw * sin + sh * cos);

  const rotated = document.createElement('canvas');
  rotated.width  = rW;
  rotated.height = rH;
  const rctx = rotated.getContext('2d');
  if (!rctx) throw new Error('canvas 2d unavailable');
  rctx.translate(rW / 2, rH / 2);
  rctx.rotate(rad);
  rctx.drawImage(src, -sw / 2, -sh / 2);
  src.close?.();

  // Now apply the crop box. Box is normalized over the rotated frame.
  const cx = Math.round(transform.box.x * rW);
  const cy = Math.round(transform.box.y * rH);
  const cw = Math.max(1, Math.round(transform.box.w * rW));
  const ch = Math.max(1, Math.round(transform.box.h * rH));

  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('canvas 2d unavailable');
  octx.drawImage(rotated, cx, cy, cw, ch, 0, 0, cw, ch);

  const outBlob = await new Promise<Blob>((res, rej) =>
    out.toBlob((b) => (b ? res(b) : rej(new Error('toBlob null'))),
               mime, mime === 'image/jpeg' ? quality : undefined));

  return { blob: outBlob, width: cw, height: ch };
}
