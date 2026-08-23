'use client';

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Scroll reveal.
 *
 * Plain IntersectionObserver plus a CSS class — no animation library, no
 * scroll listener, no requestAnimationFrame loop. The transition itself is
 * opacity + transform only, both compositor-only properties, so revealing a
 * section never forces layout.
 *
 * Two deliberate safety properties:
 *
 *   1. The initial state is `shown`, not `hidden`. Content is visible before
 *      any JavaScript runs. A hydration failure or a blocked bundle degrades
 *      to "no animation", never to an invisible page.
 *   2. The observer is skipped entirely when the user prefers reduced motion,
 *      so nothing is ever hidden from them even momentarily.
 *
 * Elements are unobserved once revealed — a section that has appeared does not
 * re-hide on scroll up, and the observer stops costing anything.
 */

type RevealProps = {
  children: ReactNode;
  /** Delay in ms, for staggering siblings. Keep under ~200ms. */
  delay?: number;
  as?: ElementType;
  className?: string;
};

export function Reveal({ children, delay = 0, as: Tag = 'div', className }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<'hidden' | 'shown'>('shown');

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const node = ref.current;
    if (!node) return;

    // Hide only now that we know JS is running and motion is welcome.
    setState('hidden');

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const timer = window.setTimeout(() => setState('shown'), delay);
          observer.unobserve(entry.target);
          return () => window.clearTimeout(timer);
        }
      },
      {
        // Start the reveal slightly before the element reaches the viewport,
        // so it finishes as it arrives rather than after.
        rootMargin: '0px 0px -12% 0px',
        threshold: 0.05,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <Tag ref={ref} data-reveal={state} className={cn(className)}>
      {children}
    </Tag>
  );
}
