import { chromium, webkit } from 'playwright';
import fs from 'node:fs';

const base=(process.env.BASE_URL||'http://127.0.0.1:4173/').replace(/\/?$/,'/');
fs.mkdirSync('test/artifacts',{recursive:true});
const failures=[];
const ok=(name,pass,detail='')=>{console.log((pass?'PASS':'FAIL')+'  '+name+(detail?' — '+detail:''));if(!pass)failures.push(name+(detail?': '+detail:''));};
const safe=async(name,fn)=>{try{await fn()}catch(e){ok(name,false,e.message)}};
function makeHexPdf(text){
  const hex=Buffer.from(text,'utf8').toString('hex').toUpperCase();
  const stream='BT /F1 24 Tf 72 720 Td <'+hex+'> Tj ET';
  const objs=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+Buffer.byteLength(stream,'ascii')+' >>\nstream\n'+stream+'\nendstream'
  ];
  let pdf='%PDF-1.4\n',offs=[0];
  for(let i=0;i<objs.length;i++){offs[i+1]=Buffer.byteLength(pdf,'ascii');pdf+=(i+1)+' 0 obj\n'+objs[i]+'\nendobj\n'}
  const xref=Buffer.byteLength(pdf,'ascii');
  pdf+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';
  for(let i=1;i<=objs.length;i++)pdf+=String(offs[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  return Buffer.from(pdf,'ascii');
}

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
  const claimParts=await page.evaluate(()=>claimSentences('Wendy Bracken September 23, 2026 Uber Technologies, Inc.\nCurrently, Uber operates in more than 70 countries (Uber Technologies, Inc., 2026).'));
  ok(label+' claim parser keeps parenthetical citation intact',claimParts.length===2&&claimParts[1].includes('(Uber Technologies, Inc., 2026).'),claimParts.join(' || '));
  await page.locator('.tab[data-tab="draft"]').click();
  await page.locator('#draft').fill(Array.from({length:18},(_,i)=>'Sentence '+(i+1)+' has enough words to exercise the compact sentence map.').join(' '));
  await page.getByRole('button',{name:'Analyze writing'}).click();
  ok(label+' sentence map starts compact',(await page.locator('#sentenceMap .item').count())===10);
  await page.getByRole('button',{name:/Show all 18 sentences/}).click();
  ok(label+' sentence map expands',(await page.locator('#sentenceMap .item').count())===18);

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
  ok(label+' Canvas review UI has no percentage scoring',!/%/.test(await page.locator('#studyQueue').innerText()));
  const capped=await page.evaluate(()=>sanitizeCanvasPayload({items:Array.from({length:130},(_,i)=>({question:'Q'+i,options:Array.from({length:30},(_,j)=>({text:'O'+j}))})),context:'x'.repeat(70000)}));
  ok(label+' Canvas payload item cap',capped.items.length===100);
  ok(label+' Canvas payload option cap',capped.items[0].options.length===20);
  ok(label+' Canvas payload context cap',capped.context.length===50000);
  await page.getByRole('button',{name:'Show setup steps'}).click();
  ok(label+' Canvas setup steps visible',await page.locator('#canvasSetup').isVisible());
  ok(label+' iPhone Lens code field',(await page.locator('#canvasBookmarkletCode').inputValue()).startsWith('javascript:'));
  await page.evaluate(()=>copyCanvasBookmarklet());
  ok(label+' bookmarklet manual fallback UI',await page.locator('#canvasBookmarkletCode').isVisible());

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
  ok(label+' PDF basic text parser',true);

  const encodedPdf=makeHexPdf('ADVANCED PDF ENCODED TEXT WORKS');
  await upload.setInputFiles({name:'encoded.pdf',mimeType:'application/pdf',buffer:encodedPdf});
  await page.waitForFunction(()=>document.getElementById('draft').value.includes('ADVANCED PDF ENCODED TEXT WORKS'),null,{timeout:30000});
  ok(label+' PDF.js encoded-text fallback',true);

  const ocrText=await page.evaluate(async bytes=>await ocrPdf(new Uint8Array(bytes).buffer,()=>{}),Array.from(makeHexPdf('OCR TEST 123')));
  ok(label+' PDF OCR render/recognition pipeline',/OCR|TEST|123/i.test(ocrText),ocrText.slice(0,80).replace(/\s+/g,' '));
  const imageOcr=await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=700;c.height=180;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='bold 52px Arial';x.fillText('SCREENSHOT OCR 321',35,105);
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));const file=new File([blob],'screenshot.png',{type:'image/png'});
    return await ocrImageFile(file,'fast',()=>{});
  });
  ok(label+' screenshot/image OCR pipeline',/SCREENSHOT|OCR|321/i.test(imageOcr),imageOcr.slice(0,80).replace(/\s+/g,' '));

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
  const connectorText=(await page.locator('#panel-connectors').innerText())||'';
  ok(label+' connector cards honest',connectorText.includes('Direct authenticated model API: not configured'));
  const handoffState=await page.evaluate(()=>({handoff:buildAIHandoff(),draft:document.getElementById('draft').value}));
  ok(label+' AI handoff includes current project',handoffState.handoff.includes('PROJECT CONTENT')&&handoffState.handoff.includes(handoffState.draft.slice(0,20)));

  await page.locator('.tab[data-tab="diagnostics"]').click();
  await page.getByRole('button',{name:'Run health checks'}).click();
  ok(label+' self-test',(await page.locator('#testResults .bad').count())===0);
  await page.getByRole('button',{name:'Run deep QA'}).click();
  ok(label+' deep QA',(await page.locator('#testResults .bad').count())===0);

  const large='A varied sentence with useful content. '.repeat(3500);
  const perf=await page.evaluate(text=>{document.getElementById('draft').value=text;const a=performance.now();analyze();const b=performance.now();rewrite('humanize');return {analysis:b-a,rewrite:performance.now()-b}},large);
  ok(label+' large-text analysis stress',perf.analysis<5000,perf.analysis.toFixed(0)+' ms');
  ok(label+' large-text rewrite stress',perf.rewrite<5000,perf.rewrite.toFixed(0)+' ms');

  const swStatus=await page.evaluate(async()=>{
    if(!('serviceWorker' in navigator))return {ok:true,detail:'unsupported'};
    let reg=null;for(let i=0;i<40&&!reg;i++){reg=await navigator.serviceWorker.getRegistration();if(!reg)await new Promise(r=>setTimeout(r,100))}
    return {ok:!!reg,detail:reg?'registered':'no registration'};
  });
  ok(label+' service worker registration',swStatus.ok,swStatus.detail);
  ok(label+' app version constant',await page.evaluate(()=>APP_VERSION==='4.1.0'));
  ok(label+' update banner control exists',(await page.locator('#updateBanner').count())===1);

  await page.screenshot({path:'test/artifacts/stress-'+label.replace(/\s+/g,'-')+'.png',fullPage:false});
  ok(label+' runtime console clean',runtime.length===0,runtime.join(' | '));
  await browser.close();
}

async function canvasSuite(browserType,label,contextOptions){
  const browser=await browserType.launch({headless:true});
  const context=await browser.newContext(contextOptions);
  const modes={classic:2,new:2,aria:2,select:2,hidden:2,mixed:6,observed:1,selected:1,nestedfeedback:1,long:80};
  for(const [mode,count] of Object.entries(modes)){
    const page=await context.newPage();
    await page.goto(base+'test/canvas-compat.html?mode='+mode,{waitUntil:'networkidle'});
    await page.waitForSelector('#provenance-canvas-lens-v2');
    await page.waitForFunction(expected=>{const t=document.querySelector('#provenance-canvas-lens-v2')?.innerText||'';return t.includes(expected+' question block')||t.includes(expected+' unique question')},count);
    const text=await page.locator('#provenance-canvas-lens-v2').innerText();
    ok(label+' Canvas '+mode+' detection',text.includes(count+' question block')||text.includes(count+' unique question'),text.split('\n')[0]);
    const expectedSelected=(mode==='selected'||mode==='nestedfeedback')?1:0;
    const selected=await page.locator('input[type="radio"]:checked,input[type="checkbox"]:checked').count();
    ok(label+' Canvas '+mode+' preserves answer controls',selected===expectedSelected,selected+' selected');
    const ctx=await page.evaluate(()=>{const r=document.getElementById('provenance-canvas-lens-v2'),t=r?.innerText||'';return !!r&&r.getBoundingClientRect().width>0&&r.getBoundingClientRect().height>0&&(t.includes('question block')||t.includes('unique question'))});
    ok(label+' Canvas '+mode+' overlay visible',ctx);
    if(mode==='classic'){
      await page.getByRole('button',{name:'Scan'}).click();
      ok(label+' Canvas Scan button works',(await page.locator('#provenance-canvas-lens-v2').innerText()).includes('2 question blocks'));
      const reviewed=page.getByRole('button',{name:'Mark reviewed'}).first();await reviewed.click();
      ok(label+' Canvas Mark reviewed works',(await page.getByRole('button',{name:'Reviewed'}).count())>0);
    }
    if(mode==='observed'){
      const overlayText=await page.locator('#provenance-canvas-lens-v2').innerText();
      const overlayAll=await page.locator('#provenance-canvas-lens-v2').textContent();
      ok(label+' Canvas observed question isolated',overlayText.includes('What is the relationship between nature and culture in shaping reality?'));
      ok(label+' Canvas observed first option clean',overlayAll.includes('A. The distinction between nature and culture is becoming increasingly blurred.'));
      ok(label+' Canvas observed option is not whole question block',!overlayAll.includes('A. Question 1 0.8 pts'));
      ok(label+' Canvas observed overlay shows no percentages',!/%/.test(overlayAll));
    }
    if(mode==='selected'){
      const overlayText=await page.locator('#provenance-canvas-lens-v2').innerText();
      ok(label+' Canvas Lens reports current selection',overlayText.includes('Currently selected in Canvas: B — Nature and culture are independent and do not influence each other.'));
    }
    if(mode==='nestedfeedback'){
      const overlayText=await page.locator('#provenance-canvas-lens-v2').innerText();
      const prompt='What is the relationship between nature and culture in shaping reality?';
      ok(label+' Canvas nested question deduplicated',overlayText.split(prompt).length-1===1,overlayText);
      ok(label+' Canvas feedback identifies confirmed answer',overlayText.includes('Canvas feedback identifies: B — Nature limits culture, while culture shapes nature over time.'));
      ok(label+' Canvas feedback reports selected wrong choice',overlayText.includes('Currently selected in Canvas: A — The distinction between nature and culture is becoming increasingly blurred.'));
    }
    await page.close();
  }

  const dynamic=await context.newPage();
  await dynamic.goto(base+'test/canvas-compat.html?mode=dynamic',{waitUntil:'domcontentloaded'});
  await dynamic.waitForFunction(()=>document.querySelector('#provenance-canvas-lens-v2')?.innerText.includes('1 question block'));
  await dynamic.waitForFunction(()=>document.querySelector('#provenance-canvas-lens-v2')?.innerText.includes('2 question blocks'),null,{timeout:5000});
  ok(label+' Canvas dynamic auto-rescan',true);
  await dynamic.getByRole('button',{name:'Close Canvas Lens'}).click();
  ok(label+' Canvas Close button works',(await dynamic.locator('#provenance-canvas-lens-v2').count())===0);
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
  await transfer.waitForFunction(()=>{const t=document.querySelector('#provenance-canvas-lens-v2')?.innerText||'';return t.includes('6 question blocks')||t.includes('6 unique questions')});
  const originalUrl=transfer.url(),pageCount=context.pages().length;
  ok(label+' Canvas inline review stays on Canvas',(await transfer.locator('#provenance-canvas-lens-v2').innerText()).includes('Inline review'));
  ok(label+' Canvas has no app-switch review buttons',(await transfer.getByRole('button',{name:/Open .*Provenance|Open deeper review/}).count())===0);
  await transfer.getByRole('button',{name:'Move Canvas Lens to other side'}).click();
  ok(label+' Canvas Lens side toggle works',(await transfer.locator('#provenance-canvas-lens-v2').evaluate(el=>getComputedStyle(el).left))!=='auto');
  await transfer.getByText('Review notes',{exact:true}).click();
  const lensNotes=transfer.locator('#provenance-canvas-lens-v2 textarea');
  await lensNotes.fill('Photosynthesis evidence note for regression.');
  await transfer.getByRole('button',{name:'Apply notes'}).click();
  ok(label+' Canvas Lens review notes persist',(await lensNotes.inputValue()).includes('Photosynthesis evidence note'));
  await transfer.getByRole('button',{name:'Minimize Canvas Lens'}).click();
  ok(label+' Canvas dock minimizes',await transfer.locator('#provenance-canvas-lens-v2 [data-body]').isHidden());
  await transfer.locator('#provenance-canvas-lens-v2').hover();
  ok(label+' Canvas dock hover-peeks',await transfer.locator('#provenance-canvas-lens-v2 [data-body]').isVisible());
  await transfer.mouse.move(1,1);
  await transfer.waitForTimeout(100);
  ok(label+' Canvas dock returns to minimized state',await transfer.locator('#provenance-canvas-lens-v2 [data-body]').isHidden());
  ok(label+' Canvas inline review does not navigate',transfer.url()===originalUrl&&context.pages().length===pageCount,transfer.url());
  await transfer.close();await framePage.close();

  const app=await context.newPage();
  await app.goto(base+'index.html',{waitUntil:'networkidle'});
  const bookmarklet=await app.evaluate(()=>canvasBookmarklet());
  await app.close();
  const bm=await context.newPage();
  await bm.goto(base+'test/canvas-compat.html?mode=nestedfeedback',{waitUntil:'networkidle'});
  const bmUrl=bm.url(),beforeSelected=await bm.locator('input[type="radio"]:checked,input[type="checkbox"]:checked').count();
  await bm.evaluate(code=>(0,eval)(code.replace(/^javascript:/,'')),bookmarklet);
  await bm.waitForSelector('#provenance-iphone-lens');
  const bmText=await bm.locator('#provenance-iphone-lens').innerText();
  ok(label+' iPhone bookmarklet renders inline Lens',bmText.includes('Canvas Lens'));
  ok(label+' iPhone bookmarklet deduplicates nested Canvas question',bmText.split('What is the relationship between nature and culture in shaping reality?').length-1===1,bmText);
  ok(label+' iPhone bookmarklet reads Canvas correct feedback',bmText.includes('Canvas feedback identifies: B — Nature limits culture, while culture shapes nature over time.'));
  ok(label+' iPhone bookmarklet shows current selected wrong answer',bmText.includes('Currently selected: A — The distinction between nature and culture is becoming increasingly blurred.'));
  ok(label+' iPhone bookmarklet stays on Canvas',bm.url()===bmUrl,bm.url());
  ok(label+' iPhone bookmarklet preserves answer controls',(await bm.locator('input[type="radio"]:checked,input[type="checkbox"]:checked').count())===beforeSelected);
  await bm.locator('#provenance-iphone-lens').getByRole('button',{name:'Minimize Canvas Lens'}).click();
  ok(label+' iPhone Lens minimizes',await bm.locator('#provenance-iphone-lens [data-b]').isHidden());
  await bm.close();

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
