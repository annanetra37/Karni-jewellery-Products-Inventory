import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { BlobServiceClient } from '@azure/storage-blob';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

function validate(file: File) {
  if (!ALLOWED.has(file.type)) throw new Error('Unsupported image type. Use JPEG, PNG, WebP, or GIF.');
  if (file.size > MAX_BYTES) throw new Error('Image is too large (max 5 MB).');
}

function generateName(file: File) {
  const ext = EXT[file.type] || 'bin';
  return `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`;
}

let blobService: BlobServiceClient | null = null;
function getBlobService(): BlobServiceClient | null {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) return null;
  if (!blobService) blobService = BlobServiceClient.fromConnectionString(conn);
  return blobService;
}

/**
 * Save an uploaded image and return its public URL.
 *
 * Production: uploads to Azure Blob Storage when AZURE_STORAGE_CONNECTION_STRING
 * is set. The container is created on first use with public blob access so
 * `<img src>` can reach it directly.
 *
 * Dev fallback: writes to ./public/uploads/ and returns /uploads/<file>.
 *
 * `folder` places the image under a sub-prefix (e.g. "book-pages") in the same
 * blob container / uploads dir, keeping different kinds of uploads separated.
 */
export async function saveImage(file: File, folder?: string): Promise<string> {
  validate(file);
  const svc = getBlobService();
  if (svc) return saveToAzure(svc, file, folder);
  return saveLocal(file, folder);
}

// Keep folder names simple and safe for both blob prefixes and local paths.
function safeFolder(folder?: string): string {
  if (!folder) return '';
  const clean = folder.replace(/[^a-zA-Z0-9_-]/g, '');
  return clean ? `${clean}/` : '';
}

async function saveToAzure(svc: BlobServiceClient, file: File, folder?: string): Promise<string> {
  const containerName = process.env.AZURE_STORAGE_CONTAINER || 'karni-uploads';
  const container = svc.getContainerClient(containerName);
  await container.createIfNotExists({ access: 'blob' });
  const name = `${safeFolder(folder)}${generateName(file)}`;
  const blob = container.getBlockBlobClient(name);
  const buf = Buffer.from(await file.arrayBuffer());
  await blob.uploadData(buf, {
    blobHTTPHeaders: { blobContentType: file.type, blobCacheControl: 'public, max-age=31536000, immutable' },
  });
  return blob.url;
}

async function saveLocal(file: File, folder?: string): Promise<string> {
  const sub = safeFolder(folder);
  const dir = path.join(process.cwd(), 'public', 'uploads', sub);
  await mkdir(dir, { recursive: true });
  const name = generateName(file);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, name), buf);
  return `/uploads/${sub}${name}`;
}
