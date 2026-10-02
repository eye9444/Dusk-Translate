/**
 * Keep Paddle price IDs together so changing an offer does not require editing
 * checkout or rendering code.
 *
 * @typedef {{
 *   name: 'Starter' | 'Pro' | 'Advanced',
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
    features: ['Everything in Starter', 'Expanded project workflow', '7-day free trial'],
    priceId: {
      month: 'pri_01m3ytbd6gcsryxwe8fbfadsgz',
      year: 'pri_01m3ytbde7rh43snkbnee4atdh',
    },
  },
  {
    name: 'Advanced',
    description: 'For serious projects that need the full workspace.',
    features: ['Everything in Pro', 'Advanced workspace tools', '7-day free trial'],
    priceId: {
      month: 'pri_01m3ytbdymdkjgr76nqp69drc1',
      year: 'pri_01m3ytbe6kjkrxa13zjy7gegkb',
    },
  },
]);
