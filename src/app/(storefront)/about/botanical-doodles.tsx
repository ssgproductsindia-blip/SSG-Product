import type { SVGProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Editorial line-art for the About page.
 *
 * The brief asks for "AI-generated editorial photography" throughout this
 * page — hands preparing herbs, wooden bowls, morning sunlight. There is no
 * image-generation tool available in this environment, so that photography
 * could not be produced. These hand-drawn botanical marks are the honest
 * substitute: a single, consistent line weight (stroke, no fill, currentColor)
 * so they read as one premium illustration system rather than clip-art, kept
 * to low opacity wherever they are layered behind text so they stay texture,
 * not content. Where the brief specifically calls for product photography
 * (the "created for our home" and "rooted in tradition" sections), the real,
 * already-uploaded product photos from the catalogue are used instead of
 * inventing a lifestyle scene.
 *
 * Every mark shares the same visual grammar: an organic, slightly imperfect
 * curve (as a hand-drawn line would have), 1.25px stroke, rounded caps. None
 * of them carry meaning on their own — they are ambient, not informational —
 * so all are `aria-hidden`.
 */

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function DoodleLeaf(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden {...base} {...props}>
      <path d="M12 52C10 30 22 12 46 10c3 20-8 38-30 42-2 .4-3.6-.2-4-2Z" />
      <path d="M14 50C22 38 30 28 44 14" />
    </svg>
  );
}

/** A small sprig — a stem with two or three leaflets, like a herb cutting. */
export function DoodleSprig(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 80" aria-hidden {...base} {...props}>
      <path d="M24 76V20" />
      <path d="M24 44C16 40 10 32 10 22c8 1 15 7 17 15" />
      <path d="M24 30C31 25 36 17 36 8c-8 0-14 6-16 14" />
      <path d="M24 58C18 55 14 49 13 42c7 0 13 4 15 10" />
    </svg>
  );
}

/** Root system — the SSG logo's own visual language, drawn as texture. */
export function DoodleRoot(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 80 56" aria-hidden {...base} {...props}>
      <path d="M40 4v20" />
      <path d="M40 24c-10 2-16 10-18 22" />
      <path d="M40 24c10 2 16 10 18 22" />
      <path d="M40 24c-4 8-4 18 2 30" />
      <path d="M40 24c4 8 2 20-4 30" />
    </svg>
  );
}

/** A simple five-petal bloom, drawn loosely rather than geometrically. */
export function DoodleBloom(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 60 60" aria-hidden {...base} {...props}>
      <circle cx="30" cy="30" r="4.5" />
      {[0, 72, 144, 216, 288].map((angle) => (
        <path
          key={angle}
          d="M30 25c-5-6-5-14 0-18 5 4 5 12 0 18Z"
          transform={`rotate(${angle} 30 30)`}
        />
      ))}
    </svg>
  );
}

/** Gentle sun rays — for morning-light moments (hero, closing section). */
export function DoodleSun(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden {...base} {...props}>
      <circle cx="32" cy="32" r="11" />
      {Array.from({ length: 8 }, (_, i) => (i * 360) / 8).map((angle) => (
        <line
          key={angle}
          x1="32"
          y1="6"
          x2="32"
          y2="13"
          transform={`rotate(${angle} 32 32)`}
        />
      ))}
    </svg>
  );
}

/**
 * A loose, organic connecting line — used as the spine of the journey
 * timeline instead of a straight corporate rule.
 */
export function DoodlePath(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 400" preserveAspectRatio="none" aria-hidden {...base} {...props}>
      <path d="M12 0C4 40 20 70 12 110 4 150 20 180 12 220 4 260 20 290 12 330 4 360 16 380 12 400" />
    </svg>
  );
}

/** A single hand-drawn arrow, for the "quietly disappearing" transition beat. */
export function DoodleArrowDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 48" aria-hidden {...base} {...props}>
      <path d="M16 2v38" />
      <path d="M6 32c3 6 7 9 10 10 3-1 7-4 10-10" />
    </svg>
  );
}

/** A small speech mark — for the word-of-mouth section. */
export function DoodleSpeech(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 56 44" aria-hidden {...base} {...props}>
      <path d="M8 6h40a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H22l-10 9v-9H8a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4Z" />
    </svg>
  );
}

/**
 * A soft, oversized background wash — layered botanical marks at very low
 * opacity, positioned absolutely behind a section's content. Purely
 * decorative texture; never affects layout (`pointer-events-none`,
 * `-z-10`, `overflow-hidden` on the parent is assumed).
 */
export function BotanicalBackdrop({
  className,
  variant = 'leaf',
}: {
  className?: string;
  variant?: 'leaf' | 'root' | 'sprig';
}) {
  const Mark = variant === 'root' ? DoodleRoot : variant === 'sprig' ? DoodleSprig : DoodleLeaf;
  return (
    <div className={cn('pointer-events-none absolute text-green-700/10', className)} aria-hidden>
      <Mark className="h-full w-full" />
    </div>
  );
}
