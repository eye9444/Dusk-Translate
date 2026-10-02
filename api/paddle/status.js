import { grantsPaidAccess } from '../../server/billing.js';
import { requireAuthenticatedUser, getSupabaseAdmin } from '../../server/supabase.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
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
      response.status(200).json({ customer: false, subscription: null, hasPaidAccess: false });
      return;
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from('subscriptions')
      .select('subscription_id,status,price_id,product_id,scheduled_change_action,scheduled_change_at')
      .eq('customer_id', customer.customer_id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    response.status(200).json({
      customer: true,
      subscription,
      hasPaidAccess: grantsPaidAccess(subscription),
    });
  } catch (error) {
    response.status(error.statusCode || 500).json({ error: error.message || 'Unable to load billing status.' });
  }
}
