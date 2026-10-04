import { createPricingPage } from './pricing.js';

export function createUpgradeDialog({createCheckout,onFree}) {
  const dialog=document.createElement('dialog');dialog.className='upgrade-dialog';
  dialog.setAttribute('aria-label','Upgrade your plan');
  dialog.innerHTML=`<header><h2>Upgrade your plan</h2><button type="button" data-close aria-label="Close upgrade plans">X</button></header>
    <p data-reason></p><p data-owner></p><section class="pricing-page">
    <div class="billing-toggle" role="group" aria-label="Billing period">
      <button type="button" data-billing-term="month" aria-pressed="true">Monthly</button>
      <button type="button" data-billing-term="year" aria-pressed="false">Yearly</button>
    </div><p data-pricing-location></p><p data-pricing-status role="status"></p><div class="pricing-grid"></div></section>`;
  document.body.append(dialog);
  let ownerOnly=false,savedRange,savedWindow;
  const view=createPricingPage({section:dialog.querySelector('section'),onFree:()=>{dialog.close();onFree?.();},
    createCheckout:price=>{if(ownerOnly)throw new Error('Only the project owner can upgrade this project.');return createCheckout(price);}});
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  dialog.addEventListener('close',()=>{
    if(savedRange&&savedWindow){try{const s=savedWindow.getSelection();s.removeAllRanges();s.addRange(savedRange);}catch{}}
    savedRange=null;savedWindow=null;
  });
  return async ({feature,required='Pro',shared=false}={})=>{
    ownerOnly=shared;
    const frame=document.getElementById('editor')?.contentWindow;
    try{const s=frame?.getSelection();if(s?.rangeCount){savedRange=s.getRangeAt(0).cloneRange();savedWindow=frame;}}catch{}
    dialog.querySelector('[data-reason]').textContent=`${feature || 'This feature'} requires ${required}.`;
    dialog.querySelector('[data-owner]').textContent=shared?'This project uses its owner\'s plan. Ask the owner to upgrade; upgrading your personal plan will not upgrade this project.':'';
    if(!dialog.open)dialog.showModal();
    await view.show();
  };
}

export function showQuotaDialog(quota,onUpgrade){
  const dialog=document.createElement('dialog');dialog.className='quota-dialog';
  dialog.innerHTML='<h2>Not enough daily capacity</h2><p data-usage></p><p data-reset></p><footer><button data-upgrade type="button">Upgrade</button><button data-cancel type="button">Cancel</button></footer>';
  dialog.querySelector('[data-usage]').textContent=`This chapter needs ${quota.required.toLocaleString()} characters; you have ${quota.remaining.toLocaleString()} remaining today.`;
  const reset=new Date(quota.resetAt);
  const update=()=>{const seconds=Math.max(0,Math.ceil((reset-Date.now())/1000));dialog.querySelector('[data-reset]').textContent=`Resets ${reset.toLocaleString()} (in ${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m ${seconds%60}s).`;};
  update();const timer=setInterval(update,1000);
  document.body.append(dialog);
  dialog.addEventListener('close',()=>{clearInterval(timer);dialog.remove();});
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('[data-upgrade]').onclick=()=>{dialog.close();onUpgrade();};
  dialog.showModal();
}
