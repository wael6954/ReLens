/**
 * Draw an LED-style date stamp into the bottom-right corner of a 2D
 * canvas context. Format: `'YY MM DD`. Style mimics the orange 7-segment
 * displays found on 80s/90s point-and-shoot film cameras.
 *
 * `sizeFactor` multiplies the base font height (which is 4.2% of width).
 * The text is rendered twice — once with an outer warm halo, then a
 * brighter inner core — so it reads as a hot LED through the film base.
 */
export function drawDateStamp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sizeFactor: number,
): void {
  const now    = new Date();
  const mm     = String(now.getMonth() + 1).padStart(2, '0');
  const dd     = String(now.getDate()).padStart(2, '0');
  const yy     = String(now.getFullYear()).slice(-2);
  const stamp  = `'${yy} ${mm} ${dd}`;
  const px     = Math.max(8, Math.round(width * 0.042 * sizeFactor));
  const margin = Math.round(width * 0.028);

  ctx.save();
  ctx.font         = `${px}px "DotGothic16", "VT323", "Courier New", monospace`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign    = 'right';

  // Outer halo
  ctx.shadowColor = 'rgba(255, 95, 25, 0.85)';
  ctx.shadowBlur  = px * 0.55;
  ctx.fillStyle   = '#ff5d1f';
  ctx.fillText(stamp, width - margin, height - margin);

  // Inner LED core
  ctx.shadowColor = 'rgba(255, 160, 60, 0.9)';
  ctx.shadowBlur  = px * 0.25;
  ctx.fillStyle   = '#ffb04a';
  ctx.fillText(stamp, width - margin, height - margin);
  ctx.restore();
}
