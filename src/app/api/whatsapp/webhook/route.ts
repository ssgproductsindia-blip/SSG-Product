import { NextResponse, type NextRequest } from 'next/server';

import { serverEnv } from '@/lib/env';

/**
 * WhatsApp (Meta Cloud API) webhook.
 *
 * GET handles Meta's one-time verification handshake: when the callback URL
 * is entered on the app dashboard, Meta sends `hub.mode=subscribe` with a
 * `hub.verify_token` and a `hub.challenge`, and expects the challenge value
 * echoed back verbatim as plain text if (and only if) the token matches
 * WHATSAPP_VERIFY_TOKEN — a value chosen here, not issued by Meta. Anything
 * else must fail closed (403), including a missing configured token: an
 * unconfigured verify token matching nothing is the safe default, not an
 * open one.
 *
 * POST delivers actual events afterwards — message status updates, and
 * incoming messages from customers. Nothing downstream currently reads
 * these (this integration only sends order-confirmation messages, it does
 * not yet handle replies), so the body is intentionally not processed. Still
 * always returns 200: Meta interprets repeated non-200 responses as a
 * broken endpoint and disables the webhook.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = serverEnv().WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && expectedToken && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST() {
  return NextResponse.json({ received: true });
}
