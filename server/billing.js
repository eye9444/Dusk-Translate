import { getSupabaseAdmin } from './supabase.js';
import { getPaddleEnvironment } from './paddle.js';

const ACCESS_STATUSES = new Set(['active', 'trialing']);

export function grantsPaidAccess(subscription) {
  return Boolean(subscription && ACCESS_STATUSES.has(subscription.status));
}

function eventTimestamp(event) {
  return event.occurredAt || new Date().toISOString();
}

function firstPrice(item) {
  const price = item?.price;
  return {
    priceId: price?.id || '',
    productId: price?.productId || '',
  };
}

async function runRpc(name, values) {
  const { error } = await getSupabaseAdmin().rpc(name, values);
  if (error) throw error;
}

/** @typedef {import('@paddle/paddle-node-sdk').EventEntity} PaddleEvent */

async function upsertCustomer(event) {
  const customer = event.data;
  await runRpc('upsert_paddle_customer', {
    target_customer_id: customer.id,
    target_email: customer.email,
    target_event_at: eventTimestamp(event),
    target_event_id: event.eventId,
  });
}

async function upsertSubscription(event) {
  const subscription = event.data;
  const { priceId, productId } = firstPrice(subscription.items?.[0]);
  await runRpc('upsert_paddle_subscription', {
    target_subscription_id: subscription.id,
    target_customer_id: subscription.customerId,
    target_status: subscription.status,
    target_price_id: priceId,
    target_product_id: productId,
    target_scheduled_change_action: subscription.scheduledChange?.action || null,
    target_scheduled_change_at: subscription.scheduledChange?.effectiveAt || null,
    target_event_at: eventTimestamp(event),
    target_event_id: event.eventId,
  });
}

async function upsertCompletedTransaction(event) {
  const transaction = event.data;
  await runRpc('upsert_paddle_transaction', {
    target_transaction_id: transaction.id,
    target_customer_id: transaction.customerId,
    target_status: transaction.status,
    target_completed_at: transaction.completedAt || eventTimestamp(event),
    target_event_at: eventTimestamp(event),
    target_event_id: event.eventId,
  });
}

/**
 * Paddle may redeliver and reorder notifications. Each database function
 * upserts by Paddle resource ID and ignores stale event timestamps.
 *
 * @param {PaddleEvent} event
 */
export async function processPaddleEvent(event) {
  const supported = /^(customer\.(created|updated)|subscription\.(created|updated|canceled|trialing|activated|paused|past_due|resumed)|transaction\.completed)$/;
  if (!supported.test(event.eventType)) return;
  const customerId = event.eventType.startsWith('customer.') ? event.data.id : event.data.customerId;
  await runRpc('ensure_paddle_customer_environment', {
    target_customer_id: customerId, target_environment: getPaddleEnvironment(),
  });
  switch (event.eventType) {
    case 'customer.created':
    case 'customer.updated':
      await upsertCustomer(event);
      return;
    case 'subscription.created':
    case 'subscription.updated':
    case 'subscription.canceled':
    case 'subscription.trialing':
    case 'subscription.activated':
    case 'subscription.paused':
    case 'subscription.past_due':
    case 'subscription.resumed':
      await upsertSubscription(event);
      if (event.data.transactionId) await bindCheckout(event.data.transactionId, customerId);
      return;
    case 'transaction.completed':
      await upsertCompletedTransaction(event);
      await bindCheckout(event.data.id, customerId);
      return;
    default:
      return;
  }
}

async function bindCheckout(transactionId, customerId) {
  await runRpc('bind_paddle_checkout', {
    target_transaction_id: transactionId, target_customer_id: customerId,
    target_environment: getPaddleEnvironment(),
  });
}
