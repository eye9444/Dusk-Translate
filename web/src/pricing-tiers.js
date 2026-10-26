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
      'Unlimited local projects with EPUB, TXT, JSON, and pasted chapters',
      'Japanese to English, Vietnamese, Russian, German, Spanish, Italian, or Portuguese',
      'English to Vietnamese, Russian, German, Spanish, Italian, or Portuguese',
      'Vietnamese, Russian, German, Spanish, Italian, or Portuguese to English',
      'Google AI Studio, OpenRouter, OpenAI, Claude, and compatible HTTPS endpoints',
      '3 cloud projects and 100 MB of cloud storage',
      '30,000 cloud translation characters per day',
      '2 people per cloud project, including the owner',
      'Glossary, dictionary, reader, find/replace, TXT/EPUB exports, and backups',
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
      'Public reader preparation and advanced project tools',
    ],
    priceId: {
      month: 'pri_01m41bn725t30w2ta3zjf181mx',
      year: 'pri_01m41bn7b9gww2020gar6d25v7',
    },
  },
  {
    name: 'Teams',
    description: 'A staged translation room for organized publishing teams.',
    features: [
      'Everything in Pro',
      '200 cloud projects and 5 GB of cloud storage',
      '10 people per cloud project, including the owner',
      'Lead, Translator, Proof-reader, and Quality Checker roles',
      'Assigned chapter queues with submit, return, review, and final approval stages',
      'Side-by-side source, base MTL, and revision comparison',
      'Shared project prompts and personal master-prompt overrides',
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
