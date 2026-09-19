'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Star, Trash2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  deleteProductImageAction,
  setPrimaryImageAction,
  updateImageAltAction,
  uploadProductImageAction,
} from '@/server/actions/product-actions';

/**
 * Product image management.
 *
 * Uploads go straight to a Server Action as multipart form data, which keeps
 * the storage credentials on the server — the browser never holds a key that
 * can write to the bucket.
 *
 * Alt text is a first-class field rather than an afterthought. It is what a
 * screen-reader user gets instead of the photograph, and it is also what
 * Google reads; leaving it blank costs both.
 */

export type ImageRow = {
  id: string;
  storage_path: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
  url: string;
};

export function ImagesEditor({
  productId,
  images,
  productName,
}: {
  productId: string;
  images: ImageRow[];
  productName: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);
    setNotice(null);

    // Sequential, not parallel. Each upload reads the current image count to
    // decide whether it is the first (and therefore primary); running them
    // together would race and could set two primaries or none.
    let uploaded = 0;
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        const result = await uploadProductImageAction(productId, formData);
        if (!result.ok) {
          setError(`${file.name}: ${result.error}`);
          break;
        }
        uploaded += 1;
      }
    } catch {
      // A Server Action can throw instead of returning ActionResult — a
      // network drop, or a request rejected before the action's own code
      // ever runs (e.g. exceeding Next's server action body size limit).
      // Without this catch, `uploading` would stay true forever: the button
      // would say "Uploading…" indefinitely with no way to tell what failed.
      setError(
        'Upload failed unexpectedly. If this image is several MB, try a smaller file.',
      );
    }

    setUploading(false);
    if (uploaded > 0) {
      setNotice(`${uploaded} image${uploaded === 1 ? '' : 's'} uploaded.`);
      router.refresh();
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleSetPrimary(imageId: string) {
    const result = await setPrimaryImageAction(productId, imageId);
    if (!result.ok) setError(result.error);
    else {
      setNotice(result.message);
      router.refresh();
    }
  }

  async function handleDelete(imageId: string) {
    const result = await deleteProductImageAction(productId, imageId);
    if (!result.ok) setError(result.error);
    else {
      setNotice(result.message);
      router.refresh();
    }
  }

  async function handleAltBlur(imageId: string, value: string, original: string) {
    if (value.trim() === original.trim()) return;
    const result = await updateImageAltAction(productId, imageId, value);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-earth-900">Images</h2>
          <p className="mt-1 text-sm text-stone-500">
            Square images work best — they are cropped to 4:5 on cards and 1:1
            on the product page.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="size-4" aria-hidden />
          {uploading ? 'Uploading…' : 'Upload images'}
        </Button>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="sr-only"
          onChange={(event) => handleFiles(event.currentTarget.files)}
          aria-label="Choose product images to upload"
        />
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      ) : null}

      {images.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line p-8 text-center text-sm text-stone-500">
          No images yet. Product cards show a &ldquo;photography coming
          soon&rdquo; placeholder until you upload one.
        </p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <li
              key={image.id}
              className={cn(
                'overflow-hidden rounded-xl border',
                image.is_primary ? 'border-green-500 ring-1 ring-green-500' : 'border-line',
              )}
            >
              <div className="relative aspect-square bg-stone-100">
                <Image
                  src={image.url}
                  alt={image.alt_text ?? `${productName} image`}
                  fill
                  sizes="(min-width: 1024px) 20vw, 45vw"
                  className="object-cover"
                />
                {image.is_primary ? (
                  <span className="absolute left-2 top-2 rounded-full bg-green-700 px-2 py-1 text-[0.65rem] font-semibold text-white">
                    Main image
                  </span>
                ) : null}
              </div>

              <div className="space-y-3 p-3">
                <label className="block">
                  <span className="block text-xs font-medium text-stone-600">
                    Image description
                  </span>
                  <input
                    defaultValue={image.alt_text ?? ''}
                    placeholder="e.g. SSG Shikakai pouch with herbs"
                    onBlur={(event) =>
                      handleAltBlur(image.id, event.currentTarget.value, image.alt_text ?? '')
                    }
                    className="mt-1 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-sm focus:border-green-600"
                  />
                  <span className="mt-0.5 block text-[0.65rem] leading-tight text-stone-400">
                    Read aloud to visually impaired customers. Saves when you
                    click away.
                  </span>
                </label>

                <div className="flex gap-2">
                  {!image.is_primary ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="subtle"
                      onClick={() => handleSetPrimary(image.id)}
                    >
                      <Star className="size-3.5" aria-hidden />
                      Set as main
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="subtle"
                    onClick={() => handleDelete(image.id)}
                    aria-label="Delete this image"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
