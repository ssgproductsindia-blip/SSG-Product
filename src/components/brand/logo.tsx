import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import Image from 'next/image';

import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * The SSG Products logo.
 *
 * The real mark — the tree with exposed roots — is an existing brand asset,
 * installed from the official artwork (SSG logo-Final.pdf, rendered to a
 * transparent PNG). The brief is explicit that it must not be redesigned, so
 * this component renders the actual file and nothing else.
 *
 * Until that file is installed, it falls back to a typographic wordmark. That
 * is deliberate: a wordmark is visibly "the logo is not here yet", whereas a
 * hand-drawn SVG tree would be a plausible-looking counterfeit that could
 * reach production, or worse, packaging, before anyone noticed it was wrong.
 *
 * To install or replace it, save the official artwork to one of:
 *     public/brand/ssg-logo.svg   (preferred — sharp at every size)
 *     public/brand/ssg-logo.png   (transparent background)
 *
 * The real mark is a roughly SQUARE lockup — the tree canopy stacked above
 * "SSG PRODUCTS" stacked above the root system — not the wide horizontal
 * lockup a nav-bar logo usually is. The aspect ratio below is read from the
 * installed file's own PNG header rather than assumed, so replacing the
 * asset with a differently-proportioned one does not silently distort it.
 *
 * Resolution happens at module load, so restart the dev server after adding
 * or replacing the file.
 */

const CANDIDATES = ['/brand/ssg-logo.svg', '/brand/ssg-logo.png'] as const;

const resolvedLogo = CANDIDATES.find((path) =>
  existsSync(join(process.cwd(), 'public', path)),
);

/**
 * Reads width/height straight from a PNG's IHDR chunk (bytes 16–23) rather
 * than pulling in an image-metadata library for one number. SVGs don't need
 * this — next/image's width/height are only for layout reservation there,
 * and a viewBox-only SVG is fine with the 1:1 fallback below.
 */
function readPngAspectRatio(absolutePath: string): number | null {
  try {
    const fd = readFileSync(absolutePath);
    if (fd.length < 24) return null;
    const width = fd.readUInt32BE(16);
    const height = fd.readUInt32BE(20);
    if (!width || !height) return null;
    return width / height;
  } catch {
    return null;
  }
}

const logoAspectRatio =
  resolvedLogo?.endsWith('.png')
    ? (readPngAspectRatio(join(process.cwd(), 'public', resolvedLogo)) ?? 1)
    : 1;

type LogoProps = {
  /** Rendered height in px. Width follows the asset's real aspect ratio. */
  size?: number;
  className?: string;
  /**
   * The site header already labels the link "SSG Products", so the image
   * there should be decorative to avoid a screen reader announcing it twice.
   */
  decorative?: boolean;
};

export function Logo({ size = 40, className, decorative = false }: LogoProps) {
  if (resolvedLogo) {
    return (
      <Image
        src={resolvedLogo}
        alt={decorative ? '' : `${BRAND.name} logo`}
        aria-hidden={decorative || undefined}
        width={Math.round(size * logoAspectRatio)}
        height={size}
        priority
        className={cn('h-auto w-auto object-contain', className)}
        style={{ height: size }}
      />
    );
  }

  return <Wordmark size={size} className={className} decorative={decorative} />;
}

/** Typographic stand-in. Not a logo — the absence of one. */
function Wordmark({ size, className, decorative }: Required<Omit<LogoProps, 'className'>> & { className?: string }) {
  return (
    <span
      className={cn('inline-flex flex-col justify-center leading-none', className)}
      style={{ height: size }}
      aria-hidden={decorative || undefined}
    >
      <span
        className="font-display font-bold tracking-tight text-green-800"
        style={{ fontSize: size * 0.48 }}
      >
        SSG
      </span>
      <span
        className="font-medium uppercase tracking-[0.22em] text-earth-600"
        style={{ fontSize: size * 0.2 }}
      >
        Products
      </span>
    </span>
  );
}
