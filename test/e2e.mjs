import {chromium} from 'playwright';
const base=process.env.BASE_URL||'http://127.0.0.1:4173/';
const browser=await chromium.launch({headless:true}),context=await browser.newContext(),failures=[];
const pass=(name,ok,detail='')=>{console.log((ok?'PASS':'FAIL')+'  '+name+(detail?' — '+detail:''));if(!ok)failures.push(name+(detail?': '+detail:''))};
async function errors(page,label){const e=[];page.on('pageerror',x=>e.push(x.message));page.on('console',m=>{if(m.type()==='error')e.push(m.text())});return()=>pass(label+' runtime clean',e.length===0,e.join(' | '))}
async function appRun(name,viewport){
  const page=await context.newPage();await page.setViewportSize(viewport);const done=await errors(page,name);
  await page.goto(base+'index.html?qa=e2e',{waitUntil:'networkidle'});await page.waitForFunction(()=>getComputedStyle(document.getElementById('runtimeWarning')).display==='none');
  pass(name+' boots',await page.locator('#draft').isVisible());
  pass(name+' release version',await page.evaluate(()=>APP_VERSION==='4.6.0'));
  pass(name+' no horizontal overflow',(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth))<=2);
  const tabs=await page.locator('.tab').evaluateAll(ts=>ts.map(t=>t.dataset.tab));let buttons=0,bad=0;
  for(const tab of tabs){await page.locator('.tab[data-tab="'+tab+'"]').click();pass(name+' panel '+tab,await page.locator('#panel-'+tab).isVisible());const dims=await page.locator('#panel-'+tab+' button').evaluateAll(bs=>bs.filter(b=>getComputedStyle(b).display!=='none').map(b=>{const r=b.getBoundingClientRect();return[r.width,r.height]}));buttons+=dims.length;bad+=dims.filter(x=>x[0]===0||x[1]===0).length}
  pass(name+' visible buttons have geometry',bad===0,buttons+' checked');
  await page.locator('.tab[data-tab="draft"]').click();await page.locator('#draft').fill('This is a representative writing sample. Furthermore, this deliberately longer sentence exercises analysis, rewriting, persistence, and export behavior in a realistic browser session.');
  await page.getByRole('button',{name:'Analyze writing'}).click();pass(name+' analysis executes',(await page.locator('#scoreBig').textContent())!=='—');
  await page.locator('.tab[data-tab="rewrite"]').click();await page.getByRole('button',{name:'Humanize'}).click();pass(name+' humanize produces revision',((await page.locator('#rewriteResult').textContent())||'').length>20);
  await page.locator('.tab[data-tab="projects"]').click();await page.locator('#projectName').fill('Production QA');await page.locator('.tab[data-tab="draft"]').click();await page.locator('#draft').fill('Persistent unicode content — café résumé 東京.');await page.locator('.tab[data-tab="projects"]').click();await page.getByRole('button',{name:'Save project'}).click();
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>getComputedStyle(document.getElementById('runtimeWarning')).display==='none');pass(name+' project survives reload',(await page.locator('#draft').inputValue()).includes('café'));
  const recovered=await page.evaluate(()=>{const good=localStorage.getItem(STORE);localStorage.setItem(STORE_BACKUP,good);localStorage.setItem(STORE,'{broken');return getProjects().length});
  pass(name+' corrupt project store recovers from backup',recovered>0,String(recovered));
  await page.evaluate(()=>{const good=localStorage.getItem(STORE_BACKUP);if(good)localStorage.setItem(STORE,good)});
  await page.locator('.tab[data-tab="draft"]').click();await page.locator('#fileInput').setInputFiles({name:'audit.txt',mimeType:'text/plain',buffer:Buffer.from('Uploaded parser audit content with Unicode café.')});await page.waitForFunction(()=>document.getElementById('draft').value.includes('Uploaded parser audit'));
  pass(name+' TXT import works',true);
  await page.locator('#fileInput').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({name:'Imported JSON',text:'JSON project import content.'}))});await page.waitForFunction(()=>document.getElementById('draft').value.includes('JSON project import'));
  pass(name+' JSON project import works',await page.locator('#projectName').inputValue()==='Imported JSON');
  pass(name+' XLSX generator produces file bytes',(await page.evaluate(()=>makeXLSX().length))>500);
  await page.locator('.tab[data-tab="verify"]').click();await page.locator('.tab[data-tab="draft"]').click();await page.locator('#draft').fill('Uber operates globally (Uber Technologies, Inc., 2026). Revenue grew 12% in 2026.');await page.locator('.tab[data-tab="verify"]').click();await page.getByRole('button',{name:'Check citations'}).click();pass(name+' citation verifier recognizes author-date citations',((await page.locator('#citationResult').textContent())||'').includes('Author-date citations: 1'));
  await page.locator('.tab[data-tab="connectors"]').click();pass(name+' connector hub is honest',((await page.locator('#panel-connectors').innerText())||'').includes('Direct authenticated model API: not configured'));pass(name+' AI handoff works',(await page.evaluate(()=>buildAIHandoff())).includes('PROJECT CONTENT'));
  await page.locator('.tab[data-tab="canvas"]').click();pass(name+' Canvas Review replaces study queue',(await page.locator('#canvasReviewResults').count())===1&&(await page.locator('#studyQueue').count())===0);
  await page.locator('.tab[data-tab="diagnostics"]').click();await page.getByRole('button',{name:'Run health checks'}).click();pass(name+' built-in health checks',(await page.locator('#testResults .bad').count())===0);
  await page.screenshot({path:'test/artifacts/production-'+name+'.png',fullPage:true});done();await page.close()
}
await appRun('desktop',{width:1280,height:900});await appRun('mobile',{width:390,height:844});

const canvas=await context.newPage();await canvas.setViewportSize({width:390,height:844});const canvasDone=await errors(canvas,'Canvas fixture');
await canvas.goto(base+'test/canvas-fixture.html',{waitUntil:'networkidle'});await canvas.waitForSelector('#provenance-canvas-lens-v2');
const text=await canvas.locator('#provenance-canvas-lens-v2').innerText();
pass('Canvas active page shows concise hint',text.includes('Hint:'));
pass('Canvas active page does not expose a choice recommendation',!text.includes('Best-supported by visible evidence:'));
pass('Canvas Lens ignores current-choice UI',!text.includes('Currently selected'));
pass('Canvas Lens filter is available',await canvas.getByRole('searchbox',{name:'Filter Canvas Lens questions'}).isVisible());
pass('Canvas Lens fast actions are available',await canvas.getByRole('button',{name:'Locate question on Canvas'}).count()>0&&await canvas.getByRole('button',{name:'Copy Lens cue'}).count()>0&&await canvas.getByRole('button',{name:'Go to next Canvas question'}).count()>0);
pass('Canvas Lens has one master mode toggle',await canvas.getByRole('button',{name:'Toggle Provenance mode'}).count()===1);
pass('Active Canvas fixture hides practice autofill',await canvas.getByRole('button',{name:'Fill all practice questions'}).count()===0);
const checkedBeforeActions=await canvas.locator('input:checked').count();await canvas.getByRole('button',{name:'Locate question on Canvas'}).first().click();await canvas.waitForTimeout(120);pass('Locate action leaves answer controls untouched',(await canvas.locator('input:checked').count())===checkedBeforeActions);
const lensRect=await canvas.locator('#provenance-canvas-lens-v2').boundingBox();
pass('Canvas Lens mobile footprint is compact',!!lensRect&&lensRect.width<=350&&lensRect.height<=844*.55,JSON.stringify(lensRect));
const before=await canvas.locator('input:checked').count();await canvas.getByRole('button',{name:'Scan'}).click();pass('Canvas Lens does not alter controls',(await canvas.locator('input:checked').count())===before);
await canvas.evaluate(()=>{const q=document.createElement('div');q.className='question';q.dataset.questionId='3';q.innerHTML='<div class="question_text">Which gas is released?</div><label><input type="radio" name="q3"> Oxygen</label><label><input type="radio" name="q3"> Nitrogen</label>';document.body.appendChild(q)});
await canvas.waitForFunction(()=>{const t=document.querySelector('#provenance-canvas-lens-v2')?.innerText||'';return t.includes('3 unique questions')||t.includes('3 question blocks')});pass('Canvas dynamic rescan works',true);
await canvas.screenshot({path:'test/artifacts/canvas-4-2-mobile.png',fullPage:true});canvasDone();await canvas.close();

const practice=await context.newPage();await practice.setViewportSize({width:390,height:844});await practice.goto(base+'test/practice-autofill.html',{waitUntil:'networkidle'});await practice.waitForSelector('#provenance-canvas-lens-v2');
pass('Practice master automation defaults off',!await practice.locator('#toggleAutomation').isChecked());
pass('Practice fill controls are hidden while master is off',await practice.getByRole('button',{name:'Fill all practice questions'}).count()===0&&await practice.getByRole('button',{name:'Fill this practice question'}).count()===0);
await practice.locator('#toggleAutomation').check();await practice.waitForTimeout(180);
pass('Practice fill controls appear while master is on',await practice.getByRole('button',{name:'Fill all practice questions'}).isVisible()&&await practice.getByRole('button',{name:'Fill this practice question'}).count()>0);
pass('Practice master fills radio answer',await practice.locator('#p1b').isChecked()&&!await practice.locator('#p1a').isChecked());
pass('Practice master fills text answer',(await practice.locator('#p2').inputValue())==='Glucose and oxygen.');
pass('Practice master fills checkbox answers',await practice.locator('#p3a').isChecked()&&await practice.locator('#p3c').isChecked()&&!await practice.locator('#p3b').isChecked());
pass('Practice master fills dropdown answer',(await practice.locator('#p4').inputValue())==='carbon-dioxide');
pass('Practice master submits once',await practice.evaluate(()=>window.__manualSubmitCount===1));
await practice.waitForTimeout(120);pass('Practice master does not double-submit',await practice.evaluate(()=>window.__manualSubmitCount===1));
await practice.locator('#toggleAutomation').uncheck();await practice.waitForTimeout(80);
pass('Practice master turns automation back off',await practice.getByRole('button',{name:'Fill all practice questions'}).count()===0);
await practice.close();

const feedback=await context.newPage();await feedback.goto(base+'test/canvas-compat.html?mode=nestedfeedback',{waitUntil:'networkidle'});await feedback.waitForSelector('#provenance-canvas-lens-v2');const ft=await feedback.locator('#provenance-canvas-lens-v2').innerText();
pass('Nested Canvas question is deduplicated',ft.split('What is the relationship between nature and culture in shaping reality?').length-1===1);
pass('Official Canvas feedback can be labeled confirmed',ft.includes('Confirmed: B — Nature limits culture, while culture shapes nature over time.'));
pass('Review feedback does not expose current choice',!ft.includes('Currently selected'));await feedback.close();

const app=await context.newPage();await app.goto(base+'index.html',{waitUntil:'networkidle'});await app.locator('.tab[data-tab="canvas"]').click();const beforeStatus=await app.locator('#canvasBridgeStatus').textContent();
await app.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.example',data:{type:'PROVENANCE_CANVAS_CAPTURE',payload:{items:[{question:'Injected',options:[]}],context:'bad'}},source:window})));
pass('Untrusted postMessage origin is rejected',(await app.locator('#canvasBridgeStatus').textContent())===beforeStatus);await app.close();

await browser.close();
if(failures.length){console.error('\nFAILURES\n'+failures.map(x=>' - '+x).join('\n'));process.exit(1)}
console.log('\nALL END-TO-END PRODUCTION TESTS PASSED');