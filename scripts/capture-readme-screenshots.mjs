import { chromium } from '@playwright/test';

const baseURL=process.env.DUSK_SCREENSHOT_URL || 'http://127.0.0.1:4173';
const browser=await chromium.launch();
try{
  for(const shot of [
    {path:'docs/screenshots/welcome-desktop.png',width:1920,height:1080,fullPage:false},
    {path:'docs/screenshots/welcome-mobile.png',width:390,height:844,fullPage:true},
  ]){
    const page=await browser.newPage({viewport:{width:shot.width,height:shot.height},deviceScaleFactor:1});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(()=>localStorage.setItem('theme','eclipse'));
    await page.goto(baseURL,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    await page.addStyleTag({content:'*,*::before,*::after{animation-play-state:paused!important;transition:none!important}'});
    await page.screenshot({path:shot.path,fullPage:shot.fullPage});
    await page.close();
  }
}finally{await browser.close();}
