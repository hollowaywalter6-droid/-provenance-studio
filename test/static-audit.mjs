import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),index=read('index.html'),overlay=read('canvas-overlay.js'),extension=read('browser-extension/content.js'),manifest=JSON.parse(read('browser-extension/manifest.json')),sw=read('sw.js'),workflow=read('.github/workflows/pages.yml'),version=JSON.parse(read('version.json')),smoke=read('test/smoke.html');
const results=[];function check(name,ok,detail=''){results.push({name,ok:!!ok,detail});if(!ok)process.exitCode=1}
function compileHtml(source,label){const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);try{scripts.forEach(s=>new Function(s));check(label,true,scripts.length+' scripts')}catch(e){check(label,false,e.message)}return scripts.join('\n')}
const js=compileHtml(index,'index syntax');compileHtml(smoke,'smoke syntax');for(const [n,c] of [['overlay',overlay],['extension',extension],['service worker',sw]]){try{new Function(c);check(n+' syntax',true)}catch(e){check(n+' syntax',false,e.message)}}
const markup=index.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi,''),ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),dup=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];check('No duplicate IDs',dup.length===0,dup.join(', '));
const tabs=[...markup.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]);check('Every tab has panel',tabs.every(t=>ids.includes('panel-'+t)),tabs.length+' tabs');
const handlers=[...new Set([...markup.matchAll(/on(?:click|change|input)="([A-Za-z_$][\w$]*)\(/g)].map(m=>m[1]))];check('Inline handlers resolve',handlers.every(n=>new RegExp('function\\s+'+n+'\\s*\\(').test(js)),handlers.length+' handlers');
check('Release version synchronized',version.version==='4.2.1'&&index.includes("APP_VERSION='4.2.1'")&&sw.includes('provenance-v4-2-1')&&manifest.version==='2.2.1');
check('Overlay and extension synchronized',overlay===extension);
check('Canvas dynamic rescans',overlay.includes('MutationObserver')&&overlay.includes('render(false)'));
check('Canvas nested deduplication',overlay.includes('questionSignature')&&overlay.includes('uniqueQuestions'));
check('Canvas active review is hint-based',overlay.includes("headline:'Hint: ")&&!overlay.includes('Best-supported by visible evidence:'));
check('Canvas current-choice state is not rendered',!overlay.includes('Currently selected in Canvas')&&!index.includes('Currently selected:'));
check('Canvas current-choice state is not parsed into Lens options',!overlay.includes('selected:!!input.checked')&&!overlay.includes('selected:!!o.selected'));
check('Canvas filter present',overlay.includes('Filter Canvas Lens questions')&&index.includes('Filter Canvas Lens questions'));
check('Canvas does not submit assessments',!/(requestSubmit\(|\.submit\(|\.click\(\).*submit)/i.test(overlay));
check('Canvas postMessage origin restricted',index.includes('trustedCanvasOrigin')&&index.includes("hostname.endsWith('.instructure.com')"));
check('Canvas concise app review replaces queue',index.includes('canvasReviewResults')&&!index.includes('Approval queue')&&!index.includes('Build review queue'));
check('Project backup recovery exists',index.includes('STORE_BACKUP')&&index.includes('parseProjectStore'));
check('File size guard exists',index.includes('MAX_FILE_BYTES=50*1024*1024'));
check('DOCX decompression guard exists',index.includes('MAX_DOCX_XML_BYTES')&&index.includes('uncompSize>MAX_DOCX_XML_BYTES'));
check('PDF.js fallback exists',index.includes('pdfjs-dist@6.3.289')&&index.includes('extractPdfWithPdfJs'));
check('OCR adaptive mobile sizing exists',index.includes('hardwareConcurrency')&&index.includes('maxPixels=')&&index.includes('ocrTextQuality'));
check('OCR retry and cancellation exist',index.includes('Fast scan was weak')&&index.includes('cancelOcr'));
check('Citation checker supports author-date citations',index.includes('Author-date citations'));
check('Connector claims remain honest',index.includes('Direct authenticated model API: not configured'));
check('Stale-cache recovery exists',index.includes('ensureLatestVersion')&&index.includes('updateNow')&&sw.includes("cache:'reload'"));
check('Accessibility focus and reduced motion styles exist',index.includes(':focus-visible')&&index.includes('prefers-reduced-motion'));
check('Mobile safe-area support exists',index.includes('safe-area-inset-bottom'));
check('Canvas Lens compact mobile footprint configured',index.includes('max-height:44vh')&&index.includes('width:min(330px')&&overlay.includes("expandedHeight=compactViewport?'44vh':'74vh'"));
check('Workflow includes Chromium WebKit Firefox',workflow.includes('chromium webkit firefox'));
for(const r of results)console.log((r.ok?'PASS':'FAIL')+'  '+r.name+(r.detail?' — '+r.detail:''));if(process.exitCode)throw new Error('Static audit failed');