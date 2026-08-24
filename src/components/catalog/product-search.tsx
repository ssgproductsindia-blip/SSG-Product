'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Clock, Search, TrendingUp, X } from 'lucide-react';

import { formatPaise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Homepage product search.
 *
 * Filters client-side against the catalogue passed in as a prop — with a
 * handful of products this is instant and needs no server round trip, and it
 * stays correct automatically as the catalogue grows, up to the point where a
 * real search endpoint becomes worth building.
 *
 * Two distinct "quick select" rows sit under the input, and neither is
 * allowed to show fabricated data:
 *
 *   Recent searches   Read from this browser's own localStorage. Empty for a
 *                      first-time visitor — that is correct, not a bug.
 *   Popular picks      Computed server-side from real order_items quantities
 *                      (see server/best-sellers.ts) and passed in as a prop.
 *                      Renders nothing at all if the store has no order
 *                      history yet, rather than inventing a "bestseller".
 */

type SearchableProduct = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  imageUrl: string | null;
  fromPaise: number | null;
};

const STORAGE_KEY = 'ssg.recentSearches.v1';
const MAX_RECENT = 5;
const EMPTY: string[] = [];

// A small useSyncExternalStore-backed store for the localStorage list, same
// pattern as the cart provider — this is state that lives outside React, and
// that hook is what React actually provides for it. A useEffect + setState
// pair works too, but forces an extra render pass on every mount and is
// exactly what react-hooks/set-state-in-effect (correctly) flags.
let cache: string[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): string[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string')
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string[] {
  if (!loaded) {
    try {
      cache = parse(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      cache = EMPTY;
    }
    loaded = true;
  }
  return cache;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function writeRecentSearch(term: string) {
  const clean = term.trim();
  if (!clean) return;
  const current = getSnapshot();
  const deduped = [clean, ...current.filter((s) => s.toLowerCase() !== clean.toLowerCase())];
  cache = deduped.slice(0, MAX_RECENT);
  loaded = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Private browsing or a full quota — recent searches just won't persist
    // this visit. The search itself still works.
  }
  emit();
}

function clearRecentSearches() {
  cache = EMPTY;
  loaded = true;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  emit();
}

export function ProductSearch({
  products,
  popular,
}: {
  products: SearchableProduct[];
  popular: SearchableProduct[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // Server has no localStorage, so the server-rendered pass and the first
  // client render both correctly see an empty list — no hydration mismatch.
  const recent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the results dropdown on an outside click.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.shortDescription?.toLowerCase().includes(term) ?? false),
      )
      .slice(0, 6);
  }, [query, products]);

  function runSearch(term: string) {
    const clean = term.trim();
    if (!clean) return;
    writeRecentSearch(clean);
    setOpen(false);
    router.push(`/products?q=${encodeURIComponent(clean)}`);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    runSearch(query);
  }

  const showChips = recent.length > 0 || popular.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <form onSubmit={handleSubmit} role="search">
        <label htmlFor="product-search" className="sr-only">
          Search products
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <input
            id="product-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search products — e.g. Shikakai, Hair Oil…"
            autoComplete="off"
            className="w-full rounded-full border border-line bg-surface py-3.5 pl-11 pr-11 text-base text-earth-900 placeholder:text-stone-400 focus:border-green-600"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setOpen(false);
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </form>

      {/* ---- Live results dropdown ---------------------------------------- */}
      {open && query.trim() ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          {matches.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-muted">
              No products match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            <ul>
              {matches.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/products/${product.slug}`}
                    onClick={() => writeRecentSearch(query)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-green-50"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-green-50">
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- tiny dropdown thumbnail; next/image's overhead isn't worth it here
                        <img src={product.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="font-display text-sm font-semibold text-green-300">
                          {product.name.replace(/^SSG\s+/i, '').charAt(0)}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-earth-900">
                        {product.name}
                      </span>
                      {product.fromPaise !== null ? (
                        <span className="text-xs text-ink-muted">
                          From {formatPaise(product.fromPaise)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => runSearch(query)}
            className="block w-full border-t border-line px-4 py-3 text-left text-sm font-medium text-green-800 hover:bg-green-50"
          >
            Search for &ldquo;{query.trim()}&rdquo; →
          </button>
        </div>
      ) : null}

      {/* ---- Quick select: recent searches + real bestsellers -------------- */}
      {showChips ? (
        <div className="mt-4 space-y-3">
          {recent.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <Clock className="size-3.5" aria-hidden />
                Recent:
              </span>
              {recent.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => runSearch(term)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-green-300 hover:bg-green-50"
                >
                  {term}
                </button>
              ))}
              <button
                type="button"
                onClick={clearRecentSearches}
                className="text-xs text-ink-muted underline decoration-dotted hover:text-stone-600"
              >
                Clear
              </button>
            </div>
          ) : null}

          {popular.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <TrendingUp className="size-3.5" aria-hidden />
                Popular:
              </span>
              {popular.map((product) => (
                <Link
                  key={product.id}
                  href={`/products/${product.slug}`}
                  className={cn(
                    'rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800',
                    'hover:border-green-400 hover:bg-green-100',
                  )}
                >
                  {product.name.replace(/^SSG\s+/i, '')}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type { SearchableProduct };
