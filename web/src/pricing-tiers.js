/**
 * Keep Paddle price IDs together so changing an offer does not require editing
 * checkout or rendering code.
 *
 * @typedef {{
 *   name: 'Starter' | 'Pro' | 'Teams',
 *   description: string,
 *   features: string[],
 *   priceId: { month: string, year: string }
 * }} Tier
 */

/** @type {readonly Tier[]} */
export const PRICING_TIERS = Object.freeze([
  {
    name: 'Starter',
    description: 'A calm place to begin translating a personal project.',
    features: ['Personal translation projects', 'Core editor and exports'],
    priceId: {
      month: 'pri_01m3ytbcem2m6vyat2nrgmx0zk',
      year: 'pri_01m3ytbcp6ye3z08h3t5w2s3wf',
    },
  },
  {
    name: 'Pro',
    description: 'More room for regular solo translation work.',
    features: ['Everything in Starter', 'Personal premium tools', '7-day free trial'],
    priceId: {
      month: 'pri_01m41bn725t30w2ta3zjf181mx',
      year: 'pri_01m41bn7b9gww2020gar6d25v7',
    },
  },
  {
    name: 'Teams',
    description: 'Your individual plan for collaborative translation work.',
    features: ['Everything in Pro', 'Individual subscription for team members', '7-day free trial'],
    priceId: {
      month: 'pri_01m41bn7n481yz3hhyw7pgyyce',
      year: 'pri_01m41bn7yanzs6t1596hjd5n05',
    },
  },
]);

// Live IDs must be explicitly configured; sandbox IDs are never a live fallback.
export function getPricingTiers(environment, livePrices) {
  if (!['sandbox', 'production'].includes(environment)) throw new Error('Paddle environment is required.');
  if (environment === 'sandbox') return PRICING_TIERS;
  let mapping;
  try { mapping = JSON.parse(livePrices || ''); } catch { throw new Error('Live Paddle price mapping is required.'); }
  return PRICING_TIERS.map(tier => {
    if (tier.name === 'Starter') return { ...tier, priceId: {} };
    const priceId = mapping[tier.name];
    if (!/^pri_[a-z0-9]+$/.test(priceId?.month || '') || !/^pri_[a-z0-9]+$/.test(priceId?.year || '')) {
      throw new Error(`Missing live prices for ${tier.name}.`);
    }
    return { ...tier, priceId };
  });
}
