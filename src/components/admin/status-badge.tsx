import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/lib/database.types';

/**
 * Order status labels and badge.
 *
 * Lives outside any page file because Next restricts what a route module may
 * export, and because both the dashboard and the orders list need it.
 *
 * The label map is exhaustive over OrderStatus, so adding a status to the
 * database enum without giving it a label is a type error rather than a blank
 * cell in the admin table.
 */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Order placed',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** Statuses in the order they actually happen, for pickers and timelines. */
export const STATUS_SEQUENCE: OrderStatus[] = [
  'placed',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
];

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const tone =
    status === 'cancelled'
      ? 'bg-[--color-danger-surface] text-[--color-danger]'
      : status === 'delivered'
        ? 'bg-green-100 text-green-800'
        : status === 'shipped' || status === 'out_for_delivery'
          ? 'bg-gold-300/40 text-[--color-warning]'
          : 'bg-stone-100 text-stone-700';

  return (
    <span
      className={cn('inline-block rounded-full px-2.5 py-1 text-xs font-medium', tone, className)}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
