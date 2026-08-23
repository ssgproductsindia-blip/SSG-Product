import { discountPercent, formatPaise, savingsPaise } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Price display.
 *
 * The one place in the UI that renders a price, so the relationship between
 * selling price, MRP and discount is stated identically everywhere — product
 * card, product page, cart, checkout, order confirmation.
 *
 * The discount percentage is computed here from the two prices. There is no
 * `discount` prop, because a caller able to pass one is a caller able to pass
 * a wrong one.
 */

type PriceProps = {
  mrpPaise: number;
  sellingPricePaise: number;
  size?: 'sm' | 'md' | 'lg';
  /** Prefix the price with "From" — for cards showing a range of variants. */
  from?: boolean;
  showSavings?: boolean;
  className?: string;
};

const SIZES = {
  sm: { price: 'text-base', mrp: 'text-xs', badge: 'text-[0.65rem] px-1.5 py-0.5' },
  md: { price: 'text-xl', mrp: 'text-sm', badge: 'text-xs px-2 py-0.5' },
  lg: { price: 'text-3xl sm:text-4xl', mrp: 'text-base', badge: 'text-sm px-2.5 py-1' },
} as const;

export function Price({
  mrpPaise,
  sellingPricePaise,
  size = 'md',
  from = false,
  showSavings = false,
  className,
}: PriceProps) {
  const percent = discountPercent(mrpPaise, sellingPricePaise);
  const saved = savingsPaise(mrpPaise, sellingPricePaise);
  const s = SIZES[size];

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2.5 gap-y-1', className)}>
      {from ? (
        <span className={cn('text-ink-muted', s.mrp)}>From</span>
      ) : null}

      <span className={cn('font-display font-semibold text-earth-900 tabular-nums', s.price)}>
        {formatPaise(sellingPricePaise)}
      </span>

      {percent > 0 ? (
        <>
          {/*
            The MRP is announced as "M.R.P." with a screen-reader-only label so
            a struck-through number is not read as just another price. Sighted
            users get the visual strike; everyone else gets the word.
          */}
          <span className={cn('price-struck text-ink-muted tabular-nums', s.mrp)}>
            <span className="sr-only">M.R.P. </span>
            {formatPaise(mrpPaise)}
          </span>

          <span
            className={cn(
              'rounded-full bg-green-100 font-semibold text-green-800 tabular-nums',
              s.badge,
            )}
          >
            {percent}% OFF
          </span>
        </>
      ) : null}

      {showSavings && saved > 0 ? (
        <span className={cn('w-full text-green-700', s.mrp)}>
          You save {formatPaise(saved)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Standalone discount badge, for overlaying on product imagery where the full
 * price block would be too heavy.
 */
export function DiscountBadge({
  mrpPaise,
  sellingPricePaise,
  className,
}: {
  mrpPaise: number;
  sellingPricePaise: number;
  className?: string;
}) {
  const percent = discountPercent(mrpPaise, sellingPricePaise);
  if (percent <= 0) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-gold-500 px-2.5 py-1',
        'text-xs font-semibold text-earth-900 tabular-nums shadow-sm',
        className,
      )}
    >
      {percent}% OFF
    </span>
  );
}
