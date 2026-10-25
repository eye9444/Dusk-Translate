import JSZip from 'jszip';
import sharp from 'sharp';
import {DOMParser} from '@xmldom/xmldom';
import {getSupabaseAdmin} from './supabase.js';

export const validReaderToken=token=>typeof token==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(token);
const elements=(doc,name)=>Array.from(doc.getElementsByTagNameNS('*',name));
const resolvePath=(base,href)=>{
  if(!href||/^[a-z][a-z0-9+.-]*:|^\/\/|\\/i.test(href))return null;
  const url=new URL(href,new URL(base,'https://epub.invalid/'));
  return url.origin==='https://epub.invalid'?decodeURIComponent(url.pathname.slice(1)):null;
};
export async function epubPreviewCover(bytes){
  if(bytes.length>50*1024*1024)return null;
  const zip=await JSZip.loadAsync(bytes);
  const read=(path,limit)=>new Promise((resolve,reject)=>{
    const file=zip.file(path);if(!file)return resolve(null);
    const chunks=[];let length=0;const stream=file.internalStream('nodebuffer');
    stream.on('data',chunk=>{length+=chunk.length;if(length>limit){stream.pause();reject(new Error('Cover resource too large'));}else chunks.push(chunk);});
    stream.on('end',()=>resolve(Buffer.concat(chunks)));stream.on('error',reject);stream.resume();
  });
  const xml=async path=>{
    const data=await read(path,1024*1024);if(!data)return null;
    const source=data.toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(source))return null;
    return new DOMParser({onError:()=>{}}).parseFromString(source,'application/xml');
  };
  const container=await xml('META-INF/container.xml');if(!container)return null;
  const opfPath=resolvePath('',elements(container,'rootfile')[0]?.getAttribute('full-path'));
  if(!opfPath)return null;const opf=await xml(opfPath);if(!opf)return null;
  const items=elements(opf,'item'),coverId=elements(opf,'meta').find(m=>m.getAttribute('name')==='cover')?.getAttribute('content');
  let item=items.find(i=>(i.getAttribute('properties')||'').split(/\s+/).includes('cover-image'))||items.find(i=>coverId&&i.getAttribute('id')===coverId);
  let path=item&&resolvePath(opfPath,item.getAttribute('href'));
  if(!path){
    const guide=elements(opf,'reference').find(r=>r.getAttribute('type')==='cover');
    const guidePath=guide&&resolvePath(opfPath,guide.getAttribute('href'));
    if(guidePath){const page=await xml(guidePath);const img=page&&(elements(page,'img')[0]||elements(page,'image')[0]);
      path=img&&resolvePath(guidePath,img.getAttribute('src')||img.getAttribute('href')||img.getAttribute('xlink:href'));
      item=items.find(i=>resolvePath(opfPath,i.getAttribute('href'))===path);
    }
  }
  const type=item?.getAttribute('media-type');if(!path||!['image/jpeg','image/png','image/webp','image/gif'].includes(type))return null;
  const image=await read(path,4*1024*1024);if(!image)return null;
  const matches=type==='image/png'?image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    type==='image/jpeg'?image[0]===255&&image[1]===216&&image[2]===255:
    type==='image/gif'?/^GIF8[79]a/.test(image.subarray(0,6).toString()):image.subarray(0,4).toString()==='RIFF'&&image.subarray(8,12).toString()==='WEBP';
  return matches?{bytes:image,type}:null;
}

// Revalidate the share token on every request, including cache hits.
export async function resolveReaderPreview(token){
  const admin=getSupabaseAdmin();
  const {data,error}=await admin.rpc('open_public_reader_link',{reader_token:token})
    .select('project_id,title,file_name,file_path').maybeSingle();
  if(error)throw error;return data?{...data,id:data.project_id}:null;
}
const covers=new Map();let cacheBytes=0;
export async function composeReaderCover(cover){
  if(!cover)return null;
  const source=()=>sharp(cover.bytes,{limitInputPixels:40000000,animated:false}).rotate();
  const background=await source().resize(1200,630,{fit:'cover'}).blur(28).modulate({brightness:.45}).toBuffer();
  const foreground=await source().resize(1120,582,{fit:'inside'}).png().toBuffer();
  const bytes=await sharp(background).composite([{input:foreground,gravity:'centre'}]).jpeg({quality:85}).toBuffer();
  return {bytes,type:'image/jpeg',width:1200,height:630};
}
export async function loadReaderCover(project){
  if(!/\.epub$/i.test(project.file_name))return null;
  const key=project.id+':'+project.file_path,cached=covers.get(key);
  if(cached&&cached.expires>Date.now())return cached.cover;
  if(cached){cacheBytes-=cached.cover?.bytes.length||0;covers.delete(key);}
  const admin=getSupabaseAdmin();
  const {data,error}=await admin.storage.from('books').createSignedUrl(project.file_path,60);
  if(error)throw error;
  const response=await fetch(data.signedUrl,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('Cover source unavailable');
  const chunks=[];let length=0;
  for await(const chunk of response.body){length+=chunk.length;if(length>50*1024*1024)throw new Error('EPUB too large');chunks.push(chunk);}
  const cover=await composeReaderCover(await epubPreviewCover(Buffer.concat(chunks)));
  while(covers.size&&(cacheBytes+(cover?.bytes.length||0)>16*1024*1024||covers.size>=32)){const [old,value]=covers.entries().next().value;cacheBytes-=value.cover?.bytes.length||0;covers.delete(old);}
  covers.set(key,{cover,expires:Date.now()+600000});cacheBytes+=cover?.bytes.length||0;return cover;
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function readerPreviewHtml(template,{token,project,cover}){
  const title=project?`${project.title} | DuskTranslate`:'DuskTranslate Reader';
  const description=project?'Read this shared novel on DuskTranslate.':'Open a shared novel or an EPUB in DuskTranslate.';
  const url='https://www.dusktranslate.com/reader'+(token?'?share='+encodeURIComponent(token):'');
  const image='https://www.dusktranslate.com/api/reader?share='+encodeURIComponent(token)+'&cover=1&layout=wide';
  const cleaned=template.replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta\b[^>]*(?:name|property)=["'](?:og:[^"']*|twitter:[^"']*|description|robots)["'][^>]*>/gi,'').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi,'').replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,'');
  const tags=`<title>${escape(title)}</title><meta name="robots" content="noindex,nofollow"><link rel="canonical" href="${escape(url)}"><meta name="description" content="${description}"><meta property="og:type" content="book"><meta property="og:site_name" content="DuskTranslate"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${description}"><meta property="og:url" content="${escape(url)}"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:card" content="${cover?'summary_large_image':'summary'}">`;
  const images=cover?`<meta property="og:image" content="${escape(image)}"><meta property="og:image:type" content="${cover.type}"><meta property="og:image:alt" content="${escape('Cover of '+project.title)}"><meta name="twitter:image" content="${escape(image)}">`:'';
  const dimensions=cover?.width&&cover?.height?`<meta property="og:image:width" content="${cover.width}"><meta property="og:image:height" content="${cover.height}">`:'';
  return cleaned.replace('</head>',tags+images+dimensions+'</head>');
}
