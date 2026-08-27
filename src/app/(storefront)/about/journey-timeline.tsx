import { Reveal } from '@/components/ui/reveal';

import { DoodlePath } from './botanical-doodles';

/**
 * The journey from a family ritual to SSG going online.
 *
 * A vertical, hand-drawn spine rather than a straight corporate timeline
 * rule — the brief is explicit that this should feel organic, not like a
 * project-plan Gantt chart. Each stage reuses the same staggered-Reveal
 * pattern already used for grids elsewhere on the site (homepage, /products),
 * so scrolling into this section feels like the rest of the app, not a
 * one-off interaction pattern invented for this page alone.
 */

const STAGES = [
  {
    number: '01',
    title: 'A thought',
    body: 'Inspired by the everyday care traditions around us.',
  },
  {
    number: '02',
    title: 'A beginning',
    body: 'We started creating for ourselves and our family.',
  },
  {
    number: '03',
    title: 'Shared with loved ones',
    body: 'We shared what we made with the people closest to us.',
  },
  {
    number: '04',
    title: 'Word of mouth',
    body: 'Through honest conversations, more people found their way to SSG.',
  },
  {
    number: '05',
    title: 'A growing journey',
    body: 'Over the next three to four years, that circle kept widening.',
  },
  {
    number: '06',
    title: 'Today',
    body: "We're bringing SSG online, so more people can find their way to it too.",
  },
] as const;

export function JourneyTimeline() {
  return (
    <ol className="relative">
      <DoodlePath
        className="absolute top-2 bottom-2 left-[15px] h-[calc(100%-1rem)] w-6 text-green-700/25 sm:left-[19px]"
      />

      {STAGES.map((stage, index) => (
        <Reveal
          key={stage.number}
          as="li"
          delay={index * 90}
          className="relative pb-10 pl-12 last:pb-0 sm:pl-16"
        >
          <span
            aria-hidden
            className="absolute top-0.5 left-0 flex size-8 shrink-0 items-center justify-center rounded-full border border-green-300 bg-cream font-display text-xs font-semibold text-green-800 sm:size-10 sm:text-sm"
          >
            {stage.number}
          </span>
          <h3 className="font-display text-lg font-semibold text-earth-900 sm:text-xl">
            {stage.title}
          </h3>
          <p className="mt-1.5 max-w-md leading-relaxed text-stone-600">{stage.body}</p>
        </Reveal>
      ))}
    </ol>
  );
}
