/* ─── Configurable date stamp ─────────────────────────────────────────────
   Renders a date stamp into the corner of a 2D canvas, with user-facing
   choices for source date, format, color, font, and position. The visual
   style is preserved (warm halo + bright core) so it still reads as a
   burned-in display on top of the photo.
*/

export type DateStampPosition = 'br' | 'bl' | 'tr' | 'tl';

export interface DateStampColor {
  id:     string;
  label:  string;
  halo:   string;
  core:   string;
  bg:     string;       // small swatch fill for the UI
}

export const DATE_STAMP_COLORS: DateStampColor[] = [
  { id: 'orange', label: 'Orange', halo: '#ff5d1f', core: '#ffb04a', bg: '#ff8030' },
  { id: 'red',    label: 'Red',    halo: '#e03030', core: '#ff8080', bg: '#e04040' },
  { id: 'amber',  label: 'Amber',  halo: '#e6a012', core: '#ffd060', bg: '#e6a830' },
  { id: 'green',  label: 'Green',  halo: '#22b048', core: '#7df090', bg: '#28c050' },
  { id: 'yellow', label: 'Yellow', halo: '#e8c020', core: '#fff080', bg: '#e8c830' },
  { id: 'white',  label: 'White',  halo: '#ffffff', core: '#ffffff', bg: '#f0f0f0' },
];

export interface DateStampFont {
  id:    string;
  label: string;
  css:   string;
}

export const DATE_STAMP_FONTS: DateStampFont[] = [
  { id: 'led',       label: 'LED',        css: '"DotGothic16", "VT323", "Courier New", monospace' },
  { id: 'vt',        label: 'Terminal',   css: '"VT323", "DotGothic16", monospace' },
  { id: 'pixel',     label: '8-bit',      css: '"Press Start 2P", "DotGothic16", monospace' },
  { id: 'typewriter',label: 'Typewriter', css: '"Courier New", "Courier", monospace' },
];

export interface DateStampFormat {
  id:    string;
  label: string;
  fn:    (d: Date) => string;
}

const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const pad2 = (n: number) => String(n).padStart(2, '0');

export const DATE_STAMP_FORMATS: DateStampFormat[] = [
  { id: 'yymmdd-tick',   label: "'YY MM DD",       fn: (d) => `'${String(d.getFullYear()).slice(-2)} ${pad2(d.getMonth() + 1)} ${pad2(d.getDate())}` },
  { id: 'yyyy-mm-dd',    label: 'YYYY-MM-DD',      fn: (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` },
  { id: 'yy-mm-dd',      label: 'YY/MM/DD',        fn: (d) => `${String(d.getFullYear()).slice(-2)}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}` },
  { id: 'mm-dd-yyyy',    label: 'MM/DD/YYYY',      fn: (d) => `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}` },
  { id: 'dd-mm-yyyy',    label: 'DD/MM/YYYY',      fn: (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` },
  { id: 'dd-mon-yyyy',   label: 'DD MON YYYY',     fn: (d) => `${pad2(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` },
  { id: 'yyyy-dot',      label: 'YYYY.MM.DD',      fn: (d) => `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}` },
  { id: 'dt',            label: "'YY MM DD HH:MM", fn: (d) => `'${String(d.getFullYear()).slice(-2)} ${pad2(d.getMonth() + 1)} ${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` },
];

export interface DateStampConfig {
  date:       Date;
  formatId:   string;
  colorId:    string;
  fontId:     string;
  position:   DateStampPosition;
  sizeFactor: number;
}

function lookup<T extends { id: string }>(arr: T[], id: string, fallback: T): T {
  return arr.find((x) => x.id === id) ?? fallback;
}

export function formatStamp(date: Date, formatId: string): string {
  const f = lookup(DATE_STAMP_FORMATS, formatId, DATE_STAMP_FORMATS[0]);
  return f.fn(date);
}

export function drawDateStamp(
  ctx:    CanvasRenderingContext2D,
  width:  number,
  height: number,
  config: DateStampConfig,
): void {
  const fmt   = lookup(DATE_STAMP_FORMATS, config.formatId, DATE_STAMP_FORMATS[0]);
  const color = lookup(DATE_STAMP_COLORS,  config.colorId,  DATE_STAMP_COLORS[0]);
  const font  = lookup(DATE_STAMP_FONTS,   config.fontId,   DATE_STAMP_FONTS[0]);

  const stamp  = fmt.fn(config.date);
  // 8-bit Press-Start font is chunkier per glyph — scale a bit down so it fits the corner.
  const base   = font.id === 'pixel' ? 0.028 : 0.042;
  const px     = Math.max(8, Math.round(width * base * config.sizeFactor));
  const margin = Math.round(width * 0.028);

  ctx.save();
  ctx.font         = `${px}px ${font.css}`;
  ctx.textBaseline = config.position === 'tr' || config.position === 'tl' ? 'top' : 'alphabetic';
  ctx.textAlign    = config.position === 'br' || config.position === 'tr' ? 'right' : 'left';

  const x = config.position === 'br' || config.position === 'tr'
    ? width - margin
    : margin;
  const y = config.position === 'tr' || config.position === 'tl'
    ? margin
    : height - margin;

  // Outer halo
  ctx.shadowColor = color.halo;
  ctx.shadowBlur  = px * 0.55;
  ctx.fillStyle   = color.halo;
  ctx.fillText(stamp, x, y);

  // Inner core
  ctx.shadowColor = color.core;
  ctx.shadowBlur  = px * 0.25;
  ctx.fillStyle   = color.core;
  ctx.fillText(stamp, x, y);
  ctx.restore();
}
