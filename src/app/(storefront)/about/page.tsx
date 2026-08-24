import type { Metadata } from 'next';
import Link from 'next/link';
import { Leaf, Package, Sprout } from 'lucide-react';

import { ProductCard } from '@/components/catalog/product-card';
import { Reveal } from '@/components/ui/reveal';
import { Button } from '@/components/ui/button';
import { ConfigurableNotice } from '@/components/content/configurable-notice';
import { BRAND } from '@/lib/brand';
import { listProducts, type CatalogProduct } from '@/server/catalog';

export const metadata: Metadata = {
  title: 'About Us',
  description: `About ${BRAND.name} — natural, homemade herbal hair care.`,
  alternates: { canonical: '/about' },
};

/**
 * About page.
 *
 * Every claim on this page is either a verbatim brand statement transcribed
 * from the actual packaging (the tagline, the "100% Natural" badge, "Organic
 * Is Our Religion") or real data pulled from the product database. There is
 * no invented founding year, no fabricated certification, no manufactured
 * "since 20XX" — the brief is explicit that none of that may be guessed, and
 * a herbal-care brand inventing provenance is exactly where it would matter
 * most. Where the brand has not supplied a founding story, this page says so
 * plainly rather than writing one anyway.
 */
export default async function AboutPage() {
  let products: CatalogProduct[] = [];
  try {
    products = await listProducts();
  } catch {
    products = [];
  }

  return (
    <div>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,var(--color-green-100),transparent_70%)]"
        />
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-green-800 uppercase">
              <Leaf className="size-3.5" aria-hidden />
              {BRAND.name}
            </p>
          </Reveal>
          <Reveal delay={60}>
            {/* The single <h1> for this page. */}
            <h1 className="mt-6 font-display text-4xl leading-tight font-semibold tracking-tight text-earth-900 text-balance sm:text-5xl">
              Rooted in Nature. Made with Care.
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-stone-600">
              {BRAND.tagline}
            </p>
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="story-heading" className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Reveal>
          <h2 id="story-heading" className="font-display text-2xl font-semibold text-earth-900">
            Our Story
          </h2>
          <p className="mt-4 leading-relaxed text-stone-600">
            {BRAND.name} makes homemade herbal hair care — blends of herbs,
            seeds, flowers and roots, prepared the traditional way rather than
            manufactured at scale.
          </p>
          <ConfigurableNotice>
            This section is intentionally brief. We have not published a
            founding story, timeline, or certifications here because none has
            been provided yet — nothing on this page is invented. This
            paragraph can be replaced with your full story at any time.
          </ConfigurableNotice>
        </Reveal>
      </section>

      <section aria-labelledby="approach-heading" className="bg-earth-900 py-14 text-earth-50 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <h2 id="approach-heading" className="font-display text-2xl font-semibold text-white">
              Our Approach
            </h2>
            <ul className="mt-6 grid gap-6 sm:grid-cols-2">
              <li className="flex gap-3">
                <Sprout className="mt-0.5 size-5 shrink-0 text-green-300" aria-hidden />
                <div>
                  <p className="font-medium text-white">Homemade, not manufactured</p>
                  <p className="mt-1 text-sm leading-relaxed text-earth-200">
                    Every batch is prepared as a homemade blend, printed
                    plainly on the label rather than a factory production line.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <Leaf className="mt-0.5 size-5 shrink-0 text-green-300" aria-hidden />
                <div>
                  <p className="font-medium text-white">{BRAND.naturalBadge}</p>
                  <p className="mt-1 text-sm leading-relaxed text-earth-200">
                    The claim printed on every SSG pouch and bottle — nothing
                    added beyond what appears on the ingredients list.
                  </p>
                </div>
              </li>
            </ul>
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="products-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <Reveal>
          <div className="flex items-center justify-between gap-4">
            <h2 id="products-heading" className="font-display text-2xl font-semibold text-earth-900">
              <span className="inline-flex items-center gap-2">
                <Package className="size-5 text-green-700" aria-hidden />
                {BRAND.name}
              </span>
            </h2>
            <Button asChild variant="ghost">
              <Link href="/products">View all</Link>
            </Button>
          </div>
        </Reveal>

        {products.length === 0 ? (
          <p className="mt-6 text-sm text-ink-muted">Products will appear here shortly.</p>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product, index) => (
              <li key={product.id}>
                <Reveal delay={index * 70}>
                  <ProductCard product={product} />
                </Reveal>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-16 text-center sm:px-6">
        <Reveal>
          <Button asChild size="lg">
            <Link href="/products">Explore Our Products</Link>
          </Button>
        </Reveal>
      </section>
    </div>
  );
}
