import type { Metadata } from 'next';

import { ProductCard } from '@/components/catalog/product-card';
import { Reveal } from '@/components/ui/reveal';
import { listProducts, type CatalogProduct } from '@/server/catalog';

export const metadata: Metadata = {
  title: 'Products',
  description:
    'All SSG Products — homemade herbal Shikakai powder and herbal hair oil, in every available pack size.',
  alternates: { canonical: '/products' },
};

export default async function ProductsPage() {
  let products: CatalogProduct[] = [];
  let loadFailed = false;

  try {
    products = await listProducts();
  } catch {
    loadFailed = true;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <Reveal>
        <header>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-earth-900 sm:text-5xl">
            Products
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-stone-600">
            Every SSG blend, in every pack size we make.
          </p>
        </header>
      </Reveal>

      {loadFailed ? (
        <div
          role="alert"
          className="mt-12 rounded-2xl border border-[--color-danger]/25 bg-[--color-danger-surface] p-10 text-center"
        >
          <p className="font-display text-lg font-semibold text-earth-900">
            Unable to load products.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-600">
            Something went wrong at our end. Please refresh in a moment.
          </p>
        </div>
      ) : products.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
          <p className="font-display text-lg font-semibold text-earth-900">
            No products available yet.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            Check back shortly — we&rsquo;re getting the shelves ready.
          </p>
        </div>
      ) : (
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product, index) => (
            <li key={product.id}>
              <Reveal delay={index * 60}>
                <ProductCard product={product} priority={index < 2} />
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
