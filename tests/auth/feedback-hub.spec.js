import {test,expect} from '@playwright/test';
import {LATEST_RELEASE_ID} from '../../web/src/releases.js';

async function signIn(page,{admin=false}={}){
  const user={id:'44444444-4444-4444-8444-444444444444',email:'feedback@example.test',aud:'authenticated',role:'authenticated',user_metadata:{translation_language_pair:{sourceLanguage:'ja',targetLanguage:'en'}}};
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const makeSession=value=>({access_token:`${encode({alg:'HS256'})}.${encode({sub:value.id,exp:Math.floor(Date.now()/1000)+3600})}.test`,refresh_token:'synthetic-feedback-refresh',token_type:'bearer',expires_in:3600,user:value});
  const session=makeSession(user);
  const ticket=description=>({id:'ticket',status:'new',description,feedback_type:'bug',created_at:'2026-11-01T00:00:00Z',unread:false});
  const state={ticketReads:0,inboxReads:0,error:null,inboxError:null,tickets:[ticket('First report')],ticket,hold:false,pending:false,release:null,
    user,session,inboxRows:null,holdInbox:false,inboxPending:false,releaseInbox:null,inboxRequests:[],
    holdScreenshot:false,screenshotPending:false,releaseScreenshot:null,screenshotError:null,imageReads:0,
    holdDelete:false,deletePending:false,releaseDelete:null,deleteError:null,deleteReads:0,
    setUser(overrides){this.user={...user,...overrides};this.session=makeSession(this.user);},
  };
  await page.route('**/api/account-preferences',route=>route.fulfill({json:{lastSeenRelease:LATEST_RELEASE_ID}}));
  await page.route('https://dusk-test.supabase.co/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/token'))return route.fulfill({json:state.session});
    if(path.endsWith('/user'))return route.fulfill({json:state.user});
    if(path.endsWith('/logout'))return route.fulfill({status:204});
    if(path.endsWith('/rpc/is_feedback_admin'))return route.fulfill({json:admin});
    if(path.endsWith('/rpc/feedback_tickets')){
      state.ticketReads++;
      const error=state.error;let tickets=state.tickets;
      if(state.hold){state.hold=false;state.pending=true;tickets=await new Promise(resolve=>{state.release=resolve;});}
      return error?route.fulfill({status:error.status,json:{message:error.message,code:error.code}}):route.fulfill({json:tickets});
    }
    if(path.endsWith('/rpc/list_feedback_inbox')){
      state.inboxReads++;
      const request={error:state.inboxError,rows:state.inboxRows??[{...ticket('Legacy founder report'),reporter_email:state.user.email}]};
      state.inboxRequests.push(request);
      if(state.holdInbox){state.inboxPending=true;await new Promise(resolve=>{request.release=resolve;state.releaseInbox=resolve;});}
      return request.error?route.fulfill({status:403,json:{message:request.error}}):route.fulfill({json:request.rows});
    }
    if(path.endsWith('/rpc/delete_feedback_report')){
      state.deleteReads++;const error=state.deleteError;
      if(state.holdDelete){state.deletePending=true;await new Promise(resolve=>{state.releaseDelete=resolve;});}
      return error?route.fulfill({status:403,json:{message:error}}):route.fulfill({json:null});
    }
    if(path.includes('/storage/v1/object/sign/feedback-screenshots/')){
      if(route.request().method()==='POST'){
        const error=state.screenshotError;
        if(state.holdScreenshot){state.screenshotPending=true;await new Promise(resolve=>{state.releaseScreenshot=resolve;});}
        return error?route.fulfill({status:403,json:{message:error}}):route.fulfill({json:{signedURL:'/object/sign/feedback-screenshots/fixture.png?token=synthetic'}});
      }
      state.imageReads++;
      return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX2kAAAAASUVORK5CYII=','base64')});
    }
    return route.fulfill({json:[]});
  });
  await page.goto('/');await page.locator('#account').click();
  await page.locator('#email').fill(user.email);await page.locator('#password').fill('SyntheticPassword123!');await page.locator('#auth-submit').click();
  await expect(page.locator('#account')).toHaveText('Account');
  // Wait for the separate badge load before counting requests made by opening the hub.
  await expect(page.locator('#feedback-inbox')).toHaveText('Feedback Hub');
  return state;
}

for(const admin of [false,true])test(`${admin?'founder':'reporter'} hub fetches once per open and gets fresh data on reopen`,async({page})=>{
  const state=await signIn(page,{admin}),before=state.ticketReads;
  await page.locator('#feedback-inbox').click();
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('First report');
  expect(state.ticketReads-before).toBe(1);
  expect(state.inboxReads).toBe(0);
  await expect(page.locator('#feedback-inbox-dialog .eyebrow')).toHaveText(admin?'FOUNDER INBOX':'YOUR REPORTS');
  await expect(page.getByRole('button',{name:'accepted',exact:true,includeHidden:true})).toHaveCount(admin?1:0);
  await page.locator('#feedback-inbox-dialog [data-close]').click();
  state.tickets=[state.ticket('A new response snapshot')];
  await page.locator('#feedback-inbox').click();
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('A new response snapshot');
  expect(state.ticketReads-before).toBe(2);
});

test('an empty successful response is rendered without another ticket request',async({page})=>{
  const state=await signIn(page),before=state.ticketReads;state.tickets=[];
  await page.locator('#feedback-inbox').click();
  await expect(page.locator('#feedback-inbox-status')).toHaveText('0 tickets (most recently updated first)');
  expect(state.ticketReads-before).toBe(1);expect(state.inboxReads).toBe(0);
});

test('a reporter denied ticket access keeps the original error and cannot use the founder fallback',async({page})=>{
  const state=await signIn(page),before=state.ticketReads;
  state.error={status:403,message:'Ticket access denied',code:'42501'};
  await page.locator('#feedback-inbox').click();
  await expect(page.locator('#library-status')).toHaveText('Tickets are not available yet: Ticket access denied · 42501');
  await expect(page.locator('#feedback-inbox-dialog')).toBeHidden();
  expect(state.ticketReads-before).toBe(1);expect(state.inboxReads).toBe(0);
});

for(const status of [404,503])test(`founder fallback remains available after ticket RPC status ${status}`,async({page})=>{
  const state=await signIn(page,{admin:true}),before=state.ticketReads;
  state.error={status,message:status===404?'Ticket migration missing':'Ticket service unavailable',code:status===404?'PGRST202':'XX000'};
  await page.locator('#feedback-inbox').click();
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Legacy founder report');
  expect(state.ticketReads-before).toBe(1);expect(state.inboxReads).toBe(1);
});

test('a failed founder fallback displays its own permission error without report data',async({page})=>{
  const state=await signIn(page,{admin:true});
  state.error={status:503,message:'Ticket service unavailable',code:'XX000'};state.inboxError='Founder access required';
  await page.locator('#feedback-inbox').click();
  await expect(page.locator('#feedback-inbox-status')).toHaveText('Founder access required');
  await expect(page.locator('#feedback-inbox-list')).toBeEmpty();expect(state.inboxReads).toBe(1);
});

test('a delayed authorised snapshot cannot reopen reports after sign-out',async({page})=>{
  const state=await signIn(page);state.hold=true;
  await page.locator('#feedback-inbox').click();
  await expect.poll(()=>state.pending).toBe(true);
  await page.evaluate(async()=>{const {cloud}=await import('/src/store.js');await cloud.auth.signOut({scope:'local'});});
  await expect(page.locator('#welcome')).toBeVisible();
  const response=page.waitForResponse(response=>response.url().endsWith('/rpc/feedback_tickets'));
  state.release([state.ticket('Previous account private report')]);await (await response).finished();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await expect(page.locator('#feedback-inbox-dialog')).toBeHidden();
  await expect(page.locator('#feedback-inbox-list')).toBeEmpty();
});

// Ported from the lead's isolated review fixture; all requests remain synthetic.
test('lead review: a delayed founder fallback cannot restore reports after sign-out',async({page})=>{
  const state=await signIn(page,{admin:true});
  state.error={status:503,message:'Ticket service unavailable',code:'XX000'};
  state.holdInbox=true;
  await page.locator('#feedback-inbox').click();
  await expect.poll(()=>state.inboxPending).toBe(true);
  await page.evaluate(async()=>{const {cloud}=await import('/src/store.js');await cloud.auth.signOut({scope:'local'});});
  await expect(page.locator('#welcome')).toBeVisible();
  const response=page.waitForResponse(response=>response.url().endsWith('/rpc/list_feedback_inbox'));
  state.releaseInbox();await (await response).finished();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await expect(page.locator('#feedback-inbox-list')).toBeEmpty();
});

async function pendingInbox(page,{error=null}={}){
  const state=await signIn(page,{admin:true});
  state.error={status:503,message:'Ticket service unavailable',code:'XX000'};
  state.inboxError=error;state.holdInbox=true;
  await page.locator('#feedback-inbox').click();
  await expect.poll(()=>state.inboxPending).toBe(true);
  return state;
}

async function signOut(page){
  await page.evaluate(async()=>{const {cloud}=await import('/src/store.js');await cloud.auth.signOut({scope:'local'});});
  await expect(page.locator('#welcome')).toBeVisible();
}

async function signBackIn(page,state){
  await page.evaluate(async email=>{
    const {cloud}=await import('/src/store.js');
    const {error}=await cloud.auth.signInWithPassword({email,password:'SyntheticPassword123!'});if(error)throw error;
  },state.user.email);
  await expect(page.locator('#account')).toHaveText('Account');
  await expect(page.locator('#feedback-inbox')).toBeVisible();
}

async function releaseInbox(page,request){
  const response=page.waitForResponse(response=>response.url().endsWith('/rpc/list_feedback_inbox'));
  request.release();await (await response).finished();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
}

test('a delayed founder fallback error cannot update status after sign-out',async({page})=>{
  const state=await pendingInbox(page,{error:'Previous founder request denied'});
  await signOut(page);
  const status=await page.locator('#feedback-inbox-status').textContent();
  await releaseInbox(page,state.inboxRequests[0]);
  await expect(page.locator('#feedback-inbox-status')).toHaveText(status);
  await expect(page.locator('#feedback-inbox-list')).toBeEmpty();
});

for(const sameAccount of [false,true])test(`a previous founder response cannot replace ${sameAccount?'the same account after sign-in':'another account'} reports`,async({page})=>{
  const state=await pendingInbox(page);
  await signOut(page);
  if(!sameAccount)state.setUser({id:'55555555-5555-4555-8555-555555555555',email:'another-founder@example.test'});
  state.error=null;state.holdInbox=false;state.tickets=[state.ticket('Current account reports')];
  await signBackIn(page,state);
  await page.locator('#feedback-inbox').click();
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Current account reports');
  await releaseInbox(page,state.inboxRequests[0]);
  await expect(page.locator('#feedback-inbox-dialog summary')).toHaveCount(1);
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Current account reports');
});

for(const error of [null,'Closed founder request failed'])test(`a closed fallback ignores delayed ${error?'errors':'successes'}`,async({page})=>{
  const state=await pendingInbox(page,{error});
  await page.locator('#feedback-inbox-dialog [data-close]').click();
  await expect(page.locator('#feedback-inbox-dialog')).toBeHidden();
  const status=await page.locator('#feedback-inbox-status').textContent();
  await releaseInbox(page,state.inboxRequests[0]);
  await expect(page.locator('#feedback-inbox-list')).toBeEmpty();
  await expect(page.locator('#feedback-inbox-status')).toHaveText(status);
});

for(const error of [null,'Older founder request failed'])test(`an older fallback ${error?'error':'success'} cannot overwrite a newer successful inbox`,async({page})=>{
  const state=await pendingInbox(page,{error});
  await page.locator('#feedback-inbox-dialog [data-close]').click();
  state.holdInbox=false;state.inboxError=null;state.inboxRows=[state.ticket('Newer founder report')];
  await page.locator('#feedback-inbox').click();
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Newer founder report');
  await releaseInbox(page,state.inboxRequests[0]);
  await expect(page.locator('#feedback-inbox-dialog summary')).toHaveCount(1);
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Newer founder report');
  await expect(page.locator('#feedback-inbox-status')).toHaveText('1 report');
});

test('a filter request supersedes a pending legacy inbox without closing the dialog',async({page})=>{
  const state=await pendingInbox(page);
  state.error=null;state.tickets=[state.ticket('Filtered current report')];
  await page.getByRole('combobox',{name:'Filter tickets'}).selectOption('new');
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Filtered current report');
  await releaseInbox(page,state.inboxRequests[0]);
  await expect(page.locator('#feedback-inbox-dialog summary')).toHaveCount(1);
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Filtered current report');
  await expect(page.locator('#feedback-inbox-status')).toHaveText('1 tickets (most recently updated first)');
});

test('a new pending hub open already supersedes the previous fallback',async({page})=>{
  const state=await pendingInbox(page);
  await page.locator('#feedback-inbox-dialog [data-close]').click();
  state.error=null;state.hold=true;
  await page.locator('#feedback-inbox').click();
  await expect.poll(()=>state.pending).toBe(true);
  await releaseInbox(page,state.inboxRequests[0]);
  await expect(page.locator('#feedback-inbox-dialog')).toBeHidden();
  await expect(page.locator('#feedback-inbox-list')).toBeEmpty();
  const response=page.waitForResponse(response=>response.url().endsWith('/rpc/feedback_tickets'));
  state.release([state.ticket('Newest hub report')]);await (await response).finished();
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Newest hub report');
});

test('an older failed ticket preflight cannot start a fallback over a newer hub',async({page})=>{
  const state=await signIn(page,{admin:true});
  state.error={status:503,message:'Older ticket request failed',code:'XX000'};state.hold=true;
  await page.locator('#feedback-inbox').click();
  await expect.poll(()=>state.pending).toBe(true);
  state.error=null;state.tickets=[state.ticket('Newest hub report')];
  await page.locator('#feedback-inbox').click();
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Newest hub report');
  const response=page.waitForResponse(response=>response.url().endsWith('/rpc/feedback_tickets'));
  state.release([]);await (await response).finished();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  expect(state.inboxReads).toBe(0);
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Newest hub report');
});

async function screenshotInbox(page,{error=null,hold=false}={}){
  const state=await signIn(page,{admin:true});
  state.error={status:503,message:'Ticket service unavailable',code:'XX000'};
  state.inboxRows=[{...state.ticket('Report with screenshot'),screenshot_path:'fixture.png'}];
  state.screenshotError=error;state.holdScreenshot=hold;
  await page.locator('#feedback-inbox').click();
  await page.locator('#feedback-inbox-dialog summary').click();
  return state;
}

for(const error of [null,'Screenshot signing denied'])test(`a closed inbox ignores a delayed screenshot ${error?'error':'URL'}`,async({page})=>{
  const state=await screenshotInbox(page,{error,hold:true});
  await expect.poll(()=>state.screenshotPending).toBe(true);
  await page.locator('#feedback-inbox-dialog [data-close]').click();
  const response=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().includes('/storage/v1/object/sign/feedback-screenshots/'));
  state.releaseScreenshot();await (await response).finished();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await expect(page.locator('#feedback-inbox-list img')).not.toHaveAttribute('src');
  await expect(page.locator('#feedback-inbox-list .field-hint')).toHaveText('Loading screenshot...');
  expect(state.imageReads).toBe(0);
});

for(const error of [null,'Screenshot signing denied'])test(`a current authorised fallback preserves screenshot ${error?'failures':'loading'}`,async({page})=>{
  const state=await screenshotInbox(page,{error});
  if(error){
    await expect(page.locator('#feedback-inbox-list .field-hint')).toContainText(error);
    await expect(page.locator('#feedback-inbox-list img')).toBeHidden();
  }else{
    await expect(page.locator('#feedback-inbox-list img')).toBeVisible();
    await expect.poll(()=>state.imageReads).toBe(1);
    await expect(page.locator('#feedback-inbox-list .field-hint')).toHaveText('');
  }
});

test('current founder report deletion retains the existing confirmation and success status',async({page})=>{
  const state=await signIn(page,{admin:true});state.error={status:503,message:'Ticket service unavailable',code:'XX000'};
  await page.locator('#feedback-inbox').click();await page.locator('#feedback-inbox-dialog summary').click();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Delete report',exact:true}).click();
  await expect(page.locator('#feedback-inbox-list')).toBeEmpty();
  await expect(page.locator('#feedback-inbox-status')).toHaveText('No feedback yet.');
  expect(state.deleteReads).toBe(1);
});

test('a stale deletion error cannot change the newer inbox status',async({page})=>{
  const state=await signIn(page,{admin:true});state.error={status:503,message:'Ticket service unavailable',code:'XX000'};
  state.holdDelete=true;state.deleteError='Old deletion failed';
  await page.locator('#feedback-inbox').click();await page.locator('#feedback-inbox-dialog summary').click();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Delete report',exact:true}).click();
  await expect.poll(()=>state.deletePending).toBe(true);
  await page.locator('#feedback-inbox-dialog [data-close]').click();
  state.inboxRows=[state.ticket('Current founder report')];
  await page.locator('#feedback-inbox').click();
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Current founder report');
  const response=page.waitForResponse(response=>response.url().endsWith('/rpc/delete_feedback_report'));
  state.releaseDelete();await (await response).finished();await page.evaluate(()=>new Promise(requestAnimationFrame));
  await expect(page.locator('#feedback-inbox-status')).toHaveText('1 report');
  await expect(page.locator('#feedback-inbox-dialog summary')).toContainText('Current founder report');
});

test('lead review: a screenshot download failure while collapsed remains retryable',async({page})=>{
  const state=await signIn(page,{admin:true});
  state.error={status:503,message:'Ticket service unavailable',code:'XX000'};
  state.inboxRows=[{...state.ticket('Report with screenshot'),screenshot_path:'fixture.png'}];
  let pending=false,release,attempts=0,signings=0;
  await page.route('**/storage/v1/object/sign/feedback-screenshots/**',async route=>{
    if(route.request().method()==='POST'){signings++;return route.fallback();}
    attempts++;if(attempts>1)return route.fallback();
    pending=true;await new Promise(resolve=>{release=resolve;});
    await route.fulfill({status:503,body:'Image unavailable'});
  });
  await page.locator('#feedback-inbox').click();
  const summary=page.locator('#feedback-inbox-dialog summary');
  await summary.click();await expect.poll(()=>pending).toBe(true);
  await summary.click();
  const response=page.waitForResponse(response=>response.request().method()==='GET'&&response.url().includes('/storage/v1/object/sign/feedback-screenshots/'));
  release();await (await response).finished();
  const image=page.locator('#feedback-inbox-list img');
  await expect.poll(()=>image.evaluate(el=>el.complete)).toBe(true);
  await expect(image).not.toHaveAttribute('src');
  await expect(page.locator('#feedback-inbox-list .field-hint')).toHaveText('Screenshot could not load. Close and reopen this report to retry.');
  await summary.click();
  await expect(image).toBeVisible();
  await expect.poll(()=>image.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  await expect(page.locator('#feedback-inbox-list .field-hint')).toHaveText('');
  expect(attempts).toBe(2);expect(signings).toBe(2);
});

test('a screenshot download succeeding while collapsed clears its loading message',async({page})=>{
  const state=await signIn(page,{admin:true});
  state.error={status:503,message:'Ticket service unavailable',code:'XX000'};
  state.inboxRows=[{...state.ticket('Report with screenshot'),screenshot_path:'fixture.png'}];
  let pending=false,release,attempts=0;
  await page.route('**/storage/v1/object/sign/feedback-screenshots/**',async route=>{
    if(route.request().method()==='POST')return route.fallback();
    attempts++;pending=true;await new Promise(resolve=>{release=resolve;});
    return route.fallback();
  });
  await page.locator('#feedback-inbox').click();
  const summary=page.locator('#feedback-inbox-dialog summary');
  await summary.click();
  await expect.poll(()=>pending).toBe(true);
  await summary.click();
  const response=page.waitForResponse(response=>response.request().method()==='GET'&&response.url().includes('/storage/v1/object/sign/feedback-screenshots/'));
  release();await (await response).finished();
  const image=page.locator('#feedback-inbox-list img');
  await expect.poll(()=>image.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  await expect(page.locator('#feedback-inbox-list .field-hint')).toHaveText('');
  await summary.click();
  await expect(image).toBeVisible();
  await expect(page.locator('#feedback-inbox-list .field-hint')).toHaveText('');
  expect(attempts).toBe(1);
});
