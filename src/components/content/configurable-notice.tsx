import { Info } from 'lucide-react';

/**
 * Marks a section of policy content as a structural placeholder rather than
 * the store's actual policy.
 *
 * The brief is explicit and repeated across shipping, returns, privacy, terms
 * and FAQ: do not invent shipping times, prices, return windows, or legal
 * terms that have not actually been supplied. This component is how that
 * instruction stays true after the page ships — a customer reading /shipping
 * sees plainly that the timeframe is a placeholder, rather than a page that
 * quietly asserts a policy nobody agreed to.
 *
 * Once the owner supplies real policy text, replace the surrounding content
 * and delete the notice — it should not linger on a page whose content is
 * actually final.
 */
export function ConfigurableNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2.5 rounded-xl border border-gold-400/50 bg-[--color-warning-surface] px-4 py-3 text-sm leading-relaxed text-[--color-warning]">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
