import { cn } from '@/lib/utils';
import type { PaymentStatus } from '@/lib/database.types';

/**
 * Payment status badge — the admin-side counterpart to StatusBadge.
 *
 * Kept as a separate component rather than folded into StatusBadge: order
 * status and payment status are independent axes (a 'placed' order can be
 * paid or pending; a 'shipped' order should never be pending but the type
 * system does not prevent it, which is exactly why this stays visible as its
 * own badge instead of being inferred from order status).
 */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Payment pending',
  paid: 'Paid',
  failed: 'Payment failed',
  refunded: 'Refunded',
};

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: PaymentStatus;
  className?: string;
}) {
  const tone =
    status === 'paid'
      ? 'bg-green-100 text-green-800'
      : status === 'failed'
        ? 'bg-[--color-danger-surface] text-[--color-danger]'
        : status === 'refunded'
          ? 'bg-stone-200 text-stone-700'
          : 'bg-[--color-warning-surface] text-[--color-warning]';

  return (
    <span
      className={cn('inline-block rounded-full px-2.5 py-1 text-xs font-medium', tone, className)}
    >
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}
