// In-app announcements are for product features, not fixes or visual polish.
export const RELEASES=Object.freeze([
  Object.freeze({id:'2026-10-12-workflow',date:'2026-10-12',title:'Language routes and team review',items:Object.freeze([
    'Translate Japanese into English, Vietnamese, Russian, German, or Spanish, and English into Vietnamese, Russian, German, or Spanish.',
    'Teams can use staged Translator, Proof-reader, Quality Checker, Lead, and per-chapter publishing workflows.',
    'Teams can replace the master translation prompt with shared or personal instructions.',
  ])}),
]);
export const LATEST_RELEASE_ID=RELEASES[0].id;

// Retired cosmetic notices already included the feature history below them.
const RETIRED_NOTICE_FEATURES=Object.freeze({
  '2026-10-12-v040':'2026-10-12-workflow',
  '2026-10-12-v041':'2026-10-12-workflow',
  '2026-10-13-v042':'2026-10-12-workflow',
});
export function hasSeenLatestRelease(id){
  return id===LATEST_RELEASE_ID||RETIRED_NOTICE_FEATURES[id]===LATEST_RELEASE_ID;
}
