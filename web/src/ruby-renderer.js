// Only text and known ruby elements are created; EPUB markup is never injected.
export function renderRubyParagraph(block) {
  const paragraph = document.createElement('p');
  const text = block.text || '';
  let cursor = 0;
  for (const item of [...(block.ruby || [])].sort((a, b) => a.start - b.start)) {
    if (!Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start < cursor || item.end <= item.start || item.end > text.length || typeof item.reading !== 'string') continue;
    paragraph.append(document.createTextNode(text.slice(cursor, item.start)));
    const ruby = document.createElement('ruby'), reading = document.createElement('rt');
    ruby.append(document.createTextNode(text.slice(item.start, item.end)));
    reading.textContent = item.reading; ruby.append(reading); paragraph.append(ruby);
    cursor = item.end;
  }
  paragraph.append(document.createTextNode(text.slice(cursor)));
  return paragraph;
}
