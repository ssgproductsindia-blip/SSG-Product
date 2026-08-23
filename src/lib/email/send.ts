import 'server-only';

import { Resend } from 'resend';

import { emailConfigured, serverEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';
import type { NotificationType } from '@/lib/database.types';

/**
 * Transactional email with a durable, single-delivery guarantee.
 *
 * The duplicate-prevention scheme (brief §44) is a claim, not a check:
 *
 *   1. INSERT a notification_logs row with status='sent'. The partial unique
 *      index `notification_logs_one_success` makes this succeed for exactly
 *      one caller. A second concurrent attempt gets 23505 and stops here.
 *   2. Only the winner calls the provider.
 *   3. On failure the row is demoted to status='failed', which drops it out of
 *      the unique index and makes a later retry possible.
 *
 * Checking "has this been sent?" and then sending would leave a window where
 * two requests both see "no" — which is precisely how customers end up with
 * two shipping emails. Claiming first closes it.
 *
 * Nothing here ever reports success it did not achieve. An unconfigured mailer
 * returns `not_configured`; a provider error returns `failed` with the real
 * message, and the caller is expected to surface it.
 */

export type EmailOutcome =
  | { status: 'sent'; providerMessageId: string | null }
  | { status: 'duplicate' }
  | { status: 'not_configured'; message: string }
  | { status: 'failed'; message: string };

type SendArgs = {
  orderId: string;
  type: NotificationType;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendOrderEmail(args: SendArgs): Promise<EmailOutcome> {
  const supabase = createServiceClient();

  // ---- Step 1: claim the send ------------------------------------------
  const { data: claim, error: claimError } = await supabase
    .from('notification_logs')
    .insert({
      order_id: args.orderId,
      notification_type: args.type,
      recipient: args.to,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (claimError) {
    // 23505 = unique_violation: another send already succeeded for this
    // (order, type). This is the expected path when an admin double-clicks
    // "Update Tracking", and it is a success from the customer's point of view.
    if (claimError.code === '23505') {
      return { status: 'duplicate' };
    }
    return {
      status: 'failed',
      message: `Could not record the notification: ${claimError.message}`,
    };
  }

  const logId = claim.id;

  const demote = async (message: string) => {
    await supabase
      .from('notification_logs')
      .update({ status: 'failed', error_message: message.slice(0, 1000), sent_at: null })
      .eq('id', logId);
  };

  // ---- Step 2: send ------------------------------------------------------
  if (!emailConfigured()) {
    const message =
      'Email is not configured. Set RESEND_API_KEY and ORDER_EMAIL_FROM to enable delivery.';
    await demote(message);
    return { status: 'not_configured', message };
  }

  const env = serverEnv();

  try {
    const resend = new Resend(env.RESEND_API_KEY);

    const { data, error } = await resend.emails.send({
      from: env.ORDER_EMAIL_FROM as string,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      ...(env.ORDER_EMAIL_BCC ? { bcc: env.ORDER_EMAIL_BCC } : {}),
    });

    if (error) {
      await demote(error.message ?? 'Unknown provider error.');
      return { status: 'failed', message: error.message ?? 'Unknown provider error.' };
    }

    await supabase
      .from('notification_logs')
      .update({ provider_message_id: data?.id ?? null })
      .eq('id', logId);

    return { status: 'sent', providerMessageId: data?.id ?? null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unexpected error sending email.';
    await demote(message);
    return { status: 'failed', message };
  }
}

/**
 * Turns an outcome into a sentence for the admin UI.
 *
 * Brief §59 and §44: never silently fail. The admin must be able to tell the
 * difference between "the customer has been told" and "the data saved but the
 * customer has not been told", because only the second one needs them to pick
 * up the phone.
 */
export function describeOutcome(outcome: EmailOutcome, action: string): string {
  switch (outcome.status) {
    case 'sent':
      return `${action} The customer has been emailed.`;
    case 'duplicate':
      return `${action} The customer was already emailed about this, so no duplicate was sent.`;
    case 'not_configured':
      return `${action} The customer email was NOT sent — ${outcome.message}`;
    case 'failed':
      return `${action} The customer email could NOT be sent — ${outcome.message}`;
  }
}
