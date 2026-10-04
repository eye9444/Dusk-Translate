import { randomUUID } from 'node:crypto';
import { getPaddle, getPaddleEnvironment } from '../../server/paddle.js';
import { requireAuthenticatedUser, getSupabaseAdmin } from '../../server/supabase.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const user = await requireAuthenticatedUser(request);
    if (!user.email_confirmed_at) return response.status(403).json({ error: 'Verify your email before subscribing.' });
    const { priceId } = typeof request.body === 'string' ? JSON.parse(request.body) : request.body || {};
    const environment = getPaddleEnvironment();
    const admin = getSupabaseAdmin();
    const { data: price, error } = await admin.from('billing_prices').select('price_id')
      .eq('environment', environment).eq('price_id', priceId).eq('checkout_enabled', true).maybeSingle();
    if (error) throw error;
    if (!price) return response.status(400).json({ error: 'This price is not available for checkout.' });
    const association = randomUUID();
    const saved = await admin.from('billing_checkout_associations').insert({
      id: association, user_id: user.id, environment, price_id: priceId,
    });
    if (saved.error) throw saved.error;
    // Bind a server-created transaction, not untrusted Checkout customData.
    const transaction = await getPaddle().transactions.create({
      items: [{ priceId, quantity: 1 }], collectionMode: 'automatic',
      customData: { checkout_association: association },
    });
    const bound = await admin.from('billing_checkout_associations')
      .update({ transaction_id: transaction.id }).eq('id', association);
    if (bound.error) throw bound.error;
    return response.status(200).json({ transactionId: transaction.id, email: user.email });
  } catch (error) {
    return response.status(error.statusCode || 503).json({ error: 'Unable to start checkout. Please sign in and retry.' });
  }
}
