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
    description: 'Generous essentials for personal translation projects.',
    features: [
      'Unlimited local projects and translation with your own AI key',
      '3 cloud projects and 100 MB of cloud storage',
      '30,000 cloud translation characters per day',
      '2 people per cloud project, including the owner',
      'Editor, glossary, dictionary, reader, and find/replace',
      'TXT/EPUB exports, backups, and collaborator comments',
    ],
    priceId: {
      month: 'pri_01m3ytbcem2m6vyat2nrgmx0zk',
      year: 'pri_01m3ytbcp6ye3z08h3t5w2s3wf',
    },
  },
  {
    name: 'Pro',
    description: 'Premium translation tools and more room for regular work.',
    features: [
      'Everything in Starter',
      'No app-imposed daily cloud translation limit',
      '50 cloud projects and 1 GB of cloud storage',
      '5 people per cloud project, including the owner',
      'Consistency checker and ruby text editing',
      'Replace EPUB images and choose exported chapters',
    ],
    priceId: {
      month: 'pri_01m41bn725t30w2ta3zjf181mx',
      year: 'pri_01m41bn7b9gww2020gar6d25v7',
    },
  },
  {
    name: 'Teams',
    description: 'Advanced publishing and collaboration for larger projects.',
    features: [
      'Everything in Pro',
      '200 cloud projects and 5 GB of cloud storage',
      '10 people per cloud project, including the owner',
      'Custom project translation instructions',
      'Public EPUB reader links with reader comments',
    ],
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
