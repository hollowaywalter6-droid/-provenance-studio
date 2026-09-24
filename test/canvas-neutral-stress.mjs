import {chromium,webkit,firefox} from 'playwright';
const base=process.env.BASE_URL||'http://127.0.0.1:4173/',failures=[];const ok=(n,p,d='')=>{console.log((p?'PASS':'FAIL')+'  '+n+(d?' — '+d:''));if(!p)failures.push(n+(d?': '+d:''))};
async function suite(type,label,opts){
 const browser=await type.launch({headless:true}),context=await browser.newContext(opts),errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const app=await context.newPage(),t0=Date.now();await app.goto(base+'index.html',{waitUntil:'networkidle'});ok(label+' app boots under 5s',Date.now()-t0<5000,(Date.now()-t0)+'ms');
 await app.locator('#draft').fill(Array.from({length:1200},(_,i)=>'Sentence '+(i+1)+' exercises large-document analysis with representative text.').join(' '));const a0=Date.now();await app.getByRole('button',{name:'Analyze writing'}).click();ok(label+' large draft analysis under 3s',Date.now()-a0<3000,(Date.now()-a0)+'ms');await app.close();
 const modes={classic:2,new:2,aria:2,select:2,hidden:2,mixed:6,observed:1,selected:1,nestedfeedback:1,long:80};
 for(const [mode,count] of Object.entries(modes)){
   const p=await context.newPage();await p.goto(base+'test/canvas-compat.html?mode='+mode,{waitUntil:'networkidle'});await p.waitForSelector('#provenance-canvas-lens-v2');
   const text=await p.locator('#provenance-canvas-lens-v2').innerText(),before=await p.locator('input[type="radio"]:checked,input[type="checkbox"]:checked').count();
   ok(label+' '+mode+' detects expected question count',text.includes(count+' unique question')||text.includes(count+' question block'),text.split('\n')[0]);
   ok(label+' '+mode+' hides current-choice state',!text.includes('Currently selected'));
   if(mode!=='nestedfeedback')ok(label+' '+mode+' does not show direct active-choice recommendation',!text.includes('Best-supported by visible evidence:'));
   if(mode==='nestedfeedback')ok(label+' nested feedback confirmed',text.includes('Confirmed: B — Nature limits culture, while culture shapes nature over time.'));
   if(mode==='long'){ok(label+' long page all listed',text.includes('80 unique questions')&&text.includes('all listed'));const filter=p.getByRole('searchbox',{name:'Filter Canvas Lens questions'});await filter.fill('Question 80');ok(label+' long filter narrows cards',(await p.locator('[data-lens-question]:visible').count())===1)}
   await p.getByRole('button',{name:'Scan'}).click();ok(label+' '+mode+' preserves controls',(await p.locator('input[type="radio"]:checked,input[type="checkbox"]:checked').count())===before);await p.close()
 }
 const dynamic=await context.newPage();await dynamic.goto(base+'test/canvas-compat.html?mode=dynamic',{waitUntil:'domcontentloaded'});await dynamic.waitForSelector('#provenance-canvas-lens-v2');await dynamic.waitForFunction(()=>{const t=document.querySelector('#provenance-canvas-lens-v2')?.innerText||'';return t.includes('2 unique questions')||t.includes('2 question blocks')},{timeout:5000});ok(label+' dynamic auto-rescan',true);await dynamic.close();
 const src=await context.newPage();await src.goto(base+'index.html',{waitUntil:'networkidle'});const bm=await src.evaluate(()=>canvasBookmarklet());await src.close();
 const bmPage=await context.newPage();await bmPage.goto(base+'test/canvas-compat.html?mode=selected',{waitUntil:'networkidle'});const b0=await bmPage.locator('input:checked').count();await bmPage.evaluate(code=>(0,eval)(code.replace(/^javascript:/,'')),bm);await bmPage.waitForSelector('#provenance-iphone-lens');const bt=await bmPage.locator('#provenance-iphone-lens').innerText();ok(label+' iPhone Lens inline',bt.includes('Canvas Lens'));ok(label+' iPhone Lens selection-neutral',!bt.includes('Currently selected')&&(await bmPage.locator('input:checked').count())===b0);ok(label+' iPhone Lens filter',await bmPage.locator('#provenance-iphone-lens').getByRole('searchbox',{name:'Filter Canvas Lens questions'}).isVisible());
 const br=await bmPage.locator('#provenance-iphone-lens').boundingBox();ok(label+' iPhone Lens compact footprint',!!br&&br.width<=350&&br.height<=844*.55,JSON.stringify(br));await bmPage.close();
 ok(label+' runtime clean',errors.length===0,errors.join(' | '));await browser.close()
}
await suite(chromium,'Chromium',{viewport:{width:1200,height:900}});
await suite(webkit,'WebKit mobile',{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await suite(firefox,'Firefox',{viewport:{width:1200,height:900}});
if(failures.length){console.error('\nCOMPETITION FAILURES\n'+failures.map(x=>' - '+x).join('\n'));process.exit(1)}console.log('\nALL PRODUCTION COMPETITION TESTS PASSED');