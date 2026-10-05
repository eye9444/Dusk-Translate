import { describeEntitlements, TIER_ORDER } from '../web/src/entitlements.js';
import { getSupabaseAdmin } from './supabase.js';
import { getPaddleEnvironment } from './paddle.js';

export function resolveTier(subscriptions, prices) {
  return (subscriptions || []).reduce((tier, subscription) => {
    const candidate = prices.get(subscription.price_id);
    return ['active', 'trialing'].includes(subscription.status)
      && candidate in TIER_ORDER && TIER_ORDER[candidate] > TIER_ORDER[tier] ? candidate : tier;
  }, 'free');
}

export async function getAccountEntitlements(userId, admin = getSupabaseAdmin()) {
  const { data: superUser, error: superUserError } = await admin.from('super_users')
    .select('user_id').eq('user_id', userId).maybeSingle();
  if (superUserError) throw superUserError;
  const { data: betaAccessUntil, error: betaError } = await admin.rpc('beta_access_until', { target_user_id: userId });
  if (betaError) throw betaError;
  const betaAccess = betaAccessUntil && new Date(betaAccessUntil).getTime() > Date.now();
  const environment = getPaddleEnvironment();
  const { data: customers, error } = await admin.from('customers')
    .select('customer_id').eq('user_id', userId).eq('environment', environment);
  if (error) throw error;
  const { data: prices, error: priceError } = await admin.from('billing_prices')
    .select('price_id,tier').eq('environment', environment);
  if (priceError) throw priceError;
  let subscriptions = [];
  if (customers.length) {
    const result = await admin.from('subscriptions').select('*')
      .in('customer_id', customers.map(customer => customer.customer_id));
    if (result.error) throw result.error;
    subscriptions = result.data;
  }
  const mapping = new Map(prices.map(price => [price.price_id, price.tier]));
  const tier = superUser || betaAccess ? 'advanced' : resolveTier(subscriptions, mapping);
  const subscription = subscriptions.find(item => mapping.get(item.price_id) === tier
    && ['active', 'trialing'].includes(item.status)) || subscriptions[0] || null;
  return { ...describeEntitlements(tier), isSuperUser: Boolean(superUser), isBetaAccess: Boolean(betaAccess), betaAccessUntil,
    customer: customers.length > 0, subscription,
    hasPaidAccess: tier !== 'free', provisioning: tier === 'free' ? 'pending_or_free' : 'ready' };
}
