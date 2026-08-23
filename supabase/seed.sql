-- ============================================================================
-- SSG Products — seed data
-- ----------------------------------------------------------------------------
-- Contains ONLY figures and text supplied in the brief. Everything not
-- supplied is left NULL rather than guessed:
--
--   sku            NULL  — no SKU scheme was provided
--   stock          NULL  — "not tracked"; see the note in 0001_schema.sql
--   description    NULL  — no long-form copy was supplied
--   specifications {}    — no shelf life, weight, manufacturing or expiry data
--   categories     none  — brief §51: do not invent unconfirmed categories
--
-- No reviews, ratings or testimonials are seeded, and none ever should be
-- fabricated (brief §75).
--
-- Idempotent: re-running updates prices in place instead of duplicating rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Store settings
-- ---------------------------------------------------------------------------
-- The WhatsApp and Instagram destinations are direct, mechanical transforms of
-- the contact details given in brief §7 (+918148993990, @Ssgproducts) — not
-- invented accounts. No other social profiles are added.

-- Email and manufacturing address are transcribed from the Herbal Hair Oil
-- back label. Shipping and tax stay null — the packaging says nothing about
-- either, so the store reports them as unconfigured rather than guessing.

insert into store_settings (id, store_name, whatsapp, instagram_url, email, address)
values (
  true,
  'SSG Products',
  '+918148993990',
  'https://instagram.com/ssgproducts',
  'ssgproducts.india@gmail.com',
  'Plot No. 13/66, 4th Street, Anbu Nagar, Alwarthirunagar, Chennai - 600 087, India'
)
on conflict (id) do update
  set store_name    = excluded.store_name,
      whatsapp      = excluded.whatsapp,
      instagram_url = excluded.instagram_url,
      email         = excluded.email,
      address       = excluded.address;

-- ---------------------------------------------------------------------------
-- Product 1 — SSG Herbal Shikakai Powder
-- ---------------------------------------------------------------------------
-- Ingredients are transcribed from the official SSG ingredients artwork, which
-- lists all 17 in this order.
--
-- One deliberate difference from brief §27: the brief writes "Kaarbogar
-- arisi", the packaging artwork writes "Kaarboga arisi". The packaging is the
-- customer-facing source of truth for a product's own ingredient list, so the
-- packaging spelling is used here. If the brief spelling is the correct one,
-- change it in the admin panel — it needs no code change.
--
-- `benefits` carries only the two statements that actually appear on the
-- pouch: the "100% NATURAL" badge and the "HOMEMADE POWDER" descriptor. No
-- hair-growth, hair-fall or dandruff claim appears on this packaging, so none
-- is written here (§31, §74).

insert into products (
  name, slug, short_description, ingredients, benefits, is_active, is_featured, sort_order
)
values (
  'SSG Herbal Shikakai Powder',
  'herbal-shikakai-powder',
  '100% Natural · Homemade herbal powder blended from 17 traditional ingredients',
  array[
    'Shikakai', 'Tulasi', 'Soap nuts', 'Sembaruthi leaves, flowers',
    'Karisalankanni', 'Amla', 'Avarampoo', 'Neem leaf', 'Green gram',
    'Kaarboga arisi', 'Fenugreek', 'Vasambu', 'Rose', 'Vettiver',
    'Curry leaves', 'Lemon & Orange peel', 'Other herbs'
  ],
  array[
    '100% Natural',
    'Homemade Powder'
  ],
  true,
  true,
  1
)
on conflict (slug) do update
  set name              = excluded.name,
      short_description = excluded.short_description,
      ingredients       = excluded.ingredients,
      benefits          = excluded.benefits,
      is_active         = excluded.is_active,
      is_featured       = excluded.is_featured,
      sort_order        = excluded.sort_order;

-- Variants. Prices are in paise: ₹199 is 19900.
--   200g  MRP ₹240  ->  ₹199   (17% off, computed at read time)
--   500g  MRP ₹600  ->  ₹430   (28% off)
--   1 KG  MRP ₹950  ->  ₹754   (21% off)

with p as (select id from products where slug = 'herbal-shikakai-powder')
insert into product_variants (
  product_id, variant_name, quantity_value, quantity_unit,
  mrp_paise, selling_price_paise, sort_order
)
select p.id, v.variant_name, v.qty, v.unit, v.mrp, v.price, v.ord
from p, (values
  ('200g',  200::numeric, 'g',  24000, 19900, 1),
  ('500g',  500::numeric, 'g',  60000, 43000, 2),
  ('1 KG',    1::numeric, 'kg', 95000, 75400, 3)
) as v(variant_name, qty, unit, mrp, price, ord)
where not exists (
  select 1 from product_variants pv
  where pv.product_id = p.id and pv.variant_name = v.variant_name
);

-- Keep prices current on re-run without touching stock or SKU.
update product_variants pv
set mrp_paise = v.mrp, selling_price_paise = v.price
from products p, (values
  ('200g', 24000, 19900),
  ('500g', 60000, 43000),
  ('1 KG', 95000, 75400)
) as v(variant_name, mrp, price)
where pv.product_id = p.id
  and p.slug = 'herbal-shikakai-powder'
  and pv.variant_name = v.variant_name;

-- ---------------------------------------------------------------------------
-- Product 2 — SSG Homemade Herbal Hair Oil
-- ---------------------------------------------------------------------------
-- `benefits` is the BENEFITS block from the actual bottle label, transcribed
-- verbatim. These are stronger than the four statements brief §28 listed, but
-- they are the brand's own printed claims, so §31's instruction applies:
-- preserve the meaning of the supplied material, neither weakened nor
-- escalated. Nothing here says "guaranteed", "clinically proven", "cure" or
-- "permanent" — and nothing may be edited to.
--
-- Ingredient spellings follow the bottle, with one exception: the label reads
-- "Smalll Onion" with three Ls, which is a printing typo rather than a
-- different ingredient, so it is set as "Small Onion". Note also that SSG's
-- two products spell the same herb differently — "Karisalankanni" on the
-- Shikakai artwork, "Karisalangani" here. Each product keeps its own label's
-- spelling; see the note in the report.
--
-- `specifications` now carries shelf life and the external-use warning, both
-- printed on the label. Brief §74 listed these as "do not invent" — they are
-- no longer invented, they are transcribed.

insert into products (
  name, slug, short_description, ingredients, benefits, specifications,
  is_active, is_featured, sort_order
)
values (
  'SSG Homemade Herbal Hair Oil',
  'herbal-hair-oil',
  '100% Natural · Infused with 13+ Natural Herbs · For All Hair Types',
  array[
    'Coconut Oil', 'Amla', 'Hibiscus Leaves', 'Hibiscus Flower',
    'Karisalangani', 'Mehandi Leaves', 'Fenugreek Seeds', 'Small Onion',
    'Rose petals', 'Aloe Vera', 'Curry Leaves', 'Neem leaves', 'Vetiver',
    'Other Herbs'
  ],
  array[
    'Reduces Hair Fall',
    'Makes Hair Thick & Stronger',
    'Helpful in Premature Greying',
    'Treats Dandruff',
    'Nourishes Hair Growth & Looks Shining',
    'Restores Hair Strength'
  ],
  jsonb_build_object(
    'Shelf life', 'Best before 12 months from packaging',
    'Directions', 'External use only',
    'Herbs', 'Infused with 13+ natural herbs',
    'Suitable for', 'All hair types'
  ),
  true,
  true,
  2
)
on conflict (slug) do update
  set name              = excluded.name,
      short_description = excluded.short_description,
      ingredients       = excluded.ingredients,
      benefits          = excluded.benefits,
      specifications    = excluded.specifications,
      is_active         = excluded.is_active,
      is_featured       = excluded.is_featured,
      sort_order        = excluded.sort_order;

--   100ml  MRP ₹390  ->  ₹259   (34% off)
--   200ml  MRP ₹680  ->  ₹389   (43% off)

with p as (select id from products where slug = 'herbal-hair-oil')
insert into product_variants (
  product_id, variant_name, quantity_value, quantity_unit,
  mrp_paise, selling_price_paise, sort_order
)
select p.id, v.variant_name, v.qty, v.unit, v.mrp, v.price, v.ord
from p, (values
  ('100ml', 100::numeric, 'ml', 39000, 25900, 1),
  ('200ml', 200::numeric, 'ml', 68000, 38900, 2)
) as v(variant_name, qty, unit, mrp, price, ord)
where not exists (
  select 1 from product_variants pv
  where pv.product_id = p.id and pv.variant_name = v.variant_name
);

update product_variants pv
set mrp_paise = v.mrp, selling_price_paise = v.price
from products p, (values
  ('100ml', 39000, 25900),
  ('200ml', 68000, 38900)
) as v(variant_name, mrp, price)
where pv.product_id = p.id
  and p.slug = 'herbal-hair-oil'
  and pv.variant_name = v.variant_name;
