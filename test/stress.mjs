import { chromium, webkit } from 'playwright';
import fs from 'node:fs';

const base=(process.env.BASE_URL||'http://127.0.0.1:4173/').replace(/\/?$/,'/');
fs.mkdirSync('test/artifacts',{recursive:true});
const failures=[];
const ok=(name,pass,detail='')=>{console.log((pass?'PASS':'FAIL')+'  '+name+(detail?' — '+detail:''));if(!pass)failures.push(name+(detail?': '+detail:''));};
const safe=async(name,fn)=>{try{await fn()}catch(e){ok(name,false,e.message)}};

async function appSuite(browserType,label,contextOptions){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext(contextOptions);
  const page=await context.newPage();
  const runtime=[];
  page.on('pageerror',e=>runtime.push('pageerror: '+e.message));
  page.on('console',m=>{if(m.type()==='error')runtime.push('console: '+m.text())});
  page.on('dialog',d=>d.accept());

  await page.goto(base+'index.html?stress=1',{waitUntil:'networkidle'});
  await page.evaluate(()=>localStorage.clear());
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('runtimeWarning')).display==='none');
  ok(label+' boot',await page.locator('#draft').isVisible());

  const tabs=await page.locator('.tab').evaluateAll(ts=>ts.map(t=>t.dataset.tab));
  for(const tab of tabs){
    await page.locator('.tab[data-tab="'+tab+'"]').click();
    ok(label+' tab '+tab,await page.locator('#panel-'+tab).isVisible());
  }

  await page.locator('.tab[data-tab="draft"]').click();
  const baseText='Furthermore, this is a deliberately formal sentence that contains enough words for the analysis engine. It is important to note that the second sentence is longer and more detailed than the first. The third sentence changes rhythm.';
  await page.locator('#draft').fill(baseText);
  await page.getByRole('button',{name:'Analyze writing'}).click();
  ok(label+' analysis metrics',(await page.locator('#scoreBig').textContent())?.includes('/ 100'));

  const modes=['Humanize','Natural','Clear','Concise','Academic','Direct'];
  await page.locator('.tab[data-tab="rewrite"]').click();
  for(const mode of modes){
    await page.getByRole('button',{name:mode,exact:true}).click();
    const t=(await page.locator('#rewriteResult').textContent())||'';
    ok(label+' rewrite '+mode,t.length>20&&!t.includes('Choose a revision mode'));
  }
  await page.getByRole('button',{name:'Grammar cleanup'}).click();
  ok(label+' grammar cleanup',((await page.locator('#rewriteResult').textContent())||'').length>20);
  await page.getByRole('button',{name:'Use this revision'}).click();
  ok(label+' apply revision',(await page.locator('#draft').inputValue()).length>20);

  await page.locator('#draft').fill('In 2026, a result increased by 25%. Research shows this always happens. Source: https://example.com/report');
  await page.locator('.tab[data-tab="verify"]').click();
  await page.getByRole('button',{name:'Check citations'}).click();
  ok(label+' citation verifier',((await page.locator('#citationResult').textContent())||'').includes('URLs found: 1'));
  await page.getByRole('button',{name:'Check claims'}).click();
  ok(label+' claim checker',((await page.locator('#claimResult').textContent())||'').includes('Claims worth checking'));

  await page.locator('.tab[data-tab="draft"]').click();
  await page.locator('#draft').fill('Robust writing stays here. https://example.com/robust-link Furthermore, more text.');
  await page.locator('.tab[data-tab="tools"]').click();
  await page.locator('#wordFilter').fill('robust, furthermore');
  await page.getByRole('button',{name:'Find words'}).click();
  ok(label+' word filter find',((await page.locator('#filterResult').textContent())||'').toLowerCase().includes('robust'));
  await page.getByRole('button',{name:'Remove words'}).click();
  const filtered=await page.locator('#draft').inputValue();
  ok(label+' word filter remove',!/^.*\brobust\b.*$/im.test(filtered.replace(/https?:\/\/\S+/g,'')));
  ok(label+' URL preservation',filtered.includes('https://example.com/robust-link'));
  await page.locator('#studyQuestion').fill('Explain why photosynthesis matters.');
  await page.getByRole('button',{name:'Break it down'}).click();
  ok(label+' Study Assist',((await page.locator('#studyResult').textContent())||'').includes('Local Study Assist'));

  await page.locator('.tab[data-tab="canvas"]').click();
  await page.locator('#canvasQuestions').fill('1. Which pigment absorbs light?\nA. Chlorophyll\nB. Oxygen\n\n2. Explain photosynthesis.');
  await page.locator('#canvasNotes').fill('Chlorophyll absorbs light. Photosynthesis produces glucose and oxygen.');
  await page.getByRole('button',{name:'Build review queue'}).click();
  ok(label+' Canvas manual queue',(await page.locator('#studyQueue .study-card').count())===2);
  const capped=await page.evaluate(()=>sanitizeCanvasPayload({items:Array.from({length:130},(_,i)=>({question:'Q'+i,options:Array.from({length:30},(_,j)=>({text:'O'+j}))})),context:'x'.repeat(70000)}));
  ok(label+' Canvas payload item cap',capped.items.length===100);
  ok(label+' Canvas payload option cap',capped.items[0].options.length===20);
  ok(label+' Canvas payload context cap',capped.context.length===50000);

  await page.locator('.tab[data-tab="projects"]').click();
  for(let i=0;i<30;i++){
    await page.locator('#projectName').fill('Stress '+i);
    await page.locator('.tab[data-tab="draft"]').click();
    await page.locator('#draft').fill('Project '+i+' content with enough words to save and reload safely.');
    await page.locator('.tab[data-tab="projects"]').click();
    await page.getByRole('button',{name:'Save project'}).click();
    await page.getByRole('button',{name:'New project'}).click();
    await page.locator('.tab[data-tab="projects"]').click();
  }
  ok(label+' 30-project persistence',(await page.locator('#projectList .item').count())===30);
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.tab[data-tab="projects"]').click();
  ok(label+' project persistence after reload',(await page.locator('#projectList .item').count())===30);

  const upload=page.locator('#fileInput');
  const textCases=[
    ['audit.txt','text/plain','TXT upload parser works.'],
    ['audit.md','text/markdown','# Markdown upload parser works.'],
    ['audit.csv','text/csv','name,value\nalpha,1'],
    ['audit.json','application/json',JSON.stringify({name:'JSON Project',text:'JSON upload parser works correctly.'})]
  ];
  for(const [name,mime,content] of textCases){
    await upload.setInputFiles({name,mimeType:mime,buffer:Buffer.from(content)});
    await page.waitForTimeout(100);
    ok(label+' upload '+name,(await page.locator('#draft').inputValue()).length>3);
  }

  const docxBytes=await page.evaluate(()=>Array.from(zipStore([
    ['[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'],
    ['word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX stress parser works correctly.</w:t></w:r></w:p></w:body></w:document>']
  ])));
  await upload.setInputFiles({name:'audit.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(docxBytes)});
  await page.waitForFunction(()=>document.getElementById('draft').value.includes('DOCX stress parser works'));
  ok(label+' DOCX parser',true);

  const pdf=Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\nBT (PDF stress parser works correctly.) Tj ET\n%%EOF');
  await upload.setInputFiles({name:'audit.pdf',mimeType:'application/pdf',buffer:pdf});
  await page.waitForFunction(()=>document.getElementById('draft').value.includes('PDF stress parser works'));
  ok(label+' PDF text parser',true);

  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlS4AAAAASUVORK5CYII=','base64');
  await upload.setInputFiles({name:'audit.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>document.getElementById('imagePreview').style.display==='block');
  ok(label+' image preview',true);

  await page.locator('.tab[data-tab="draft"]').click();
  await page.locator('#draft').fill('Export sentence one. Export sentence two has more words.');
  await page.locator('.tab[data-tab="export"]').click();
  for(const name of ['Download TXT','Download Markdown','Download JSON','Download CSV','Download XLSX']){
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name}).click()]);
    const path=await download.path();
    ok(label+' '+name,!!path&&fs.statSync(path).size>0,download.suggestedFilename());
  }

  await page.locator('.tab[data-tab="connectors"]').click();
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Import a document'}).click();
  const fc=await chooser;
  ok(label+' native file-picker bridge',!!fc);
  ok(label+' connector cards honest',((await page.locator('#panel-connectors').innerText())||'').includes('Not connected in this edition'));

  await page.locator('.tab[data-tab="diagnostics"]').click();
  await page.getByRole('button',{name:'Run health checks'}).click();
  ok(label+' self-test',(await page.locator('#testResults .bad').count())===0);
  await page.getByRole('button',{name:'Run deep QA'}).click();
  ok(label+' deep QA',(await page.locator('#testResults .bad').count())===0);

  const large='A varied sentence with useful content. '.repeat(3500);
  const perf=await page.evaluate(text=>{document.getElementById('draft').value=text;const a=performance.now();analyze();const b=performance.now();rewrite('humanize');return {analysis:b-a,rewrite:performance.now()-b}},large);
  ok(label+' large-text analysis stress',perf.analysis<5000,perf.analysis.toFixed(0)+' ms');
  ok(label+' large-text rewrite stress',perf.rewrite<5000,perf.rewrite.toFixed(0)+' ms');

  const sw=await page.evaluate(async()=>('serviceWorker' in navigator)?!!(await navigator.serviceWorker.getRegistration()):true);
  ok(label+' service worker registration',sw);

  await page.screenshot({path:'test/artifacts/stress-'+label.replace(/\s+/g,'-')+'.png',fullPage:true});
  ok(label+' runtime console clean',runtime.length===0,runtime.join(' | '));
  await browser.close();
}

async function canvasSuite(browserType,label,contextOptions){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext(contextOptions);
  const modes={classic:2,new:2,aria:2,select:2,hidden:2,mixed:6,long:80};
  for(const [mode,count] of Object.entries(modes)){
    const page=await context.newPage();
    await page.goto(base+'test/canvas-compat.html?mode='+mode,{waitUntil:'networkidle'});
    await page.waitForSelector('#provenance-canvas-lens-v2');
    await page.waitForFunction(expected=>document.querySelector('#provenance-canvas-lens-v2')?.innerText.includes(expected+' question block'),count);
    const text=await page.locator('#provenance-canvas-lens-v2').innerText();
    ok(label+' Canvas '+mode+' detection',text.includes(count+' question block'),text.split('\n')[0]);
    const selected=await page.locator('input[type="radio"]:checked,input[type="checkbox"]:checked').count();
    ok(label+' Canvas '+mode+' no auto-selection',selected===0,selected+' selected');
    const ctx=await page.evaluate(()=>{const r=document.getElementById('provenance-canvas-lens-v2');return !!r&&r.getBoundingClientRect().width>0&&r.getBoundingClientRect().height>0&&r.innerText.includes('Response builder')});
    ok(label+' Canvas '+mode+' overlay visible',ctx);
    await page.close();
  }

  const dynamic=await context.newPage();
  await dynamic.goto(base+'test/canvas-compat.html?mode=dynamic',{waitUntil:'domcontentloaded'});
  await dynamic.waitForFunction(()=>document.querySelector('#provenance-canvas-lens-v2')?.innerText.includes('1 question block'));
  await dynamic.waitForFunction(()=>document.querySelector('#provenance-canvas-lens-v2')?.innerText.includes('2 question blocks'),null,{timeout:5000});
  ok(label+' Canvas dynamic auto-rescan',true);
  await dynamic.close();

  const framePage=await context.newPage();
  await framePage.goto(base+'test/canvas-compat.html?mode=frame',{waitUntil:'networkidle'});
  await framePage.waitForSelector('#provenance-canvas-lens-v2');
  const child=framePage.frames().find(f=>f!==framePage.mainFrame());
  await child.waitForSelector('#provenance-canvas-lens-v2');
  await child.waitForFunction(()=>document.querySelector('#provenance-canvas-lens-v2')?.innerText.includes('2 question blocks'));
  ok(label+' Canvas embedded-frame overlay',true);

  const transfer=await context.newPage();
  await transfer.goto(base+'test/canvas-compat.html?mode=mixed',{waitUntil:'networkidle'});
  await transfer.waitForFunction(()=>document.querySelector('#provenance-canvas-lens-v2')?.innerText.includes('6 question blocks'));
  const popupPromise=context.waitForEvent('page');
  await transfer.getByRole('button',{name:'Open all in Provenance'}).click();
  const popup=await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForFunction(()=>document.getElementById('canvasBridgeStatus')?.textContent.includes('6 items received'),null,{timeout:10000});
  ok(label+' Canvas no-copy page bridge',true);
  ok(label+' Canvas review queue from page',(await popup.locator('#studyQueue .study-card').count())===6);
  await popup.close();await transfer.close();await framePage.close();
  await browser.close();
}

await safe('Chromium app stress',()=>appSuite(chromium,'Chromium desktop',{viewport:{width:1365,height:900}}));
await safe('WebKit app stress',()=>appSuite(webkit,'WebKit mobile',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}));
await safe('Chromium Canvas matrix',()=>canvasSuite(chromium,'Chromium',{viewport:{width:1200,height:900}}));
await safe('WebKit Canvas matrix',()=>canvasSuite(webkit,'WebKit',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}));

if(failures.length){
  console.error('\nSTRESS FAILURES\n'+failures.map(x=>' - '+x).join('\n'));
  process.exit(1);
}
console.log('\nALL STRESS AND CANVAS COMPATIBILITY TESTS PASSED');
