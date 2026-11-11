import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import AdmZip from 'adm-zip';

export interface PreviewResult {
  file: string;
  kind: 'image' | 'pdf';
}

const PNG_START = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_END = Buffer.from('IEND\xaeB`\x82', 'binary');
const JPEG_START = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_END = Buffer.from([0xff, 0xd9]);

function findLargestPngInBuffer(buf: Buffer): Buffer | null {
  let offset = 0;
  let bestPng: Buffer | null = null;

  while (offset < buf.length) {
    const startPos = buf.indexOf(PNG_START, offset);
    if (startPos === -1) break;
    const endPos = buf.indexOf(PNG_END, startPos);
    if (endPos === -1) break;

    const sliceEnd = endPos + 8;
    const slice = buf.subarray(startPos, sliceEnd);
    if (!bestPng || slice.length > bestPng.length) {
      bestPng = slice;
    }
    offset = sliceEnd;
  }
  return bestPng && bestPng.length > 128 ? bestPng : null;
}

function findPngInZlibStreams(buf: Buffer): Buffer | null {
  let bestPng: Buffer | null = null;
  const headers = [
    Buffer.from([0x78, 0x9c]),
    Buffer.from([0x78, 0x01]),
    Buffer.from([0x78, 0xda]),
    Buffer.from([0x78, 0x5e]),
  ];

  for (const hdr of headers) {
    let offset = 0;
    let attempts = 0;
    while (offset < buf.length && attempts < 400) {
      const pos = buf.indexOf(hdr, offset);
      if (pos === -1) break;
      offset = pos + 2;
      attempts++;

      try {
        const chunk = buf.subarray(pos, Math.min(buf.length, pos + 6 * 1024 * 1024));
        const inflated = zlib.inflateSync(chunk, {
          finishFlush: zlib.constants.Z_SYNC_FLUSH,
          maxOutputLength: 10 * 1024 * 1024,
        });
        const png = findLargestPngInBuffer(inflated);
        if (png && (!bestPng || png.length > bestPng.length)) {
          bestPng = png;
        }
      } catch {
        // Ignorar falsos positivos
      }
    }
  }
  return bestPng;
}

export function extractServerPreview(
  filePath: string,
  ext: string,
  destDir: string,
  baseName: string
): PreviewResult | null {
  const cleanExt = ext.toLowerCase().replace(/^\./, '');

  try {
    // A) Apple iWork (.pages, .numbers, .key) y Office (.docx, .pptx) -> ZIP interno con QuickLook
    if (['pages', 'numbers', 'key', 'docx', 'pptx'].includes(cleanExt)) {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();

      const candidates: Array<{ pattern: RegExp; ext: string; kind: 'pdf' | 'image' }> = [
        { pattern: /QuickLook\/Preview\.pdf$/i, ext: 'pdf', kind: 'pdf' },
        { pattern: /QuickLook\/Thumbnail\.jpg$/i, ext: 'jpg', kind: 'image' },
        { pattern: /preview\.jpg$/i, ext: 'jpg', kind: 'image' },
        { pattern: /preview-web\.jpg$/i, ext: 'jpg', kind: 'image' },
        { pattern: /docProps\/thumbnail\.jpe?g$/i, ext: 'jpg', kind: 'image' },
      ];

      for (const cand of candidates) {
        const found = entries.find((e) => cand.pattern.test(e.entryName));
        if (found) {
          const data = found.getData();
          if (data && data.length > 64) {
            const previewFile = `${baseName}.preview.${cand.ext}`;
            fs.writeFileSync(path.join(destDir, previewFile), data);
            return { file: previewFile, kind: cand.kind };
          }
        }
      }
    }

    // B) Affinity (.af)
    if (cleanExt === 'af') {
      // 1. Verificar si es contenedor ZIP con preview interna
      try {
        const zip = new AdmZip(filePath);
        const imgEntry = zip.getEntries().find((e) => /\.(png|jpe?g|pdf)$/i.test(e.entryName));
        if (imgEntry) {
          const data = imgEntry.getData();
          if (data && data.length > 128) {
            const isPdf = imgEntry.entryName.toLowerCase().endsWith('.pdf');
            const outExt = isPdf ? 'pdf' : 'png';
            const previewFile = `${baseName}.preview.${outExt}`;
            fs.writeFileSync(path.join(destDir, previewFile), data);
            return { file: previewFile, kind: isPdf ? 'pdf' : 'image' };
          }
        }
      } catch {
        // No es ZIP estándar
      }

      // 2. Escaneo binario completo (PNG directo o en stream zlib)
      const buf = fs.readFileSync(filePath);
      let bestPng = findLargestPngInBuffer(buf);
      if (!bestPng) {
        bestPng = findPngInZlibStreams(buf);
      }

      if (bestPng) {
        const previewFile = `${baseName}.preview.png`;
        fs.writeFileSync(path.join(destDir, previewFile), bestPng);
        return { file: previewFile, kind: 'image' };
      }

      // 3. Fallback en macOS con QuickLook (qlmanage)
      if (process.platform === 'darwin') {
        try {
          execFileSync('qlmanage', ['-t', '-s', '1200', '-o', destDir, filePath], {
            stdio: 'ignore',
            timeout: 6000,
          });
          const qlOut = path.join(destDir, path.basename(filePath) + '.png');
          if (fs.existsSync(qlOut)) {
            const previewFile = `${baseName}.preview.png`;
            fs.renameSync(qlOut, path.join(destDir, previewFile));
            return { file: previewFile, kind: 'image' };
          }
        } catch {
          // qlmanage no generó vista previa
        }
      }
    }

    // C) Adobe Illustrator (.ai) -> Cabecera compatible con PDF (%PDF-)
    if (cleanExt === 'ai') {
      const fd = fs.openSync(filePath, 'r');
      const headBuf = Buffer.alloc(1024);
      const bytesRead = fs.readSync(fd, headBuf, 0, 1024, 0);
      fs.closeSync(fd);
      const headStr = headBuf.subarray(0, bytesRead).toString('latin1');
      if (headStr.includes('%PDF-')) {
        return { file: path.basename(filePath), kind: 'pdf' };
      }
    }
  } catch (err) {
    console.warn('Aviso extrayendo vista previa:', err);
  }

  return null;
}
