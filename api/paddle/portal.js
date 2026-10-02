import { getPaddle } from '../../server/paddle.js';
import { requireAuthenticatedUser, getSupabaseAdmin } from '../../server/supabase.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const user = await requireAuthenticatedUser(request);
    const admin = getSupabaseAdmin();
    const { data: customer, error: customerError } = await admin
      .from('customers')
      .select('customer_id')
      .ilike('email', user.email)
      .limit(1)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer) {
      response.status(404).json({ error: 'No Paddle customer exists for this account yet.' });
      return;
    }

    const { data: subscriptions, error: subscriptionError } = await admin
      .from('subscriptions')
      .select('subscription_id')
      .eq('customer_id', customer.customer_id);
    if (subscriptionError) throw subscriptionError;

    const session = await getPaddle().customerPortalSessions.create(
      customer.customer_id,
      (subscriptions || []).map(subscription => subscription.subscription_id),
    );
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({ url: session.urls.general.overview });
  } catch (error) {
    response.status(error.statusCode || 500).json({ error: error.message || 'Unable to open the billing portal.' });
  }
}
