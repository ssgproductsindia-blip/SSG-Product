/**
 * Shared shell for the long-form policy pages (shipping, returns, privacy,
 * terms). One consistent header and section rhythm across all four, reusing
 * the site's existing type scale rather than inventing a new one for
 * "document" pages.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-earth-900 sm:text-4xl">
        {title}
      </h1>
      {intro ? <p className="mt-4 text-lg leading-relaxed text-stone-600">{intro}</p> : null}
      <div className="mt-10 space-y-10">{children}</div>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-earth-900">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-stone-600">{children}</div>
    </section>
  );
}
