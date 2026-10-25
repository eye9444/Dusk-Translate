// Only declared, local raster covers are used. Never fetch references from book markup.
export async function readEpubCover(file) {
  if(!file||file.size>50*1024*1024)return null;
  const {default:JSZip}=await import('jszip');
  const zip=await JSZip.loadAsync(file);
  const read=async(path,limit)=>{
    const entry=zip.file(path);if(!entry)return null;
    return new Promise((resolve,reject)=>{
      let size=0;const chunks=[],stream=entry.internalStream('uint8array');
      stream.on('data',chunk=>{size+=chunk.length;if(size>limit){stream.pause();reject(new Error('Cover resource too large'));}else chunks.push(chunk);});
      stream.on('error',reject);stream.on('end',()=>{const result=new Uint8Array(size);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length;}resolve(result);});stream.resume();
    });
  };
  const xml=bytes=>new DOMParser().parseFromString(new TextDecoder().decode(bytes),'application/xml');
  const container=await read('META-INF/container.xml',65536);if(!container)return null;
  const path=xml(container).querySelector('rootfile')?.getAttribute('full-path');if(!path)return null;
  const packageBytes=await read(path,2*1024*1024);if(!packageBytes)return null;
  const doc=xml(packageBytes),coverId=doc.querySelector('meta[name="cover"]')?.getAttribute('content');
  const item=[...doc.querySelectorAll('manifest > item')].find(i=>i.getAttribute('properties')?.split(/\s+/).includes('cover-image'))||[...doc.querySelectorAll('manifest > item')].find(i=>coverId&&i.id===coverId);
  if(!item)return null;
  const type=item.getAttribute('media-type');if(!['image/jpeg','image/png','image/webp','image/gif'].includes(type))return null;
  const href=item.getAttribute('href');if(!href||/^[a-z]+:|^\/\//i.test(href))return null;
  const base=new URL(path,'https://epub.invalid/'),url=new URL(href,base);if(url.origin!==base.origin)return null;
  const bytes=await read(decodeURIComponent(url.pathname.slice(1)),12*1024*1024);
  return bytes?new Blob([bytes],{type}):null;
}

export function createCoverGallery(loadFile){
  let observer,queue=[],running=0,epoch=0;const urls=new Set();
  const pump=()=>{while(running<2&&queue.length){const task=queue.shift();running++;task().finally(()=>{running--;pump();});}};
  return {
    reset(){epoch++;observer?.disconnect();queue=[];for(const url of urls)URL.revokeObjectURL(url);urls.clear();},
    attach(card,project){
      const cover=document.createElement('div');cover.className='project-cover';
      const title=document.createElement('span');title.textContent=project.title;cover.append(title);
      const hint=document.createElement('small');hint.textContent='No cover';cover.append(hint);card.prepend(cover);
      if(!/\.epub$/i.test(project.fileName))return;
      const version=epoch;
      cover.loadCover=()=>{queue.push(async()=>{try{
        if(version!==epoch||!cover.isConnected)return;
        const blob=await readEpubCover(await loadFile(project));if(!blob||version!==epoch||!cover.isConnected)return;
        const url=URL.createObjectURL(blob);urls.add(url);const image=new Image();image.alt=`Cover of ${project.title}`;image.decoding='async';
        image.onload=()=>{if(version===epoch&&cover.isConnected)cover.replaceChildren(image);};image.src=url;
      }catch{/* Keep the title fallback when a cover is missing or unreadable. */}});pump();};
      observer??=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);entry.target.loadCover();}},{rootMargin:'100px'});
      observer.observe(cover);
    }
  };
}
