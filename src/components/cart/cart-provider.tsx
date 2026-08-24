'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/**
 * Cart state.
 *
 * Backed by localStorage and read through `useSyncExternalStore`, which is the
 * API React provides for exactly this: state that lives outside React and can
 * change without React knowing. Seeding it with a `useEffect` + `setState`
 * would also work, but it triggers a second render pass on every mount and
 * React now flags it, so this uses the intended mechanism instead.
 *
 * What is stored is a DISPLAY SNAPSHOT: enough to render the cart (name,
 * variant, image, the price as last seen) plus the two fields that actually
 * matter — `variantId` and `quantity`.
 *
 * The stored price is for rendering only and is never trusted. Checkout sends
 * variant ids and quantities; the server re-reads every price from the
 * database. A customer who edits localStorage changes what their own screen
 * says and nothing about what they are charged.
 */

export type CartItem = {
  variantId: string;
  quantity: number;
  /* --- display snapshot; authoritative values come from the server --- */
  productName: string;
  productSlug: string;
  variantName: string;
  sellingPricePaise: number;
  mrpPaise: number;
  imageUrl: string | null;
};

const STORAGE_KEY = 'ssg.cart.v1';
const MAX_QTY = 99;

/** Stable empty reference. getSnapshot must never return a fresh array. */
const EMPTY: CartItem[] = [];

// ---------------------------------------------------------------------------
// External store
// ---------------------------------------------------------------------------

let cache: CartItem[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): CartItem[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;

    // Validate on read. localStorage is user-writable and may also hold data
    // from an older shape of this app; anything malformed is dropped rather
    // than crashing the cart on render.
    const valid = parsed.filter((item): item is CartItem => {
      if (typeof item !== 'object' || item === null) return false;
      const i = item as Record<string, unknown>;
      return (
        typeof i.variantId === 'string' &&
        typeof i.quantity === 'number' &&
        Number.isInteger(i.quantity) &&
        i.quantity > 0 &&
        i.quantity <= MAX_QTY &&
        typeof i.productName === 'string' &&
        typeof i.variantName === 'string' &&
        typeof i.sellingPricePaise === 'number'
      );
    });

    return valid.length > 0 ? valid : EMPTY;
  } catch {
    return EMPTY;
  }
}

function readStorage(): CartItem[] {
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  // Keep tabs in step: adding an item in one tab updates the others.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache = parse(event.newValue);
    emit();
  };

  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): CartItem[] {
  // Read once, then serve the cached reference. Returning a new array on every
  // call would make React think the store changed on every render and loop.
  if (!loaded) {
    cache = readStorage();
    loaded = true;
  }
  return cache;
}

/** The server has no cart. React uses this for SSR and hydration. */
function getServerSnapshot(): CartItem[] {
  return EMPTY;
}

function write(next: CartItem[]) {
  cache = next;
  loaded = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota. The cart still works for this session;
    // it just will not survive a reload.
  }
  emit();
}

/** Tiny store that is false during SSR and true once mounted on the client. */
const noopSubscribe = () => () => {};
const alwaysTrue = () => true;
const alwaysFalse = () => false;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  /** Subtotal from the local snapshot — indicative only, never charged. */
  indicativeSubtotalPaise: number;
  add: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  /** False during SSR and the hydration pass, so markup matches. */
  hydrated: boolean;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(noopSubscribe, alwaysTrue, alwaysFalse);

  const add = useCallback((item: Omit<CartItem, 'quantity'>, quantity = 1) => {
    const current = getSnapshot();
    const existing = current.find((i) => i.variantId === item.variantId);

    write(
      existing
        ? current.map((i) =>
            i.variantId === item.variantId
              ? { ...i, ...item, quantity: Math.min(MAX_QTY, i.quantity + quantity) }
              : i,
          )
        : [...current, { ...item, quantity: Math.min(MAX_QTY, Math.max(1, quantity)) }],
    );
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    const current = getSnapshot();
    if (quantity <= 0) {
      write(current.filter((i) => i.variantId !== variantId));
      return;
    }
    const clamped = Math.min(MAX_QTY, Math.floor(quantity));
    write(current.map((i) => (i.variantId === variantId ? { ...i, quantity: clamped } : i)));
  }, []);

  const remove = useCallback((variantId: string) => {
    write(getSnapshot().filter((i) => i.variantId !== variantId));
  }, []);

  const clear = useCallback(() => write(EMPTY), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
      indicativeSubtotalPaise: items.reduce(
        (sum, i) => sum + i.sellingPricePaise * i.quantity,
        0,
      ),
      add,
      setQuantity,
      remove,
      clear,
      hydrated,
    }),
    [items, hydrated, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside <CartProvider>.');
  }
  return context;
}
