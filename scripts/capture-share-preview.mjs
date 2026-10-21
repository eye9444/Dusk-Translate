import {chromium} from '@playwright/test';

// Capture the real hero without navigation or sign-in controls for link previews.
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('theme','eclipse'));
  await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4175/',{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  await page.addStyleTag({content:`
    body {padding:0!important;margin:0!important;overflow:hidden!important}
    .app-window {margin:0!important;width:1200px!important;min-height:630px!important;border-radius:0!important}
    .masthead {height:72px!important;padding:18px 44px!important}
    .masthead nav,.window-lights,.welcome-actions,.welcome-private,.welcome-links,.welcome-notes,.art-caption,.desktop-caption {display:none!important}
    .welcome {height:558px!important;min-height:0!important;box-sizing:border-box;padding:30px 44px!important;grid-template-columns:1fr 500px!important;gap:30px!important}
    .welcome-copy {padding:0!important}
    .welcome h1 {font-size:64px!important}
    .welcome .eyebrow {margin-bottom:24px!important}
    .welcome-intro {font-size:16px!important;line-height:1.7!important;margin-bottom:0!important}
    .welcome-art {height:470px!important}
  `});
  await page.screenshot({path:'web/public/brand/novel-suite-preview.png'});
} finally {await browser.close();}
