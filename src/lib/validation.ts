import { z } from 'zod';

/**
 * Input validation.
 *
 * Note what the cart schema does NOT accept: a price. The browser sends a
 * variant id and a quantity, and nothing else. Prices are re-read from the
 * database server-side (see src/server/pricing.ts), so there is no field a
 * tampered request could put a favourable number into.
 */

const uuid = z.string().uuid('Invalid identifier.');

/** Indian mobile number, with or without +91 / 0 prefix. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .refine((v) => /^(?:\+91|91|0)?[6-9]\d{9}$/.test(v), {
    message: 'Enter a valid 10-digit Indian mobile number.',
  })
  // Store the last 10 digits so lookups compare like with like regardless of
  // how the customer typed it at checkout versus on the tracking page.
  .transform((v) => v.slice(-10));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254, 'That email address is too long.');

export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code.');

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const cartLineSchema = z.object({
  variantId: uuid,
  quantity: z
    .number()
    .int('Quantity must be a whole number.')
    .min(1, 'Quantity must be at least 1.')
    // The cap matches the order_items CHECK constraint. A limit here gives the
    // customer a clear message; the constraint stops anything that skips this.
    .max(99, 'Maximum 99 per item.'),
});

export const cartSchema = z
  .array(cartLineSchema)
  .min(1, 'Your cart is empty.')
  .max(50, 'Too many different items in one order.')
  .superRefine((lines, ctx) => {
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.variantId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'The same variant appears twice in the cart.',
        });
        return;
      }
      seen.add(line.variantId);
    }
  });

export type CartLineInput = z.infer<typeof cartLineSchema>;

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * Proof of payment returned by the Razorpay Checkout widget after a
 * successful payment. Validated for shape only here — the values are not
 * trustworthy until verifyPaymentSignature() (src/lib/payments/razorpay.ts)
 * confirms the signature was produced with the account's own key secret.
 * Nothing in this schema makes a claim true; it only makes a malformed
 * request fail before it reaches that check.
 */
export const paymentProofSchema = z.object({
  razorpayOrderId: z.string().trim().min(1).max(64),
  razorpayPaymentId: z.string().trim().min(1).max(64),
  razorpaySignature: z.string().trim().min(1).max(256),
});

export const checkoutSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2, 'Enter your full name.').max(120),
    email: emailSchema,
    phone: phoneSchema,
  }),
  shipping: z.object({
    address: z.string().trim().min(8, 'Enter your full address.').max(400),
    city: z.string().trim().min(2, 'Enter your city.').max(120),
    state: z.string().trim().min(2, 'Enter your state.').max(120),
    postalCode: pincodeSchema,
    country: z.string().trim().min(2).max(80).default('India'),
  }),
  items: cartSchema,
  notes: z.string().trim().max(500).optional(),
  /** Present only when payments are enabled and the customer already paid. */
  payment: paymentProofSchema.optional(),
  /**
   * Explicit opt-in to receive the order confirmation on WhatsApp. WhatsApp's
   * policy requires the customer to have agreed before a business messages
   * them, so absence means no — never a default of yes.
   */
  whatsappOptIn: z.boolean().optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ---------------------------------------------------------------------------
// Order tracking
// ---------------------------------------------------------------------------

export const trackOrderSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^SSG-\d{8}-\d{4}$/, 'Order numbers look like SSG-20260823-0001.'),
  contact: z.string().trim().min(5, 'Enter the email or phone used on the order.'),
});

// ---------------------------------------------------------------------------
// Admin — products
// ---------------------------------------------------------------------------

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only.')
  .refine(
    (s) =>
      ![
        'admin', 'cart', 'checkout', 'products', 'track-order', 'contact',
        'about', 'api', 'order', 'auth', 'privacy', 'terms', 'shipping', 'returns',
      ].includes(s),
    { message: 'That slug is reserved by a site route. Choose another.' },
  );

/** Splits a textarea of one-per-line entries into a clean array. */
const linesToArray = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required.').max(200),
  slug: slugSchema,
  categoryId: uuid.nullable().optional(),
  shortDescription: z.string().trim().max(300).optional().or(z.literal('')),
  description: z.string().trim().max(10_000).optional().or(z.literal('')),
  ingredients: linesToArray,
  benefits: linesToArray,
  usageInstructions: z.string().trim().max(4000).optional().or(z.literal('')),
  seoTitle: z.string().trim().max(70).optional().or(z.literal('')),
  seoDescription: z.string().trim().max(180).optional().or(z.literal('')),
  isActive: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export type ProductInput = z.infer<typeof productSchema>;

// ---------------------------------------------------------------------------
// Admin — variants
// ---------------------------------------------------------------------------

const paiseSchema = z
  .number()
  .int('Enter a valid amount.')
  .min(1, 'Price must be greater than zero.')
  .max(100_000_000, 'That price looks wrong — check the amount.');

export const variantSchema = z
  .object({
    variantName: z.string().trim().min(1, 'Variant name is required.').max(80),
    quantityValue: z.number().positive().max(100_000).nullable().optional(),
    quantityUnit: z.string().trim().max(16).nullable().optional(),
    mrpPaise: paiseSchema,
    sellingPricePaise: paiseSchema,
    sku: z.string().trim().max(64).nullable().optional(),
    /** null = stock not tracked for this variant. */
    stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .refine((v) => v.sellingPricePaise <= v.mrpPaise, {
    message: 'Selling price cannot be higher than MRP — that would show a negative discount.',
    path: ['sellingPricePaise'],
  });

export type VariantInput = z.infer<typeof variantSchema>;

// ---------------------------------------------------------------------------
// Admin — orders and shipping
// ---------------------------------------------------------------------------

export const orderStatusSchema = z.enum([
  'placed',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
]);

export const shipmentSchema = z.object({
  orderId: uuid,
  courierName: z.string().trim().min(2, 'Courier name is required.').max(80),
  trackingId: z.string().trim().min(3, 'Tracking ID is required.').max(120),
  trackingUrl: z
    .string()
    .trim()
    .url('Tracking URL must be a full https:// link.')
    .max(500)
    .optional()
    .or(z.literal('')),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'Category name is required.').max(120),
  slug: slugSchema,
  description: z.string().trim().max(500).optional().or(z.literal('')),
  sortOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const storeSettingsSchema = z.object({
  storeName: z.string().trim().min(2).max(120),
  whatsapp: z.string().trim().max(20).optional().or(z.literal('')),
  instagramUrl: z.string().trim().url().max(300).optional().or(z.literal('')),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  shippingFlatPaise: z.number().int().min(0).max(10_000_000).nullable().optional(),
  /** Tamil Nadu override. When set alongside shippingFlatPaise, Tamil Nadu
   *  orders pay this instead of the default rate — see src/server/pricing.ts. */
  shippingTamilNaduPaise: z.number().int().min(0).max(10_000_000).nullable().optional(),
  freeShippingThresholdPaise: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Customer accounts
// ---------------------------------------------------------------------------

/**
 * At least 8 characters with a letter and a number. Not a "strong password"
 * checklist of symbol classes — those tend to push people toward
 * "Password1!" and away from a longer passphrase, which is the thing that
 * actually resists guessing. Supabase enforces its own minimum server-side
 * regardless of what this schema requires.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password is too long.') // bcrypt's effective limit
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), {
    message: 'Password must include both letters and numbers.',
  });

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
  phone: phoneSchema,
});

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional().or(z.literal('')),
  name: z.string().trim().min(2, 'Enter a full name.').max(120),
  phone: phoneSchema,
  address: z.string().trim().min(8, 'Enter the full address.').max(400),
  apartment: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter a city.').max(120),
  state: z.string().trim().min(2, 'Enter a state.').max(120),
  postalCode: pincodeSchema,
  country: z.string().trim().min(2).max(80).default('India'),
  isDefault: z.boolean().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(120),
  email: emailSchema,
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  subject: z.string().trim().min(2, 'Enter a subject.').max(150),
  message: z.string().trim().min(10, 'Message must be at least 10 characters.').max(4000),
  // Honeypot: a real visitor never sees or fills this field (hidden via CSS).
  // A bot filling every input on the form trips it. Any non-empty value here
  // is treated as spam and silently accepted without sending mail.
  website: z.string().max(200).optional().or(z.literal('')),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
