'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Cart state.
 *
 * Persisted to localStorage so a cart survives a refresh without requiring an
 * account. What is stored is a DISPLAY SNAPSHOT: enough to render the cart
 * (name, variant, image, the price as last seen) plus the two fields that
 * actually matter — `variantId` and `quantity`.
 *
 * The stored price is for rendering only and is never trusted. Checkout sends
 * variant ids and quantities; the server re-reads every price from the
 * database (see src/server/pricing.ts and the create_order function). A
 * customer who edits localStorage changes what their own screen says and
 * nothing about what they are charged.
 *
 * This also means a price change while an item sits in someone's cart is
 * handled honestly: the cart page re-prices on load and tells them if
 * something moved, rather than silently honouring a stale number.
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

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  /** Subtotal from the local snapshot — indicative only, never charged. */
  indicativeSubtotalPaise: number;
  add: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  /** False until localStorage has been read, so SSR and first paint agree. */
  hydrated: boolean;
};

const STORAGE_KEY = 'ssg.cart.v1';
const MAX_QTY = 99;

const CartContext = createContext<CartContextValue | null>(null);

function readStorage(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Validate on read. localStorage is user-writable and may also hold data
    // from an older shape of this app; anything malformed is dropped rather
    // than crashing the cart on render.
    return parsed.filter((item): item is CartItem => {
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
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Read after mount, never during render: the server has no localStorage, and
  // seeding state from it directly would produce a hydration mismatch.
  useEffect(() => {
    setItems(readStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Private browsing or a full quota. The cart still works for this
      // session; it just will not survive a reload.
    }
  }, [items, hydrated]);

  // Keep tabs in step, so adding an item in one tab is reflected in another.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) setItems(readStorage());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((item: Omit<CartItem, 'quantity'>, quantity = 1) => {
    setItems((current) => {
      const existing = current.find((i) => i.variantId === item.variantId);
      if (existing) {
        return current.map((i) =>
          i.variantId === item.variantId
            ? { ...i, ...item, quantity: Math.min(MAX_QTY, i.quantity + quantity) }
            : i,
        );
      }
      return [...current, { ...item, quantity: Math.min(MAX_QTY, Math.max(1, quantity)) }];
    });
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setItems((current) => {
      if (quantity <= 0) return current.filter((i) => i.variantId !== variantId);
      const clamped = Math.min(MAX_QTY, Math.floor(quantity));
      return current.map((i) => (i.variantId === variantId ? { ...i, quantity: clamped } : i));
    });
  }, []);

  const remove = useCallback((variantId: string) => {
    setItems((current) => current.filter((i) => i.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

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
    [items, add, setQuantity, remove, clear, hydrated],
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
