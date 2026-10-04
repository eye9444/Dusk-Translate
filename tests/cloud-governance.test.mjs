import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {launchDatabase,asUser,asAdmin} from './helpers/launch-db.mjs';

test('cloud limits enforce project slots, reserved uploads, seats, and non-destructive downgrade',async()=>{
 const db=await launchDatabase(),owner=randomUUID(),editor=randomUUID(),extra=randomUUID();
 const projects=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];
 const create=async(id,size=100)=>{
   const path=`${owner}/${id}/original`;
   await db.query('select reserve_cloud_upload($1,$2,$3)',[id,path,size]);
   await db.query("insert into storage.objects(bucket_id,name,metadata) values('books',$1,$2)",[path,{size}]);
   await db.query('insert into projects(id,owner_id,title,file_name,file_path,snapshot) values($1,$2,\'Book\',\'book.epub\',$3,$4)',[id,owner,path,{novel:{chapters:[{id:'one',text:'Hello'}]},translations:{one:'World'}}]);
 };
 try{
   for(const [id,email] of [[owner,'owner@test.invalid'],[editor,'editor@test.invalid'],[extra,'extra@test.invalid']])await db.query('insert into auth.users(id,email) values($1,$2)',[id,email]);
   await asUser(db,owner);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values('books',$1,'{\"size\":100}')",[`${owner}/${projects[0]}/original`]),/Reserve upload/);
   for(const id of projects.slice(0,3))await create(id);
   await assert.rejects(create(projects[3]),/project limit/);
   await db.query('update projects set archived=true where id=$1',[projects[0]]);
   await assert.rejects(create(projects[3]),/project limit/);
   await db.query('select create_project_invitations($1,$2)',[projects[0],[{email:'editor@test.invalid',role:'editor'}]]);
   await db.query('select create_project_invitations($1,$2)',[projects[0],[{email:'editor@test.invalid',role:'editor'}]]);
   await assert.rejects(db.query('select create_project_invitations($1,$2)',[projects[0],[{email:'extra@test.invalid',role:'editor'}]]),/seat limit/);
   await asUser(db,editor);
   const invitation=(await db.query('select * from list_my_project_invitations()')).rows[0];
   await db.query('select respond_to_project_invitation($1,true)',[invitation.id]);
   assert.equal((await db.query('select project_entitlements($1) as value',[projects[0]])).rows[0].value.tier,'free');
   await asAdmin(db);
   await db.query("insert into customers(customer_id,user_id,environment) values('ctm_owner',$1,'sandbox')",[owner]);
   await db.query("select upsert_paddle_subscription('sub_owner','ctm_owner','active','pri_01m3ytbd6gcsryxwe8fbfadsgz','product',null,null,now(),'event')");
   await asUser(db,owner);await create(projects[3]);
   await db.query('select create_project_invitations($1,$2)',[projects[0],[{email:'extra@test.invalid',role:'editor'}]]);
   await asUser(db,extra);
   const invite2=(await db.query('select * from list_my_project_invitations()')).rows[0];await db.query('select respond_to_project_invitation($1,true)',[invite2.id]);
   await asAdmin(db);await db.exec("update subscriptions set status='canceled'");
   await asUser(db,extra);assert.equal((await db.query('select * from projects')).rows.length,0);
   await asUser(db,owner);
   assert.equal((await db.query('select * from projects')).rows.length,4);
   const capacity=(await db.query('select account_cloud_capacity() as result')).rows[0].result;
   assert.equal(capacity.projects.length,4);assert.equal(capacity.limits.projects,3);
   assert.equal(capacity.projects.filter(project=>project.selected).length,3);
   await assert.rejects(db.query('update projects set title=\'Changed\' where id=$1',[projects[3]]),/read-only/);
   await db.query('select select_editable_projects($1)',[[projects[1],projects[2],projects[3]]]);
   await db.query('update projects set title=\'Changed\' where id=$1',[projects[3]]);
   await db.query('select configure_project_launch($1,$2,null)',[projects[0],[extra]]);
   const seats=(await db.query('select project_seat_selection($1) as result',[projects[0]])).rows[0].result;
   assert.equal(seats.allowance,1);assert.equal(seats.members.find(member=>member.id===extra).selected,true);
   await asUser(db,extra);assert.equal((await db.query('select * from projects')).rows.length,1);
   await assert.rejects(db.query('select project_seat_selection($1)',[projects[0]]),/Owner access/);
   await asAdmin(db);assert.equal((await db.query('select * from project_collaborators')).rows.length,2);
 }finally{await db.close();}
});
