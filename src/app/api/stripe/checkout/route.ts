import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICE_IDS: Record<string, string> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  annual: process.env.STRIPE_PRICE_ANNUAL!,
};

export async function POST(req: NextRequest) {
  try {
    const { userId, displayName, tier, donationAmount } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const origin = req.headers.get('origin') || 'https://familyhaven.app';

    let session: Stripe.Checkout.Session;

    if (tier === 'donor' && donationAmount) {
      // One-off donation — custom amount
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        currency: 'aud',
        line_items: [{
          price_data: {
            currency: 'aud',
            unit_amount: Math.round(donationAmount * 100),
            product_data: {
              name: 'Haven Community Donation',
              description: 'Thank you for supporting Haven.',
            },
          },
          quantity: 1,
        }],
        metadata: { userId, displayName, tier: 'donor' },
        success_url: `${origin}/supporters?thankyou=1`,
        cancel_url: `${origin}/support`,
      });
    } else {
      // Subscription
      const priceId = PRICE_IDS[tier];
      if (!priceId) {
        return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
      }

      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { userId, displayName, tier },
        success_url: `${origin}/supporters?thankyou=1`,
        cancel_url: `${origin}/support`,
      });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
