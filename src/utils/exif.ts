/* ─── Minimal JPEG APP1 (EXIF) passthrough ─────────────────────────────────
   Canvas re-encoding strips EXIF, so we extract the EXIF APP1 segment from
   the source JPEG and inject it into the processed JPEG immediately after
   the SOI marker. This preserves camera/lens/date/GPS without pulling in
   a full metadata library.

   Only JPEGs carry EXIF in APP1 form. PNG/WEBP sources are no-ops.
*/

const SOI  = 0xFFD8;
const APP1 = 0xFFE1;
const SOS  = 0xFFDA;
const EOI  = 0xFFD9;

function readU16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && readU16BE(bytes, 0) === SOI;
}

/** Return all APP1 segments (full bytes including marker + length) that
 *  contain EXIF data, in order. Most JPEGs have just one. */
function findExifSegments(bytes: Uint8Array): Uint8Array[] {
  if (!isJpeg(bytes)) return [];
  const out: Uint8Array[] = [];
  let i = 2;            // skip SOI
  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xFF) break;
    // Skip fill bytes
    while (i < bytes.length && bytes[i] === 0xFF) i++;
    const marker = 0xFF00 | bytes[i];
    i++;
    if (marker === SOS || marker === EOI) break;
    if (i + 2 > bytes.length) break;
    const len = readU16BE(bytes, i);
    const segStart = i - 2;             // back to the marker
    const segEnd   = i + len;           // marker(2) + len(2) + payload(len-2)
    if (segEnd > bytes.length) break;
    if (marker === APP1) {
      // Verify EXIF identifier "Exif\0\0" at payload offset 0
      const p = i + 2;
      if (segEnd - p >= 6
          && bytes[p]   === 0x45   // E
          && bytes[p+1] === 0x78   // x
          && bytes[p+2] === 0x69   // i
          && bytes[p+3] === 0x66   // f
          && bytes[p+4] === 0x00
          && bytes[p+5] === 0x00) {
        out.push(bytes.slice(segStart, segEnd));
      }
    }
    i = segEnd;
  }
  return out;
}

/** Inject the given APP1 segments into the destination JPEG immediately
 *  after the SOI marker (replacing any existing EXIF APP1 segments). */
function injectExifSegments(dest: Uint8Array, segments: Uint8Array[]): Uint8Array {
  if (!isJpeg(dest) || segments.length === 0) return dest;

  // Strip any existing EXIF APP1 from dest before injecting (avoids dupes)
  const existing = findExifSegments(dest);
  let body: Uint8Array;
  if (existing.length === 0) {
    body = dest.slice(2);          // everything after SOI
  } else {
    // Walk dest and copy everything except EXIF APP1 segments
    const out: number[] = [];
    let i = 2;
    while (i < dest.length - 1) {
      if (dest[i] !== 0xFF) { out.push(dest[i]); i++; continue; }
      let j = i;
      while (j < dest.length && dest[j] === 0xFF) j++;
      const marker = 0xFF00 | dest[j];
      const headStart = i;
      const lenIdx = j + 1;
      if (marker === SOS || marker === EOI || lenIdx + 2 > dest.length) {
        // Copy rest unchanged
        for (let k = headStart; k < dest.length; k++) out.push(dest[k]);
        i = dest.length;
        break;
      }
      const segLen = readU16BE(dest, lenIdx);
      const segEnd = lenIdx + segLen;
      const isExif = marker === APP1
        && segEnd - (lenIdx + 2) >= 6
        && dest[lenIdx + 2] === 0x45
        && dest[lenIdx + 3] === 0x78
        && dest[lenIdx + 4] === 0x69
        && dest[lenIdx + 5] === 0x66;
      if (!isExif) {
        for (let k = headStart; k < segEnd; k++) out.push(dest[k]);
      }
      i = segEnd;
    }
    body = new Uint8Array(out);
  }

  // Combine: SOI + injected EXIF segments + body
  const segLenTotal = segments.reduce((s, seg) => s + seg.length, 0);
  const final = new Uint8Array(2 + segLenTotal + body.length);
  final[0] = 0xFF; final[1] = 0xD8;
  let p = 2;
  for (const seg of segments) { final.set(seg, p); p += seg.length; }
  final.set(body, p);
  return final;
}

/* ─── EXIF DateTimeOriginal parser ────────────────────────────────────────
   Parses just enough TIFF/IFD to return the "DateTimeOriginal" tag (0x9003)
   as a JS Date. No third-party EXIF lib required.
*/

interface TiffReader {
  bytes:    Uint8Array;
  offset:   number;     // absolute offset of TIFF header (byte 0 of "MM"/"II")
  littleEndian: boolean;
}

function readU16(r: TiffReader, off: number): number {
  return r.littleEndian
    ? (r.bytes[off] | (r.bytes[off + 1] << 8))
    : ((r.bytes[off] << 8) | r.bytes[off + 1]);
}
function readU32(r: TiffReader, off: number): number {
  return r.littleEndian
    ? (r.bytes[off] | (r.bytes[off + 1] << 8) | (r.bytes[off + 2] << 16) | (r.bytes[off + 3] << 24)) >>> 0
    : ((r.bytes[off] << 24) | (r.bytes[off + 1] << 16) | (r.bytes[off + 2] << 8) | r.bytes[off + 3]) >>> 0;
}

function findTagInIFD(r: TiffReader, ifdOffset: number, tag: number): { type: number; count: number; valueOff: number } | null {
  const base = r.offset;
  if (ifdOffset < 0 || base + ifdOffset + 2 > r.bytes.length) return null;
  const count = readU16(r, base + ifdOffset);
  for (let i = 0; i < count; i++) {
    const entry = base + ifdOffset + 2 + i * 12;
    if (entry + 12 > r.bytes.length) break;
    const t = readU16(r, entry);
    if (t === tag) {
      return {
        type:     readU16(r, entry + 2),
        count:    readU32(r, entry + 4),
        valueOff: entry + 8,
      };
    }
  }
  return null;
}

function readAscii(r: TiffReader, info: { type: number; count: number; valueOff: number }): string | null {
  if (info.type !== 2) return null;        // 2 = ASCII
  // If count <= 4, the value is inlined at valueOff. Otherwise valueOff is a u32 pointing into TIFF.
  let absStart: number;
  if (info.count <= 4) {
    absStart = info.valueOff;
  } else {
    const ptr = readU32(r, info.valueOff);
    absStart = r.offset + ptr;
  }
  const absEnd = absStart + info.count;
  if (absStart < 0 || absEnd > r.bytes.length) return null;
  let s = '';
  for (let i = absStart; i < absEnd; i++) {
    const c = r.bytes[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** Returns the EXIF DateTimeOriginal (or DateTime as fallback) as a JS Date,
 *  or null if not present / not a JPEG. */
export async function extractExifDate(blob: Blob): Promise<Date | null> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const segs = findExifSegments(bytes);
    if (segs.length === 0) return null;
    const seg = segs[0];

    // seg = [0xFF 0xE1] [len hi/lo] [Exif\0\0] [TIFF header ...]
    const tiffStart = 2 + 2 + 6;   // marker + length + "Exif\0\0"
    if (seg.length < tiffStart + 8) return null;
    const bom = (seg[tiffStart] << 8) | seg[tiffStart + 1];
    const littleEndian = bom === 0x4949;     // 'II'
    if (!littleEndian && bom !== 0x4D4D) return null;

    const r: TiffReader = {
      bytes:        seg,
      offset:       tiffStart,
      littleEndian,
    };

    const magic = readU16(r, tiffStart + 2);
    if (magic !== 42) return null;
    const ifd0Offset = readU32(r, tiffStart + 4);

    // Look up the ExifIFD pointer tag (0x8769) in IFD0
    const exifIFDPtrInfo = findTagInIFD(r, ifd0Offset, 0x8769);

    let dateStr: string | null = null;
    if (exifIFDPtrInfo) {
      const exifIFDOffset = readU32(r, exifIFDPtrInfo.valueOff);
      const info = findTagInIFD(r, exifIFDOffset, 0x9003);    // DateTimeOriginal
      if (info) dateStr = readAscii(r, info);
    }
    if (!dateStr) {
      // Fallback: IFD0 DateTime (0x0132)
      const info = findTagInIFD(r, ifd0Offset, 0x0132);
      if (info) dateStr = readAscii(r, info);
    }
    if (!dateStr) return null;

    // EXIF date format: "YYYY:MM:DD HH:MM:SS"
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(dateStr.trim());
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  } catch {
    return null;
  }
}

/** High-level: extract EXIF from the original blob and bake it into the
 *  processed JPEG blob. Safe to call with non-JPEG inputs (returns the
 *  processed blob unchanged). */
export async function injectExifFromOriginal(
  originalBlob:  Blob,
  processedJpeg: Blob,
): Promise<Blob> {
  if (processedJpeg.type && processedJpeg.type !== 'image/jpeg') return processedJpeg;
  const origType = originalBlob.type || '';
  if (origType && origType !== 'image/jpeg' && origType !== 'image/jpg') return processedJpeg;

  try {
    const [origBytes, procBytes] = await Promise.all([
      originalBlob.arrayBuffer().then((b) => new Uint8Array(b)),
      processedJpeg.arrayBuffer().then((b) => new Uint8Array(b)),
    ]);
    const segs = findExifSegments(origBytes);
    if (segs.length === 0) return processedJpeg;
    const merged = injectExifSegments(procBytes, segs);
    return new Blob([merged], { type: 'image/jpeg' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[exif] passthrough failed, returning processed JPEG unchanged', err);
    return processedJpeg;
  }
}
