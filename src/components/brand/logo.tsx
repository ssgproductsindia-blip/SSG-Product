import { existsSync } from 'node:fs';
import { join } from 'node:path';

import Image from 'next/image';

import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

/**
 * The SSG Products logo.
 *
 * The real mark — the tree with exposed roots — is an existing brand asset.
 * The brief is explicit that it must not be redesigned, so this component
 * renders the actual file and nothing else.
 *
 * Until that file is installed, it falls back to a typographic wordmark. That
 * is deliberate: a wordmark is visibly "the logo is not here yet", whereas a
 * hand-drawn SVG tree would be a plausible-looking counterfeit that could
 * reach production, or worse, packaging, before anyone noticed it was wrong.
 *
 * To install it, save the official artwork to one of:
 *     public/brand/ssg-logo.svg   (preferred — sharp at every size)
 *     public/brand/ssg-logo.png   (transparent background)
 *
 * Resolution happens at module load, so restart the dev server after adding
 * the file.
 */

const CANDIDATES = ['/brand/ssg-logo.svg', '/brand/ssg-logo.png'] as const;

const resolvedLogo = CANDIDATES.find((path) =>
  existsSync(join(process.cwd(), 'public', path)),
);

type LogoProps = {
  /** Rendered height in px. Width follows the asset's aspect ratio. */
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
        width={size * 3}
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
