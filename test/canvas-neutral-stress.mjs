import {chromium,webkit} from 'playwright';

const base=process.env.BASE_URL||'http://127.0.0.1:4173/';
const failures=[];
function ok(name,pass,detail=''){
  console.log((pass?'PASS':'FAIL')+'  '+name+(detail?' — '+detail:''));
  if(!pass)failures.push(name+(detail?': '+detail:''));
}
async function suite(browserType,label,contextOptions){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext(contextOptions);
  const errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));

  const classic=await context.newPage();
  await classic.goto(base+'test/canvas-compat.html?mode=classic',{waitUntil:'networkidle'});
  await classic.waitForSelector('#provenance-canvas-lens-v2');
  const classicText=await classic.locator('#provenance-canvas-lens-v2').innerText();
  ok(label+' classic Canvas detected',classicText.includes('2 unique questions')||classicText.includes('2 question blocks'));
  ok(label+' current-choice state hidden',!classicText.includes('Currently selected'));
  ok(label+' no automatic control changes',(await classic.locator('input:checked').count())===0);
  await classic.close();

  const selected=await context.newPage();
  await selected.goto(base+'test/canvas-compat.html?mode=selected',{waitUntil:'networkidle'});
  await selected.waitForSelector('#provenance-canvas-lens-v2');
  const before=await selected.locator('input:checked').count();
  const selectedText=await selected.locator('#provenance-canvas-lens-v2').innerText();
  ok(label+' pre-existing choice is not displayed by Lens',!selectedText.includes('Currently selected'));
  ok(label+' pre-existing choice is not changed',(await selected.locator('input:checked').count())===before);
  await selected.close();

  const feedback=await context.newPage();
  await feedback.goto(base+'test/canvas-compat.html?mode=nestedfeedback',{waitUntil:'networkidle'});
  await feedback.waitForSelector('#provenance-canvas-lens-v2');
  const feedbackText=await feedback.locator('#provenance-canvas-lens-v2').innerText();
  const prompt='What is the relationship between nature and culture in shaping reality?';
  ok(label+' nested question deduplicated',feedbackText.split(prompt).length-1===1);
  ok(label+' Canvas feedback is surfaced when the page exposes it',feedbackText.includes('Canvas feedback'));
  ok(label+' feedback view stays current-choice neutral',!feedbackText.includes('Currently selected'));
  await feedback.close();

  const long=await context.newPage();
  await long.goto(base+'test/canvas-compat.html?mode=long',{waitUntil:'networkidle'});
  await long.waitForSelector('#provenance-canvas-lens-v2');
  await long.waitForFunction(()=>{const t=document.querySelector('#provenance-canvas-lens-v2')?.innerText||'';return t.includes('80 unique questions')||t.includes('80 question blocks')});
  const longText=await long.locator('#provenance-canvas-lens-v2').innerText();
  ok(label+' long Canvas page lists all questions',longText.includes('all listed'));
  ok(label+' long page renders every review card',(await long.getByRole('button',{name:'Mark reviewed'}).count())===80);
  await long.close();

  const dynamic=await context.newPage();
  await dynamic.goto(base+'test/canvas-compat.html?mode=dynamic',{waitUntil:'domcontentloaded'});
  await dynamic.waitForSelector('#provenance-canvas-lens-v2');
  await dynamic.waitForFunction(()=>{const t=document.querySelector('#provenance-canvas-lens-v2')?.innerText||'';return t.includes('2 unique questions')||t.includes('2 question blocks')},{timeout:5000});
  ok(label+' dynamic Canvas auto-rescan',true);
  await dynamic.close();

  const app=await context.newPage();
  await app.goto(base+'index.html',{waitUntil:'networkidle'});
  const bookmarklet=await app.evaluate(()=>canvasBookmarklet());
  await app.close();

  const bm=await context.newPage();
  await bm.goto(base+'test/canvas-compat.html?mode=selected',{waitUntil:'networkidle'});
  const bmBefore=await bm.locator('input:checked').count();
  await bm.evaluate(code=>(0,eval)(code.replace(/^javascript:/,'')),bookmarklet);
  await bm.waitForSelector('#provenance-iphone-lens');
  const bmText=await bm.locator('#provenance-iphone-lens').innerText();
  ok(label+' iPhone Lens stays inline',bmText.includes('Canvas Lens'));
  ok(label+' iPhone Lens hides current-choice state',!bmText.includes('Currently selected'));
  ok(label+' iPhone Lens preserves page controls',(await bm.locator('input:checked').count())===bmBefore);
  await bm.close();

  ok(label+' runtime clean',errors.length===0,errors.join(' | '));
  await browser.close();
}

await suite(chromium,'Chromium',{viewport:{width:1200,height:900}});
await suite(webkit,'WebKit mobile',{viewport:{width:390,height:844},isMobile:true,hasTouch:true});

if(failures.length){
  console.error('\nCANVAS NEUTRAL STRESS FAILURES\n'+failures.map(x=>' - '+x).join('\n'));
  process.exit(1);
}
console.log('\nALL CANVAS SELECTION-NEUTRAL STRESS TESTS PASSED');
