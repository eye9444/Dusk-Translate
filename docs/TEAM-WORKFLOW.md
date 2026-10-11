# Teams Translation Workflow

Teams projects can opt into a staged, per-chapter review pipeline without changing ordinary projects, which continue to use live collaborative editing.

## Roles and stages

1. A Translator or Junior Translator claims a chapter, chooses any base MTL, edits the translation, and submits it. The submitted base MTL is frozen with that revision.
2. An optional Proof-reader compares the source, base MTL, and submitted revision, then edits and submits or returns it with a required note.
3. An optional Quality Checker performs the same comparison and handoff.
4. The Lead Translator approves and publishes the chapter.

The project owner is the initial Lead and can assign a collaborator as Lead. Every workflow participant needs their own Teams access, while the owner continues to control project storage and seats.

## Revision rules

- Every handoff creates an immutable revision with its author, stage, timestamp, translation, base MTL, and note.
- A reviewer can claim work from the shared role queue. Self-review is permitted and remains visible in revision history.
- Returns require a note and an earlier destination stage.
- Publication is per chapter. The Lead is the only stage that can publish.
- The workflow is optional. Disabling it leaves the existing live Yjs collaboration path unchanged.

## Prompt precedence

Translation prompts resolve in this order: personal browser override, shared project prompt, then the built-in default. Custom prompts are limited to 20,000 characters and 80 KB. Source text, glossary data, and reference context remain in separately labelled sections so book content cannot silently become application instructions.
