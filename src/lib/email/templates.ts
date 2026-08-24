import { formatPaise } from '@/lib/money';
import { BRAND } from '@/lib/brand';

/**
 * Transactional email templates.
 *
 * Table-based layout with inline styles, which is not how anyone would write a
 * web page in 2026 but is still what Outlook and Gmail actually render
 * reliably. Flexbox, grid and <style> blocks are unsafe here.
 *
 * Every template ships a plain-text alternative alongside the HTML. Some
 * clients show it, some users prefer it, and spam filters treat an
 * HTML-only transactional email with suspicion.
 *
 * Nothing in these emails invents a delivery estimate, a refund window, or a
 * support promise the store has not made.
 */

const GREEN = '#3d7a2f';
const EARTH_DARK = '#3a2414';
const CREAM = '#fcf7ef';
const LINE = '#e2dad0';
const MUTED = '#7a6a5a';

export type EmailOrderItem = {
  productName: string;
  variantName: string;
  quantity: number;
  sellingPricePaise: number;
  subtotalPaise: number;
};

export type EmailOrder = {
  orderNumber: string;
  customerName: string;
  items: EmailOrderItem[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  totalPaise: number;
  shippingAddress: {
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  trackUrl: string;
};

export function escapeHtml(value: string): string {
  // Customer-supplied strings (names, addresses) end up inside this HTML.
  // Escaping is not optional: an unescaped name is an injection into every
  // inbox that receives the mail, including the store owner's BCC copy.
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${EARTH_DARK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 0 28px;">
              <p style="margin:0;font-size:18px;font-weight:700;letter-spacing:-0.2px;color:${GREEN};">${escapeHtml(BRAND.name)}</p>
              <p style="margin:4px 0 0 0;font-size:12px;color:${MUTED};">${escapeHtml(BRAND.tagline)}</p>
            </td>
          </tr>
          ${bodyHtml}
          <tr>
            <td style="padding:24px 28px 28px 28px;border-top:1px solid ${LINE};">
              <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
                Questions about this order? Reply to this email or message us on WhatsApp.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function itemRows(items: EmailOrderItem[]): string {
  return items
    .map(
      (item) => `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;">
      <strong style="font-weight:600;">${escapeHtml(item.productName)}</strong><br>
      <span style="color:${MUTED};font-size:13px;">${escapeHtml(item.variantName)} &times; ${item.quantity}</span>
    </td>
    <td align="right" style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;white-space:nowrap;">
      ${escapeHtml(formatPaise(item.subtotalPaise))}
    </td>
  </tr>`,
    )
    .join('');
}

function totalsRows(order: EmailOrder): string {
  const rows: string[] = [
    `<tr><td style="padding:6px 0;font-size:14px;color:${MUTED};">Subtotal</td>
     <td align="right" style="padding:6px 0;font-size:14px;">${escapeHtml(formatPaise(order.subtotalPaise))}</td></tr>`,
  ];

  if (order.discountPaise > 0) {
    rows.push(
      `<tr><td style="padding:6px 0;font-size:14px;color:${GREEN};">You saved</td>
       <td align="right" style="padding:6px 0;font-size:14px;color:${GREEN};">&minus;${escapeHtml(formatPaise(order.discountPaise))}</td></tr>`,
    );
  }

  rows.push(
    `<tr><td style="padding:6px 0;font-size:14px;color:${MUTED};">Shipping</td>
     <td align="right" style="padding:6px 0;font-size:14px;">${
       order.shippingPaise > 0 ? escapeHtml(formatPaise(order.shippingPaise)) : 'Free'
     }</td></tr>`,
  );

  rows.push(
    `<tr><td style="padding:12px 0 0 0;border-top:1px solid ${LINE};font-size:16px;font-weight:700;">Total</td>
     <td align="right" style="padding:12px 0 0 0;border-top:1px solid ${LINE};font-size:16px;font-weight:700;">${escapeHtml(formatPaise(order.totalPaise))}</td></tr>`,
  );

  return rows.join('');
}

function addressBlock(order: EmailOrder): string {
  const a = order.shippingAddress;
  return `${escapeHtml(a.address)}<br>${escapeHtml(a.city)}, ${escapeHtml(a.state)} ${escapeHtml(a.postalCode)}<br>${escapeHtml(a.country)}`;
}

// ---------------------------------------------------------------------------
// Order confirmation
// ---------------------------------------------------------------------------

export function orderConfirmationEmail(order: EmailOrder) {
  const subject = `Order confirmed — ${order.orderNumber}`;

  const html = shell(
    subject,
    `
  <tr>
    <td style="padding:24px 28px 0 28px;">
      <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;font-weight:700;">Thank you, ${escapeHtml(order.customerName)}.</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:${MUTED};">
        We&rsquo;ve received your order. Your order number is
        <strong style="color:${EARTH_DARK};">${escapeHtml(order.orderNumber)}</strong> &mdash;
        keep it, you&rsquo;ll need it to track your delivery.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 28px 0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${itemRows(order.items)}
        ${totalsRows(order)}
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 28px 0 28px;">
      <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;">Shipping to</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:${MUTED};">${addressBlock(order)}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 28px 4px 28px;">
      <a href="${escapeHtml(order.trackUrl)}"
         style="display:inline-block;background-color:${GREEN};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:999px;">
        Track your order
      </a>
    </td>
  </tr>`,
  );

  const text = [
    `Thank you, ${order.customerName}.`,
    ``,
    `We've received your order.`,
    `Order number: ${order.orderNumber}`,
    ``,
    `Items:`,
    ...order.items.map(
      (i) => `  ${i.productName} (${i.variantName}) x${i.quantity} — ${formatPaise(i.subtotalPaise)}`,
    ),
    ``,
    `Subtotal: ${formatPaise(order.subtotalPaise)}`,
    ...(order.discountPaise > 0 ? [`You saved: -${formatPaise(order.discountPaise)}`] : []),
    `Shipping: ${order.shippingPaise > 0 ? formatPaise(order.shippingPaise) : 'Free'}`,
    `Total: ${formatPaise(order.totalPaise)}`,
    ``,
    `Shipping to:`,
    `  ${order.shippingAddress.address}`,
    `  ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}`,
    `  ${order.shippingAddress.country}`,
    ``,
    `Track your order: ${order.trackUrl}`,
    ``,
    `— ${BRAND.name}`,
  ].join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Shipped
// ---------------------------------------------------------------------------

export function orderShippedEmail(
  order: EmailOrder,
  shipment: { courierName: string; trackingId: string; trackingUrl: string | null },
) {
  const subject = `Your ${BRAND.name} order has been shipped — Order #${order.orderNumber}`;

  const html = shell(
    subject,
    `
  <tr>
    <td style="padding:24px 28px 0 28px;">
      <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;font-weight:700;">Your order is on its way, ${escapeHtml(order.customerName)}.</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:${MUTED};">
        Order <strong style="color:${EARTH_DARK};">${escapeHtml(order.orderNumber)}</strong> has been handed to the courier.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 28px 0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};border-radius:10px;">
        <tr>
          <td style="padding:16px 18px;">
            <p style="margin:0 0 4px 0;font-size:13px;color:${MUTED};">Courier</p>
            <p style="margin:0 0 12px 0;font-size:15px;font-weight:600;">${escapeHtml(shipment.courierName)}</p>
            <p style="margin:0 0 4px 0;font-size:13px;color:${MUTED};">Tracking ID</p>
            <p style="margin:0;font-size:15px;font-weight:600;">${escapeHtml(shipment.trackingId)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 28px 4px 28px;">
      <a href="${escapeHtml(shipment.trackingUrl ?? order.trackUrl)}"
         style="display:inline-block;background-color:${GREEN};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:999px;">
        Track shipment
      </a>
    </td>
  </tr>`,
  );

  const text = [
    `Your order is on its way, ${order.customerName}.`,
    ``,
    `Order ${order.orderNumber} has been handed to the courier.`,
    ``,
    `Courier: ${shipment.courierName}`,
    `Tracking ID: ${shipment.trackingId}`,
    `Track shipment: ${shipment.trackingUrl ?? order.trackUrl}`,
    ``,
    `— ${BRAND.name}`,
  ].join('\n');

  return { subject, html, text };
}
