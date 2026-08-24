'use server';

import { headers } from 'next/headers';

import { clientKey, rateLimit } from '@/lib/rate-limit';
import { contactMessageSchema } from '@/lib/validation';
import { sendContactMessage } from '@/lib/email/contact';

/**
 * Contact form submission.
 *
 * Layered protection, none of it relying on the others alone:
 *
 *   - Zod validates shape and length server-side — the only validation that
 *     actually matters, since a client-side check is just UX and stops
 *     nobody who posts to this action directly.
 *   - A honeypot field (`website`) is invisible to a real visitor via CSS and
 *     never legitimately filled in. A bot that fills every field on the form
 *     trips it; the response looks identical to a real success, so the bot
 *     gets no signal that it was caught.
 *   - Rate limiting bounds how many messages one client can trigger — see
 *     the honest limitation documented in src/lib/rate-limit.ts.
 *   - The message is only ever inserted into the outgoing email through
 *     escapeHtml() (see lib/email/templates.ts / lib/email/contact.ts), and
 *     is never rendered back into any page on this site, so there is no
 *     stored-XSS surface for it to land in.
 */

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function submitContactFormAction(input: unknown): Promise<ActionResult> {
  const requestHeaders = await headers();

  const limit = rateLimit(clientKey(requestHeaders, 'contact'), {
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });

  if (!limit.allowed) {
    return {
      ok: false,
      error: `Too many messages sent. Please wait ${limit.retryAfter} seconds and try again.`,
    };
  }

  const parsed = contactMessageSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  }

  // Honeypot tripped: report success without sending anything. A bot that
  // gets a normal-looking success response has no signal to adapt against.
  if (parsed.data.website) {
    return { ok: true, message: 'Thank you. Your message has been received.' };
  }

  const outcome = await sendContactMessage({
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone || undefined,
    subject: parsed.data.subject,
    message: parsed.data.message,
  });

  if (outcome.status === 'sent') {
    return { ok: true, message: 'Thank you. Your message has been received.' };
  }

  // Never fake a success the same way an order confirmation would not be
  // faked. If mail genuinely could not be sent, the visitor is told so and
  // pointed at WhatsApp as a working alternative, rather than believing a
  // message went out that never did.
  return {
    ok: false,
    error:
      outcome.status === 'not_configured'
        ? 'Message could not be sent right now — please reach us on WhatsApp instead.'
        : 'Unable to send your message. Please try again or reach us on WhatsApp.',
  };
}
