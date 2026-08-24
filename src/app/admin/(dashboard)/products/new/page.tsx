import Link from 'next/link';

import { ProductForm } from '../product-form';

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm">
        <Link href="/admin/products" className="text-stone-500 hover:text-green-800 hover:underline">
          ← Products
        </Link>
      </nav>

      <h1 className="font-display text-2xl font-semibold text-earth-900">Add product</h1>
      <p className="mt-2 text-sm text-stone-500">
        Create the product first, then add its sizes and prices. It stays hidden
        from the store until you publish it.
      </p>

      <div className="mt-8">
        <ProductForm />
      </div>
    </div>
  );
}
