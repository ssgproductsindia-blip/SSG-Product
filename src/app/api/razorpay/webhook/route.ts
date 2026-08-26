import { NextResponse, type NextRequest } from 'next/server';

import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Razorpay webhook.
 *
 * This is reconciliation, not the primary order-creation path — orders are
 * created synchronously, in the same request that receives the Checkout
 * widget's success callback (see placeOrderAction in checkout-actions.ts),
 * because that is the only place this app actually has the cart contents and
 * shipping address needed to build one. By the time a webhook for the same
 * payment arrives, an order created that way should normally already exist.
 *
 * What this endpoint is FOR: the case where the synchronous path did not
 * finish — the customer's tab closed right after paying but before
 * placeOrderAction's request completed, for instance. Razorpay captured real
 * money in that scenario and this app has no record of it. Reconstructing a
 * full order from webhook data alone (no cart, no address) is not attempted
 * here — that would mean guessing at what the customer meant to buy. Instead
 * this logs a clearly actionable admin_audit_logs entry so a human can find
 * the payment in the Razorpay dashboard and follow up, rather than the
 * captured payment vanishing without a trace anywhere in this system.
 *
 * Must read the RAW body before any parsing — verifyWebhookSignature checks
 * the exact bytes Razorpay signed, and re-serializing parsed JSON can change
 * whitespace or key order in ways that break a genuine signature.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');

  if (!verifyWebhookSignature(rawBody, signature)) {
    // 400, not 401/403: a signature mismatch means we cannot trust anything
    // about this request, including whether it is even worth distinguishing
    // "unauthorized" from "malformed" to whoever sent it.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = event.event;
  const payment = event.payload?.payment?.entity;

  // Only these two are handled — everything else Razorpay might send
  // (refunds, disputes, subscription events) is acknowledged with 200 and
  // otherwise ignored, since nothing downstream currently uses it.
  if (
    (eventType !== 'payment.captured' && eventType !== 'payment.failed') ||
    !payment?.order_id ||
    !payment.id
  ) {
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from('orders')
    .select('id, payment_status')
    .eq('razorpay_order_id', payment.order_id)
    .maybeSingle();

  if (!order) {
    // See the file docstring: this is the one case that actually needs a
    // human, because there is no order here to reconcile automatically.
    await supabase.from('admin_audit_logs').insert({
      action: 'payment.webhook_no_matching_order',
      entity_type: 'razorpay_payment',
      entity_id: payment.id,
      metadata: { razorpay_order_id: payment.order_id, event: eventType },
    });
    return NextResponse.json({ received: true });
  }

  const nextStatus = eventType === 'payment.captured' ? 'paid' : 'failed';

  // Idempotent: a webhook Razorpay retries, or one that arrives after the
  // synchronous path already set the same status, is a no-op update rather
  // than a duplicate side effect.
  if (order.payment_status !== nextStatus) {
    await supabase
      .from('orders')
      .update({
        payment_status: nextStatus,
        payment_provider: 'razorpay',
        payment_reference: payment.id,
      })
      .eq('id', order.id);

    await supabase.from('admin_audit_logs').insert({
      action: 'payment.webhook_status_updated',
      entity_type: 'order',
      entity_id: order.id,
      metadata: { razorpay_payment_id: payment.id, event: eventType, new_status: nextStatus },
    });
  }

  return NextResponse.json({ received: true });
}
