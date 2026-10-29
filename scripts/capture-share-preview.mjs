import {chromium} from '@playwright/test';

// Reuse the real hero at two sizes: a minimal social card and a fuller README banner.
const browser=await chromium.launch();
try {
  for(const variant of ['social','readme']){
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('theme','eclipse'));
  await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4175/',{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{
    document.querySelector('#welcome-title').innerHTML='Your Novel<br><em>Translation Suite</em>';
  });
  await page.addStyleTag({content:`
    body {padding:0!important;margin:0!important;overflow:hidden!important;background:transparent!important}
    .app-window {margin:0!important;width:1200px!important;height:630px!important;min-height:630px!important;border-radius:18px!important;background:#100f0d!important;box-shadow:none!important;backdrop-filter:none!important}
    .masthead {height:72px!important;padding:18px 30px!important}
    .masthead nav,.environment-badge,.brand-copy>span,.welcome-actions,.welcome-private,.welcome-links,.welcome-socials,.welcome-notes,.art-caption,.desktop-caption {display:none!important}
    .welcome {height:558px!important;min-height:0!important;box-sizing:border-box;padding:20px 44px!important;grid-template-columns:560px 530px!important;gap:22px!important;align-items:center!important}
    .welcome-copy {padding:0!important}
    .welcome h1 {max-width:560px!important;font-size:72px!important;line-height:1.04!important;letter-spacing:-.055em!important}
    .welcome-art {width:690px!important;max-width:none!important;height:560px!important;transform:scale(.78)!important;transform-origin:center!important;pointer-events:none!important}
    .planet-scene {transform:none!important}
    *,*::before,*::after {animation-play-state:paused!important;transition:none!important}
    ${variant==='social'?'.welcome-intro,.specimen {display:none!important}':'.welcome h1 {font-size:65px!important}.welcome-intro {font-size:16px!important;line-height:1.8!important;max-width:500px!important;margin:28px 0 0!important}'}
  `});
  await page.screenshot({path:`web/public/brand/novel-suite-${variant}.png`,omitBackground:true});
  await page.close();
  }
} finally {await browser.close();}
