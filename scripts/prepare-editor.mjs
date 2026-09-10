import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
const source = await readFile('releases/development/DuskTranslate_epubfixestest6dev_delimiter.html', 'utf8');
await mkdir('web/public/editor', { recursive: true });
// Preserve the standalone releases. Ship the latest engine with a project adapter.
const html = source
  .replace('if (!full.length && !plainTextFallback)', 'if (!full.length && !plainTextFallback && !abortCtrl.signal.aborted)')
  .replace('} else if (full.length > 80)', '} else if (full.length > 0)')
  .replace('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', '/editor/jszip.min.js')
  .replace('<title>LN Translator</title>', '<title>DuskTranslate workspace</title>')
  .replace('</head>', '<link rel="stylesheet" href="/editor/adapter.css"></head>')
  .replace(/<\/body>\s*<\/html>\s*$/, '<script src="/editor/adapter.js"></script></body></html>');
await writeFile('web/public/editor/index.html', html);
await copyFile('node_modules/jszip/dist/jszip.min.js', 'web/public/editor/jszip.min.js');
await copyFile('web/editor/adapter.js', 'web/public/editor/adapter.js');
await copyFile('web/editor/adapter.css', 'web/public/editor/adapter.css');
