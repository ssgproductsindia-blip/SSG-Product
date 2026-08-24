'use client';

import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Labelled admin form field.
 *
 * Every input gets a real <label> tied by `htmlFor`, and errors are wired
 * through `aria-describedby` + `aria-invalid`. Admin forms are used daily by
 * one person, which is exactly the situation where accessibility gets skipped
 * — and exactly where a mislabelled price field costs real money.
 */

type BaseProps = {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  /** Rendered inside the input on the left, e.g. the rupee sign. */
  prefix?: string;
};

const inputClasses = (error?: string, hasPrefix?: boolean) =>
  cn(
    'w-full rounded-lg border bg-white py-2.5 text-sm text-earth-900',
    'placeholder:text-stone-400 transition-colors focus:border-green-600',
    hasPrefix ? 'pl-7 pr-3' : 'px-3',
    error ? 'border-[--color-danger]' : 'border-line',
  );

export function Field({
  name,
  label,
  error,
  hint,
  optional,
  className,
  prefix,
  ...rest
}: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'className'>) {
  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <Label name={name} label={label} optional={optional} />
      {hint ? <Hint name={name}>{hint}</Hint> : null}
      <div className="relative mt-1.5">
        {prefix ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-500"
          >
            {prefix}
          </span>
        ) : null}
        <input
          id={name}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={inputClasses(error, Boolean(prefix))}
          {...rest}
        />
      </div>
      {error ? <ErrorText name={name}>{error}</ErrorText> : null}
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  error,
  hint,
  optional,
  className,
  rows = 4,
  ...rest
}: BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'name' | 'className'>) {
  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <Label name={name} label={label} optional={optional} />
      {hint ? <Hint name={name}>{hint}</Hint> : null}
      <textarea
        id={name}
        name={name}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn('mt-1.5', inputClasses(error))}
        {...rest}
      />
      {error ? <ErrorText name={name}>{error}</ErrorText> : null}
    </div>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className="mt-0.5 size-4 rounded border-line text-green-700 focus:ring-green-600"
      />
      <div>
        <label htmlFor={name} className="text-sm font-medium text-earth-900">
          {label}
        </label>
        {hint ? (
          <p id={`${name}-hint`} className="text-xs text-stone-500">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Label({ name, label, optional }: { name: string; label: string; optional?: boolean }) {
  return (
    <label htmlFor={name} className="block text-sm font-medium text-earth-900">
      {label}
      {optional ? <span className="ml-1.5 font-normal text-stone-400">(optional)</span> : null}
    </label>
  );
}

function Hint({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <p id={`${name}-hint`} className="mt-0.5 text-xs text-stone-500">
      {children}
    </p>
  );
}

function ErrorText({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <p id={`${name}-error`} role="alert" className="mt-1 text-xs text-[--color-danger]">
      {children}
    </p>
  );
}
