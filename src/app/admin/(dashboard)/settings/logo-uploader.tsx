'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { brandAssetUrl } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { removeLogoAction, uploadLogoAction } from '@/server/actions/settings-actions';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'];
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Logo upload / removal.
 *
 * The preview reads directly from the storage URL rather than rendering the
 * real <Logo> component — <Logo> is an async Server Component (it queries
 * the database) and cannot run inside this client form. That is not a loss:
 * the whole point of this control is to see the NEW file before committing
 * to it, which a server-rendered component re-fetched after a page reload
 * could not show anyway.
 */
export function LogoUploader({ currentLogoPath }: { currentLogoPath: string | null }) {
  const [preview, setPreview] = useState<string | null>(
    currentLogoPath ? brandAssetUrl(currentLogoPath) : null,
  );
  const [hasCustomLogo, setHasCustomLogo] = useState(Boolean(currentLogoPath));
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setResult(null);

    if (!file) {
      setPendingFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setResult({ ok: false, message: 'Logo must be JPEG, PNG, WebP, AVIF or SVG.' });
      event.target.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      setResult({
        ok: false,
        message: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please keep it under 4 MB.`,
      });
      event.target.value = '';
      return;
    }

    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setSubmitting(true);
    setResult(null);

    const formData = new FormData();
    formData.set('file', pendingFile);

    const res = await uploadLogoAction(formData);

    if (res.ok) {
      setHasCustomLogo(true);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    setResult(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.error });
    setSubmitting(false);
  }

  async function handleRemove() {
    setSubmitting(true);
    setResult(null);

    const res = await removeLogoAction();

    if (res.ok) {
      setHasCustomLogo(false);
      setPreview(null);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    setResult(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.error });
    setSubmitting(false);
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-line bg-stone-50">
          {preview ? (
            // A plain <img>, not next/image: this can be an unconfirmed
            // local blob: URL for a file not uploaded yet, which next/image
            // cannot serve through its optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-16 max-w-16 object-contain" />
          ) : (
            <span className="text-xs text-stone-400">No logo</span>
          )}
        </div>

        <div className="flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleFileChange}
            className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200"
          />
          <p className="mt-1.5 text-xs text-stone-500">
            {hasCustomLogo
              ? 'A custom logo is active.'
              : 'Using the logo installed in the codebase (or the text wordmark, if none is installed).'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={handleUpload} disabled={!pendingFile || submitting}>
          {submitting ? 'Saving…' : 'Upload logo'}
        </Button>
        {hasCustomLogo ? (
          <Button size="sm" variant="subtle" onClick={handleRemove} disabled={submitting}>
            Remove custom logo
          </Button>
        ) : null}
      </div>

      {result ? (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={cn('mt-3 text-sm', result.ok ? 'text-green-700' : 'text-[--color-danger]')}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
