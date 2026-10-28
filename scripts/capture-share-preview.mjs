import {chromium} from '@playwright/test';

// Capture the real hero without navigation or sign-in controls for link previews.
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('theme','eclipse'));
  await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4175/',{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{
    document.querySelector('#welcome-title').innerHTML='Your Novel<br><em>Translation Suite</em>';
  });
  await page.addStyleTag({content:`
    body {padding:0!important;margin:0!important;overflow:hidden!important}
    .app-window {margin:0!important;width:1200px!important;min-height:630px!important;border-radius:0!important}
    .masthead {height:72px!important;padding:18px 44px!important}
    .masthead nav,.window-lights,.environment-badge,.welcome-actions,.welcome-private,.welcome-links,.welcome-notes,.welcome-intro,.specimen,.art-caption,.desktop-caption {display:none!important}
    .welcome {height:558px!important;min-height:0!important;box-sizing:border-box;padding:38px 44px!important;grid-template-columns:1fr 470px!important;gap:36px!important}
    .welcome-copy {padding:0!important}
    .welcome h1 {max-width:610px!important;font-size:78px!important;line-height:1.02!important;letter-spacing:-.065em!important}
    .welcome-art {height:450px!important;pointer-events:none!important}
    .planet-scene {transform:scale(.9)!important;transform-origin:center!important}
  `});
  await page.screenshot({path:'web/public/brand/novel-suite-preview.png'});
} finally {await browser.close();}
