'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Star, Trash2 } from 'lucide-react';

import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  deleteAddressAction,
  saveAddressAction,
  setDefaultAddressAction,
} from '@/server/actions/address-actions';
import type { CustomerAddressRow } from '@/lib/database.types';

export function AddressesManager({ addresses }: { addresses: CustomerAddressRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleDelete(id: string) {
    const result = await deleteAddressAction(id);
    if (result.ok) {
      setNotice(result.message);
      router.refresh();
    }
  }

  async function handleSetDefault(id: string) {
    const result = await setDefaultAddressAction(id);
    if (result.ok) {
      setNotice(result.message);
      router.refresh();
    }
  }

  return (
    <div>
      {notice ? (
        <p role="status" className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {addresses.map((address) =>
          editingId === address.id ? (
            <div key={address.id} className="sm:col-span-2">
              <AddressForm
                address={address}
                onDone={(msg) => {
                  setNotice(msg);
                  setEditingId(null);
                  router.refresh();
                }}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div
              key={address.id}
              className={cn(
                'rounded-2xl border p-5',
                address.is_default ? 'border-green-400 ring-1 ring-green-400' : 'border-line',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  {address.label ? (
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                      {address.label}
                    </p>
                  ) : null}
                  <p className="mt-1 font-medium text-earth-900">{address.name}</p>
                </div>
                {address.is_default ? (
                  <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                    <Star className="size-3" aria-hidden />
                    Default
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                {address.apartment ? `${address.apartment}, ` : ''}
                {address.address}
                <br />
                {address.city}, {address.state} {address.postal_code}
                <br />
                {address.country}
              </p>
              <p className="mt-1 text-sm text-stone-500">{address.phone}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="subtle" onClick={() => setEditingId(address.id)}>
                  Edit
                </Button>
                {!address.is_default ? (
                  <Button size="sm" variant="subtle" onClick={() => handleSetDefault(address.id)}>
                    Set as default
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => handleDelete(address.id)}
                  aria-label={`Delete address: ${address.name}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            </div>
          ),
        )}
      </div>

      {adding ? (
        <div className="mt-5">
          <AddressForm
            onDone={(msg) => {
              setNotice(msg);
              setAdding(false);
              router.refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <Button variant="outline" className="mt-5" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden />
          Add address
        </Button>
      )}

      {addresses.length === 0 && !adding ? (
        <p className="mt-4 text-sm text-ink-muted">
          No saved addresses yet. Add one to check out faster next time.
        </p>
      ) : null}
    </div>
  );
}

function AddressForm({
  address,
  onDone,
  onCancel,
}: {
  address?: CustomerAddressRow;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();

    const result = await saveAddressAction(address?.id ?? null, {
      label: text('label'),
      name: text('name'),
      phone: text('phone'),
      address: text('address'),
      apartment: text('apartment'),
      city: text('city'),
      state: text('state'),
      postalCode: text('postalCode'),
      country: text('country') || 'India',
      isDefault: form.get('isDefault') === 'on',
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    onDone(result.message);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-green-300 bg-green-50/30 p-5">
      {error ? (
        <p role="alert" className="mb-4 rounded-xl border border-[--color-danger]/25 bg-[--color-danger-surface] px-4 py-3 text-sm text-[--color-danger]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="label"
          label="Label"
          optional
          defaultValue={address?.label ?? ''}
          placeholder="Home, Work…"
          error={fieldErrors.label}
        />
        <Field
          name="name"
          label="Full name"
          required
          defaultValue={address?.name}
          error={fieldErrors.name}
        />
        <Field
          name="phone"
          label="Phone"
          type="tel"
          required
          defaultValue={address?.phone}
          error={fieldErrors.phone}
        />
        <Field
          name="apartment"
          label="Apartment / Unit"
          optional
          defaultValue={address?.apartment ?? ''}
          error={fieldErrors.apartment}
        />
        <Field
          name="address"
          label="Address"
          required
          defaultValue={address?.address}
          error={fieldErrors.address}
          className="sm:col-span-2"
        />
        <Field name="city" label="City" required defaultValue={address?.city} error={fieldErrors.city} />
        <Field name="state" label="State" required defaultValue={address?.state} error={fieldErrors.state} />
        <Field
          name="postalCode"
          label="PIN code"
          required
          inputMode="numeric"
          defaultValue={address?.postal_code}
          error={fieldErrors.postalCode}
        />
        <Field
          name="country"
          label="Country"
          required
          defaultValue={address?.country ?? 'India'}
          error={fieldErrors.country}
        />
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-earth-900">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.is_default}
          className="size-4 rounded border-line text-green-700 focus:ring-green-600"
        />
        Set as default address
      </label>

      <div className="mt-5 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : address ? 'Save changes' : 'Add address'}
        </Button>
        <Button type="button" variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
