(()=>{
  'use strict';
  const OVERLAY_ID='provenance-canvas-lens-v2';
  const APP_URL=(window.PROVENANCE_APP_URL||'https://hollowaywalter6-droid.github.io/-provenance-studio/').replace(/#.*$/,'');
  if(document.getElementById(OVERLAY_ID)){document.getElementById(OVERLAY_ID).remove();return}

  const STOP=new Set(['the','and','for','that','with','from','this','what','which','when','where','who','why','how','are','was','were','have','has','had','not','but','you','your','into','about','can','could','would','should']);
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const words=s=>(norm(s).toLowerCase().match(/[a-z0-9'-]{3,}/g)||[]).filter(w=>!STOP.has(w));
  const visible=el=>{
    if(!el||!el.isConnected)return false;
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)!==0&&r.width>0&&r.height>0;
  };
  const overlap=(a,b)=>{
    const A=new Set(words(a)),B=words(b); if(!A.size||!B.length)return 0;
    const hit=B.filter(x=>A.has(x)).length;
    return Math.round(hit/Math.max(1,Math.min(A.size,B.length))*100);
  };
  function labelText(input,root){
    const aria=input.getAttribute&&input.getAttribute('aria-label');
    if(aria)return norm(aria);
    const by=input.getAttribute&&input.getAttribute('aria-labelledby');
    if(by){
      const t=by.split(/\s+/).map(id=>document.getElementById(id)).filter(Boolean).map(n=>n.innerText||n.textContent).join(' ');
      if(norm(t))return norm(t);
    }
    if(input.id){
      try{const lab=document.querySelector('label[for="'+CSS.escape(input.id)+'"]');if(lab&&norm(lab.innerText))return norm(lab.innerText)}catch(e){}
    }
    const lab=input.closest&&input.closest('label'); if(lab&&norm(lab.innerText))return norm(lab.innerText);
    for(const s of ['[data-testid*="answer"]','[data-testid*="choice"]','[class*="answer"]','[class*="choice"]','[class*="label"]']){
      const node=input.closest&&input.closest(s);
      if(node&&node!==root){
        const t=norm(node.innerText);
        if(t&&t!==norm(root.innerText)&&t.length<1200)return t;
      }
    }
    let node=input.parentElement,best='';
    for(let depth=0;node&&node!==root&&depth<4;depth++,node=node.parentElement){
      const t=norm(node.innerText);
      if(t&&t!==norm(root.innerText)&&t.length<1200&&(!best||t.length<best.length))best=t;
    }
    return best||norm(input.innerText);
  }
  function candidateRoots(){
    const candidates=[];
    const add=(els,priority)=>els.filter(visible).forEach(el=>{
      if(!el||el.id===OVERLAY_ID||el.closest('#'+OVERLAY_ID)||el.closest('[data-provenance-lens-ignore="true"]'))return;
      const hasControl=!!el.querySelector('input,textarea,select,[role="radio"],[role="checkbox"],[contenteditable="true"]');
      if(!hasControl&&priority<3)return;
      if(norm(el.innerText).length<3)return;
      candidates.push({el,priority});
    });
    add(['.question','.quiz_question','[data-question-id]','.question_holder'].flatMap(s=>[...document.querySelectorAll(s)]),3);
    add(['fieldset','[data-testid*="question-container"]','[data-testid*="question-item"]','[data-testid^="question-"]','[role="group"][aria-labelledby]'].flatMap(s=>[...document.querySelectorAll(s)]),2);
    const ctrls=[...document.querySelectorAll('input[type="radio"],input[type="checkbox"],input[type="text"],input[type="number"],textarea,select,[role="radio"],[role="checkbox"],[contenteditable="true"]')].filter(visible);
    add(ctrls.map(c=>c.closest('fieldset,.question,.quiz_question,[data-question-id],[role="group"],li,article,section,form>div')).filter(Boolean),1);
    candidates.sort((a,b)=>b.priority-a.priority);
    const out=[];
    for(const cand of candidates){
      if(out.some(x=>x.el===cand.el))continue;
      const containing=out.filter(x=>cand.el.contains(x.el));
      if(containing.some(x=>x.priority>=cand.priority))continue;
      const parent=out.find(x=>x.el.contains(cand.el));
      if(parent){
        if(cand.priority>=parent.priority){
          const i=out.indexOf(parent);out.splice(i,1,cand);
        }
        continue;
      }
      out.push(cand);
    }
    return out.map(x=>x.el);
  }
  function questionText(el,index){
    const by=el.getAttribute&&el.getAttribute('aria-labelledby');
    if(by){
      const t=by.split(/\s+/).map(id=>document.getElementById(id)).filter(Boolean).map(n=>n.innerText||n.textContent).join(' ');
      if(norm(t).length>3)return norm(t).slice(0,1600);
    }
    for(const s of ['.question_text','.question_name','legend','[data-testid*="question-text"]','[data-testid*="prompt"]','h1','h2','h3','h4']){
      const n=el.querySelector(s); if(n&&norm(n.innerText).length>3)return norm(n.innerText).slice(0,1600);
    }
    const clone=el.cloneNode(true);
    clone.querySelectorAll('input,button,select,textarea,script,style,[role="radio"],[role="checkbox"]').forEach(n=>n.remove());
    const txt=norm(clone.innerText);
    return (txt||('Question '+(index+1))).slice(0,1600);
  }
  function choiceFeedback(input,root){
    let node=input,depth=0,signals='';
    while(node&&node!==root&&depth<5){
      const cls=typeof node.className==='string'?node.className:'';
      signals+=' '+cls+' '+(node.getAttribute?.('aria-label')||'')+' '+(node.getAttribute?.('title')||'')+' '+(node.getAttribute?.('data-testid')||'');
      node=node.parentElement;depth++;
    }
    const low=signals.toLowerCase();
    if(/incorrect|wrong|answer[_-]?incorrect|marked[_-]?incorrect/.test(low))return 'incorrect';
    if(/correct[_-]?answer|answer[_-]?correct|\bcorrect\b|marked[_-]?correct/.test(low))return 'correct';
    return '';
  }
  function parseOptions(el){
    const out=[];
    const choiceControls=[...el.querySelectorAll('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"]')].filter(visible);
    choiceControls.forEach((input,i)=>{
      const text=labelText(input,el);
      if(text&&!out.some(o=>o.text===text))out.push({label:String.fromCharCode(65+out.length),text,type:(input.getAttribute('role')||input.type||'choice'),feedback:choiceFeedback(input,el)});
    });
    [...el.querySelectorAll('select')].filter(visible).forEach(sel=>{
      [...sel.options].filter(o=>!o.disabled&&norm(o.text)).forEach(o=>{
        const text=norm(o.text);
        if(!out.some(x=>x.text===text))out.push({label:String.fromCharCode(65+out.length),text,type:'select',feedback:''});
      });
    });
    return out;
  }
  function parseQuestion(el,index){
    const options=parseOptions(el);
    const openResponse=!!el.querySelector('textarea,input[type="text"],input[type="number"],[contenteditable="true"]');
    const r=el.getBoundingClientRect(),mid=(r.top+r.bottom)/2,vh=Math.max(1,innerHeight||document.documentElement.clientHeight||1);
    return {index:index+1,question:questionText(el,index),options,openResponse,inView:r.bottom>0&&r.top<vh,viewportDistance:Math.round(Math.abs(mid-vh/2))};
  }
  function questionSignature(item){
    return norm(item.question).toLowerCase()+'||'+item.options.map(o=>norm(o.text).toLowerCase()).join('|');
  }
  function uniqueQuestions(nodes){
    const seen=new Map(),pairs=[];
    nodes.forEach((el,i)=>{
      const item=parseQuestion(el,i),sig=questionSignature(item);
      if(!item.question||item.question.length<3)return;
      const prev=seen.get(sig);
      if(!prev){const pair={el,item};seen.set(sig,pair);pairs.push(pair);return}
      if(item.viewportDistance<prev.item.viewportDistance){prev.el=el;prev.item=item}
    });
    pairs.sort((a,b)=>a.el.compareDocumentPosition(b.el)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
    pairs.forEach((p,i)=>p.item.index=i+1);
    return pairs
  }
  function pageContext(questionNodes){
    const clone=document.body.cloneNode(true);
    clone.querySelectorAll('[data-provenance-lens],#'+OVERLAY_ID).forEach(n=>n.remove());
    clone.querySelectorAll('script,style,nav,header,footer,button,input,textarea,select,[role="radio"],[role="checkbox"]').forEach(n=>n.remove());
    let text=norm(clone.innerText);
    questionNodes.forEach(q=>{const t=norm(q.innerText);if(t&&t.length<5000)text=text.replace(t,' ')});
    return norm(text).slice(0,30000);
  }
  function topEvidence(q,context){
    return String(context||'').split(/(?<=[.!?])\s+/).map(norm).filter(x=>x.length>20&&x.length<700)
      .map(s=>({text:s,score:overlap(q,s)})).sort((a,b)=>b.score-a.score).filter(x=>x.score>0).slice(0,4);
  }
  function optionEvidenceScore(item,option,context){
    const qWords=words(item.question).filter(w=>!['which','what','answer','option','choice','substance','item','during'].includes(w));
    const optWords=words(option.text),sentences=String(context||'').split(/(?<=[.!?])\s+/).map(norm).filter(Boolean);
    let best=0;
    for(const sentence of sentences){
      const tokens=words(sentence),low=sentence.toLowerCase(),opt=norm(option.text).toLowerCase();
      const optPos=[];tokens.forEach((t,i)=>{if(optWords.includes(t))optPos.push(i)});
      if(!optPos.length&&!low.includes(opt))continue;
      const qPos=[];tokens.forEach((t,i)=>{if(qWords.includes(t)&&!optWords.includes(t))qPos.push(i)});
      const distance=(optPos.length&&qPos.length)?Math.min(...optPos.flatMap(x=>qPos.map(y=>Math.abs(x-y)))):12;
      const proximity=Math.max(0,100-distance*9),qMatch=overlap(item.question,sentence),exact=low.includes(opt)?100:overlap(option.text,sentence);
      best=Math.max(best,Math.round(qMatch*.55+proximity*.30+exact*.15));
    }
    return best;
  }
  function localResponse(item,context){
    const ev=topEvidence(item.question,context);
    if(item.options.length){
      const confirmed=item.options.find(o=>o.feedback==='correct');
      if(confirmed)return {headline:'Confirmed: '+confirmed.label+' — '+confirmed.text,detail:'Official Canvas review feedback.',evidence:[],source:'canvas-feedback'};
      if(ev.length)return {headline:'Hint: '+ev[0].text.slice(0,260),detail:'',evidence:[],source:'evidence'};
      return {headline:'Hint: focus on '+words(item.question).slice(0,6).join(', ')+'.',detail:'',evidence:[],source:'evidence'};
    }
    if(ev.length)return {headline:'Key context: '+ev[0].text.slice(0,260),detail:'',evidence:[],source:'evidence'};
    return {headline:'Key terms: '+words(item.question).slice(0,6).join(', ')+'.',detail:'',evidence:[],source:'evidence'};
  }
  function scan(){
    const pairs=uniqueQuestions(candidateRoots()),nodes=pairs.map(p=>p.el),items=pairs.map(p=>p.item);
    const iframeCount=[...document.querySelectorAll('iframe')].filter(visible).length;
    return {
      type:'PROVENANCE_CANVAS_CAPTURE',version:3,
      payload:{
        title:document.title,url:location.href,items,context:pageContext(nodes),
        meta:{frame:window.top===window.self?'top':'embedded',iframeCount,capturedAt:new Date().toISOString(),deduplicated:true}
      }
    };
  }
  function compactPayload(capture,item){
    const p=capture.payload||{},items=(item?[item]:(p.items||[])).slice(0,20).map((q,i)=>({
      index:i+1,question:String(q.question||'').slice(0,900),
      options:(q.options||[]).slice(0,12).map(o=>({label:String(o.label||'').slice(0,8),text:String(o.text||'').slice(0,500),feedback:String(o.feedback||'').slice(0,16)})),
      openResponse:!!q.openResponse
    }));
    return {title:String(p.title||'Canvas page').slice(0,300),url:String(p.url||location.href).slice(0,1500),context:String(p.context||'').slice(0,8000),items,meta:{...(p.meta||{}),bridge:'mobile-same-tab'}};
  }
  function sendToApp(capture,item){
    const data=typeof structuredClone==='function'?structuredClone(capture):JSON.parse(JSON.stringify(capture));
    if(item)data.payload.items=[item];
    const iphone=/iPad|iPhone|iPod/i.test(navigator.userAgent);
    if(iphone){location.href=APP_URL+'#canvas='+encodeURIComponent(JSON.stringify(compactPayload(capture,item)));return}
    const popup=window.open(APP_URL+'#canvas-ready','_blank');
    if(!popup){location.href=APP_URL+'#canvas='+encodeURIComponent(JSON.stringify(compactPayload(capture,item)));return}
    let tries=0;const target=new URL(APP_URL).origin;
    const timer=setInterval(()=>{tries++;try{popup.postMessage(data,target)}catch(e){}if(tries>=20)clearInterval(timer)},250);
  }

  const compactViewport=Math.min(innerWidth||9999,document.documentElement.clientWidth||9999)<=600;
  const expandedWidth=compactViewport?'min(330px,calc(100vw - 28px))':'min(390px,calc(100vw - 20px))';
  const expandedHeight=compactViewport?'44vh':'74vh';
  const expandedBodyHeight=compactViewport?'calc(44vh - 50px)':'calc(74vh - 50px)';
  const root=document.createElement('div');root.id=OVERLAY_ID;
  root.setAttribute('data-provenance-lens','true');
  root.style.cssText='position:fixed;right:10px;bottom:10px;width:min(390px,calc(100vw - 20px));max-height:74vh;z-index:2147483647;background:#101520;color:#f6f7fb;border:1px solid #384259;border-radius:18px;box-shadow:0 22px 60px rgba(0,0,0,.5);font:14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;overflow:hidden;pointer-events:auto;isolation:isolate;-webkit-transform:translateZ(0);transition:width .15s ease,box-shadow .15s ease;';
  root.innerHTML='<div data-head style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 12px;background:#171d2a;border-bottom:1px solid #2a3244"><div style="display:flex;align-items:center;gap:8px;min-width:0"><span style="width:8px;height:8px;border-radius:50%;background:#63e6be;box-shadow:0 0 12px #63e6be"></span><strong style="white-space:nowrap">Canvas Lens</strong><span data-count style="font-size:11px;color:#aeb8cb;white-space:nowrap"></span></div><div style="display:flex;gap:5px"><button type="button" data-a="master" aria-label="Toggle Provenance mode">Mode</button><button type="button" data-a="scan" aria-label="Rescan Canvas page">Scan</button><button type="button" data-a="side" aria-label="Move Canvas Lens to other side">↔</button><button type="button" data-a="toggle" aria-label="Minimize Canvas Lens">−</button><button type="button" data-a="close" aria-label="Close Canvas Lens">×</button></div></div><div data-body style="padding:10px;overflow:auto;max-height:calc(74vh - 50px)"></div>';
  root.querySelectorAll('button').forEach(b=>b.style.cssText='margin:0;border:1px solid #3a455e;border-radius:9px;background:#222b3e;color:#fff;padding:6px 8px;font-size:12px;font-weight:700;touch-action:manipulation');
  root.style.width=expandedWidth;root.style.maxHeight=expandedHeight;if(compactViewport)root.style.fontSize='13px';
  document.documentElement.appendChild(root);
  root.addEventListener('pointerdown',e=>e.stopPropagation());
  root.addEventListener('click',e=>e.stopPropagation());
  root.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
  const body=root.querySelector('[data-body]'),countEl=root.querySelector('[data-count]'),toggle=root.querySelector('[data-a="toggle"]'),sideBtn=root.querySelector('[data-a="side"]'),masterBtn=root.querySelector('[data-a="master"]');body.style.maxHeight=expandedBodyHeight;
  let lastSignature='',collapsed=false,hoverPeek=false,lensSide='right';
  let masterEnabled=!practiceAutofillEnabled();
  if(!practiceAutofillEnabled()){try{const saved=localStorage.getItem('provenance-canvas-master-v1');if(saved!==null)masterEnabled=saved==='on'}catch(_){}}
  function syncMasterButton(){
    masterBtn.textContent=practiceAutofillEnabled()?(masterEnabled?'Auto ON':'Auto OFF'):(masterEnabled?'Assist ON':'Assist OFF');
    masterBtn.setAttribute('aria-pressed',masterEnabled?'true':'false')
  }
  function setMaster(enabled){
    masterEnabled=!!enabled;syncMasterButton();
    if(practiceAutofillEnabled()){
      const host=document.body||document.documentElement;
      ['select','fill','submit'].forEach(k=>host.setAttribute('data-provenance-auto-'+k,masterEnabled?'on':'off'));
      if(!masterEnabled)document.querySelector('[data-provenance-practice-submit="true"]')?.removeAttribute('data-provenance-auto-submitted');
      else setTimeout(()=>runPracticeAutomation(),0)
    }else{try{localStorage.setItem('provenance-canvas-master-v1',masterEnabled?'on':'off')}catch(_){}}
    lastSignature='';render(true)
  }
  syncMasterButton();
  let lensNotes='';try{lensNotes=localStorage.getItem('provenance-canvas-lens-notes-v1')||''}catch(_){};
  function setExpanded(expanded,temporary=false){
    body.style.display=expanded?'block':'none';
    root.style.width=expanded?expandedWidth:(compactViewport?'138px':'156px');
    root.style.boxShadow=expanded?'0 22px 60px rgba(0,0,0,.5)':'0 10px 30px rgba(0,0,0,.35)';
    toggle.textContent=expanded?'−':'+';
    toggle.setAttribute('aria-label',expanded?'Minimize Canvas Lens':'Expand Canvas Lens');
    if(!temporary)collapsed=!expanded;
  }
  function locateQuestion(item){
    const sig=questionSignature(item),pair=uniqueQuestions(candidateRoots()).find(p=>questionSignature(p.item)===sig);
    if(!pair||!pair.el)return false;
    const el=pair.el,old=el.style.outline,off=el.style.outlineOffset;
    el.scrollIntoView({behavior:'smooth',block:'center'});el.style.outline='3px solid #63e6be';el.style.outlineOffset='4px';
    setTimeout(()=>{el.style.outline=old;el.style.outlineOffset=off},1500);return true
  }
  async function copyCue(text){
    let ok=false;try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);ok=true}}catch(_){}
    if(!ok){const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(ta);ta.select();try{ok=!!document.execCommand('copy')}catch(_){}ta.remove()}return ok
  }
  function quickButton(text,label){
    const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label||text);
    b.style.cssText='border:1px solid #3a455e;border-radius:9px;background:#1d2637;color:#fff;padding:6px 8px;font-size:11px;font-weight:800;touch-action:manipulation';return b
  }
  function practiceAutofillEnabled(){
    return document.documentElement.getAttribute('data-provenance-autofill')==='practice'||document.body?.getAttribute('data-provenance-autofill')==='practice'
  }
  function emitPracticeInput(control){
    control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}))
  }
  function practiceAutomationSettings(){
    const host=document.body||document.documentElement;
    return {
      autoSelect:host.getAttribute('data-provenance-auto-select')==='on',
      autoFill:host.getAttribute('data-provenance-auto-fill')==='on',
      autoSubmit:host.getAttribute('data-provenance-auto-submit')==='on'
    }
  }
  function fillPracticeQuestion(item,modes={select:true,text:true}){
    if(!practiceAutofillEnabled())return false;
    const sig=questionSignature(item),pair=uniqueQuestions(candidateRoots()).find(p=>questionSignature(p.item)===sig);
    if(!pair||!pair.el)return false;
    const root=pair.el;let changed=0;
    if(modes.select){
      root.querySelectorAll('input[type="radio"],input[type="checkbox"]').forEach(control=>{
        const flag=control.getAttribute('data-provenance-correct');if(flag===null)return;
        const shouldCheck=flag==='true';if(control.checked!==shouldCheck){control.checked=shouldCheck;emitPracticeInput(control);changed++}
      });
      root.querySelectorAll('select').forEach(control=>{
        const option=[...control.options].find(o=>o.getAttribute('data-provenance-correct')==='true');
        if(option&&control.value!==option.value){control.value=option.value;emitPracticeInput(control);changed++}
      })
    }
    if(modes.text){
      root.querySelectorAll('textarea,input[type="text"],input[type="number"],[contenteditable="true"]').forEach(control=>{
        const answer=control.getAttribute('data-provenance-answer');if(answer===null)return;
        const current=control.isContentEditable?control.textContent:control.value;
        if(current!==answer){if(control.isContentEditable)control.textContent=answer;else control.value=answer;emitPracticeInput(control);changed++}
      })
    }
    return changed>0
  }
  function runPracticeAutomation(){
    if(!practiceAutofillEnabled())return false;
    const settings=practiceAutomationSettings(),items=scan().payload.items||[];
    if(settings.autoSelect||settings.autoFill){
      items.forEach(item=>fillPracticeQuestion(item,{select:settings.autoSelect,text:settings.autoFill}))
    }
    if(settings.autoSubmit){
      const submit=document.querySelector('[data-provenance-practice-submit="true"]');
      if(submit&&submit.dataset.provenanceAutoSubmitted!=='true'){
        submit.dataset.provenanceAutoSubmitted='true';setTimeout(()=>submit.click(),50)
      }
    }
    return true
  }
  function evidenceDetails(response){
    const details=document.createElement('details');details.style.cssText='margin-top:8px;border-top:1px solid #263147;padding-top:7px';
    const summary=document.createElement('summary');summary.textContent='Evidence';summary.style.cssText='cursor:pointer;color:#cbd5e1;font-size:12px;font-weight:700';
    details.appendChild(summary);
    const ev=document.createElement('div');ev.style.cssText='margin-top:7px;color:#aeb8cb;font-size:12px;line-height:1.4;white-space:pre-wrap';
    ev.textContent=response.evidence&&response.evidence.length?response.evidence.map((x,i)=>(i+1)+'. '+x.text).join('\n'):'No supporting page context was found.';
    details.appendChild(ev);return details;
  }
  function render(force=false){
    if(!masterEnabled){body.innerHTML='<div style="padding:10px;color:#aeb8cb;font-size:12px">Provenance mode is off.</div>';countEl.textContent='';return}
    const capture=scan(),p=capture.payload;
    const sig=JSON.stringify(p.items.map(x=>[x.question,x.options.map(o=>[o.text,o.feedback])]))+'|'+lensNotes;
    if(!force&&sig===lastSignature)return;
    lastSignature=sig;body.innerHTML='';
    countEl.textContent=p.items.length?'• '+p.items.length:'';
    const meta=document.createElement('div');meta.style.cssText='font-size:11px;color:#aeb8cb;margin-bottom:8px';
    meta.textContent=p.items.length?p.items.length+' question block'+(p.items.length===1?'':'s')+' detected • Inline review • no app switching required':'No standard Canvas question blocks detected';
    if(p.meta.frame==='top'&&p.meta.iframeCount)meta.textContent+=' • '+p.meta.iframeCount+' frame'+(p.meta.iframeCount===1?'':'s');
    body.appendChild(meta);
    const filter=document.createElement('input');filter.type='search';filter.placeholder='Filter questions…';filter.setAttribute('aria-label','Filter Canvas Lens questions');filter.style.cssText='box-sizing:border-box;width:100%;margin:0 0 8px;padding:8px 9px;border:1px solid #3a455e;border-radius:9px;background:#0a0f17;color:#fff;font-size:12px';body.appendChild(filter);
    const notesWrap=document.createElement('details');notesWrap.style.cssText='margin:0 0 8px;border:1px solid #263147;border-radius:10px;padding:7px;background:#0b1119';
    const notesSummary=document.createElement('summary');notesSummary.textContent='Review notes';notesSummary.style.cssText='cursor:pointer;color:#cbd5e1;font-size:12px;font-weight:700';
    const notes=document.createElement('textarea');notes.value=lensNotes;notes.placeholder='Optional class notes or source material…';notes.style.cssText='box-sizing:border-box;width:100%;min-height:72px;margin-top:7px;border:1px solid #3a455e;border-radius:9px;background:#0a0f17;color:#fff;padding:8px;font:12px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
    const apply=document.createElement('button');apply.type='button';apply.textContent='Apply notes';apply.style.cssText='margin-top:7px;border:1px solid #3a455e;border-radius:9px;background:#222b3e;color:#fff;padding:6px 8px;font-size:12px;font-weight:700';
    apply.onclick=()=>{lensNotes=notes.value.trim();try{localStorage.setItem('provenance-canvas-lens-notes-v1',lensNotes)}catch(_){};lastSignature='';render(true)};
    notesWrap.append(notesSummary,notes,apply);body.appendChild(notesWrap);
    if(!p.items.length){
      const fallback=document.createElement('div');fallback.style.cssText='padding:10px;border-radius:12px;background:#0c1119;border:1px solid #2a3346';
      fallback.textContent='Lens could not isolate a question on this view. Scroll to a visible question and tap Scan.';
      body.appendChild(fallback);return;
    }
    const shown=p.items.slice(0,100);
    meta.textContent=p.items.length+' unique question'+(p.items.length===1?'':'s')+' • '+(p.items.length>100?'first 100 listed':'all listed')+' • Inline review';
    if(practiceAutofillEnabled()){
      meta.textContent+=' • Practice autofill enabled';
      const practiceBar=document.createElement('div');practiceBar.style.cssText='display:flex;gap:6px;margin:0 0 8px;flex-wrap:wrap';
      const fillAll=quickButton('Fill all practice','Fill all practice questions');
      fillAll.onclick=()=>{let count=0;shown.forEach(it=>{if(fillPracticeQuestion(it))count++});fillAll.textContent=count?'Filled '+count:'No keyed answers';setTimeout(()=>fillAll.textContent='Fill all practice',1100)};
      practiceBar.append(fillAll);body.appendChild(practiceBar)
    }
    shown.forEach((item,idx)=>{
      const box=document.createElement('div');box.style.cssText='border:1px solid #2a3346;border-radius:14px;padding:10px;margin:8px 0;background:#0c1119';
      const q=document.createElement('div');q.style.cssText='font-weight:800;line-height:1.35;font-size:13px';q.textContent=(item.index||idx+1)+'. '+item.question.slice(0,500);box.appendChild(q);
      if(item.options.length){
        const choices=document.createElement('details');choices.style.cssText='margin-top:7px;border:1px solid #20293a;border-radius:10px;padding:7px;background:#0b1119';
        const summary=document.createElement('summary');summary.textContent='Detected choices';summary.style.cssText='cursor:pointer;color:#cbd5e1;font-size:12px;font-weight:700';
        const list=document.createElement('div');list.style.cssText='margin-top:7px;color:#aeb8cb;font-size:12px;line-height:1.45';
        list.textContent=item.options.map(o=>o.label+'. '+o.text+(o.feedback==='correct'?'  ✓ Canvas: correct':o.feedback==='incorrect'?'  ✕ Canvas: incorrect':'')).join('\n');
        choices.append(summary,list);box.appendChild(choices);
      }
      const response=localResponse(item,(p.context+'\n'+lensNotes).trim());
      const answer=document.createElement('div');answer.style.cssText='margin-top:8px;padding:9px;border-radius:10px;background:#141c29;line-height:1.4';
      const title=document.createElement('div');title.style.cssText='font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#63e6be;font-weight:800';title.textContent='Lens review';
      const headline=document.createElement('div');headline.style.cssText='margin-top:5px;font-weight:800';headline.textContent=response.headline;
      const detail=document.createElement('div');detail.style.cssText='margin-top:5px;color:#aeb8cb;font-size:12px';detail.textContent=response.detail;
      answer.append(title,headline,detail,evidenceDetails(response));box.appendChild(answer);
      const bar=document.createElement('div');bar.style.cssText='display:flex;gap:5px;margin-top:8px;flex-wrap:wrap';
      const locate=quickButton('Locate','Locate question on Canvas');locate.onclick=()=>locateQuestion(item);
      const copy=quickButton('Copy cue','Copy Lens cue');copy.onclick=async()=>{const ok=await copyCue(response.headline);copy.textContent=ok?'Copied':'Blocked';setTimeout(()=>copy.textContent='Copy cue',900)};
      const next=quickButton('Next','Go to next Canvas question');next.onclick=()=>{const target=shown[(idx+1)%shown.length];if(target)locateQuestion(target)};
      const reviewed=quickButton('Reviewed','Mark question reviewed');reviewed.onclick=()=>{box.style.borderColor='#4cbf9f';reviewed.textContent='✓ Reviewed';reviewed.disabled=true};
      if(practiceAutofillEnabled()){const fill=quickButton('Fill this','Fill this practice question');fill.onclick=()=>{const ok=fillPracticeQuestion(item);fill.textContent=ok?'Filled':'No key';setTimeout(()=>fill.textContent='Fill this',900)};bar.append(fill)}
      bar.append(locate,copy,next,reviewed);box.appendChild(bar);box.dataset.lensQuestion=norm(item.question+' '+item.options.map(o=>o.text).join(' ')).toLowerCase();body.appendChild(box);
    });
    filter.oninput=()=>{const term=norm(filter.value).toLowerCase();body.querySelectorAll('[data-lens-question]').forEach(card=>{card.style.display=!term||card.dataset.lensQuestion.includes(term)?'block':'none'})};
  }
  masterBtn.onclick=()=>setMaster(!masterEnabled);
  toggle.onclick=()=>setExpanded(collapsed);
  sideBtn.onclick=()=>{
    lensSide=lensSide==='right'?'left':'right';
    root.style.right=lensSide==='right'?'10px':'auto';root.style.left=lensSide==='left'?'10px':'auto';
    sideBtn.setAttribute('aria-label',lensSide==='right'?'Move Canvas Lens left':'Move Canvas Lens right')
  };
  root.addEventListener('mouseenter',()=>{if(collapsed){hoverPeek=true;setExpanded(true,true)}});
  root.addEventListener('mouseleave',()=>{if(collapsed&&hoverPeek){hoverPeek=false;setExpanded(false,true)}});

  let timer=0;
  const observer=new MutationObserver(muts=>{
    if(muts.every(m=>root.contains(m.target)))return;
    clearTimeout(timer);timer=setTimeout(()=>render(false),450);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-hidden','hidden','class']});
  root.querySelector('[data-a="close"]').onclick=()=>{observer.disconnect();root.remove()};
  root.querySelector('[data-a="scan"]').onclick=()=>render(true);
  window.addEventListener('provenance:practice-settings',()=>{setTimeout(()=>{runPracticeAutomation();lastSignature='';render(true)},0)});
  if(practiceAutofillEnabled()&&masterEnabled)setTimeout(()=>runPracticeAutomation(),60);
  window.addEventListener('popstate',()=>setTimeout(()=>render(true),250));
  window.addEventListener('hashchange',()=>setTimeout(()=>render(true),250));
  render(true);
})();