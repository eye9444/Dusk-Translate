// In-app announcements are for product features, not fixes or visual polish.
export const RELEASES=Object.freeze([
  Object.freeze({id:'2026-10-24-feedback-chapters',date:'2026-10-24',title:'A better way to report problems and organise chapters',items:Object.freeze([
    'Your reports now have their own conversation in Feedback Hub. You can reply there, see whether I have accepted a report or put it on standby, and read my reason if I reject it. Unread replies show up in the sidebar.',
    'Right-click a chapter to mark it unfinished, mark translated chapters complete, or delete selected chapters together. You can also focus a chapter and press Shift+F10. For EPUBs, you can remove unused images from deleted chapters when exporting. Your uploaded original stays untouched.',
    'Account now shows your cloud project count and storage usage. You can also find my Reddit profile and the Discord server in the feedback form.',
  ])}),
  Object.freeze({id:'2026-10-20-community',date:'2026-10-20',title:"I'm making DuskTranslate free",paragraphs:Object.freeze([
    "Hey everyone. I've decided to make all the current features on DuskTranslate free for everyone, including everything that was behind the Pro and Teams plans.",
    "After talking this through with someone who works in software and fan translation, I realised the paid plans weren't a good fit for the people using the site right now. A lot of you buy the Japanese books yourselves, spend your own time translating them, and share that work with readers for free. I don't want the tools here to be another expense on top of that.",
    "So you can use the custom prompts, editing tools, and full team review workflow without a subscription. I'm putting the paid plans aside for now.",
    "Hosting still costs money, so I'm setting up optional donations to help keep the site running. The payment link isn't ready yet. Once it is, if you like the site and can spare a little, I'd appreciate it. If you can't, please keep using it anyway.",
    "You'll still need your own AI-provider key, and your provider may charge for translations. Cloud storage and project limits also still apply. Making the features free doesn't remove those costs or limits.",
    "Thanks for using DuskTranslate and telling me what needs fixing. It helps a lot while I'm building this.",
  ]),signature:'Eye, creator of DuskTranslate',items:Object.freeze([
    'Also in this update: you can now translate Japanese or English into Portuguese.',
  ])}),
  Object.freeze({id:'2026-10-18-italian',date:'2026-10-18',title:'Italian joins the translation room',items:Object.freeze([
    'Translate Japanese or English books and web novels into Italian with the same chapter, glossary, review, and export workflow.',
  ])}),
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
