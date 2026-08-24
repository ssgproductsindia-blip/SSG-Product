import 'server-only';

import { Resend } from 'resend';

import { emailConfigured, serverEnv } from '@/lib/env';
import { escapeHtml } from '@/lib/email/templates';
import { BRAND } from '@/lib/brand';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Contact form email.
 *
 * Reuses the same Resend configuration as order email (RESEND_API_KEY,
 * ORDER_EMAIL_FROM) rather than standing up a second email path — this
 * project has one transactional mail sender, not one per feature. It is a
 * separate function from sendOrderEmail() because that function's
 * duplicate-prevention scheme is keyed on an order id; a contact message has
 * no order to key against, and forcing one through would be the wrong tool
 * reused past where it fits.
 *
 * The destination is the store's own contact address from `store_settings`,
 * configured by the owner in the admin panel — never an address supplied by
 * the visitor, which would let a contact form be used to spam a third party
 * "on behalf of" SSG.
 */

export type ContactEmailOutcome =
  | { status: 'sent' }
  | { status: 'not_configured'; message: string }
  | { status: 'failed'; message: string };

export async function sendContactMessage(input: {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}): Promise<ContactEmailOutcome> {
  if (!emailConfigured()) {
    return {
      status: 'not_configured',
      message: 'Email is not configured (RESEND_API_KEY / ORDER_EMAIL_FROM).',
    };
  }

  const supabase = createServiceClient();
  const { data: settings } = await supabase
    .from('store_settings')
    .select('email, store_name')
    .eq('id', true)
    .maybeSingle();

  const to = settings?.email;
  if (!to) {
    return {
      status: 'not_configured',
      message: 'No store contact email is configured yet (Admin → Settings).',
    };
  }

  const env = serverEnv();
  const storeName = settings.store_name || BRAND.name;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#fcf7ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2a231c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2dad0;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:24px 28px;">
      <p style="margin:0 0 4px 0;font-size:12px;color:#7a6a5a;">New message from the ${escapeHtml(storeName)} contact form</p>
      <h1 style="margin:0 0 16px 0;font-size:18px;">${escapeHtml(input.subject)}</h1>
      <p style="margin:0 0 4px 0;font-size:14px;"><strong>From:</strong> ${escapeHtml(input.name)} (${escapeHtml(input.email)})</p>
      ${input.phone ? `<p style="margin:0 0 12px 0;font-size:14px;"><strong>Phone:</strong> ${escapeHtml(input.phone)}</p>` : ''}
      <p style="margin:16px 0 0 0;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeHtml(input.message)}</p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `New message from the ${storeName} contact form`,
    ``,
    `Subject: ${input.subject}`,
    `From: ${input.name} (${input.email})`,
    ...(input.phone ? [`Phone: ${input.phone}`] : []),
    ``,
    input.message,
  ].join('\n');

  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: env.ORDER_EMAIL_FROM as string,
      to,
      // Setting reply-to means clicking "Reply" in the inbox goes straight
      // back to the customer, without exposing the store's sending address.
      replyTo: input.email,
      subject: `Contact form: ${input.subject}`,
      html,
      text,
    });

    if (error) return { status: 'failed', message: error.message ?? 'Unknown provider error.' };
    return { status: 'sent' };
  } catch (cause) {
    return {
      status: 'failed',
      message: cause instanceof Error ? cause.message : 'Unexpected error sending the message.',
    };
  }
}
