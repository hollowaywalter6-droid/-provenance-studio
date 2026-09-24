import { chromium } from 'playwright';
import fs from 'node:fs';

const base=(process.env.BASE_URL||'http://127.0.0.1:4173/').replace(/\/?$/,'/');
fs.mkdirSync('test/artifacts',{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const failures=[];
const pass=(name,ok,detail='')=>{
  console.log((ok?'PASS':'FAIL')+'  '+name+(detail?' — '+detail:''));
  if(!ok) failures.push(name+(detail?': '+detail:''));
};
async function pageErrors(page,label){
  const errs=[];
  page.on('pageerror',e=>errs.push(String(e.message||e)));
  page.on('console',m=>{if(m.type()==='error') errs.push('console: '+m.text())});
  return ()=>pass(label+' has no runtime errors',errs.length===0,errs.join(' | '));
}
async function appRun(name,viewport){
  const page=await context.newPage();
  await page.setViewportSize(viewport);
  const finishErrors=await pageErrors(page,name);
  await page.goto(base+'index.html?qa=e2e',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('runtimeWarning')).display==='none');
  pass(name+' booted',await page.locator('#draft').isVisible());
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  pass(name+' has no horizontal overflow',overflow<=2,'overflow '+overflow+'px');

  const tabs=await page.locator('.tab').evaluateAll(ts=>ts.map(t=>t.dataset.tab));
  let controls=0,zero=0;
  for(const tab of tabs){
    await page.locator('.tab[data-tab="'+tab+'"]').click();
    pass(name+' panel '+tab+' renders',await page.locator('#panel-'+tab).isVisible());
    const dims=await page.locator('#panel-'+tab+' button').evaluateAll(bs=>bs.filter(b=>{const s=getComputedStyle(b);return s.display!=='none'&&s.visibility!=='hidden'}).map(b=>{const r=b.getBoundingClientRect();return [r.width,r.height]}));
    controls+=dims.length;zero+=dims.filter(([w,h])=>w===0||h===0).length;
  }
  pass(name+' all visible-panel buttons have geometry',zero===0,controls+' buttons checked');

  await page.locator('.tab[data-tab="draft"]').click();
  await page.locator('#draft').fill('This is a test sentence. Furthermore, this deliberately longer sentence exercises the analysis and rewrite engines in a realistic browser session.');
  await page.getByRole('button',{name:'Analyze writing'}).click();
  pass(name+' analysis executes',(await page.locator('#scoreBig').textContent())!=='—');

  await page.locator('.tab[data-tab="rewrite"]').click();
  await page.locator('#panel-rewrite button').filter({hasText:'Humanize'}).first().click();
  const revision=(await page.locator('#rewriteResult').textContent())||'';
  pass(name+' humanize produces a revision',revision.length>20&&!revision.includes('Choose a revision mode'));

  await page.locator('.tab[data-tab="projects"]').click();
  await page.locator('#projectName').fill('E2E Project');
  await page.locator('.tab[data-tab="draft"]').click();
  await page.locator('#draft').fill('Persistent project content for the automated test.');
  await page.locator('.tab[data-tab="projects"]').click();
  await page.getByRole('button',{name:'Save project'}).click();
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('runtimeWarning')).display==='none');
  pass(name+' project persistence survives reload',(await page.locator('#draft').inputValue()).includes('Persistent project content'));

  const upload=page.locator('#fileInput');
  await upload.setInputFiles({name:'audit.txt',mimeType:'text/plain',buffer:Buffer.from('Uploaded text parser audit content.')});
  await page.waitForFunction(()=>document.getElementById('draft').value.includes('Uploaded text parser audit content.'));
  pass(name+' TXT upload parser works',true);

  const xlsx=await page.evaluate(()=>makeXLSX().length);
  pass(name+' XLSX generator works',xlsx>500,xlsx+' bytes');

  await page.locator('.tab[data-tab="connectors"]').click();
  pass(name+' connector controls render',await page.getByRole('button',{name:'Import a document'}).isVisible()&&await page.getByRole('button',{name:'Save/share project file'}).isVisible());

  await page.locator('.tab[data-tab="canvas"]').click();
  await page.getByRole('button',{name:'Show setup steps'}).click();
  pass(name+' Canvas setup renders',await page.locator('#canvasSetup').isVisible());
  pass(name+' Canvas bookmarklet code is available',(await page.locator('#canvasBookmarkletCode').inputValue()).startsWith('javascript:'));
  await page.evaluate(()=>copyCanvasBookmarklet());
  pass(name+' Canvas copy fallback remains usable',await page.locator('#canvasBookmarkletCode').isVisible());

  await page.locator('.tab[data-tab="diagnostics"]').click();
  await page.getByRole('button',{name:'Run health checks'}).click();
  let bad=await page.locator('#testResults .bad').count();
  pass(name+' built-in health checks pass',bad===0,bad+' failures');
  await page.getByRole('button',{name:'Run deep QA'}).click();
  bad=await page.locator('#testResults .bad').count();
  pass(name+' deep QA passes',bad===0,bad+' failures');

  await page.screenshot({path:'test/artifacts/app-'+name+'.png',fullPage:true});
  finishErrors();
  await page.close();
}

await appRun('desktop',{width:1280,height:900});
await appRun('mobile',{width:390,height:844});

const canvas=await context.newPage();
await canvas.setViewportSize({width:390,height:844});
const finishCanvasErrors=await pageErrors(canvas,'Canvas fixture');
await canvas.goto(base+'test/canvas-fixture.html',{waitUntil:'networkidle'});
await canvas.waitForSelector('#provenance-canvas-lens-v2');
await canvas.waitForFunction(()=>document.querySelector('#provenance-canvas-lens-v2')?.innerText.includes('2 question blocks detected'));
pass('Canvas Lens detects classic Canvas-style questions',true);
const demoText=await canvas.locator('#provenance-canvas-lens-v2').innerText();
pass('Canvas Lens fixture evidence ranking favors Chlorophyll',demoText.includes('Best-supported page-context choice: B — Chlorophyll'));
pass('Canvas Lens overlay shows no percentage scores',!/%/.test(demoText));
pass('Canvas Lens renders inline review on Canvas',demoText.includes('Inline review'));

await canvas.evaluate(()=>{
  const q=document.createElement('div');q.className='question';q.dataset.questionId='3';
  q.innerHTML='<div class="question_text">Which gas is released?</div><label><input type="radio" name="q3"> Oxygen</label><label><input type="radio" name="q3"> Nitrogen</label>';
  document.body.appendChild(q);
});
await canvas.waitForFunction(()=>document.querySelector('#provenance-canvas-lens-v2')?.innerText.includes('3 question blocks detected'));
pass('Canvas Lens auto-rescans dynamically loaded questions',true);

const selected=await canvas.locator('input[type="radio"]:checked,input[type="checkbox"]:checked').count();
pass('Canvas Lens never auto-selects answers',selected===0,selected+' selected controls');

const canvasUrl=canvas.url(),pagesBefore=context.pages().length;
pass('Canvas overlay has no app-switch buttons',(await canvas.getByRole('button',{name:/Open .*Provenance|Open deeper review/}).count())===0);
await canvas.getByRole('button',{name:'Minimize Canvas Lens'}).click();
pass('Canvas Lens minimizes inline',await canvas.locator('#provenance-canvas-lens-v2 [data-body]').isHidden());
await canvas.locator('#provenance-canvas-lens-v2').hover();
pass('Canvas Lens hover expands inline',await canvas.locator('#provenance-canvas-lens-v2 [data-body]').isVisible());
await canvas.mouse.move(1,1);await canvas.waitForTimeout(100);
pass('Canvas Lens returns to minimized dock',await canvas.locator('#provenance-canvas-lens-v2 [data-body]').isHidden());
pass('Canvas Lens interactions stay on Canvas',canvas.url()===canvasUrl&&context.pages().length===pagesBefore);
await canvas.screenshot({path:'test/artifacts/canvas-overlay-mobile.png',fullPage:true});
finishCanvasErrors();

await canvas.close();
await browser.close();

if(failures.length){
  console.error('\nFAILURES\n'+failures.map(x=>' - '+x).join('\n'));
  process.exit(1);
}
console.log('\nALL END-TO-END AUDIT TESTS PASSED');
