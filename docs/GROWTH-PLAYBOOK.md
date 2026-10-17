# DuskTranslate Organic Growth Playbook

This playbook keeps promotion useful, honest, and free. The goal is not to spray links across communities. It is to publish material that helps translators, earns relevant references, and lets search engines understand what DuskTranslate actually does.

## Positioning

**Core line:** A book and web novel translation workspace: Japanese at heart, with more languages in reach.

**One sentence:** DuskTranslate imports EPUB and TXT projects, keeps source and editable translation side by side, manages terminology and review, and exports the finished book.

**Who it is for:** light-novel and web-novel translators, fan translation teams working with authorized material, multilingual writers, language learners doing close reading, and people who want a structured alternative to translating chapters in isolated chat sessions.

Never market it as a one-click perfect translator, a piracy tool, or support for every language. Always mention that machine output requires human review and that users must have permission to process their source material.

## Search Setup

1. Add `https://www.dusktranslate.com` to Google Search Console and Bing Webmaster Tools.
2. Submit `https://www.dusktranslate.com/sitemap.xml` in both dashboards.
3. Inspect `/`, `/features.html`, and `/guides/api-keys.html`, then request indexing once after deployment.
4. Monitor indexed pages, search queries, click-through rate, Core Web Vitals, and crawl errors monthly. Do not request indexing repeatedly without meaningful page changes.
5. Add an IndexNow key only after Bing Webmaster Tools is connected. Keep the generated key out of this repository until it is intentionally public as the required verification file.

## Pages Worth Publishing Next

Each page should answer a real question with screenshots and link naturally to the app. Publish one useful page at a time.

- How to translate an EPUB chapter by chapter without breaking its structure
- A practical Japanese light-novel translation workflow with glossary examples
- EPUB versus TXT for web-novel translation projects
- How to use Yomitan alongside a Japanese translation workspace
- How to review machine translation against Japanese source text
- How translator, proof-reader, QC, and lead roles fit together
- How to use OpenRouter, Claude, OpenAI, or Google AI Studio with your own key

Avoid near-duplicate landing pages for every keyword or language pair. A smaller collection of genuinely useful guides is more credible and easier to maintain.

## Community Promotion

Before posting, read each community's current self-promotion rules and ask moderators when the policy is ambiguous. Participate without links first where possible. Disclose that you built the product and ask for specific feedback.

Good free channels include relevant translation communities, language-learning communities that permit tools, EPUB and self-publishing communities, open-source showcases, Hacker News Show HN, Indie Hackers, Product Hunt, AlternativeTo, Slant, GitHub topics, and personal dev logs. Do not repost the same pitch everywhere on the same day.

The existing r/mangapiracy and r/machinetranslation posts should be followed with useful progress updates only when the communities permit them. Do not retry r/animepiracy while its software-promotion policy excludes the product.

## Reusable Launch Copy

### Short directory description

DuskTranslate is a browser-based workspace for translating books and web novels. Import EPUB or TXT, translate and edit chapter by chapter, keep names consistent with a glossary, review source and output side by side, collaborate through staged roles, and export TXT or EPUB. Japanese-to-English is the primary route, with selected Japanese and English routes into Vietnamese, Russian, German, Spanish, and Italian.

### Show HN title

Show HN: DuskTranslate – a chapter-based translation workspace for EPUBs and web novels

### Community post opener

I built DuskTranslate because translating a novel in isolated prompts made it too easy to lose chapter state, recurring names, and revisions. It imports EPUB or TXT projects, keeps source and editable output side by side, and maintains a glossary through export. Japanese-to-English is still the main focus. I would especially value feedback on EPUB compatibility and real translation-review workflows.

### Outreach note

I came across your work on book or web-novel translation and thought your workflow experience might expose problems I have missed. I build DuskTranslate, a browser workspace for chapter-based translation and review. If the project is relevant to you, I would appreciate blunt feedback; there is no expectation to post or promote it.

## GitHub Discoverability

Keep the repository description aligned with the core sentence and use focused topics: `translation`, `epub`, `web-novel`, `light-novel`, `japanese`, `localization`, `translation-workflow`, `openrouter`, `openai`, `claude`, and `supabase`. Every feature or bug-fix release should have concise release notes, while visual-only changes remain silent under the current version policy.

Pin an issue called “Feedback and EPUB compatibility reports” with a clear reproduction template. Label beginner-friendly issues only when they are genuinely scoped and documented.

## Monthly Rhythm

- Week 1: publish or improve one useful guide based on a real user question.
- Week 2: share that guide in one community where it directly answers a recurring problem.
- Week 3: post a short development note with screenshots or a concrete compatibility improvement.
- Week 4: review Search Console and feedback, then choose the next guide from demonstrated demand.

Measure qualified actions rather than raw impressions: local-library opens, account creation, first project import, first completed chapter, return use, and feedback submissions. Add privacy-respecting analytics only after defining those events and updating the privacy policy.
