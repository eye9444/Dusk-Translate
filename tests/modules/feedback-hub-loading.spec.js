import {test,expect} from '@playwright/test';

async function mount(page,{supplied=false,empty=false}={}){
  await page.goto('/');
  await page.evaluate(async options=>{
    const {createFeedbackHub}=await import('/src/feedback-hub.js');
    const dialog=document.createElement('dialog');dialog.innerHTML='<p class="eyebrow"></p><h2></h2><p id="feedback-inbox-status"></p><div id="feedback-inbox-list"></div>';
    document.body.replaceChildren(dialog);
    const tickets=options.empty?[]:[{id:'one',description:'Loaded report',status:'new',created_at:'2026-11-01T00:00:00Z'}];
    const fixture={reads:0,fail:false};
    const remote={async feedbackTickets(){fixture.reads++;if(fixture.fail)throw new Error('Permission changed');return tickets;}};
    fixture.hub=createFeedbackHub({remote,dialog,isAdmin:()=>false});window.feedbackFixture=fixture;
    await fixture.hub.open(options.supplied?tickets:undefined);
  },{supplied,empty});
}

for(const empty of [false,true])test(`a supplied ${empty?'empty':'nonempty'} authorised snapshot is rendered without fetching again`,async({page})=>{
  await mount(page,{supplied:true,empty});
  await expect(page.locator('#feedback-inbox-status')).toHaveText(`${empty?0:1} tickets (most recently updated first)`);
  expect(await page.evaluate(()=>window.feedbackFixture.reads)).toBe(0);
});

test('standalone opens and filter changes still fetch and display failures',async({page})=>{
  await mount(page);
  expect(await page.evaluate(()=>window.feedbackFixture.reads)).toBe(1);
  await page.getByRole('combobox',{name:'Filter tickets'}).selectOption('new');
  await expect(page.locator('#feedback-inbox-status')).toHaveText('1 tickets (most recently updated first)');
  expect(await page.evaluate(()=>window.feedbackFixture.reads)).toBe(2);
  await page.evaluate(()=>{window.feedbackFixture.fail=true;});
  await page.getByRole('combobox',{name:'Filter tickets'}).selectOption('all');
  await expect(page.locator('#feedback-inbox-status')).toHaveText('Tickets are unavailable: Permission changed');
  await expect(page.locator('dialog')).toBeVisible();
  expect(await page.evaluate(()=>window.feedbackFixture.reads)).toBe(3);
});
