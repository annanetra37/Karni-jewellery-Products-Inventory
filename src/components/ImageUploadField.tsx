'use client';

import { useEffect, useRef, useState } from 'react';

// Clean, bright studio backdrop the cut-out is placed onto (a light white-beige).
const BACKDROP = '#faf6ed';
// Keep plenty of detail; large enough for a crisp catalog photo, small enough
// to stay well under the upload cap.
const MAX_DIM = 2560;
// Lift exposure on phone shots, which tend to come out dark indoors.
const ENHANCE = 'brightness(1.28) contrast(1.05) saturate(1.08)';

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
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.95));
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
  return await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.95));
}

export function ImageUploadField({
  name = 'imageUrl', defaultValue = '', cutout = false,
}: {
  name?: string;
  defaultValue?: string;
  /** When true, the "Erase background" toggle defaults on (ideal for product cut-outs). */
  cutout?: boolean;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const [removeBg, setRemoveBg] = useState(cutout);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  async function handleImage(file: Blob, cut: boolean) {
    setErr(''); setUploading(true);
    try {
      let toUpload: Blob;
      if (cut) {
        setStatus('Cleaning up background…');
        const resized = await resizeBlob(file, MAX_DIM, true);
        const { removeBackground } = await import('@imgly/background-removal');
        const cutBlob = await removeBackground(resized, { output: { format: 'image/png', quality: 1 } });
        setStatus('Finishing…');
        toUpload = await flattenOnBackdrop(cutBlob, BACKDROP);
      } else {
        toUpload = file;
      }
      setStatus('Uploading…');
      const upName = cut ? 'product.jpg' : (file instanceof File ? file.name : 'photo.jpg');
      const upType = cut ? 'image/jpeg' : (file.type || 'image/jpeg');
      const fd = new FormData();
      fd.append('file', new File([toUpload], upName, { type: upType }));
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'Upload failed'); return; }
      setUrl(j.url);
    } catch {
      setErr(cut
        ? 'Background removal failed. Try again, or turn it off and re-upload.'
        : 'Upload failed — check your connection and try again.');
    } finally {
      setUploading(false); setStatus('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImage(file, removeBg);
  }

  async function openCamera() {
    setErr('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr('Camera is not available in this browser. Use file upload instead.');
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      setCameraOpen(true);
    } catch {
      setErr('Could not access the camera. Grant permission, or use file upload.');
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const wantCut = removeBg;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      closeCamera();
      handleImage(file, wantCut);
    }, 'image/jpeg', 0.97);
  }

  return (
    <div className="space-y-3">
      {/* This is what the form submits. */}
      <input type="hidden" name={name} value={url} />

      {url ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Product" className="w-28 h-28 rounded-xl object-contain border border-karni-200" style={{ background: BACKDROP }} />
          <button type="button" className="btn-link-danger" onClick={() => setUrl('')}>Remove photo</button>
        </div>
      ) : (
        <div className="w-28 h-28 rounded-xl border-2 border-dashed border-karni-200 flex items-center justify-center text-karni-400">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" />
          </svg>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-karni-600" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} disabled={uploading} />
        <span style={{ color: 'var(--ink)' }}>Clean up background (white-beige)</span>
      </label>

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
          : removeBg
            ? 'Capture or pick a photo — the busy background is replaced with a clean white-beige backdrop.'
            : 'JPEG / PNG / WebP / GIF, up to 10 MB.'}
      </p>
      {err && <p className="banner-danger mt-1">{err}</p>}

      <div>
        <label className="label" htmlFor="image-url">…or paste a URL</label>
        <input id="image-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/photo.jpg" />
      </div>

      {/* Live camera modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-3">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black aspect-[3/4] object-cover" />
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1" onClick={capture}>Capture</button>
              <button type="button" className="btn-secondary" onClick={closeCamera}>Cancel</button>
            </div>
            {removeBg && <p className="text-xs text-center text-white/80">The background will be replaced with a clean white-beige backdrop after capture.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
