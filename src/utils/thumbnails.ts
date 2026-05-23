import type { FilterPreset, SliderOverrides } from '../types/filter';
import { renderFilter, type FilterPipeline, type ReferenceLUTOption, type SkinSmoothOption } from './pipeline';

/**
 * Run the full filter pipeline on `sourceTexture` and return the result as
 * ImageData. Accepts an optional AbortSignal — if aborted the function
 * cleans up any allocated GPU resources and throws `AbortError`.
 */
export async function renderFilterToImageData(
  pipeline:      FilterPipeline,
  device:        GPUDevice,
  sourceTexture: GPUTexture,
  preset:        FilterPreset,
  overrides:     SliderOverrides = {},
  signal?:       AbortSignal,
  referenceLUT?: ReferenceLUTOption | null,
  skinSmooth?:   SkinSmoothOption  | null,
): Promise<ImageData> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const output = await renderFilter(pipeline, device, sourceTexture, preset, overrides, referenceLUT, skinSmooth);
  if (signal?.aborted) { output.destroy(); throw new DOMException('Aborted', 'AbortError'); }

  const width  = output.width;
  const height = output.height;

  const bytesPerPixel = 4;
  const unpaddedRow   = width * bytesPerPixel;
  const paddedRow     = Math.ceil(unpaddedRow / 256) * 256;

  const buf = device.createBuffer({
    label: 'thumb.readback',
    size:  paddedRow * height,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const enc = device.createCommandEncoder({ label: 'thumb.encoder' });
  enc.copyTextureToBuffer(
    { texture: output },
    { buffer: buf, bytesPerRow: paddedRow, rowsPerImage: height },
    { width, height, depthOrArrayLayers: 1 },
  );
  device.queue.submit([enc.finish()]);

  await buf.mapAsync(GPUMapMode.READ);
  if (signal?.aborted) {
    try { buf.unmap(); } catch { /* */ }
    buf.destroy(); output.destroy();
    throw new DOMException('Aborted', 'AbortError');
  }

  const padded = new Uint8Array(buf.getMappedRange().slice(0));
  buf.unmap();
  buf.destroy();
  output.destroy();

  const flat = new Uint8ClampedArray(unpaddedRow * height);
  for (let y = 0; y < height; y++) {
    flat.set(padded.subarray(y * paddedRow, y * paddedRow + unpaddedRow), y * unpaddedRow);
  }
  return new ImageData(flat, width, height);
}
