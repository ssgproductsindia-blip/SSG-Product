# SSG Products — setup and deployment

Everything here is a one-time setup. Once it is done, adding products, changing
prices and shipping orders happen entirely in the admin panel — no code, no
redeploy.

Steps 1–6 can be done now and do not depend on the rest of the build.

---

## 1. Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com) → **New project**.
2. Name it `ssg-products`. Choose the region closest to your customers —
   **Mumbai (ap-south-1)** for an India-facing store.
3. Save the database password somewhere safe. You will not be shown it again.
4. Wait for provisioning (~2 minutes).

## 2. Run the migrations

Supabase dashboard → **SQL Editor** → paste and **Run** each file in order.
Order matters: later files reference tables and functions created by earlier ones.

| # | File | What it creates |
|---|---|---|
| 1 | `supabase/migrations/0001_schema.sql` | All tables, enums, order-number generator |
| 2 | `supabase/migrations/0002_rls.sql` | Row Level Security + the order-tracking lookup |
| 3 | `supabase/migrations/0003_storage.sql` | Image buckets and their access rules |
| 4 | `supabase/migrations/0004_create_order.sql` | The transactional order write path |
| 5 | `supabase/seed.sql` | The two SSG products and their five variants |

`seed.sql` is safe to re-run — it updates prices in place rather than creating
duplicates.

### Verifying it worked

Run this in the SQL Editor:

```sql
select p.name, v.variant_name,
       v.mrp_paise / 100.0 as mrp,
       v.selling_price_paise / 100.0 as price,
       round((v.mrp_paise - v.selling_price_paise) * 100.0 / v.mrp_paise) as discount_pct
from products p
join product_variants v on v.product_id = p.id
order by p.sort_order, v.sort_order;
```

You should get five rows: Shikakai at 17% / 28% / 21% off, Hair Oil at 34% / 43% off.

## 3. Collect your keys

Supabase → **Project Settings → API**. You need three values:

| Value | Variable | Notes |
|---|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | Public |
| Publishable (anon) key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public — safe only because RLS is on |
| Secret (service_role) key | `SUPABASE_SECRET_KEY` | **Never expose this.** See warning below |

> **The secret key bypasses Row Level Security completely.** Anyone holding it
> can read every customer's name, phone, address and order history. It belongs
> only in server-side environment variables. It must never be given a
> `NEXT_PUBLIC_` prefix, never be pasted into a component, and never be
> committed. If it leaks, rotate it immediately in the Supabase dashboard.

## 4. Configure the app locally

```bash
cd "D:/Claude Code Project/ssg-products"
cp .env.example .env.local
```

Fill in the three Supabase values. Leave email and payment blank for now — the
app runs without them and tells you honestly when a feature is unavailable
rather than pretending it worked.

```bash
npm install
npm run dev
```

## 5. Configure authentication

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` now; your real domain later.
- **Redirect URLs**: add both `http://localhost:3000/**` and
  `https://yourdomain.com/**`.

Admin sign-in is by **magic link** — there is no admin password to be phished,
reused or leaked.

## 6. Create your admin user

```bash
npx tsx scripts/create-admin.ts your@email.com
```

Use the email you actually check. This is the only way to grant admin access:
there is no sign-up page, and no INSERT policy on `admin_users`, so a
compromised admin session cannot create more admins.

Then sign in at `/admin/login`.

---

## 7. Email (Resend) — optional, enables order emails

Until these are set, orders are still created and stored correctly — the admin
just sees *"Tracking saved, but the customer email could not be sent"* instead
of a false success.

1. [resend.com/signup](https://resend.com/signup) → sign up.
2. Dashboard → **API Keys** → **Create API Key** → name it, "Sending access"
   permission is enough → copy it now, it is shown once.
3. Choose one of the two setups below.

### Option A — no domain yet (test mode)

```
RESEND_API_KEY=re_xxxxxxxx
ORDER_EMAIL_FROM=SSG Products <onboarding@resend.dev>
```

`onboarding@resend.dev` needs no domain setup and works immediately. The
limitation is real and not a bug if you hit it: **it can only deliver to the
email address you signed up to Resend with.** Sending to any other address
returns

> You can only send testing emails to your own email address. To send emails
> to other recipients, please verify a domain at resend.com/domains…

which surfaces in this app as `describeOutcome`'s honest "the customer email
could NOT be sent" message, not a silent failure. Good enough to prove the
whole flow works end to end (place an order using your own Resend sign-up
email as the customer email, save tracking, watch the email arrive) — not
good enough to email real customers. Move to Option B before launch.

### Option B — real domain (required before launch)

1. Resend dashboard → **Domains** → **Add Domain** → enter your domain.
2. Add the DNS records Resend gives you (SPF/DKIM, as TXT/CNAME records) at
   your domain registrar or DNS host. Propagation can take a few minutes to a
   few hours.
3. Once Resend shows the domain as **Verified**:

```
RESEND_API_KEY=re_xxxxxxxx
ORDER_EMAIL_FROM=SSG Products <orders@yourdomain.com>
ORDER_EMAIL_BCC=your@email.com
```

Sending from an unverified domain is rejected by Resend outright.

## 8. Payments (Razorpay) — optional

Without all of the values below set, payments are **off**: checkout skips the
Razorpay widget entirely, orders are created with `payment_status = 'pending'`,
and the customer is told plainly that payment has not been collected. Nothing
is ever reported as paid without a server-verified signature.

1. Razorpay dashboard → toggle **Test Mode** (top left) → **Settings → API
   Keys** → generate a key. No KYC needed for test mode.
2. Add to `.env.local`, **all four together**:

   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   RAZORPAY_WEBHOOK_SECRET=
   ```

   `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID` are the **same value**,
   set twice. The Key ID is not secret — it is meant to be embedded in the
   Checkout widget in the browser — but a server action and client-side code
   are different compilation contexts, so it needs the `NEXT_PUBLIC_` copy to
   reach the browser at all. `paymentsConfigured()` checks both copies are
   present and equal, specifically to catch updating one and forgetting the
   other.

3. Leave `RAZORPAY_WEBHOOK_SECRET` blank for now — it needs a public HTTPS
   URL to register, so it comes after deployment (step 9 below), not during
   local development. Payments still work locally without it: the webhook is
   reconciliation for the rare case where a customer's tab closes right after
   paying but before the order finishes writing, not the primary path.
4. After deploying: Razorpay dashboard → **Settings → Webhooks** → add
   `https://yourdomain.com/api/razorpay/webhook`, subscribe to
   `payment.captured` and `payment.failed`, then copy the webhook secret it
   generates into `RAZORPAY_WEBHOOK_SECRET` in Vercel and redeploy.
5. When ready for real payments (i.e. once Razorpay has approved the
   account): generate live keys — dashboard → toggle out of Test Mode →
   **Settings → API Keys → Generate Live Key** — and set them as
   **Vercel's production environment variables, not `.env.local`.**
   Local dev is where testing and experimentation happens; live keys
   are real money and do not belong sitting in a sandbox alongside them.
   Test-mode and live-mode keys cannot be mixed — this project's local
   `.env.local` should stay on test-mode keys indefinitely, even after
   the live site is charging real customers.

   Verifying live mode is also a different exercise from verifying test
   mode. In test mode it is safe to fabricate a valid payment signature
   with the account's own key secret to prove the verification code
   works, because nothing real is on the other end of it. Doing that
   against a live account would create a real "paid" order in your
   actual merchant records for a payment that never happened — so the
   only honest way to confirm live mode works is a real, deliberate,
   small transaction with a real card, placed by a human who intends to
   pay it (and can request a refund from the Razorpay dashboard
   afterward if it was purely a test).

---

## 9. Deploy to Vercel

1. Push this folder to its own GitHub repository (it is already an independent
   git repo — it is not part of the portfolio repo).
2. [vercel.com](https://vercel.com) → **Add New → Project** → import it.
3. Framework preset: **Next.js**. No build settings need changing.
4. Add every variable from `.env.local` under **Environment Variables**, with
   `NEXT_PUBLIC_SITE_URL` set to the production domain.
5. Deploy.

## 10. Domain

Vercel → **Settings → Domains** → add your domain and follow the DNS
instructions. Then update, or emailed links will point at the wrong host:

- `NEXT_PUBLIC_SITE_URL` in Vercel → redeploy
- Supabase → Authentication → URL Configuration → Site URL and Redirect URLs

## 11. Production checks

Work through these against the live site:

- [ ] Both products appear with the correct prices and discount badges
- [ ] Changing variant updates price, MRP and discount instantly
- [ ] A test order is created and appears in `/admin/orders`
- [ ] The order confirmation email arrives
- [ ] Entering courier + tracking sends the shipping email, once — clicking
      "Update tracking" twice must not send a second email
- [ ] `/track-order` finds the order with the right email, and returns
      *not found* with the wrong one
- [ ] Changing a price in admin updates the storefront, and the existing test
      order still shows the price it was placed at
- [ ] Site is usable at 360px width
- [ ] If Razorpay is configured: a test-mode payment (card `4111 1111 1111
      1111`, any future expiry/CVV) completes the Checkout widget and the
      resulting order shows `payment_status = paid` with a
      `razorpay_order_id` set
- [ ] Closing the Razorpay widget without paying leaves no order behind at all
- [ ] A test-mode webhook (Razorpay dashboard → Webhooks → send test event)
      is accepted with a 200; the same request replayed does not change
      anything the second time

## 12. Rotating a leaked key

If `SUPABASE_SECRET_KEY` is ever committed, pasted into a chat, or exposed:

1. Supabase → Project Settings → API → **rotate** the secret key.
2. Update it in Vercel and `.env.local`.
3. Redeploy.

Rotating invalidates the old key immediately. Do it before investigating what
went wrong, not after.
