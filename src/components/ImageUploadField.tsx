'use client';

import { useRef, useState } from 'react';

export function ImageUploadField({ name = 'imageUrl', defaultValue = '' }: { name?: string; defaultValue?: string }) {
  const [url, setUrl] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || 'Upload failed'); return; }
      setUrl(j.url);
    } catch {
      setErr('Upload failed — check your connection and try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-3">
      {/* This is what the form submits. */}
      <input type="hidden" name={name} value={url} />

      {url ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Product" className="w-28 h-28 rounded-xl object-cover border border-karni-200" />
          <button type="button" className="btn-link-danger" onClick={() => setUrl('')}>Remove photo</button>
        </div>
      ) : (
        <div className="w-28 h-28 rounded-xl border-2 border-dashed border-karni-200 flex items-center justify-center text-karni-400">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" />
          </svg>
        </div>
      )}

      <div>
        <label className="label" htmlFor="image-upload">Upload a photo</label>
        <input
          id="image-upload"
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={onFile}
          disabled={uploading}
          className="input"
        />
        <p className="text-xs text-karni-700 mt-1">
          {uploading ? 'Uploading to storage…' : 'JPEG / PNG / WebP / GIF, up to 5 MB. Stored in Azure Blob Storage.'}
        </p>
        {err && <p className="banner-danger mt-2">{err}</p>}
      </div>

      <div>
        <label className="label" htmlFor="image-url">…or paste a URL</label>
        <input id="image-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/photo.jpg" />
      </div>
    </div>
  );
}
