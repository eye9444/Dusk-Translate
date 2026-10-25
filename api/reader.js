import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validReaderToken,resolveReaderPreview,loadReaderCover,readerPreviewHtml} from '../server/reader-preview.js';

export function createReaderHandler({resolve=resolveReaderPreview,cover=loadReaderCover,template=()=>readFile(join(process.cwd(),'dist/index.html'),'utf8')}={}){
  return async(request,response)=>{
    response.setHeader('Cache-Control','no-store');response.setHeader('X-Robots-Tag','noindex, nofollow');
    if(!['GET','HEAD'].includes(request.method)){response.setHeader('Allow','GET, HEAD');return response.status(405).end();}
    const token=request.query?.share,image=request.query?.cover==='1';
    let project=null,art=null,status=200;
    try{
      if(token!==undefined){if(!validReaderToken(token))status=404;else{project=await resolve(token);if(!project)status=404;}}
      if(project){try{art=await cover(project);}catch{/* A broken cover must not prevent reading the book. */}}
    }catch{status=503;}
    if(image){if(!art)return response.status(status===503?503:404).end();response.setHeader('Content-Type',art.type);response.setHeader('X-Content-Type-Options','nosniff');return response.status(200).end(request.method==='HEAD'?undefined:art.bytes);}
    try{
      const html=readerPreviewHtml(await template(),{token:validReaderToken(token)?token:null,project,cover:art});
      response.setHeader('Content-Type','text/html; charset=utf-8');return response.status(status).end(request.method==='HEAD'?undefined:html);
    }catch{return response.status(503).end('Reader temporarily unavailable. Please try again.');}
  };
}
export default createReaderHandler();
