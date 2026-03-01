import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function supabaseAdmin(path: string, method: string, body?: object) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret);
  } catch (err) {
    console.error('Webhook signature failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }
      case 'customer.subscription.deleted':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(sub);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const displayName = session.metadata?.displayName || 'Anonymous';
  const mode = session.mode;

  if (!userId) return;

  const tier = mode === 'subscription'
    ? (session.metadata?.tier || 'monthly')
    : 'donor';

  const amountCents = session.amount_total || 0;

  const countRes = await fetch(`${supabaseUrl}/rest/v1/supporters?select=id`, {
    headers: { 'apikey': supabaseServiceKey, 'Authorization': `Bearer ${supabaseServiceKey}` },
  });
  const existing = await countRes.json();
  const isFounding = Array.isArray(existing) && existing.length < 100;

  await supabaseAdmin(
    `profiles?id=eq.${userId}`,
    'PATCH',
    {
      is_supporter: true,
      supporter_since: new Date().toISOString(),
      supporter_tier: tier,
      stripe_customer_id: session.customer,
      stripe_subscription_id: session.subscription || null,
    }
  );

  await supabaseAdmin('supporters', 'POST', {
    user_id: userId,
    display_name: displayName,
    tier,
    amount_cents: amountCents,
    is_founding: isFounding,
    show_on_wall: true,
    supporter_since: new Date().toISOString(),
  });
}

async function handleSubscriptionChange(sub: Stripe.Subscription) {
  const customerId = sub.customer as string;
  const active = sub.status === 'active' || sub.status === 'trialing';

  await supabaseAdmin(
    `profiles?stripe_customer_id=eq.${customerId}`,
    'PATCH',
    { is_supporter: active }
  );
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  await supabaseAdmin(
    `profiles?stripe_customer_id=eq.${customerId}`,
    'PATCH',
    { is_supporter: false }
  );
}
