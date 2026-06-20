'use client';

import { useEffect, useRef, useState } from 'react';

// Clean, bright studio backdrop the cut-out is placed onto (a light white-beige).
const BACKDROP = '#faf6ed';
// Keep plenty of detail; large enough for a crisp catalog photo, small enough
// to stay well under the upload cap.
const MAX_DIM = 2560;
// Lift exposure on phone shots, which tend to come out dark indoors.
const ENHANCE = 'brightness(1.28) contrast(1.05) saturate(1.08)';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function blobToJpeg(canvas: HTMLCanvasElement, quality = 0.95): Promise<Blob> {
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', quality));
}

// Resize (never upscale) a blob through a canvas, returning a high-quality JPEG.
// When `enhance` is set, a brightness/contrast lift is baked in.
async function resizeBlob(src: Blob, maxDim: number, enhance = false): Promise<Blob> {
  const bmp = await createImageBitmap(src);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingQuality = 'high';
    if (enhance) ctx.filter = ENHANCE;
    ctx.drawImage(bmp, 0, 0, w, h);
  }
  bmp.close?.();
  return blobToJpeg(canvas);
}

// Flatten a transparent cut-out onto a solid backdrop, returning a high-quality
// JPEG — so the product keeps a clean white-beige background, not a hole.
async function flattenOnBackdrop(src: Blob, color: string): Promise<Blob> {
  const bmp = await createImageBitmap(src);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0);
  }
  bmp.close?.();
  return blobToJpeg(canvas);
}

// ── Crop / rotate editor ──────────────────────────────────────────────────────
// A dependency-free cropper: drag the box or its corners, rotate 90°, then apply.
function CropEditor({ blob, onApply, onCancel }: {
  blob: Blob;
  onApply: (b: Blob) => void;
  onCancel: () => void;
}) {
  const [workBlob, setWorkBlob] = useState<Blob>(blob);
  const [src, setSrc] = useState('');
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [rect, setRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<null | { mode: string; sx: number; sy: number; rect: typeof rect }>(null);

  // Load the current work image: object URL + natural size, crop reset to full.
  useEffect(() => {
    const u = URL.createObjectURL(workBlob);
    setSrc(u);
    const im = new Image();
    im.onload = () => {
      setNat({ w: im.naturalWidth, h: im.naturalHeight });
      setRect({ x: 0, y: 0, w: im.naturalWidth, h: im.naturalHeight });
    };
    im.src = u;
    return () => URL.revokeObjectURL(u);
  }, [workBlob]);

  function pointerDown(e: React.PointerEvent, mode: string) {
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, rect };
  }
  function pointerMove(e: React.PointerEvent) {
    const d = dragRef.current; const img = imgRef.current;
    if (!d || !img || !img.clientWidth) return;
    const k = nat.w / img.clientWidth;
    const dx = (e.clientX - d.sx) * k;
    const dy = (e.clientY - d.sy) * k;
    let { x, y, w, h } = d.rect;
    const min = Math.max(24, nat.w * 0.06);
    if (d.mode === 'move') {
      x = clamp(x + dx, 0, nat.w - w);
      y = clamp(y + dy, 0, nat.h - h);
    } else {
      let x2 = x + w, y2 = y + h;
      if (d.mode.includes('w')) x = clamp(x + dx, 0, x2 - min);
      if (d.mode.includes('e')) x2 = clamp(x2 + dx, x + min, nat.w);
      if (d.mode.includes('n')) y = clamp(y + dy, 0, y2 - min);
      if (d.mode.includes('s')) y2 = clamp(y2 + dy, y + min, nat.h);
      w = x2 - x; h = y2 - y;
    }
    setRect({ x, y, w, h });
  }
  function pointerUp() { dragRef.current = null; }

  async function rotate() {
    setBusy(true);
    try {
      const bmp = await createImageBitmap(workBlob);
      const c = document.createElement('canvas');
      c.width = bmp.height; c.height = bmp.width;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
      }
      bmp.close?.();
      setWorkBlob(await blobToJpeg(c));
    } finally { setBusy(false); }
  }

  async function apply(full: boolean) {
    setBusy(true);
    try {
      if (full || (rect.w >= nat.w - 1 && rect.h >= nat.h - 1)) { onApply(workBlob); return; }
      const bmp = await createImageBitmap(workBlob);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(rect.w));
      c.height = Math.max(1, Math.round(rect.h));
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
      }
      bmp.close?.();
      onApply(await blobToJpeg(c));
    } finally { setBusy(false); }
  }

  const pct = (v: number, total: number) => `${total ? (v / total) * 100 : 0}%`;
  const handle = 'absolute w-4 h-4 -m-2 rounded-full bg-white border border-karni-600 shadow touch-none';

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md space-y-3">
        <p className="text-white text-sm font-medium text-center">Crop &amp; rotate</p>
        <div className="text-center">
          <div
            className="relative inline-block align-top select-none touch-none"
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerLeave={pointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imgRef} src={src} alt="" className="block max-w-full max-h-[60vh] rounded-lg" draggable={false} />
            {nat.w > 0 && (
              <div
                className="absolute border-2 border-white/90 cursor-move touch-none"
                style={{ left: pct(rect.x, nat.w), top: pct(rect.y, nat.h), width: pct(rect.w, nat.w), height: pct(rect.h, nat.h), boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
                onPointerDown={(e) => pointerDown(e, 'move')}
              >
                <span className={`${handle} left-0 top-0 cursor-nwse-resize`} onPointerDown={(e) => pointerDown(e, 'nw')} />
                <span className={`${handle} right-0 top-0 cursor-nesw-resize`} onPointerDown={(e) => pointerDown(e, 'ne')} />
                <span className={`${handle} left-0 bottom-0 cursor-nesw-resize`} onPointerDown={(e) => pointerDown(e, 'sw')} />
                <span className={`${handle} right-0 bottom-0 cursor-nwse-resize`} onPointerDown={(e) => pointerDown(e, 'se')} />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={rotate} disabled={busy}>⟳ Rotate</button>
          <button type="button" className="btn-secondary" onClick={() => setRect({ x: 0, y: 0, w: nat.w, h: nat.h })} disabled={busy}>Reset</button>
          <button type="button" className="btn-secondary ml-auto" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn-secondary" onClick={() => apply(true)} disabled={busy}>Use full</button>
          <button type="button" className="btn-primary" onClick={() => apply(false)} disabled={busy}>{busy ? 'Working…' : 'Apply crop'}</button>
        </div>
      </div>
    </div>
  );
}

export function ImageUploadField({
  name = 'imageUrl', defaultValue = '', cutout = false,
}: {
  name?: string;
  defaultValue?: string;
  /** When true, the background is cleaned up automatically after the first upload. */
  cutout?: boolean;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [originalUrl, setOriginalUrl] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const originalBlobRef = useRef<Blob | null>(null);

  // Attach / detach the live camera stream.
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);
  // Always release the camera when the component goes away.
  useEffect(() => () => stopStream(), []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }
  function closeCamera() {
    stopStream();
    setCameraOpen(false);
  }

  async function uploadBlob(blob: Blob, fname: string, ftype: string): Promise<string> {
    const fd = new FormData();
    fd.append('file', new File([blob], fname, { type: ftype }));
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Upload failed');
    return j.url as string;
  }

  // The raw (pre-cut-out) photo, from the in-memory blob if we have it, else
  // refetched from its URL (e.g. when re-editing an existing product).
  async function originalAsBlob(): Promise<Blob | null> {
    if (originalBlobRef.current) return originalBlobRef.current;
    if (!originalUrl) return null;
    try {
      const r = await fetch(originalUrl);
      return r.ok ? await r.blob() : null;
    } catch { return null; }
  }

  // Upload a freshly captured / cropped photo as the original, then (for cut-out
  // fields) clean up the background automatically — still reversible afterwards.
  async function uploadOriginal(blob: Blob) {
    setErr(''); setUploading(true); setStatus('Uploading…');
    try {
      const resized = await resizeBlob(blob, MAX_DIM, false);
      originalBlobRef.current = resized;
      const up = await uploadBlob(resized, 'photo.jpg', 'image/jpeg');
      setOriginalUrl(up); setUrl(up);
      if (cutout) await runRemoveBg(resized);
    } catch (e) {
      setErr((e as Error).message || 'Upload failed — check your connection and try again.');
    } finally {
      setUploading(false); setStatus('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // Remove the background from the original and show the clean cut-out.
  async function runRemoveBg(base?: Blob) {
    setErr(''); setUploading(true); setStatus('Cleaning up background…');
    try {
      const src = base ?? await originalAsBlob();
      if (!src) throw new Error('Could not load the original photo.');
      const resized = await resizeBlob(src, MAX_DIM, true);
      const { removeBackground } = await import('@imgly/background-removal');
      const cut = await removeBackground(resized, { output: { format: 'image/png', quality: 1 } });
      setStatus('Finishing…');
      const flat = await flattenOnBackdrop(cut, BACKDROP);
      const up = await uploadBlob(flat, 'product.jpg', 'image/jpeg');
      setUrl(up);
    } catch {
      setErr('Background removal failed. Try again, or keep the original.');
    } finally {
      setUploading(false); setStatus('');
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPendingBlob(file); // → opens the crop editor
  }

  async function openCamera() {
    setErr(''); setZoom(1);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr('Camera is not available in this browser. Use file upload instead.');
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      });
      setCameraOpen(true);
    } catch {
      setErr('Could not access the camera. Grant permission, or use file upload.');
    }
  }

  // Capture, applying the current digital zoom by cropping the centre of the
  // frame (works on every device, including iOS where hardware zoom isn't exposed).
  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const z = Math.max(1, zoom);
    const vw = video.videoWidth, vh = video.videoHeight;
    const sw = vw / z, sh = vh / z;
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw); canvas.height = Math.round(sh);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      closeCamera();
      setPendingBlob(blob); // → opens the crop editor
    }, 'image/jpeg', 0.97);
  }

  async function editPhoto() {
    const base = await originalAsBlob();
    if (base) setPendingBlob(base);
    else setErr('Could not load the photo to edit.');
  }

  function clearAll() {
    originalBlobRef.current = null;
    setUrl(''); setOriginalUrl('');
  }

  const hasCutout = !!url && url !== originalUrl;

  return (
    <div className="space-y-3">
      {/* This is what the form submits. */}
      <input type="hidden" name={name} value={url} />

      {url ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Product" className="w-28 h-28 rounded-xl object-contain border border-karni-200" style={{ background: BACKDROP }} />
          <div className="flex flex-col items-start gap-1.5">
            <button type="button" className="btn-secondary text-sm" onClick={editPhoto} disabled={uploading}>✂️ Edit / crop</button>
            {hasCutout ? (
              <>
                <button type="button" className="btn-secondary text-sm" onClick={() => setUrl(originalUrl)} disabled={uploading}>↺ Use original</button>
                <button type="button" className="btn-secondary text-sm" onClick={() => runRemoveBg()} disabled={uploading}>🔄 Redo background</button>
              </>
            ) : (
              <button type="button" className="btn-secondary text-sm" onClick={() => runRemoveBg()} disabled={uploading}>✨ Remove background</button>
            )}
            <button type="button" className="btn-link-danger" onClick={clearAll} disabled={uploading}>Remove photo</button>
          </div>
        </div>
      ) : (
        <div className="w-28 h-28 rounded-xl border-2 border-dashed border-karni-200 flex items-center justify-center text-karni-400">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" />
          </svg>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={openCamera} disabled={uploading}>
          📷 Take photo
        </button>
        <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
          Choose file
        </button>
        <input
          id="image-upload"
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={onFile}
          disabled={uploading}
          className="hidden"
        />
      </div>
      <p className="text-xs text-karni-700">
        {uploading
          ? (status || 'Working…')
          : 'Capture or pick a photo — crop it, then use “Remove background” for a clean white-beige backdrop.'}
      </p>
      {err && <p className="banner-danger mt-1">{err}</p>}

      <div>
        <label className="label" htmlFor="image-url">…or paste a URL</label>
        <input id="image-url" className="input" value={url} onChange={(e) => { setUrl(e.target.value); setOriginalUrl(e.target.value); originalBlobRef.current = null; }} placeholder="https://…/photo.jpg" />
      </div>

      {/* Live camera modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-3">
            <div className="w-full rounded-xl bg-black aspect-[3/4] overflow-hidden">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} playsInline muted
                className="w-full h-full object-cover origin-center transition-transform"
                style={{ transform: `scale(${zoom})` }} />
            </div>
            <div className="flex items-center gap-2 text-white">
              <span className="text-xs w-8 shrink-0">{zoom.toFixed(1)}×</span>
              <input type="range" min={1} max={4} step={0.1} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-karni-400" aria-label="Zoom" />
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1" onClick={capture}>Capture</button>
              <button type="button" className="btn-secondary" onClick={closeCamera}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Crop / rotate editor */}
      {pendingBlob && (
        <CropEditor
          blob={pendingBlob}
          onCancel={() => setPendingBlob(null)}
          onApply={(b) => { setPendingBlob(null); uploadOriginal(b); }}
        />
      )}
    </div>
  );
}
