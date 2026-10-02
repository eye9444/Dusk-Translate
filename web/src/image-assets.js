import JSZip from 'jszip';
import { validateReplacementMetadata } from './image-policy.js';

const TYPES={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
const cleanPath=value=>decodeURIComponent(value).replace(/\\/g,'/').split('/').reduce((parts,part)=>{if(!part||part==='.')return parts;if(part==='..')parts.pop();else parts.push(part);return parts;},[]).join('/');

export async function listEpubImages(file){
  const zip=await JSZip.loadAsync(file),container=zip.file('META-INF/container.xml');
  if(!container)throw new Error('EPUB container is missing.');
  const xml=value=>new DOMParser().parseFromString(value,'application/xml');
  const opfPath=xml(await container.async('string')).querySelector('rootfile')?.getAttribute('full-path');
  const opfEntry=opfPath&&zip.file(cleanPath(opfPath));if(!opfEntry)throw new Error('EPUB package is missing.');
  const base=cleanPath(opfPath).split('/').slice(0,-1).join('/'),opf=xml(await opfEntry.async('string'));
  const assets=[];
  for(const item of opf.querySelectorAll('manifest > item')){
    const mime=item.getAttribute('media-type')||'',href=item.getAttribute('href')||'',path=cleanPath(`${base}/${href}`),entry=zip.file(path);
    if(!entry||!mime.startsWith('image/'))continue;
    const bytes=await entry.async('uint8array');
    assets.push({epubPath:path,name:path.split('/').pop()||'image',mime,bytes,replaceable:Object.values(TYPES).includes(mime)});
  }
  return assets;
}

function hasChunk(bytes,name){
  const token=[...name].map(character=>character.charCodeAt(0));
  outer:for(let index=0;index<=bytes.length-token.length;index++){for(let offset=0;offset<token.length;offset++)if(bytes[index+offset]!==token[offset])continue outer;return true;}return false;
}
function dimensions(bytes,mime){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(mime==='image/png'&&bytes.length>=24&&view.getUint32(0)===0x89504e47&&view.getUint32(4)===0x0d0a1a0a)return {width:view.getUint32(16),height:view.getUint32(20),animated:hasChunk(bytes,'acTL')};
  if(mime==='image/jpeg'){
    if(bytes.length<4||view.getUint16(0)!==0xffd8)throw new Error('The file contents are not a JPEG image.');
    let offset=2;while(offset+9<bytes.length){if(bytes[offset]!==0xff){offset++;continue;}const marker=bytes[offset+1],length=view.getUint16(offset+2);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {height:view.getUint16(offset+5),width:view.getUint16(offset+7),animated:false};if(length<2)break;offset+=2+length;}
  }
  if(mime==='image/webp'&&bytes.length>=30&&hasChunk(bytes.slice(0,12),'RIFF')&&hasChunk(bytes.slice(8,12),'WEBP')){const kind=String.fromCharCode(...bytes.slice(12,16));if(kind==='VP8X')return {width:1+view.getUint8(24)+(view.getUint8(25)<<8)+(view.getUint8(26)<<16),height:1+view.getUint8(27)+(view.getUint8(28)<<8)+(view.getUint8(29)<<16),animated:Boolean(view.getUint8(20)&2)};if(kind==='VP8 ')return {width:view.getUint16(26,true)&0x3fff,height:view.getUint16(28,true)&0x3fff,animated:hasChunk(bytes,'ANIM')};if(kind==='VP8L'){const b1=bytes[21],b2=bytes[22],b3=bytes[23],b4=bytes[24];return {width:1+b1+((b2&0x3f)<<8),height:1+(b2>>6)+(b3<<2)+((b4&0x0f)<<10),animated:hasChunk(bytes,'ANIM')};}}
  throw new Error('Could not safely read this image header. Use a conventional static PNG, JPEG, or WebP file.');
}

export async function validateReplacement(file,originalBytes){
  const bytes=new Uint8Array(await file.arrayBuffer()),metadata={originalBytes,bytes:bytes.length,mime:file.type,...dimensions(bytes,file.type)};
  validateReplacementMetadata(metadata);return {...metadata,file};
}

export async function applyImageReplacements(file,replacements){
  if(!replacements?.length)return file;
  const zip=await JSZip.loadAsync(file);
  for(const replacement of replacements)zip.file(replacement.epubPath,replacement.file);
  return zip.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE',compressionOptions:{level:6}});
}
