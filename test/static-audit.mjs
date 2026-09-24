import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const index=read('index.html');
const overlay=read('canvas-overlay.js');
const extension=read('browser-extension/content.js');
const manifest=JSON.parse(read('browser-extension/manifest.json'));
const smoke=read('test/smoke.html');
const sw=read('sw.js');
const workflow=read('.github/workflows/pages.yml');
const version=JSON.parse(read('version.json'));

const results=[];
function check(name,ok,detail=''){
  results.push({name,ok:!!ok,detail});
  if(!ok) process.exitCode=1;
}
function compileScripts(source,label){
  const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
  try{scripts.forEach(s=>new Function(s));check(label,true,scripts.length+' inline scripts compiled')}
  catch(e){check(label,false,e.message)}
  return scripts.join('\n');
}

const js=compileScripts(index,'index.html JavaScript syntax');
compileScripts(smoke,'smoke page JavaScript syntax');
try{new Function(overlay);check('Canvas overlay syntax',true)}catch(e){check('Canvas overlay syntax',false,e.message)}
try{new Function(extension);check('Canvas extension syntax',true)}catch(e){check('Canvas extension syntax',false,e.message)}
try{new Function(sw);check('service worker syntax',true)}catch(e){check('service worker syntax',false,e.message)}

const markup=index.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi,'');
const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const dup=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];
check('No duplicate HTML IDs',dup.length===0,dup.join(', '));

const tabs=[...markup.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]);
const missingPanels=tabs.filter(t=>!ids.includes('panel-'+t));
check('Every tab has a panel',missingPanels.length===0,tabs.length+' tabs; missing '+missingPanels.join(', '));

const handlers=[...new Set([...markup.matchAll(/on(?:click|change|input)="([A-Za-z_$][\w$]*)\(/g)].map(m=>m[1]))];
const missingHandlers=handlers.filter(n=>!new RegExp('function\\s+'+n+'\\s*\\(').test(js));
check('Every inline control handler resolves',missingHandlers.length===0,handlers.length+' handlers; missing '+missingHandlers.join(', '));

const refs=[...js.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
const missingIds=[...new Set(refs.filter(id=>!ids.includes(id)))];
check('Every $() DOM reference exists',missingIds.length===0,missingIds.join(', '));

check('Canvas overlay and extension are synchronized',overlay===extension);
check('Canvas overlay auto-rescans dynamic pages',overlay.includes('MutationObserver')&&overlay.includes('render(false)'));
check('Canvas overlay uses live postMessage bridge',overlay.includes('PROVENANCE_CANVAS_CAPTURE')&&overlay.includes('postMessage'));
check('Canvas overlay has mobile same-tab fallback',overlay.includes('compactPayload')&&overlay.includes("iPad|iPhone|iPod"));
check('Canvas overlay isolates host-page events',overlay.includes("root.addEventListener('pointerdown'")&&overlay.includes("root.addEventListener('click'"));
check('Canvas overlay uses inline hover dock',overlay.includes('Inline review')&&overlay.includes("data-a=\"toggle\"")&&overlay.includes("mouseenter")&&overlay.includes("mouseleave"));
check('Canvas Lens can move sides',overlay.includes('data-a="side"')&&overlay.includes("lensSide==='right'?'left':'right'"));
check('Canvas Lens reports current selection',overlay.includes('Currently selected in Canvas'));
check('Canvas Lens supports local review notes',overlay.includes('provenance-canvas-lens-notes-v1')&&overlay.includes('Apply notes'));
check('Canvas overlay removes app-switch review controls',!overlay.includes('Open deeper review')&&!overlay.includes('Open all in Provenance'));
check('Canvas overlay does not auto-submit',!/(\.submit\(|requestSubmit\(|click\(\).*submit)/i.test(overlay));
check('Canvas app accepts live page bridge',index.includes("window.addEventListener('message'")&&index.includes('handleCanvasPayload'));
check('iPhone bookmarklet renders an on-page Lens',index.includes("provenance-iphone-lens")&&index.includes("Canvas Lens")&&!index.includes("location.href=u"));
check('Bookmarklet copy has manual fallback',index.includes('legacyCopyText')&&index.includes('canvasBookmarkletCode'));
check('Canvas review removes percentage scoring',!index.includes('choice-score')&&!index.includes("note overlap '+o.score+'%"));
check('Canvas capture builds clean context',index.includes("F.forEach(e=>{const t=n(e.innerText);if(t)C=C.replace(t,' ')}"));
check('iPhone bookmarklet uses inline context review',index.includes("Inline review")&&index.includes("tap bookmark again to rescan"));
check('Canvas payload enters review without lossy reparse',index.includes("studyItems=p.items.map(function(item,i)"));
check('Canvas bookmarklet is inline/CSP resilient',index.includes("return 'javascript:'+code")&&!index.includes("s.src='https://hollowaywalter6-droid.github.io/-provenance-studio/canvas-overlay.js"));
check('Canvas extension runs in frames',manifest.content_scripts?.[0]?.all_frames===true);
check('Canvas extension declares Canvas hosts',(manifest.host_permissions||[]).some(x=>x.includes('instructure.com')));
check('Canvas fixture present',read('test/canvas-fixture.html').includes('data-question-id="1"'));
check('Live smoke test present',smoke.includes('ALL LIVE SMOKE TESTS PASSED'));
check('Service worker cache is v4.0.0',sw.includes("provenance-v4-0-0"));
check('Version endpoint matches release',version.version==='4.0.0'&&index.includes("APP_VERSION='4.0.0'"));
check('Stale-version recovery present',index.includes('ensureLatestVersion')&&index.includes('updateNow')&&sw.includes("cache:'reload'"));
check('Advanced PDF.js fallback present',index.includes('extractPdfWithPdfJs')&&index.includes('pdfjs-dist@6.3.289'));
check('Scanned PDF OCR fallback present',index.includes('ocrPdf')&&index.includes('tesseract.js@7.0.0'));
check('Image/screenshot OCR present',index.includes('ocrImageFile')&&index.includes('runPendingImageOcr'));
check('OCR has fast/accurate modes',index.includes('Fast mobile')&&index.includes('Accurate')&&index.includes('ocrScale'));
check('OCR progress is compact and cancellable',index.includes('ocrProgressBar')&&index.includes('cancelOcr'));
check('Connector hub has functional AI handoff',index.includes('buildAIHandoff')&&index.includes('copyAIHandoff')&&index.includes('shareAIHandoff'));
check('Claim checker has citation-aware splitter',index.includes('claimSentences')&&index.includes('PVCITE'));
check('Sentence map is compact/expandable',index.includes('toggleSentenceMap')&&index.includes('Show all sentences'));
check('Deployment no longer cancels superseded runs',workflow.includes('cancel-in-progress: false'));

for(const r of results) console.log((r.ok?'PASS':'FAIL')+'  '+r.name+(r.detail?' — '+r.detail:''));
if(process.exitCode) throw new Error('Static audit failed');
