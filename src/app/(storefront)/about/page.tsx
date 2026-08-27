import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { ProductCard } from '@/components/catalog/product-card';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/ui/reveal';
import { listProducts, type CatalogProduct } from '@/server/catalog';

import {
  BotanicalBackdrop,
  DoodleArrowDown,
  DoodleBloom,
  DoodleRoot,
  DoodleSpeech,
  DoodleSprig,
  DoodleSun,
} from './botanical-doodles';
import { JourneyTimeline } from './journey-timeline';

export const metadata: Metadata = {
  title: 'About SSG Products | Our Story',
  description:
    'The inspiration behind SSG Products, and its journey from traditional nature-inspired care to modern everyday routines.',
  alternates: { canonical: '/about' },
};

/**
 * About page — SSG's brand story.
 *
 * Everything here is the owner's own account of how SSG began, given
 * directly and refined for the page rather than invented — no founding year,
 * customer count, or claim appears here that was not supplied. The tone
 * guidance that came with the story is followed closely: reflective rather
 * than fear-based ("things we rarely stop to think about", never "chemicals
 * are poisoning us"), and no outcome, cure, or "chemical-free"/"proven"
 * claim is made anywhere on the page — see the docstring in
 * botanical-doodles.tsx for why the visual atmosphere is hand-drawn line art
 * and real product photography rather than the AI lifestyle photography the
 * brief describes; this environment has no image-generation tool.
 *
 * The product section at the end reuses listProducts() and <ProductCard>
 * exactly as the homepage and /products do — nothing about the product
 * system is duplicated or reimplemented for this page.
 */
export default async function AboutPage() {
  let products: CatalogProduct[] = [];
  try {
    products = await listProducts();
  } catch {
    products = [];
  }

  const showcase = products.filter((p) => p.isFeatured).slice(0, 3);
  const productList = showcase.length > 0 ? showcase : products.slice(0, 3);

  // Two different real product photos stand in for the two spots that would
  // otherwise need an invented lifestyle photograph (the trust section and
  // the "today" side of the tradition/today split) — distinct products where
  // possible, so the same single photo is not repeated three times on a page
  // that already shows it once more in the product grid below.
  const photographedProducts = products.filter((p) => p.images.length > 0);
  const trustSectionProduct = photographedProducts[0] ?? null;
  const splitTodayProduct = photographedProducts[1] ?? photographedProducts[0] ?? null;

  return (
    <div className="overflow-x-clip">
      {/* ================================================================ */}
      {/* Hero                                                              */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_65%_at_50%_-10%,var(--color-green-100),transparent_70%)]"
        />
        <BotanicalBackdrop
          variant="sprig"
          className="-top-6 -right-10 h-56 w-56 rotate-12 sm:h-72 sm:w-72"
        />
        <BotanicalBackdrop
          variant="root"
          className="-bottom-10 -left-14 h-48 w-64 -rotate-6 text-earth-700/10"
        />

        <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-1.5 text-xs font-semibold tracking-wide text-green-800 uppercase">
              <DoodleSun className="size-4 motion-safe:animate-[ssg-gentle-spin_28s_linear_infinite]" />
              Our story
            </span>
          </Reveal>

          <Reveal delay={70}>
            <h1 className="mt-7 font-display text-4xl leading-[1.1] font-semibold tracking-tight text-earth-900 text-balance sm:text-6xl">
              Some of the best traditions begin at home.
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-stone-600 text-pretty">
              It began with a simple question: what could we learn from the
              care rituals passed down through generations?
            </p>
          </Reveal>
        </div>
      </section>

      {/* ================================================================ */}
      {/* The question that started it                                     */}
      {/* ================================================================ */}
      <section aria-labelledby="question-heading" className="relative mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <h2
            id="question-heading"
            className="font-display text-3xl font-semibold tracking-tight text-earth-900 text-balance sm:text-4xl"
          >
            When did we stop looking back?
          </h2>
        </Reveal>

        <div className="mt-8 space-y-5">
          <Reveal delay={70}>
            <p className="text-lg leading-relaxed text-stone-600">
              Our everyday routines are filled with things we rarely stop to
              think about.
            </p>
          </Reveal>
          <Reveal delay={130}>
            <div className="flex items-center gap-3 text-green-700/70">
              <DoodleArrowDown className="size-6 shrink-0" />
              <p className="text-lg leading-relaxed text-stone-600">
                Somewhere along the way, quieter traditions began to fade.
              </p>
            </div>
          </Reveal>
          <Reveal delay={190}>
            <p className="text-lg leading-relaxed font-medium text-earth-900">
              So we looked back — and found something worth remembering.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Our greatest inspiration                                         */}
      {/* ================================================================ */}
      <section
        aria-labelledby="inspiration-heading"
        className="relative overflow-hidden bg-cream-deep py-16 sm:py-24"
      >
        <BotanicalBackdrop
          variant="leaf"
          className="top-1/2 -right-16 h-72 w-72 -translate-y-1/2 rotate-45 text-earth-700/10"
        />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <Reveal>
              {/*
                A symbolic composition, not a photograph — the brief is
                explicit that no image should depict the actual person this
                story is about. Rendered in the same hand-drawn line
                language as the rest of the page: a bowl, rising steam,
                a herb sprig, morning light.
              */}
              <div className="relative mx-auto aspect-square w-full max-w-sm text-earth-700">
                <DoodleSun className="absolute top-2 right-6 size-10 text-gold-500" />
                <svg
                  viewBox="0 0 200 200"
                  aria-hidden
                  className="h-full w-full"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* a simple wooden bowl */}
                  <path d="M40 128c8 26 30 42 60 42s52-16 60-42" />
                  <ellipse cx="100" cy="128" rx="60" ry="12" />
                  {/* rising warmth */}
                  <path d="M78 96c-6-10-2-18 4-26" opacity={0.6} />
                  <path d="M100 90c-6-10-2-20 4-28" opacity={0.6} />
                  <path d="M122 96c-6-10-2-18 4-26" opacity={0.6} />
                </svg>
                <DoodleSprig className="absolute -bottom-2 -left-4 size-16 text-green-700" />
              </div>
            </Reveal>

            <div>
              <Reveal delay={70}>
                <h2
                  id="inspiration-heading"
                  className="font-display text-3xl font-semibold tracking-tight text-earth-900 text-balance sm:text-4xl"
                >
                  It started with a grandmother&rsquo;s everyday ritual.
                </h2>
              </Reveal>
              <Reveal delay={130}>
                <p className="mt-5 leading-relaxed text-stone-600">
                  Even today, our great-grandmother uses the same traditional
                  care she always has — Shikakai powder, herbal bath powders,
                  simple routines passed down without much thought of
                  changing them.
                </p>
              </Reveal>
              <Reveal delay={190}>
                <p className="mt-4 leading-relaxed text-stone-600">
                  Watching her reminded us that nature had never really left
                  our everyday lives. We had just stopped noticing.
                </p>
              </Reveal>
              <Reveal delay={250}>
                <p className="mt-4 font-display text-lg font-medium text-earth-900">
                  That quiet observation became the beginning of SSG.
                </p>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Journey timeline                                                 */}
      {/* ================================================================ */}
      <section aria-labelledby="journey-heading" className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <h2
            id="journey-heading"
            className="font-display text-3xl font-semibold tracking-tight text-earth-900 text-balance sm:text-4xl"
          >
            From a family ritual to SSG.
          </h2>
        </Reveal>
        <div className="mt-12">
          <JourneyTimeline />
        </div>
      </section>

      {/* ================================================================ */}
      {/* We use what we create                                            */}
      {/* ================================================================ */}
      <section aria-labelledby="trust-heading" className="relative bg-green-800 py-16 text-white sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <Reveal>
                <h2
                  id="trust-heading"
                  className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
                >
                  Created for our home, before yours.
                </h2>
              </Reveal>
              <Reveal delay={70}>
                <p className="mt-5 leading-relaxed text-green-100">
                  Before SSG reached anyone else, it was already part of our
                  own everyday routine. We made it for our family first, and
                  shared it because we believed in it ourselves.
                </p>
              </Reveal>
              <Reveal delay={130}>
                <p className="mt-4 leading-relaxed text-green-100">
                  Our own experience is what encouraged us to share it
                  further — and that&rsquo;s still how we think about every
                  product we make.
                </p>
              </Reveal>
            </div>

            <Reveal delay={100}>
              <ProductPhotoFrame product={trustSectionProduct} tone="dark" />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Word of mouth                                                    */}
      {/* ================================================================ */}
      <section aria-labelledby="wom-heading" className="relative overflow-hidden mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <BotanicalBackdrop
          variant="leaf"
          className="top-4 -left-10 h-40 w-40 rotate-[-30deg]"
        />
        <Reveal>
          <DoodleSpeech className="size-8 text-green-700/60" />
        </Reveal>
        <Reveal delay={60}>
          <h2
            id="wom-heading"
            className="mt-4 font-display text-3xl font-semibold tracking-tight text-earth-900 text-balance sm:text-4xl"
          >
            One conversation at a time.
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-5 leading-relaxed text-stone-600">
            There was no campaign behind SSG&rsquo;s early growth — just
            people telling people. Friends passed it on to their friends, and
            slowly, a small circle became a larger one.
          </p>
        </Reveal>
        <Reveal delay={180}>
          <p className="mt-4 leading-relaxed font-medium text-earth-900">
            That kind of trust can&rsquo;t be manufactured. It has to be
            earned, one conversation at a time.
          </p>
        </Reveal>
      </section>

      {/* ================================================================ */}
      {/* The thought behind SSG — philosophical heart                     */}
      {/* ================================================================ */}
      <section aria-labelledby="philosophy-heading" className="relative overflow-hidden py-20 sm:py-32">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_50%_50%,var(--color-green-50),transparent_75%)]"
        />
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <Reveal>
            <h2
              id="philosophy-heading"
              className="font-display text-3xl leading-tight font-semibold tracking-tight text-earth-900 text-balance sm:text-5xl"
            >
              Care for your skin with the same intention you bring to your
              everyday choices.
            </h2>
          </Reveal>
          <Reveal delay={90}>
            <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-stone-600 text-pretty">
              We think carefully about what we eat and how we care for our
              wellbeing. We believe our everyday skin and hair care deserve
              that same thought.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-stone-600 text-pretty">
              SSG is our attempt to bring nature-inspired, traditional care
              into modern, everyday routines.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Rooted in tradition, made for today — split visual               */}
      {/* ================================================================ */}
      <section aria-labelledby="rooted-heading" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <h2
            id="rooted-heading"
            className="max-w-2xl font-display text-3xl font-semibold tracking-tight text-earth-900 text-balance sm:text-4xl"
          >
            We don&rsquo;t believe moving forward means forgetting where we
            came from.
          </h2>
        </Reveal>
        <Reveal delay={60}>
          <p className="mt-4 max-w-xl leading-relaxed text-stone-600">
            Sometimes, the inspiration for what comes next is already sitting
            quietly in the traditions that came before us.
          </p>
        </Reveal>

        <div className="mt-10 grid overflow-hidden rounded-3xl border border-line sm:grid-cols-2">
          <Reveal delay={110} className="relative flex aspect-4/3 items-center justify-center bg-earth-50 p-10 sm:aspect-auto">
            <span className="absolute top-4 left-5 text-xs font-semibold tracking-[0.18em] text-earth-600 uppercase">
              Traditional
            </span>
            <div className="flex gap-3 text-earth-700">
              <DoodleSprig className="size-16" />
              <DoodleRoot className="size-16 self-end" />
              <DoodleBloom className="size-14 self-start text-gold-600" />
            </div>
          </Reveal>

          <Reveal delay={170} className="relative flex aspect-4/3 items-center justify-center bg-green-50 p-10 sm:aspect-auto">
            <span className="absolute top-4 left-5 text-xs font-semibold tracking-[0.18em] text-green-700 uppercase">
              Today
            </span>
            <ProductPhotoFrame product={splitTodayProduct} tone="light" bare />
          </Reveal>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Philosophy cards                                                 */}
      {/* ================================================================ */}
      <section aria-labelledby="values-heading" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <h2 id="values-heading" className="sr-only">
            Our philosophy
          </h2>
        </Reveal>
        <ul className="grid gap-5 sm:grid-cols-2">
          {[
            {
              title: 'Inspired by Nature',
              body: 'Traditional, natural ingredients continue to shape how we think about care.',
            },
            {
              title: 'Made with Intention',
              body: 'Every product starts as something we would want for our own family first.',
            },
            {
              title: 'Part of Everyday Care',
              body: 'Simple rituals, practised consistently, can become meaningful.',
            },
            {
              title: 'A Journey Shared',
              body: 'What began at home has grown through the people who chose to share it further.',
            },
          ].map((value, index) => (
            <li key={value.title}>
              <Reveal delay={index * 70}>
                <div className="h-full rounded-2xl border border-line bg-surface p-7">
                  <h3 className="font-display text-lg font-semibold text-earth-900">
                    {value.title}
                  </h3>
                  <p className="mt-2.5 leading-relaxed text-ink-muted">{value.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* ================================================================ */}
      {/* Products                                                         */}
      {/* ================================================================ */}
      <section aria-labelledby="products-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <div className="text-center">
            <h2
              id="products-heading"
              className="font-display text-3xl font-semibold tracking-tight text-earth-900 text-balance sm:text-4xl"
            >
              From our story to your everyday ritual.
            </h2>
          </div>
        </Reveal>

        {productList.length === 0 ? (
          <p className="mt-10 text-center text-sm text-ink-muted">
            Products will appear here shortly.
          </p>
        ) : (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {productList.map((product, index) => (
              <li key={product.id}>
                <Reveal delay={index * 70}>
                  <ProductCard product={product} />
                </Reveal>
              </li>
            ))}
          </ul>
        )}

        <Reveal delay={100}>
          <div className="mt-10 text-center">
            <Button asChild size="lg">
              <Link href="/products">Explore Our Products</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      {/* ================================================================ */}
      {/* Closing moment                                                   */}
      {/* ================================================================ */}
      <section aria-labelledby="closing-heading" className="relative overflow-hidden bg-earth-900 py-20 text-center text-white sm:py-28">
        <BotanicalBackdrop
          variant="leaf"
          className="top-6 left-1/2 h-64 w-64 -translate-x-[130%] -rotate-12 text-green-300/10"
        />
        <BotanicalBackdrop
          variant="sprig"
          className="bottom-6 left-1/2 h-56 w-56 translate-x-[60%] rotate-6 text-green-300/10"
        />
        <div className="relative mx-auto max-w-2xl px-4 sm:px-6">
          <Reveal>
            <DoodleSun className="mx-auto size-10 text-gold-400 motion-safe:animate-[ssg-gentle-spin_28s_linear_infinite]" />
          </Reveal>
          <Reveal delay={70}>
            <h2
              id="closing-heading"
              className="mt-6 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              Sometimes, the simplest rituals are the ones worth keeping.
            </h2>
          </Reveal>
          <Reveal delay={130}>
            <p className="mx-auto mt-5 max-w-lg leading-relaxed text-earth-200 text-pretty">
              SSG is our journey of remembering, learning and bringing
              nature-inspired care into everyday life.
            </p>
          </Reveal>
          <Reveal delay={190}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="bg-white text-green-900 hover:bg-green-50">
                <Link href="/products">Explore Products</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-earth-500 text-white hover:bg-earth-800"
              >
                <Link href="/contact">Get in Touch</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

/**
 * Frames a real product photo for the "modern" side of the tradition/today
 * contrast and the trust section — reusing actual catalogue photography
 * rather than inventing a lifestyle scene. Falls back to a botanical mark if
 * no product has a photo uploaded yet, so the layout never shows a broken
 * image.
 */
function ProductPhotoFrame({
  product,
  tone,
  bare = false,
}: {
  product: CatalogProduct | null;
  tone: 'light' | 'dark';
  bare?: boolean;
}) {
  const image = product?.images[0] ?? null;

  const frame = (
    <div
      className={
        bare
          ? 'relative aspect-square w-full max-w-[220px] overflow-hidden rounded-2xl'
          : `relative aspect-square w-full max-w-sm overflow-hidden rounded-2xl border ${
              tone === 'dark' ? 'border-white/15 bg-white/5' : 'border-line bg-surface'
            } p-4`
      }
    >
      {image ? (
        <div className="relative h-full w-full overflow-hidden rounded-xl">
          <Image
            src={image.url}
            alt={image.alt_text ?? product?.name ?? 'SSG product'}
            fill
            sizes="(min-width: 1024px) 30vw, 80vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center rounded-xl ${
            tone === 'dark' ? 'bg-white/5' : 'bg-green-50'
          }`}
        >
          <DoodleSprig className={tone === 'dark' ? 'size-16 text-white/40' : 'size-16 text-green-700/40'} />
        </div>
      )}
    </div>
  );

  return bare ? frame : <div className="mx-auto">{frame}</div>;
}
