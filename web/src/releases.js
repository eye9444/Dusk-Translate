// Feature announcements use the creator's final wording when supplied.
export const RELEASES=Object.freeze([
  Object.freeze({id:'2026-10-29-v200',date:'2026-10-29',title:'Desloppification and more WN support!',paragraphs:Object.freeze([
    "Hey everyone, ok nvm am too bored, here's the patch notes.",
  ]),items:Object.freeze([
    "Major UI/UX changes to home and hero screen. There was too much stuff that the AI added that didn't make much sense and I never changed before since I was focused on the actual toolkit. They are less cluttered than your room now.",
    'Click anywhere on a project card or the Continue bar to open your book, they also look less ugly now. Turns out the rest of the card can do something besides take up space.',
    'On touchscreens, double-tap to open; tap a gallery cover once to reveal its actions. Individual buttons still work with one tap.',
    'Choose your usual language pair in Account preferences. New projects start with that choice, and it follows your account when you sign in elsewhere. New accounts get asked after their first sign-in. Existing books keep their own languages. Having to put the same two languages for every book was a bit dumb of the site.',
  ])}),
  Object.freeze({id:'2026-10-26-reverse-routes',date:'2026-10-26',title:'More books can make their way into English',items:Object.freeze([
    'You can now translate Vietnamese, Russian, German, Spanish, Italian, and Portuguese novels into English. The existing Japanese and English routes are still there.',
    'The EPUB reader now has its own light and dark mode button. It follows the same theme as the rest of DuskTranslate and remembers your choice after a reload.',
  ])}),
  Object.freeze({id:'2026-10-26-editor-preferences',date:'2026-10-26',title:'Set up the editor your way',items:Object.freeze([
    'Account now has Editor preferences for spellcheck and optional device storage of API keys and URLs. They are saved on this browser and stay in sync with the editor buttons, so you do not have to set them again for each book. These choices do not affect your collaborators.',
  ])}),
  Object.freeze({id:'2026-10-26-reader-covers',date:'2026-10-26',title:'Your book cover comes with the link',items:Object.freeze([
    'Public reader links now include the EPUB cover and book title in link previews. Books without a cover keep a text-only preview. Your existing links still work, though chat apps may take a while to refresh previews they have already saved.',
  ])}),
  Object.freeze({id:'2026-10-25-cover-gallery',date:'2026-10-25',title:'Browse your books by their covers',items:Object.freeze([
    'There is now a Gallery view in your library. It shows the cover from your EPUB, or the book title when there is no cover. You can still switch back to grid or list.',
    'Right-clicking a chapter now opens a small menu beside your cursor. Select chapters in the sidebar for bulk actions, without opening a separate dialog. Deleting chapters still asks for confirmation.',
  ])}),
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
