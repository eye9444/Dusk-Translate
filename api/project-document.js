import { getSupabaseAdmin, requireAuthenticatedUser } from '../server/supabase.js';
import { getPaddleEnvironment } from '../server/paddle.js';
import { createDocumentSeed } from '../web/src/shared-document.js';
import { validateDocumentUpdate } from '../server/document-validation.js';

const bytes=value=>new Uint8Array(Buffer.from(value.slice(2),'hex'));
const hex=value=>'\\x'+Buffer.from(value).toString('hex');
export default async function handler(request,response){
 response.setHeader('Cache-Control','no-store');
 if(request.method!=='POST'){response.setHeader('Allow','POST');return response.status(405).json({error:'Method not allowed.'});}
 try{
   const user=await requireAuthenticatedUser(request),admin=getSupabaseAdmin();
   const body=typeof request.body==='string'?JSON.parse(request.body):request.body||{};
   const permission=await admin.rpc('project_actor_can_read_document',{target_project:body.projectId,actor:user.id});
   if(permission.error)throw permission.error;
   if(!permission.data)return response.status(403).json({error:'Document access required.'});
   const project=await admin.from('projects').select('owner_id,snapshot').eq('id',body.projectId).single();
   if(project.error)throw project.error;
   if(body.action==='initialize'){
     const result=await admin.rpc('initialize_checked_document',{actor:user.id,target_project:body.projectId,initial_state:hex(createDocumentSeed(project.data.snapshot))});
     if(result.error)throw result.error;
     return response.status(200).json({seed:result.data});
   }
   if(body.action!=='append'||!/^\\x(?:[0-9a-f]{2})+$/i.test(body.payload||'')||body.payload.length>2097154)return response.status(400).json({error:'Invalid update.'});
   const document=await admin.from('project_documents').select('seed,update_revision').eq('project_id',body.projectId).single();
   if(document.error)throw document.error;
   // Paginate explicitly: Supabase's default row limit must not truncate CRDT state.
   const updates=[];
   for(let offset=0;;offset+=1000){
     const result=await admin.from('project_document_updates').select('payload').eq('project_id',body.projectId)
       .order('created_at').order('update_id').range(offset,offset+999);
     if(result.error)throw result.error;
     updates.push(...result.data.map(row=>bytes(row.payload)));
     if(result.data.length<1000)break;
   }
   const tier=await admin.rpc('account_tier',{target_user_id:user.id,target_environment:getPaddleEnvironment()});
   if(tier.error)throw tier.error;
   validateDocumentUpdate(bytes(document.data.seed),updates,bytes(body.payload),tier.data);
   const saved=await admin.rpc('append_checked_document',{actor:user.id,target_project:body.projectId,operation_id:body.operationId,
     update_bytes:body.payload,expected_revision:document.data.update_revision,validated_tier:tier.data});
   if(saved.error)throw saved.error;
   return response.status(200).json({saved:true});
 }catch(error){return response.status(error.statusCode||409).json({error:error.message||'Document update could not be saved. Sync and retry.'});}
}
