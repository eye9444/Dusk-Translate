import {test,expect} from '@playwright/test';
test('ticket hub renders private conversation text safely and sends replies',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const {createFeedbackHub}=await import('/src/feedback-hub.js');
    const dialog=document.createElement('dialog');dialog.innerHTML='<p class="eyebrow"></p><h2></h2><p id="feedback-inbox-status"></p><div id="feedback-inbox-list"></div>';
    document.body.replaceChildren(dialog);const messages=[];
    const remote={async feedbackTickets(){return[{id:'ticket',status:'new',description:'Export failed after translation',created_at:new Date().toISOString(),unread:true}];},async feedbackTicketAction(_id,action,body){if(action==='reply')messages.push({id:'message',body,from_admin:false,created_at:new Date().toISOString()});return messages;}};
    await createFeedbackHub({remote,dialog,isAdmin:()=>false}).open();
  });
  await page.locator('summary').click();await page.getByRole('textbox',{name:'Reply to ticket'}).fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button',{name:'Send reply'}).click();
  await expect(page.locator('.feedback-item p').filter({hasText:'<img src=x onerror=alert(1)>'})).toHaveCount(1);
  await expect(page.locator('img')).toHaveCount(0);await expect(page.getByRole('button',{name:'rejected',exact:true})).toHaveCount(0);
});
