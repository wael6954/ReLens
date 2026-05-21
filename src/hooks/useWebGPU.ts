import { useEffect, useState, type RefObject } from 'react';

export interface UseWebGPUResult {
  device:      GPUDevice | null;
  context:     GPUCanvasContext | null;
  format:      GPUTextureFormat | null;
  isSupported: boolean;
  error:       string | null;
}

/**
 * Initializes a WebGPU device + canvas context. Returns nullable handles plus
 * `isSupported` and an `error` string. The device is automatically destroyed
 * on unmount.
 */
export function useWebGPU(
  canvasRef: RefObject<HTMLCanvasElement | null>,
): UseWebGPUResult {
  const [state, setState] = useState<UseWebGPUResult>({
    device:      null,
    context:     null,
    format:      null,
    isSupported: true,
    error:       null,
  });

  useEffect(() => {
    let cancelled  = false;
    let localDevice: GPUDevice | null = null;

    async function init() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (typeof navigator === 'undefined' || !navigator.gpu) {
        if (!cancelled) {
          setState({
            device: null, context: null, format: null,
            isSupported: false,
            error: 'WebGPU not supported in this environment',
          });
        }
        return;
      }

      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          if (!cancelled) {
            setState({
              device: null, context: null, format: null,
              isSupported: false,
              error: 'WebGPU not supported in this environment',
            });
          }
          return;
        }

        const device = await adapter.requestDevice();
        if (cancelled) { device.destroy(); return; }
        localDevice  = device;

        const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
        if (!context) {
          device.destroy();
          if (!cancelled) {
            setState({
              device: null, context: null, format: null,
              isSupported: false,
              error: 'WebGPU not supported in this environment',
            });
          }
          return;
        }

        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
          device,
          format,
          alphaMode: 'premultiplied',
        });

        // Surface uncaptured device-lost errors to the consumer
        device.addEventListener('uncapturederror', ((event: Event) => {
          const e = event as GPUUncapturedErrorEvent;
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              error: prev.error ?? `WebGPU error: ${e.error.message}`,
            }));
          }
        }) as EventListener);

        if (!cancelled) {
          setState({ device, context, format, isSupported: true, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            device: null, context: null, format: null,
            isSupported: false,
            error: `WebGPU not supported in this environment`,
          });
        }
        if (localDevice) localDevice.destroy();
        // eslint-disable-next-line no-console
        console.error('[useWebGPU] init failed', err);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (localDevice) {
        try { localDevice.destroy(); } catch { /* noop */ }
      }
    };
  }, [canvasRef]);

  return state;
}
