import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import Image from 'next/image';

import { BRAND, brandAssetUrl } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { getStoreSettings } from '@/server/catalog';

/**
 * The SSG Products logo.
 *
 * The real mark — the tree with exposed roots — is an existing brand asset,
 * installed from the official artwork (SSG logo-Final.pdf, rendered to a
 * transparent PNG). The brief is explicit that it must not be redesigned, so
 * this component renders the actual file and nothing else.
 *
 * Two sources, checked in order:
 *
 *   1. `store_settings.logo_path` — set from Admin → Settings
 *      (src/server/actions/settings-actions.ts), stored in the `brand-assets`
 *      bucket. Lets the owner swap the logo without a deploy.
 *   2. The file installed at build time: public/brand/ssg-logo.svg|png.
 *
 * Falling back to a typographic wordmark when NEITHER exists is deliberate:
 * a wordmark is visibly "the logo is not here yet", whereas a hand-drawn SVG
 * tree would be a plausible-looking counterfeit that could reach production,
 * or worse, packaging, before anyone noticed it was wrong.
 *
 * This is a Server Component (it calls the database), which Next.js runs as
 * an async function — every existing call site (`<Logo />` inside other
 * Server Components) already supports that without any change on their end.
 */

const CANDIDATES = ['/brand/ssg-logo.svg', '/brand/ssg-logo.png'] as const;

const installedLogo = CANDIDATES.find((path) => existsSync(join(process.cwd(), 'public', path)));

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

const installedLogoAspectRatio =
  installedLogo?.endsWith('.png')
    ? (readPngAspectRatio(join(process.cwd(), 'public', installedLogo)) ?? 1)
    : 1;

/**
 * The real SSG lockup is a roughly SQUARE mark — the tree canopy stacked
 * above "SSG PRODUCTS" stacked above the root system — so 1:1 is used as the
 * aspect ratio for an admin-uploaded logo, whose exact proportions cannot be
 * read without a round trip to Storage on every render. An admin who uploads
 * a differently-shaped mark can crop it to square before uploading; this is
 * a display default, not a hard constraint enforced anywhere.
 */
const UPLOADED_LOGO_ASPECT_RATIO = 1;

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

export async function Logo({ size = 40, className, decorative = false }: LogoProps) {
  // Never let a settings lookup take the logo down with it — every page that
  // renders <Logo> would otherwise 500 if this query ever failed.
  const settings = await getStoreSettings().catch(() => null);

  if (settings?.logo_path) {
    return (
      <Image
        src={brandAssetUrl(settings.logo_path)}
        alt={decorative ? '' : `${BRAND.name} logo`}
        aria-hidden={decorative || undefined}
        width={Math.round(size * UPLOADED_LOGO_ASPECT_RATIO)}
        height={size}
        priority
        unoptimized // remote SVGs are not run through next/image's optimizer
        className={cn('h-auto w-auto object-contain', className)}
        style={{ height: size }}
      />
    );
  }

  if (installedLogo) {
    return (
      <Image
        src={installedLogo}
        alt={decorative ? '' : `${BRAND.name} logo`}
        aria-hidden={decorative || undefined}
        width={Math.round(size * installedLogoAspectRatio)}
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
