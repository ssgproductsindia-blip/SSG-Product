/**
 * Pure helpers for the WhatsApp Cloud API order-confirmation message.
 *
 * Kept free of `server-only` and of any network or database access so they
 * can be exercised directly. The sender in ./send.ts is the only thing that
 * performs I/O.
 */

/**
 * Normalises an Indian mobile number to the digits-only, country-code-prefixed
 * form the Cloud API expects (`919876543210`). Returns null for anything that
 * is not a valid Indian mobile, rather than guessing at a number to message.
 */
export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;

  const local = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(local)) return null;

  // Anything longer than 10 digits must be a +91 / 91 / 0 prefix; a different
  // country code would mean this is not an Indian number at all.
  const prefix = digits.slice(0, -10);
  if (prefix !== '' && prefix !== '91' && prefix !== '0') return null;

  return `91${local}`;
}

/** Rupee amount for the template body, e.g. 19900 -> "199", 19950 -> "199.50". */
export function formatRupeesForTemplate(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

/**
 * Template parameters may not contain newlines, tabs or long runs of spaces,
 * and are length-limited; a customer-typed name is untrusted input here.
 */
export function cleanTemplateText(value: string, maxLength = 60): string {
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
  return cleaned || '-';
}

export type OrderConfirmationTemplateInput = {
  to: string;
  templateName: string;
  languageCode: string;
  customerName: string;
  orderNumber: string;
  totalPaise: number;
  /** True only when the approved template includes the dynamic "Track order" URL button. */
  includeTrackButton: boolean;
};

/**
 * Builds the request body for the approved `order_confirmation` template:
 * body variables {{1}} customer name, {{2}} order number, {{3}} total in
 * rupees, plus (optionally) the URL button's dynamic suffix, the order number.
 */
export function buildOrderConfirmationPayload(input: OrderConfirmationTemplateInput) {
  const components: unknown[] = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: cleanTemplateText(input.customerName) },
        { type: 'text', text: input.orderNumber },
        { type: 'text', text: formatRupeesForTemplate(input.totalPaise) },
      ],
    },
  ];

  if (input.includeTrackButton) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: input.orderNumber }],
    });
  }

  return {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components,
    },
  };
}
