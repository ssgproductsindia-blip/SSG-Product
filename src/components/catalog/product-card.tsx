import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { DiscountBadge, Price } from '@/components/ui/price';
import type { CatalogProduct } from '@/server/catalog';
import { cn } from '@/lib/utils';

/**
 * Product card.
 *
 * The whole card is one link with a single accessible name, rather than
 * separate links on the image, the title and the button — which would make a
 * screen reader announce three identical destinations per product.
 *
 * "From ₹199" reflects the cheapest variant a customer can actually buy; see
 * `leadVariant` in server/catalog.ts.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  product: CatalogProduct;
  priority?: boolean;
}) {
  const lead = product.leadVariant;
  const image = product.images[0] ?? null;
  const variantCount = product.variants.length;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-shadow duration-300 hover:shadow-lg hover:shadow-earth-900/5">
      <div className="relative aspect-4/5 overflow-hidden bg-green-50">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt_text ?? product.name}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
            className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
          />
        ) : (
          <ImagePlaceholder name={product.name} />
        )}

        {lead ? (
          <DiscountBadge
            mrpPaise={lead.mrp_paise}
            sellingPricePaise={lead.selling_price_paise}
            className="absolute left-3 top-3"
          />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="font-display text-lg leading-snug font-semibold text-earth-900">
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0">
            {product.name}
          </Link>
        </h3>

        {product.shortDescription ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-ink-muted">
            {product.shortDescription}
          </p>
        ) : null}

        <div className="mt-auto pt-1">
          {lead ? (
            <Price
              mrpPaise={lead.mrp_paise}
              sellingPricePaise={lead.selling_price_paise}
              from={variantCount > 1}
              size="md"
            />
          ) : null}

          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-green-800">
            View product
            <ArrowRight
              className="size-4 transition-transform duration-300 group-hover:translate-x-1"
              aria-hidden
            />
          </p>
        </div>
      </div>
    </article>
  );
}

/**
 * Shown when a product has no photography yet.
 *
 * Deliberately not a stock photo or a generic "no image" glyph — it is a
 * branded, obviously-empty panel, so an unphotographed product looks
 * unfinished to the owner rather than passing as a real listing.
 */
function ImagePlaceholder({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-2 bg-green-50 p-6 text-center',
        className,
      )}
    >
      <span
        aria-hidden
        className="font-display text-5xl font-semibold text-green-200 select-none"
      >
        {name.replace(/^SSG\s+/i, '').charAt(0)}
      </span>
      <span className="text-xs font-medium text-green-700/70">Photography coming soon</span>
    </div>
  );
}
