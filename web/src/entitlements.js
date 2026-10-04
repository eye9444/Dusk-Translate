// Public offer metadata only. Authorization is resolved independently on the server.
export const TIER_ORDER = Object.freeze({ free: 0, pro: 1, advanced: 2 });
// Keep persisted price mappings compatible; 'advanced' is now branded Teams.
export const TIER_LABELS = Object.freeze({ free: 'Starter', pro: 'Pro', advanced: 'Teams' });
export const FEATURE_TIERS = Object.freeze({
  consistency: 'pro', rubyEdit: 'pro', replaceImages: 'pro', exportSelection: 'pro',
  customPrompt: 'advanced', readerLinks: 'advanced', readerComments: 'advanced',
});
export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({ projects: 3, storageBytes: 100_000_000, seats: 2, dailyCharacters: 30_000 }),
  pro: Object.freeze({ projects: 50, storageBytes: 1_000_000_000, seats: 5, dailyCharacters: null }),
  advanced: Object.freeze({ projects: 200, storageBytes: 5_000_000_000, seats: 10, dailyCharacters: null }),
});
export function describeEntitlements(tier = 'free') {
  if (!(tier in TIER_ORDER)) throw new Error('Unknown subscription tier.');
  return {
    tier, limits: PLAN_LIMITS[tier],
    capabilities: Object.fromEntries(Object.entries(FEATURE_TIERS).map(([feature, required]) =>
      [feature, TIER_ORDER[tier] >= TIER_ORDER[required]])),
  };
}
export function countSourceCharacters(text) {
  return Array.from(text || '').length;
}
