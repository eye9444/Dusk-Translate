import {test,expect} from '@playwright/test';
import JSZip from 'jszip';

const token='12345678-1234-4234-8234-123456789abc';
const chapters=['one','two','three'].map(id=>({id,title:`Chapter ${id}`,text:`Passage ${id}`,xhtmlPath:`${id}.xhtml`}));

async function setupReader(page,{epub=false,failInitial=false,failComments=false}={}){
  const zip=new JSZip();
  zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');
  zip.file('book.opf',`<package><metadata><title>Test book</title></metadata><manifest>${chapters.map(ch=>`<item id="${ch.id}" href="${ch.xhtmlPath}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map(ch=>`<itemref idref="${ch.id}"/>`).join('')}</spine></package>`);
  for(const chapter of chapters)zip.file(chapter.xhtmlPath,`<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>${chapter.title}</h1><p>${chapter.text}</p></body></html>`);
  const file=epub?await zip.generateAsync({type:'nodebuffer'}):Buffer.from('Synthetic book');
  const state={calls:[],failure:failInitial?'Reader link revoked or suspended':null,hold:null,holdAt:1,held:null,release:null};
  await page.route('https://dusk-test.supabase.co/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/rpc/open_public_reader_link'))return route.fulfill({json:[{project_id:'book',title:'Test book',file_name:epub?'book.epub':'book.txt',file_path:'owner/book/original',snapshot:{novel:{projectType:'web-novel',chapters},translations:{}}}]});
    if(url.pathname.includes('/storage/v1/object/'))return route.fulfill({body:file,contentType:epub?'application/epub+zip':'text/plain'});
    if(url.pathname.endsWith('/rpc/list_reader_comments')){
      const chapter=route.request().postDataJSON().target_chapter;
      state.calls.push(chapter);
      let failure=state.failure;
      if(failComments&&state.calls.length===2)failure='Comment access server unavailable';
      if(state.hold===chapter&&state.calls.filter(value=>value===chapter).length===state.holdAt){state.hold=null;state.held=chapter;failure=await new Promise(resolve=>{state.release=resolve;});}
      return failure?route.fulfill({status:503,json:{message:failure}}):route.fulfill({json:{enabled:true,version:'v1',comments:[]}});
    }
    return route.fulfill({json:[]});
  });
  await page.goto(`/reader?share=${token}`);
  return state;
}

for(const epub of [false,true])test(`initial ${epub?'EPUB':'web-novel'} access failure is not announced as ready`,async({page},testInfo)=>{
  await setupReader(page,{epub,failInitial:true});
  await expect(page.locator('#reader-status')).toHaveText('Reader link revoked or suspended');
  await expect(page.locator('#reader-content')).toBeEmpty();
  await expect(page.locator('#reader-chapter-title')).not.toHaveText('Opening EPUB...');
  await page.screenshot({path:testInfo.outputPath('reader-access-failure.png')});
});

test('failure in the comment-view access check is not announced as ready',async({page})=>{
  const state=await setupReader(page,{failComments:true});
  await expect(page.locator('#reader-status')).toHaveText('Comment access server unavailable');
  await expect(page.locator('#reader-content')).toBeEmpty();
  expect(state.calls).toEqual(['one','one']);
});

for(const failure of ['Reader link revoked or suspended','Reader service unavailable'])test(`${failure} withholds cached chapter content`,async({page})=>{
  const state=await setupReader(page);
  await expect(page.locator('#reader-status')).toHaveText('Ready to read');
  state.failure=failure;
  await page.getByRole('button',{name:'Read section 1: Chapter two',exact:true}).click();
  await expect(page.locator('#reader-status')).toHaveText(failure);
  await expect(page.locator('#reader-content')).toBeEmpty();
  await expect(page.locator('#reader-comments')).toBeHidden();
});

for(const lateFailure of [null,'Late access failure'])test(`late ${lateFailure?'failure':'success'} cannot overwrite the latest chapter`,async({page})=>{
  const state=await setupReader(page);
  await expect(page.locator('#reader-status')).toHaveText('Ready to read');
  state.hold='two';
  await page.getByRole('button',{name:'Read section 1: Chapter two',exact:true}).click();
  await expect.poll(()=>state.held).toBe('two');
  await expect(page.locator('#reader-content')).toBeEmpty();
  await page.getByRole('button',{name:'Read section 2: Chapter three',exact:true}).click();
  await expect(page.locator('#reader-content')).toContainText('Passage three');
  const response=page.waitForResponse(response=>response.url().endsWith('/rpc/list_reader_comments')&&response.request().postDataJSON().target_chapter==='two');
  state.release(lateFailure);await (await response).finished();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await expect(page.locator('#reader-chapter-title')).toHaveText('Chapter three');
  await expect(page.locator('#reader-content')).toContainText('Passage three');
  await expect(page.locator('#reader-status')).toHaveText('Ready to read');
  await expect(page.locator('#reader-comments')).toBeVisible();
});

test('old comment-view failure cannot invalidate a chapter awaiting authorisation',async({page})=>{
  const state=await setupReader(page);
  await expect(page.locator('#reader-status')).toHaveText('Ready to read');
  state.hold='two';state.holdAt=2;
  await page.getByRole('button',{name:'Read section 1: Chapter two',exact:true}).click();
  await expect.poll(()=>state.held).toBe('two');
  const releaseComments=state.release;
  state.hold='three';state.holdAt=1;
  await page.getByRole('button',{name:'Read section 2: Chapter three',exact:true}).click();
  await expect.poll(()=>state.held).toBe('three');
  const releaseAccess=state.release;
  const oldResponse=page.waitForResponse(response=>response.url().endsWith('/rpc/list_reader_comments')&&response.request().postDataJSON().target_chapter==='two');
  releaseComments('Old comment access failed');await (await oldResponse).finished();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await expect(page.locator('#reader-status')).not.toHaveText('Old comment access failed');
  await expect(page.locator('#reader-content')).toBeEmpty();
  releaseAccess(null);
  await expect(page.locator('#reader-content')).toContainText('Passage three');
  await expect(page.locator('#reader-status')).toHaveText('Ready to read');
});

test('leaving the reader invalidates a pending chapter request',async({page})=>{
  const state=await setupReader(page);
  await expect(page.locator('#reader-status')).toHaveText('Ready to read');
  state.hold='two';
  await page.getByRole('button',{name:'Read section 1: Chapter two',exact:true}).click();
  await expect.poll(()=>state.held).toBe('two');
  await page.locator('#reader-back').click();
  const response=page.waitForResponse(response=>response.url().endsWith('/rpc/list_reader_comments')&&response.request().postDataJSON().target_chapter==='two');
  state.release('Late revoked response');await (await response).finished();
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page).not.toHaveURL(/\/reader/);
});
