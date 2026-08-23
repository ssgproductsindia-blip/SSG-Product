import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Button.
 *
 * Sizes are set so every variant clears a 44px touch target at `md` and above
 * — the `sm` size is for dense admin tables where a pointer is assumed, not
 * for the storefront.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full',
    'font-medium transition-[background-color,color,border-color,transform,box-shadow]',
    'duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
    'disabled:pointer-events-none disabled:opacity-50',
    // Nudge on press rather than on hover, so touch users get the feedback too.
    'active:translate-y-px',
    '[&_svg]:size-[1.1em] [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-green-700 text-white hover:bg-green-800 shadow-sm hover:shadow',
        secondary: 'bg-earth-700 text-white hover:bg-earth-800 shadow-sm hover:shadow',
        outline:
          'border border-green-700 text-green-800 bg-transparent hover:bg-green-50',
        ghost: 'text-green-800 hover:bg-green-50',
        subtle: 'bg-stone-100 text-stone-700 hover:bg-stone-200',
        danger: 'bg-[--color-danger] text-white hover:brightness-90',
      },
      size: {
        sm: 'h-9 px-3.5 text-sm',
        md: 'h-11 px-5 text-sm',
        lg: 'h-13 px-7 text-base',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', full: false },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render as the child element — for wrapping a `<Link>`. */
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  full,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      // A <button> inside a <form> defaults to type="submit", which is a
      // classic source of accidental submissions. Default to "button" unless
      // asChild (where the child owns its own semantics).
      {...(asChild ? {} : { type: type ?? 'button' })}
      className={cn(buttonVariants({ variant, size, full }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
