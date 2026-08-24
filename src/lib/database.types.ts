/**
 * Database types.
 *
 * Hand-authored to match supabase/migrations/*.sql. Once your Supabase project
 * exists you can regenerate this file from the live schema with:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 *
 * Keep the two in step: this file is what stops a renamed column from becoming
 * a runtime `undefined` instead of a compile error.
 */

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type NotificationType =
  | 'order_confirmation'
  | 'order_shipped'
  | 'order_status_updated';

export type NotificationStatus = 'sent' | 'failed';

type Timestamps = { created_at: string; updated_at: string };

export type CategoryRow = Timestamps & {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export type ProductRow = Timestamps & {
  id: string;
  name: string;
  slug: string;
  category_id: string | null;
  short_description: string | null;
  description: string | null;
  ingredients: string[];
  benefits: string[];
  usage_instructions: string | null;
  specifications: Record<string, unknown>;
  seo_title: string | null;
  seo_description: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
}

export type ProductVariantRow = Timestamps & {
  id: string;
  product_id: string;
  variant_name: string;
  quantity_value: number | null;
  quantity_unit: string | null;
  mrp_paise: number;
  selling_price_paise: number;
  sku: string | null;
  /** null means stock is not tracked for this variant. */
  stock: number | null;
  is_active: boolean;
  sort_order: number;
}

export type ProductImageRow = {
  id: string;
  product_id: string;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  width: number | null;
  height: number | null;
  created_at: string;
}

export type CustomerRow = Timestamps & {
  id: string;
  email: string;
  name: string;
  phone: string | null;
}

export type OrderRow = Timestamps & {
  id: string;
  order_number: string;
  customer_id: string;
  subtotal_paise: number;
  discount_paise: number;
  shipping_paise: number;
  total_paise: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_provider: string | null;
  payment_reference: string | null;
  notes: string | null;
  /** Set only when the buyer was signed in at checkout. Null for guest orders. */
  auth_user_id: string | null;
}

export type ProfileRow = Timestamps & {
  id: string;
  full_name: string | null;
  phone: string | null;
}

export type CustomerAddressRow = Timestamps & {
  id: string;
  profile_id: string;
  label: string | null;
  name: string;
  phone: string;
  address: string;
  apartment: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name_snapshot: string;
  variant_name_snapshot: string;
  sku_snapshot: string | null;
  mrp_paise_snapshot: number;
  selling_price_paise_snapshot: number;
  quantity: number;
  subtotal_paise: number;
}

export type ShippingAddressRow = {
  id: string;
  order_id: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export type ShipmentRow = Timestamps & {
  id: string;
  order_id: string;
  courier_name: string;
  tracking_id: string;
  tracking_url: string | null;
  shipped_at: string;
}

export type NotificationLogRow = {
  id: string;
  order_id: string;
  notification_type: NotificationType;
  recipient: string;
  status: NotificationStatus;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export type AdminAuditLogRow = {
  id: string;
  admin_user_id: string | null;
  admin_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type StoreSettingsRow = {
  id: boolean;
  store_name: string;
  logo_path: string | null;
  whatsapp: string | null;
  instagram_url: string | null;
  email: string | null;
  address: string | null;
  shipping_flat_paise: number | null;
  free_shipping_threshold_paise: number | null;
  tax_config: Record<string, unknown>;
  updated_at: string;
}

export type AdminUserRow = {
  user_id: string;
  email: string;
  role: 'admin' | 'owner';
  created_at: string;
}

/**
 * Insert shapes.
 *
 * Two kinds of column are optional when inserting: those the database
 * generates (ids, timestamps, DEFAULTs) and those that accept NULL — omitting
 * a nullable column is the same as passing null, so requiring it would force
 * every call site to spell out `error_message: null`.
 */
type NullableKeys<T> = {
  [K in keyof T]-?: null extends T[K] ? K : never;
}[keyof T];

type Insertable<T, Generated extends keyof T> = Omit<T, Generated | NullableKeys<T>> &
  Partial<Pick<T, Generated | NullableKeys<T>>>;

type Table<Row, Ins, Upd = Partial<Ins>> = {
  Row: Row;
  Insert: Ins;
  Update: Upd;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      categories: Table<
        CategoryRow,
        Insertable<CategoryRow, 'id' | 'created_at' | 'updated_at' | 'sort_order' | 'is_active'>
      >;
      products: Table<
        ProductRow,
        Insertable<
          ProductRow,
          | 'id'
          | 'created_at'
          | 'updated_at'
          | 'ingredients'
          | 'benefits'
          | 'specifications'
          | 'is_active'
          | 'is_featured'
          | 'sort_order'
        >
      >;
      product_variants: Table<
        ProductVariantRow,
        Insertable<
          ProductVariantRow,
          'id' | 'created_at' | 'updated_at' | 'is_active' | 'sort_order'
        >
      >;
      product_images: Table<
        ProductImageRow,
        Insertable<ProductImageRow, 'id' | 'created_at' | 'sort_order' | 'is_primary'>
      >;
      customers: Table<
        CustomerRow,
        Insertable<CustomerRow, 'id' | 'created_at' | 'updated_at'>
      >;
      orders: Table<
        OrderRow,
        Insertable<
          OrderRow,
          | 'id'
          | 'order_number'
          | 'created_at'
          | 'updated_at'
          | 'status'
          | 'payment_status'
          | 'discount_paise'
          | 'shipping_paise'
        >
      >;
      order_items: Table<OrderItemRow, Insertable<OrderItemRow, 'id'>>;
      shipping_addresses: Table<
        ShippingAddressRow,
        Insertable<ShippingAddressRow, 'id' | 'country'>
      >;
      shipments: Table<
        ShipmentRow,
        Insertable<ShipmentRow, 'id' | 'created_at' | 'updated_at' | 'shipped_at'>
      >;
      notification_logs: Table<
        NotificationLogRow,
        Insertable<NotificationLogRow, 'id' | 'created_at'>
      >;
      admin_audit_logs: Table<
        AdminAuditLogRow,
        Insertable<AdminAuditLogRow, 'id' | 'created_at' | 'metadata'>
      >;
      store_settings: Table<StoreSettingsRow, Insertable<StoreSettingsRow, 'id' | 'updated_at'>>;
      admin_users: Table<AdminUserRow, Insertable<AdminUserRow, 'created_at' | 'role'>>;
      profiles: Table<ProfileRow, Insertable<ProfileRow, 'created_at' | 'updated_at'>>;
      customer_addresses: Table<
        CustomerAddressRow,
        Insertable<CustomerAddressRow, 'id' | 'created_at' | 'updated_at' | 'is_default'>
      >;
    };
    Views: Record<never, never>;
    Functions: {
      lookup_order: {
        Args: { p_order_number: string; p_contact: string };
        Returns: unknown;
      };
      create_order: {
        Args: {
          p_customer: { name: string; email: string; phone: string };
          p_shipping: {
            address: string;
            city: string;
            state: string;
            postal_code: string;
            country: string;
          };
          p_items: { variant_id: string; quantity: number }[];
          p_notes: string | null;
          p_auth_user_id?: string | null;
        };
        Returns: unknown;
      };
      is_admin: { Args: Record<never, never>; Returns: boolean };
    };
    Enums: {
      order_status: OrderStatus;
      payment_status: PaymentStatus;
      notification_type: NotificationType;
      notification_status: NotificationStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}
