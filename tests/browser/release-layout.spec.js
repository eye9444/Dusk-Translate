import {test,expect} from '@playwright/test';
test.use({launchOptions:{ignoreDefaultArgs:['--hide-scrollbars']}});
for(const theme of ['dusk','eclipse'])test(`release notes keep close controls and scrollbar inside the frame in ${theme}`,async({page},testInfo)=>{
  await page.addInitScript(theme=>{localStorage.setItem('theme',theme);sessionStorage.setItem('dusk-guest','true');},theme);
  await page.goto('/');
  await page.evaluate(()=>{
    const list=document.getElementById('release-list');
    for(let i=0;i<30;i++){const p=document.createElement('p');p.textContent='Release note content for scrolling and checking the rounded dialog frame.';list.append(p);}
    document.getElementById('whats-new-dialog').showModal();
  });
  const dialog=page.locator('#whats-new-dialog'),list=page.locator('#release-list'),close=page.getByRole('button',{name:"Close What's New"});
  await list.evaluate(el=>el.scrollTop=el.scrollHeight);
  await expect(close).toBeInViewport();await expect(dialog.getByRole('button',{name:'Close',exact:true})).toBeInViewport();
  const bounds=await dialog.evaluate(el=>{const d=el.getBoundingClientRect(),r=el.querySelector('#release-list').getBoundingClientRect();return {inside:r.top>d.top+50&&r.bottom<d.bottom-40,overflow:getComputedStyle(el).overflow};});
  expect(bounds).toEqual({inside:true,overflow:'hidden'});
  await page.screenshot({path:testInfo.outputPath(`releases-${theme}.png`)});
  await page.setViewportSize({width:390,height:640});await expect(close).toBeInViewport();
  await close.click();await expect(dialog).toBeHidden();
});
