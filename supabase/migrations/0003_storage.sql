-- ============================================================================
-- SSG Products — Storage
-- ----------------------------------------------------------------------------
-- One public bucket for product photography. Public READ is correct: these are
-- catalogue images meant to be served to anonymous shoppers and cached by the
-- CDN. Public WRITE is not — uploads are restricted to admins.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760, -- 10 MB; product photography above this should be compressed first
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Brand assets (logo, OG images). Separate bucket so that a bulk purge of
-- product photography can never take the logo with it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- allowed_mime_types on the bucket is the real defence against someone
-- uploading an .html file to a public bucket and getting stored XSS on the
-- storage origin. These policies control who, the bucket config controls what.

create policy "product images are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');

create policy "brand assets are publicly readable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'brand-assets');

create policy "admins upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('product-images', 'brand-assets') and is_admin());

create policy "admins update product images"
  on storage.objects for update to authenticated
  using (bucket_id in ('product-images', 'brand-assets') and is_admin())
  with check (bucket_id in ('product-images', 'brand-assets') and is_admin());

create policy "admins delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id in ('product-images', 'brand-assets') and is_admin());
