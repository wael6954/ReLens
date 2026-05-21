import { useEffect, useRef } from 'react';

/**
 * Fullscreen animated film-grain background. Pure 2D canvas — renders a
 * 256×256 noise tile every 50ms and stretches it across the viewport. Sits
 * behind everything (z-0, pointer-events-none) at 4% opacity, just enough
 * to feel like emulsion sitting over the dark UI.
 */
export default function GrainBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Low-res offscreen tile — generating 256×256 random pixels per frame is
    // ~65k operations, cheap. Then drawImage stretches with nearest-neighbour.
    const TILE = 256;
    const off  = document.createElement('canvas');
    off.width  = TILE;
    off.height = TILE;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    const imageData = offCtx.createImageData(TILE, TILE);
    const data      = imageData.data;

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
    }
    resize();
    window.addEventListener('resize', resize);

    function tick() {
      // Greyscale noise — R=G=B per pixel, alpha 255
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        data[i]     = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      if (!offCtx) return;
      offCtx.putImageData(imageData, 0, 0);
      if (!ctx || !canvas) return;
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    }

    tick();
    const interval = window.setInterval(tick, 50);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
      style={{ opacity: 0.04 }}
    />
  );
}
