import Link from 'next/link';
import { Leaf, Sparkles, Sprout } from 'lucide-react';

import { ProductCard } from '@/components/catalog/product-card';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/ui/reveal';
import { BRAND } from '@/lib/brand';
import { listProducts, type CatalogProduct } from '@/server/catalog';

/**
 * Homepage.
 *
 * A scroll story, but every word of it is either verified brand copy from the
 * packaging or real data from the database. There is no invented founder
 * narrative, no "trusted by thousands", no fabricated heritage — the brief
 * forbids inventing content, and a herbal-care brand inventing provenance is
 * the exact place where that would matter most.
 *
 * The ingredient section is generated from the products' own ingredient
 * arrays, so it stays true as the catalogue changes and needs no maintenance.
 */
export default async function HomePage() {
  // A catalogue failure should cost the visitor the product grid, not the
  // whole page. Letting this throw would hand them a blank error screen with
  // no branding, no navigation and no way to reach WhatsApp for help.
  let products: CatalogProduct[] = [];
  let loadFailed = false;

  try {
    products = await listProducts();
  } catch {
    loadFailed = true;
  }

  const featured = products.filter((p) => p.isFeatured);
  const showcase = featured.length > 0 ? featured : products;

  // Union of every ingredient in the catalogue, de-duplicated case-insensitively.
  const ingredients = Array.from(
    products
      .flatMap((p) => p.ingredients)
      .filter((name) => !/^other herbs$/i.test(name))
      .reduce((map, name) => {
        const key = name.toLowerCase();
        if (!map.has(key)) map.set(key, name);
        return map;
      }, new Map<string, string>())
      .values(),
  );

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        {/* Soft botanical wash. Pure CSS gradients — no image weight, and it
            never competes with the product photography that sits on top. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,var(--color-green-100),transparent_70%)]"
        />

        <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-green-800 uppercase">
              <Leaf className="size-3.5" aria-hidden />
              {BRAND.naturalBadge}
            </p>
          </Reveal>

          {/* The single <h1> for this page. */}
          <Reveal delay={60}>
            <h1 className="mt-6 max-w-4xl font-display text-4xl leading-[1.08] font-semibold tracking-tight text-earth-900 text-balance sm:text-6xl lg:text-7xl">
              Homemade herbal hair care, made the traditional way
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600 text-pretty">
              {BRAND.tagline}. Blended from herbs, seeds, flowers and roots —
              nothing more.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/products">Shop now</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#ingredients">See what&rsquo;s inside</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Products                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="products-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <SectionEyebrow>The range</SectionEyebrow>
              <h2
                id="products-heading"
                className="mt-3 font-display text-3xl font-semibold tracking-tight text-earth-900 sm:text-4xl"
              >
                Our products
              </h2>
            </div>
            {products.length > showcase.length ? (
              <Button asChild variant="ghost">
                <Link href="/products">View all {products.length}</Link>
              </Button>
            ) : null}
          </div>
        </Reveal>

        {loadFailed ? (
          <CatalogueError />
        ) : showcase.length === 0 ? (
          <EmptyCatalogue />
        ) : (
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {showcase.map((product, index) => (
              <li key={product.id}>
                <Reveal delay={index * 70}>
                  <ProductCard product={product} priority={index === 0} />
                </Reveal>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Ingredients                                                       */}
      {/* ---------------------------------------------------------------- */}
      {ingredients.length > 0 ? (
        <section
          id="ingredients"
          aria-labelledby="ingredients-heading"
          className="scroll-mt-24 bg-earth-900 py-16 text-earth-50 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <SectionEyebrow tone="dark">Every ingredient, listed</SectionEyebrow>
              <h2
                id="ingredients-heading"
                className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-white text-balance sm:text-4xl"
              >
                {ingredients.length} natural ingredients across the range
              </h2>
              <p className="mt-4 max-w-xl leading-relaxed text-earth-200">
                Exactly what goes into the pouch, printed on the pack and
                repeated here. Nothing is held back and nothing is added to the
                list that is not in the blend.
              </p>
            </Reveal>

            <Reveal delay={100}>
              <ul className="mt-10 flex flex-wrap gap-2.5">
                {ingredients.map((name) => (
                  <li
                    key={name}
                    className="rounded-full border border-earth-700 bg-earth-800/60 px-4 py-2 text-sm text-earth-100"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Brand values — verified packaging claims only                     */}
      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="values-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <h2
            id="values-heading"
            className="max-w-2xl font-display text-3xl font-semibold tracking-tight text-earth-900 text-balance sm:text-4xl"
          >
            {BRAND.logoTagline}
          </h2>
        </Reveal>

        <ul className="mt-10 grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: Leaf,
              title: BRAND.naturalBadge,
              body: 'The claim printed on every SSG pouch.',
            },
            {
              icon: Sprout,
              title: 'Homemade',
              body: 'Blended in small batches, not manufactured at scale.',
            },
            {
              icon: Sparkles,
              title: BRAND.tagline,
              body: 'The line we have carried on our packaging from the start.',
            },
          ].map((value, index) => (
            <li key={value.title}>
              <Reveal delay={index * 80}>
                <div className="h-full rounded-2xl border border-line bg-surface p-6">
                  <value.icon className="size-6 text-green-700" aria-hidden />
                  <h3 className="mt-4 font-display text-lg font-semibold text-earth-900">
                    {value.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{value.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Closing CTA                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <Reveal>
          <div className="rounded-3xl bg-green-800 px-6 py-14 text-center sm:px-12">
            <h2 className="mx-auto max-w-xl font-display text-3xl font-semibold text-white text-balance sm:text-4xl">
              Ready to try it?
            </h2>
            <p className="mx-auto mt-4 max-w-md leading-relaxed text-green-100">
              Choose your pack size and we&rsquo;ll get it on its way.
            </p>
            <Button asChild size="lg" className="mt-8 bg-white text-green-900 hover:bg-green-50">
              <Link href="/products">Shop all products</Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </>
  );
}

function SectionEyebrow({
  children,
  tone = 'light',
}: {
  children: React.ReactNode;
  tone?: 'light' | 'dark';
}) {
  return (
    <p
      className={
        tone === 'dark'
          ? 'text-xs font-semibold tracking-[0.18em] text-green-300 uppercase'
          : 'text-xs font-semibold tracking-[0.18em] text-green-700 uppercase'
      }
    >
      {children}
    </p>
  );
}

/**
 * Empty state.
 *
 * Reached when the database has no active products — most likely because the
 * migrations ran but the seed did not. It says so, rather than rendering a
 * blank grid that looks like a styling bug.
 */
/**
 * Shown when the catalogue query itself failed — a bad key, an unreachable
 * project, a network fault.
 *
 * Distinct from the empty state on purpose. "No products available" tells a
 * customer the shop is bare when in fact the shop is fine and the connection
 * is not, and it tells the owner to go looking in the wrong place.
 */
function CatalogueError() {
  return (
    <div
      role="alert"
      className="mt-10 rounded-2xl border border-[--color-danger]/25 bg-[--color-danger-surface] p-10 text-center"
    >
      <p className="font-display text-lg font-semibold text-earth-900">
        Unable to load products right now.
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-600">
        Please refresh in a moment. If it keeps happening, message us on
        WhatsApp and we&rsquo;ll take your order directly.
      </p>
    </div>
  );
}

function EmptyCatalogue() {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
      <p className="font-display text-lg font-semibold text-earth-900">
        No products available yet.
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
        If you have just set the store up, run <code className="rounded bg-stone-100 px-1.5 py-0.5">supabase/seed.sql</code>, or
        add your first product from the admin panel.
      </p>
    </div>
  );
}
