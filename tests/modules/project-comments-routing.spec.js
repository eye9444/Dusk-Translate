import {test,expect} from '@playwright/test';

async function setup(page, {owner='alice', storage='local', role='owner', account='alice'}={}) {
  await page.goto('/');
  await page.evaluate(async options=>{
    const {createComments}=await import('/src/comments.js');
    const {local}=await import('/src/store.js');
    const anchor={chapterId:'one',pane:'source',start:0,end:7,quote:'Passage'};
    const thread=(author,body)=>({id:'thread',author_id:author,anchor,resolved:false,messages:[{id:'message',author_id:author,body,created_at:new Date().toISOString()}]});
    for(const identity of ['guest','alice','bob'])await local.saveComments(identity,'same-book',[thread(identity,`${identity} saved note`)]);
    let user=options.account?{id:options.account}:null;
    let project={id:'same-book',owner:options.owner,storage:options.storage,accessRole:options.role,snapshot:{novel:{chapters:[{id:'one',text:'Passage'}]}}};
    const calls=[];
    let pendingRead, pendingSave;
    const cloud={async rpc(name,args){calls.push({name,args});if(name==='list_project_comments'){if(pendingRead)return pendingRead;return {data:[thread(user.id,'Cloud note')]};}return {data:null};}};
    const localAdapter={...local,async saveComments(identity,id,threads){
      if(pendingSave){window.commentsFixture.saveStarted=true;await pendingSave;}
      return local.saveComments(identity,id,threads);
    }};
    const controller=createComments({cloud,local:localAdapter,getUser:()=>user,getProject:()=>project,focus:()=>{}});
    window.commentsFixture={controller,calls,anchor,local,
      switchAccount(identity){user=identity?{id:identity}:null;project={...project,owner:identity||'guest'};},
      async open(){await controller.open(anchor);},
      async read(identity){return local.comments(identity,'same-book');},
      deferCloudRead(){pendingRead=new Promise(resolve=>{this.resolveRead=()=>{pendingRead=null;resolve({data:[thread('alice','Late Alice response')]});};});},
      deferLocalSave(){pendingSave=new Promise(resolve=>{this.resolveSave=()=>{pendingSave=null;resolve();};});},
    };
    await controller.open(anchor);
  },{owner,storage,role,account});
}

for(const identity of ['guest','alice'])test(`${identity} local comments stay in their existing IndexedDB namespace`,async({page})=>{
  await setup(page,{owner:identity,account:identity==='guest'?null:identity,storage:identity==='guest'?null:'local'});
  await expect(page.locator('.comment-message')).toContainText(`${identity} saved note`);
  await page.getByRole('textbox',{name:'New comment'}).fill('New local note');
  await page.getByRole('button',{name:'Post comment',exact:true}).click();
  await expect(page.locator('.comment-message')).toHaveCount(2);
  const saved=await page.evaluate(async identity=>({calls:window.commentsFixture.calls,own:await window.commentsFixture.read(identity),other:await window.commentsFixture.read(identity==='alice'?'guest':'alice')}),identity);
  expect(saved.calls).toEqual([]);
  expect(saved.own[1].author_id).toBe(identity);
  expect(saved.own[1].messages[0].author_id).toBe(identity);
  expect(saved.other).toHaveLength(1);
  await page.getByRole('button',{name:'Edit comment',exact:true}).last().click();
  await page.getByRole('textbox',{name:'Edit comment text'}).fill('Edited local note');
  await page.getByRole('button',{name:'Save comment',exact:true}).click();
  await expect(page.locator('.comment-message').last()).toContainText('Edited local note');
  await page.getByRole('button',{name:'Delete comment',exact:true}).last().click();
  await expect(page.locator('.comment-message')).toHaveCount(1);
});

for(const owner of ['alice','another-owner'])test(`${owner==='alice'?'owned':'shared'} cloud comments retain RPC routing`,async({page})=>{
  await setup(page,{owner,storage:'cloud',role:owner==='alice'?'owner':'editor'});
  await expect(page.locator('.comment-message')).toContainText('Cloud note');
  await page.getByRole('textbox',{name:'New comment'}).fill('Cloud reply');
  await page.getByRole('button',{name:'Post comment',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.commentsFixture.calls.some(call=>call.name==='write_project_comment'))).toBe(true);
  const result=await page.evaluate(async()=>({calls:window.commentsFixture.calls,local:await window.commentsFixture.read('alice')}));
  expect(result.calls.find(call=>call.name==='write_project_comment').args).toMatchObject({target_project_id:'same-book',action:'create',comment_body:'Cloud reply'});
  expect(result.local).toHaveLength(1);
});

for(const storage of ['local','cloud'])test(`${storage} viewers cannot open or write comment threads`,async({page})=>{
  await setup(page,{storage,role:'viewer'});
  await expect(page.locator('.comments-panel').last()).toBeHidden();
  await page.evaluate(()=>window.commentsFixture.controller.watch());
  await page.evaluate(()=>[...document.querySelectorAll('.comments-panel form')].at(-1).dispatchEvent(new Event('submit',{cancelable:true})));
  const calls=await page.evaluate(()=>window.commentsFixture.calls);
  expect(calls.map(call=>call.name)).toEqual(storage==='cloud'?['list_project_comments']:[]);
  expect(await page.evaluate(async()=> (await window.commentsFixture.read('alice')).length)).toBe(1);
});

test('another account cannot open a local project under its owner namespace',async({page})=>{
  await setup(page,{owner:'alice',account:'bob'});
  await expect(page.locator('.comments-panel').last()).toBeHidden();
  await page.evaluate(()=>window.commentsFixture.controller.watch());
  expect(await page.evaluate(()=>window.commentsFixture.calls)).toEqual([]);
  await expect(page.locator('.comment-message')).toHaveCount(0);
});

test('account switching clears old threads and cannot write through the previous context',async({page})=>{
  await setup(page);
  await page.evaluate(()=>window.commentsFixture.switchAccount('bob'));
  await page.getByRole('textbox',{name:'New comment'}).fill('Must not save as Bob into Alice');
  await page.getByRole('button',{name:'Post comment',exact:true}).click();
  await page.evaluate(()=>window.commentsFixture.open());
  await expect(page.locator('.comment-message')).toHaveCount(1);
  await expect(page.locator('.comment-message')).toContainText('bob saved note');
  await page.getByRole('textbox',{name:'New comment'}).fill('Bob new note');
  await page.getByRole('button',{name:'Post comment',exact:true}).click();
  await expect(page.locator('.comment-message')).toHaveCount(2);
  const result=await page.evaluate(async()=>({alice:await window.commentsFixture.read('alice'),bob:await window.commentsFixture.read('bob'),guest:await window.commentsFixture.read('guest'),calls:window.commentsFixture.calls}));
  expect(result.alice).toHaveLength(1);expect(result.guest).toHaveLength(1);
  expect(result.bob[1].messages[0]).toMatchObject({author_id:'bob',body:'Bob new note'});
  expect(result.calls).toEqual([]);
});

test('an old cloud response cannot replace comments after an account switch',async({page})=>{
  await setup(page,{storage:'cloud'});
  await page.evaluate(()=>{window.commentsFixture.deferCloudRead();window.oldCommentOpen=window.commentsFixture.open();});
  await page.evaluate(()=>{window.commentsFixture.switchAccount('bob');window.commentsFixture.resolveRead();});
  await page.evaluate(()=>window.oldCommentOpen);
  await expect(page.locator('.comment-message')).not.toContainText('Late Alice response');
});

test('an in-flight local save stays with its author and does not clear the next account draft',async({page})=>{
  await setup(page);
  await page.evaluate(()=>window.commentsFixture.deferLocalSave());
  await page.getByRole('textbox',{name:'New comment'}).fill('Alice pending note');
  await page.getByRole('button',{name:'Post comment',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.commentsFixture.saveStarted)).toBe(true);
  await page.evaluate(async()=>{window.commentsFixture.switchAccount('bob');await window.commentsFixture.open();});
  await page.getByRole('textbox',{name:'New comment'}).fill('Bob unsent draft');
  await page.evaluate(()=>window.commentsFixture.resolveSave());
  await expect.poll(()=>page.evaluate(async()=> (await window.commentsFixture.read('alice')).length)).toBe(2);
  await expect(page.getByRole('textbox',{name:'New comment'})).toHaveValue('Bob unsent draft');
  await expect(page.locator('.comment-message')).toHaveCount(1);
  await expect(page.locator('.comment-message')).toContainText('bob saved note');
  expect(await page.evaluate(async()=> (await window.commentsFixture.read('bob')).length)).toBe(1);
  expect(await page.evaluate(()=>window.commentsFixture.calls)).toEqual([]);
});
