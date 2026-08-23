import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PurchasePanel } from '@/components/catalog/purchase-panel';
import { Reveal } from '@/components/ui/reveal';
import { publicEnv } from '@/lib/env';
import { getProductBySlug, listProducts, type CatalogProduct } from '@/server/catalog';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  let product: CatalogProduct | null = null;
  try {
    product = await getProductBySlug(slug);
  } catch {
    // Metadata generation must not take the page down with it; the page's own
    // fetch will decide between rendering and a 404.
    return {};
  }

  if (!product) return { title: 'Product not found' };

  const description =
    product.seoDescription ??
    product.shortDescription ??
    `${product.name} from SSG Products.`;

  return {
    title: product.seoTitle ?? product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title: product.seoTitle ?? product.name,
      description,
      type: 'website',
      url: `/products/${product.slug}`,
      images: product.images[0] ? [{ url: product.images[0].url }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const prices = product.variants.map((v) => v.selling_price_paise);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);

  /**
   * Product structured data.
   *
   * `availability` is derived from real stock, and no `aggregateRating` or
   * `review` is emitted — there are no reviews, and inventing them here would
   * be both a lie to customers and a Google structured-data violation.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? product.description ?? undefined,
    brand: { '@type': 'Brand', name: 'SSG Products' },
    image: product.images.map((img) => img.url),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'INR',
      lowPrice: (lowest / 100).toFixed(2),
      highPrice: (highest / 100).toFixed(2),
      offerCount: product.variants.length,
      availability: product.variants.some((v) => v.stock === null || v.stock > 0)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `${publicEnv.NEXT_PUBLIC_SITE_URL}/products/${product.slug}`,
    },
  };

  return (
    <article className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <script
        type="application/ld+json"
        // Serialised from values we control; no user-supplied HTML reaches it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="mb-8 text-sm">
        <ol className="flex items-center gap-2 text-ink-muted">
          <li>
            <Link href="/" className="hover:text-green-800 hover:underline">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/products" className="hover:text-green-800 hover:underline">
              Products
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-earth-900">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        {/* ---- Gallery: sticky on desktop, inline on mobile ------------- */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Gallery product={product} />
        </div>

        {/* ---- Buy box --------------------------------------------------- */}
        <div>
          {/* The one <h1> on this page. */}
          <h1 className="font-display text-3xl font-semibold tracking-tight text-earth-900 text-balance sm:text-4xl">
            {product.name}
          </h1>

          {product.shortDescription ? (
            <p className="mt-4 text-lg leading-relaxed text-stone-600 text-pretty">
              {product.shortDescription}
            </p>
          ) : null}

          {product.benefits.length > 0 ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {product.benefits.map((benefit) => (
                <li
                  key={benefit}
                  className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800"
                >
                  {benefit}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-8">
            <PurchasePanel product={product} />
          </div>

          {product.description ? (
            <section aria-labelledby="about-heading" className="mt-12 border-t border-line pt-8">
              <h2 id="about-heading" className="font-display text-xl font-semibold text-earth-900">
                About this product
              </h2>
              <p className="mt-3 leading-relaxed whitespace-pre-line text-stone-600">
                {product.description}
              </p>
            </section>
          ) : null}

          {product.ingredients.length > 0 ? (
            <section
              aria-labelledby="ingredients-heading"
              className="mt-10 border-t border-line pt-8"
            >
              <h2
                id="ingredients-heading"
                className="font-display text-xl font-semibold text-earth-900"
              >
                Ingredients
              </h2>
              <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {product.ingredients.map((ingredient) => (
                  <li
                    key={ingredient}
                    className="flex items-baseline gap-2.5 text-sm text-stone-700"
                  >
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-green-500" />
                    {ingredient}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {product.usageInstructions ? (
            <section aria-labelledby="usage-heading" className="mt-10 border-t border-line pt-8">
              <h2 id="usage-heading" className="font-display text-xl font-semibold text-earth-900">
                How to use
              </h2>
              <p className="mt-3 leading-relaxed whitespace-pre-line text-stone-600">
                {product.usageInstructions}
              </p>
            </section>
          ) : null}

          <Specifications specifications={product.specifications} />
        </div>
      </div>
    </article>
  );
}

/**
 * Product details taken from the physical label — shelf life, directions,
 * suitability.
 *
 * "External use only" is pulled out of the list and rendered as a callout
 * rather than a row in a table. It is the one entry here that is a safety
 * instruction rather than a product fact, and burying a safety instruction in
 * a definition list is how it goes unread.
 */
function Specifications({ specifications }: { specifications: Record<string, string> }) {
  const entries = Object.entries(specifications).filter(([, value]) => Boolean(value));
  if (entries.length === 0) return null;

  const isSafetyNote = ([key, value]: [string, string]) =>
    /^directions$/i.test(key) && /external use only/i.test(value);

  const safety = entries.find(isSafetyNote);
  const facts = entries.filter((entry) => !isSafetyNote(entry));

  return (
    <section aria-labelledby="details-heading" className="mt-10 border-t border-line pt-8">
      <h2 id="details-heading" className="font-display text-xl font-semibold text-earth-900">
        Product details
      </h2>

      {safety ? (
        <p className="mt-4 rounded-xl border border-gold-400/50 bg-[--color-warning-surface] px-4 py-3 text-sm font-semibold text-[--color-warning]">
          For external use only.
        </p>
      ) : null}

      {facts.length > 0 ? (
        <dl className="mt-4 divide-y divide-line border-t border-line">
          {facts.map(([key, value]) => (
            <div key={key} className="grid grid-cols-3 gap-4 py-3 text-sm">
              <dt className="font-medium text-stone-500">{key}</dt>
              <dd className="col-span-2 text-stone-700">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function Gallery({ product }: { product: CatalogProduct }) {
  if (product.images.length === 0) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-2xl bg-green-50 p-8 text-center">
        <span
          aria-hidden
          className="font-display text-7xl font-semibold text-green-200 select-none"
        >
          {product.name.replace(/^SSG\s+/i, '').charAt(0)}
        </span>
        <p className="text-sm font-medium text-green-700/70">
          Product photography coming soon
        </p>
      </div>
    );
  }

  const [primary, ...rest] = product.images;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-green-50">
        <Image
          src={primary.url}
          alt={primary.alt_text ?? product.name}
          fill
          priority
          sizes="(min-width: 1024px) 45vw, 92vw"
          className="object-cover"
        />
      </div>

      {rest.length > 0 ? (
        <ul className="grid grid-cols-4 gap-3">
          {rest.slice(0, 4).map((image) => (
            <li key={image.id} className="relative aspect-square overflow-hidden rounded-xl bg-green-50">
              <Image
                src={image.url}
                alt={image.alt_text ?? `${product.name} — additional view`}
                fill
                sizes="20vw"
                className="object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Pre-render the known product pages at build time. Products added later are
 * rendered on demand, because `dynamicParams` defaults to true.
 */
export async function generateStaticParams() {
  try {
    const products = await listProducts();
    return products.map((product) => ({ slug: product.slug }));
  } catch {
    // No database at build time is not a build failure — every page just
    // renders on first request instead.
    return [];
  }
}
