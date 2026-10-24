function resolve(path,base){
  try{return decodeURIComponent(new URL(path,`https://epub.invalid/${base}`).pathname.slice(1));}catch{return '';}
}
export async function pruneDeletedEpub(zip,snapshot){
  if(!snapshot.deletedChapters?.length)return;
  const opfPath=snapshot.novel._epubOpfPath,entry=zip.file(opfPath);
  if(!entry)throw new Error('EPUB package is missing.');
  const parser=new DOMParser(),opf=parser.parseFromString(await entry.async('string'),'application/xml');
  if(opf.querySelector('parsererror'))throw new Error('EPUB package could not be parsed safely.');
  const items=Array.from(opf.getElementsByTagName('item')),removed=new Set(),imageCandidates=new Set();
  const retainedPaths=new Set(snapshot.novel.chapters.map(ch=>ch.xhtmlPath));
  for(const chapter of snapshot.deletedChapters){
    if(retainedPaths.has(chapter.xhtmlPath))continue;
    const item=items.find(item=>resolve(item.getAttribute('href'),opfPath)===chapter.xhtmlPath&&item.getAttribute('media-type')==='application/xhtml+xml');
    if(!item)continue;
    const chapterEntry=zip.file(chapter.xhtmlPath);
    if(chapter.removeImages&&chapterEntry){
      const content=parser.parseFromString(await chapterEntry.async('string'),'application/xhtml+xml');
      for(const image of content.querySelectorAll('img,image')){
        const href=image.getAttribute('src')||image.getAttribute('href')||image.getAttribute('xlink:href');
        if(href)imageCandidates.add(resolve(href,chapter.xhtmlPath));
      }
    }
    removed.add(chapter.xhtmlPath);zip.remove(chapter.xhtmlPath);
    for(const ref of Array.from(opf.getElementsByTagName('itemref')))if(ref.getAttribute('idref')===item.getAttribute('id'))ref.remove();
    item.remove();
  }
  const remainingText=[];
  for(const item of items.filter(item=>item.parentNode)){
    const path=resolve(item.getAttribute('href'),opfPath),file=zip.file(path),type=item.getAttribute('media-type')||'';
    if(!file||!(/xml|html|css|svg/.test(type)))continue;
    let text=await file.async('string');
    if(type.includes('xml')||type.includes('html')){
      const doc=parser.parseFromString(text,'application/xml');
      if(!doc.querySelector('parsererror')){
        for(const link of doc.querySelectorAll('a[href],content[src]')){
          const target=resolve(link.getAttribute('href')||link.getAttribute('src'),path);
          if(removed.has(target)){
            if(link.localName==='content'){
              const parent=link.parentElement;
              for(const child of Array.from(parent?.children||[]))if(child.localName==='navPoint')parent.before(child);
              parent?.remove();
            }
            else if(item.getAttribute('properties')?.split(/\s+/).includes('nav')){
              const li=link.closest('li');if(li?.querySelector('li'))link.remove();else (li||link).remove();
            }
            else link.removeAttribute('href');
          }
        }
        text=new XMLSerializer().serializeToString(doc);zip.file(path,text);
      }
    }
    remainingText.push(text);
  }
  const coverIds=new Set(Array.from(opf.getElementsByTagName('meta')).filter(meta=>meta.getAttribute('name')==='cover').map(meta=>meta.getAttribute('content')));
  for(const item of items.filter(item=>item.parentNode)){
    const path=resolve(item.getAttribute('href'),opfPath),name=path.split('/').pop();
    if(!imageCandidates.has(path)||!item.getAttribute('media-type')?.startsWith('image/')||coverIds.has(item.id)||item.getAttribute('properties')?.includes('cover-image'))continue;
    // Conservatively retain shared images, including CSS and SVG references.
    if(remainingText.some(text=>text.includes(name)||text.includes(encodeURIComponent(name))))continue;
    zip.remove(path);item.remove();
  }
  zip.file(opfPath,new XMLSerializer().serializeToString(opf));
}
