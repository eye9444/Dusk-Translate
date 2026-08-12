# DuskTranslate

DuskTranslate is a browser-based Japanese-to-English translation tool for working through long-form novel chapters. It provides chapter navigation, glossary support, translation through AI Studio or OpenRouter, EPUB/TXT import and export, and optional developer logging.

## Running It

Open `releases/current/DuskTranslate.html` in a modern browser. The app is a self-contained HTML file, so no build system or local server is required.

Enter an API key in the app when prompted. API keys and translation data are deliberately kept outside Git in the ignored `Important/` and `test files/` directories.

## Project Layout

```text
releases/
  current/       Main build intended for normal use
  development/  Active experimental and feature-test builds
  archive/       Older translator and EPUB test releases
Important/       Local glossary, source data, and secrets (ignored)
test files/      Local translation samples and generated files (ignored)
```

## Build Notes

- `releases/current/` is the preferred starting point.
- Files in `releases/development/` are snapshots kept for testing or comparison.
- Files in `releases/archive/` are historical versions and may contain unfinished behavior.
- The HTML builds are intentionally kept self-contained to make local testing easy.

## Privacy

This repository is private. Do not commit API keys, novel source material, generated translations, or other personal test data. The repository ignores `Important/` and `test files/` for this reason.

## Git Workflow

```bash
git status
git add -A
git commit -m "Describe the change"
git push
```
