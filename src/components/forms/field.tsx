'use client';

import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Storefront form field.
 *
 * Extracted from the checkout form so sign-up, sign-in, account and contact
 * forms all use one implementation instead of five copies of the same
 * label/hint/error wiring. This is the customer-facing counterpart to
 * src/components/admin/field.tsx — same accessibility contract (real
 * <label>, aria-describedby, aria-invalid), different visual weight to match
 * the storefront rather than the admin dashboard.
 */

type BaseProps = {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
};

export function Field({
  name,
  label,
  type = 'text',
  error,
  hint,
  optional = false,
  className,
  ...rest
}: BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'type' | 'className'> & { type?: string }) {
  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <FieldLabel name={name} label={label} optional={optional} />
      {hint ? <FieldHint name={name}>{hint}</FieldHint> : null}
      <div className="mt-2">
        <input
          id={name}
          name={name}
          type={type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={fieldInputClasses(error)}
          {...rest}
        />
      </div>
      {error ? <FieldError name={name}>{error}</FieldError> : null}
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  error,
  hint,
  optional = false,
  className,
  rows = 3,
  ...rest
}: BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'name' | 'className'>) {
  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <FieldLabel name={name} label={label} optional={optional} />
      {hint ? <FieldHint name={name}>{hint}</FieldHint> : null}
      <div className="mt-2">
        <textarea
          id={name}
          name={name}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={fieldInputClasses(error)}
          {...rest}
        />
      </div>
      {error ? <FieldError name={name}>{error}</FieldError> : null}
    </div>
  );
}

export function fieldInputClasses(error?: string) {
  return cn(
    'w-full rounded-xl border bg-surface px-3.5 py-3 text-base text-earth-900',
    'placeholder:text-stone-400 transition-colors',
    error ? 'border-[--color-danger]' : 'border-line focus:border-green-600',
  );
}

function FieldLabel({ name, label, optional }: { name: string; label: string; optional?: boolean }) {
  return (
    <label htmlFor={name} className="block text-sm font-medium text-earth-900">
      {label}
      {optional ? <span className="ml-1.5 font-normal text-ink-muted">(optional)</span> : null}
    </label>
  );
}

function FieldHint({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <p id={`${name}-hint`} className="mt-1 text-xs text-ink-muted">
      {children}
    </p>
  );
}

function FieldError({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <p id={`${name}-error`} role="alert" className="mt-1.5 text-sm text-[--color-danger]">
      {children}
    </p>
  );
}
