import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const PUBLIC_UPLOADS = path.join(process.cwd(), 'public', 'uploads');

/**
 * Save a user-uploaded image and return its public URL (`/uploads/...`).
 * Writes to `public/uploads/` so Next.js serves it directly. On Railway,
 * attach a Volume mounted at `/app/public/uploads` to persist across deploys.
 */
export async function saveImage(file: File): Promise<string> {
  if (!ALLOWED.has(file.type)) {
    throw new Error('Unsupported image type. Use JPEG, PNG, WebP, or GIF.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Image is too large (max 5 MB).');
  }
  await mkdir(PUBLIC_UPLOADS, { recursive: true });

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const ext = extMap[file.type] || 'bin';

  const name = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`;
  const fullPath = path.join(PUBLIC_UPLOADS, name);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buf);
  return `/uploads/${name}`;
}
