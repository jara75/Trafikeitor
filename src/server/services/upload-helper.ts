import fs from 'node:fs';
import path from 'node:path';
import { extractServerPreview } from './preview-extractor';

export const uploadsDir = path.resolve('./uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const CODE_EXTS = [
  'html', 'htm', 'js', 'mjs', 'jsx', 'ts', 'tsx', 'css', 'scss', 'sass', 'json',
  'py', 'sh', 'bash', 'zsh', 'sql', 'xml', 'yaml', 'yml', 'php', 'rb', 'go', 'rs',
  'c', 'cpp', 'h', 'txt', 'csv', 'svg', 'md', 'markdown',
];

export interface SavedUploadResult {
  id: string;
  name: string;
  type: string;
  ext: string;
  size: string;
  date: string;
  url: string;
  originalUrl: string;
  previewUrl: string | null;
  previewKind: string | null;
  content: string | null;
  versionGroupId: string;
  versionNumber: number;
  reviewStatus: string;
}

/**
 * Persiste un archivo recibido en multipart/form-data dentro de ./uploads/<otId>/
 * y extrae su vista previa si corresponde a una suite nativa o documento compatible.
 */
export async function saveUploadedFileForOt(
  rawOtId: string,
  file: File,
  versionMeta?: { versionGroupId?: string; versionNumber?: number; reviewStatus?: string }
): Promise<SavedUploadResult> {
  const otId = String(rawOtId || 'GENERAL').replace(/[^a-zA-Z0-9_-]/g, '');
  const origName = file.name || 'archivo';
  const ext = path.extname(origName).toLowerCase().replace(/^\./, '');
  const safeBase = path.basename(origName, path.extname(origName)).replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniquePrefix = Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const destFileName = `${uniquePrefix}_${safeBase}${ext ? '.' + ext : ''}`;

  const otDir = path.join(uploadsDir, otId);
  if (!fs.existsSync(otDir)) {
    fs.mkdirSync(otDir, { recursive: true });
  }

  const destPath = path.join(otDir, destFileName);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(destPath, buffer);

  const relUrl = `/uploads/${otId}/${destFileName}`;
  const preview = extractServerPreview(destPath, ext, otDir, destFileName);

  let textContent: string | null = null;
  if (CODE_EXTS.includes(ext) && buffer.length < 1024 * 1024) {
    textContent = buffer.toString('utf-8');
  }

  let fileType = 'document';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'avif', 'svg'].includes(ext)) fileType = 'image';
  else if (['mp4', 'webm', 'mov', 'ogg', 'm4v'].includes(ext)) fileType = 'video';
  else if (ext === 'pdf') fileType = 'pdf';
  else if (['md', 'markdown'].includes(ext)) fileType = 'markdown';
  else if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) fileType = 'font';
  else if (CODE_EXTS.includes(ext)) fileType = 'code';

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');

  return {
    id: 'm-' + Date.now() + Math.random().toString(36).substring(2, 6),
    name: origName,
    type: preview?.kind || fileType,
    ext,
    size: (buffer.length / (1024 * 1024)).toFixed(2) + ' MB',
    date: `${dd}/${mm}/${yyyy} ${hh}:${min}`,
    url: preview ? `/uploads/${otId}/${preview.file}` : relUrl,
    originalUrl: relUrl,
    previewUrl: preview ? `/uploads/${otId}/${preview.file}` : null,
    previewKind: preview ? preview.kind : null,
    content: textContent,
    versionGroupId: versionMeta?.versionGroupId || ('vg-' + Date.now() + Math.random().toString(36).substring(2, 6)),
    versionNumber: versionMeta?.versionNumber || 1,
    reviewStatus: versionMeta?.reviewStatus || 'draft',
  };
}

