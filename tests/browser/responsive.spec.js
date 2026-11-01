import {test,expect} from '@playwright/test';
import JSZip from 'jszip';

const sizes=[{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:851,height:600},{width:1024,height:768},{width:1280,height:720},{width:1920,height:540},{width:2560,height:1080}];
async function inside(locator){
  const bounds=await locator.evaluate(el=>{
    const r=el.getBoundingClientRect();
    return {left:r.left,right:r.right,width:innerWidth};
  });
  expect(bounds.left).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width+1);
}
for(const size of sizes){
  test(`controls remain reachable at ${size.width}x${size.height}`,async({page})=>{
    await page.setViewportSize(size);
    await page.goto('/');
    await inside(page.locator('.welcome h1'));
    await inside(page.locator('#welcome-signin'));
    await page.screenshot({path:test.info().outputPath('hero.png'),fullPage:true});
    await page.evaluate(()=>sessionStorage.setItem('dusk-guest','true'));
    await page.goto('/home');
    await inside(page.locator('#new-project'));
    await inside(page.locator('.filters'));
    await page.locator('#new-project').click();
    await page.locator('#new-title').fill('Responsive project');
    await page.locator('#new-file').setInputFiles({name:'test.txt',mimeType:'text/plain',buffer:Buffer.from('Source paragraph.\n\n'.repeat(100))});
    await page.locator('#create-submit').click();
    const frame=page.frameLocator('#editor');
    await expect(frame.locator('#src-txt')).toContainText('Source paragraph.');
    if(size.width<=850)await frame.locator('.provider-disclosure summary').click();
    for(const id of ['#api-key','#model-select','#model-import']){
      await inside(frame.locator(id));
      await frame.locator(id).scrollIntoViewIfNeeded();
      await expect(frame.locator(id)).toBeInViewport();
    }
    if(size.width<=850)await frame.locator('.tool-disclosure summary').click();
    for(const id of ['#btn-tl','#btn-export','#host-prompt-button']){
      await inside(frame.locator(id));
      await frame.locator(id).scrollIntoViewIfNeeded();
      await expect(frame.locator(id)).toBeInViewport();
    }
    if(size.width<=850)await frame.locator('.tool-disclosure summary').click();
    for(const id of ['#src-txt','#tl-out']){
      const box=await frame.locator(id).boundingBox();
      expect(box.height).toBeGreaterThan(30);
      expect(box.y+box.height).toBeLessThanOrEqual(size.height+1);
    }
    await page.screenshot({path:test.info().outputPath('editor.png')});
    await frame.locator('#host-menu').click();
    await frame.locator('#host-library').click();
    await expect(page.locator('#library')).toBeVisible();
    for(const id of ['#view-grid','#view-list','#view-gallery']){
      await page.locator(id).click();
      await inside(page.locator('.project-card').first());
      await inside(page.locator('.resume-strip'));
      await page.screenshot({path:test.info().outputPath(`${id.slice(1)}.png`),fullPage:true});
    }
    const zip=new JSZip();
    zip.file('META-INF/container.xml','<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>');
    zip.file('book.opf','<package><metadata/><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/></spine></package>');
    zip.file('one.xhtml','<html><body><h1>Reader</h1><p>Readable content.</p></body></html>');
    await page.locator('#reader-file').setInputFiles({name:'reader.epub',mimeType:'application/epub+zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
    await expect(page.locator('#reader-content')).toContainText('Readable content.');
    for(const id of ['#reader-back','#reader-theme','#reader-font-up']){
      await inside(page.locator(id));
      await expect(page.locator(id)).toBeInViewport();
    }
    await page.screenshot({path:test.info().outputPath('reader.png')});
    await page.locator('#reader-theme').click();
    await expect(page.locator('body')).toHaveClass(/eclipse/);
    await inside(page.locator('#reader-theme'));
  });
}
