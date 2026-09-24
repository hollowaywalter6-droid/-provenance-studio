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
  function labelText(input){
    const aria=input.getAttribute&&input.getAttribute('aria-label');
    if(aria)return norm(aria);
    const by=input.getAttribute&&input.getAttribute('aria-labelledby');
    if(by){
      const t=by.split(/\s+/).map(id=>document.getElementById(id)).filter(Boolean).map(n=>n.innerText||n.textContent).join(' ');
      if(norm(t))return norm(t);
    }
    if(input.id){
      try{const lab=document.querySelector('label[for="'+CSS.escape(input.id)+'"]');if(lab)return norm(lab.innerText)}catch(e){}
    }
    const lab=input.closest&&input.closest('label'); if(lab)return norm(lab.innerText);
    return norm(input.innerText||(input.parentElement&&input.parentElement.innerText));
  }
  function candidateRoots(){
    const candidates=[];
    const add=(els,priority)=>els.filter(visible).forEach(el=>{
      if(!el||el.id===OVERLAY_ID||el.closest('#'+OVERLAY_ID))return;
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
  function parseOptions(el){
    const out=[];
    const choiceControls=[...el.querySelectorAll('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"]')].filter(visible);
    choiceControls.forEach((input,i)=>{
      const text=labelText(input);
      if(text&&!out.some(o=>o.text===text))out.push({label:String.fromCharCode(65+out.length),text,type:(input.getAttribute('role')||input.type||'choice')});
    });
    [...el.querySelectorAll('select')].filter(visible).forEach(sel=>{
      [...sel.options].filter(o=>!o.disabled&&norm(o.text)).forEach(o=>{
        const text=norm(o.text);
        if(!out.some(x=>x.text===text))out.push({label:String.fromCharCode(65+out.length),text,type:'select'});
      });
    });
    return out;
  }
  function parseQuestion(el,index){
    const options=parseOptions(el);
    const openResponse=!!el.querySelector('textarea,input[type="text"],input[type="number"],[contenteditable="true"]');
    return {index:index+1,question:questionText(el,index),options,openResponse};
  }
  function pageContext(questionNodes){
    const clone=document.body.cloneNode(true);
    const overlay=clone.querySelector('#'+OVERLAY_ID);if(overlay)overlay.remove();
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
      const ranked=item.options.map(o=>({...o,score:optionEvidenceScore(item,o,context)})).sort((x,y)=>y.score-x.score);
      const best=ranked[0],second=ranked[1],clear=best&&best.score>=25&&(!second||best.score-second.score>=5);
      return {headline:clear?'Top page-context match: '+best.label+' — '+best.text:'No single option is strongly supported by the visible page context.',detail:clear?'Evidence score '+best.score+'%. Review the page context before using it.':'Open the deeper review to inspect the evidence instead of relying on a weak tie.',evidence:ev};
    }
    return {headline:ev.length?'Response notes from this page':'No supporting context found on this page.',detail:ev.length?ev.map(x=>'• '+x.text).join('\n'):'Open the deeper review and add notes or source material.',evidence:ev};
  }
  function compactPayload(capture,item){
    const p=capture.payload||{},items=(item?[item]:(p.items||[])).slice(0,20).map((q,i)=>({
      index:i+1,question:String(q.question||'').slice(0,900),
      options:(q.options||[]).slice(0,12).map(o=>({label:String(o.label||'').slice(0,8),text:String(o.text||'').slice(0,500)})),
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

  const root=document.createElement('div');root.id=OVERLAY_ID;
  root.style.cssText='position:fixed;right:14px;bottom:14px;width:min(410px,calc(100vw - 28px));max-height:78vh;z-index:2147483647;background:#101520;color:#f6f7fb;border:1px solid #384259;border-radius:18px;box-shadow:0 22px 60px rgba(0,0,0,.5);font:14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;overflow:hidden;pointer-events:auto;isolation:isolate;-webkit-transform:translateZ(0);';
  root.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#171d2a;border-bottom:1px solid #2a3244"><strong>Provenance Canvas Lens</strong><div><button type="button" data-a="scan">Scan</button><button type="button" data-a="close" aria-label="Close Canvas Lens">×</button></div></div><div data-body style="padding:12px;overflow:auto;max-height:calc(78vh - 54px)"></div>';
  root.querySelectorAll('button').forEach(b=>b.style.cssText='margin-left:6px;border:1px solid #3a455e;border-radius:10px;background:#222b3e;color:#fff;padding:7px 10px;font-weight:700;touch-action:manipulation');
  document.documentElement.appendChild(root);
  root.addEventListener('pointerdown',e=>e.stopPropagation());
  root.addEventListener('click',e=>e.stopPropagation());
  root.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
  const body=root.querySelector('[data-body]');
  let lastSignature='';

  function render(force=false){
    const capture=scan(),p=capture.payload;
    const sig=JSON.stringify(p.items.map(x=>[x.question,x.options.map(o=>o.text)]));
    if(!force&&sig===lastSignature)return;
    lastSignature=sig;body.innerHTML='';
    const meta=document.createElement('div');meta.style.cssText='font-size:12px;color:#aeb8cb;margin-bottom:10px';
    meta.textContent=p.items.length?p.items.length+' question block'+(p.items.length===1?'':'s')+' detected':'No standard Canvas question blocks detected';
    if(p.meta.frame==='top'&&p.meta.iframeCount)meta.textContent+=' • '+p.meta.iframeCount+' embedded frame'+(p.meta.iframeCount===1?'':'s')+' present';
    body.appendChild(meta);
    if(!p.items.length){
      const fallback=document.createElement('div');fallback.textContent='No question structure was detected. You can still send the visible page text for review.';
      const b=document.createElement('button');b.type='button';b.textContent='Analyze visible page';b.style.cssText='margin-top:10px;border:0;border-radius:10px;background:#806fff;color:#fff;padding:9px 11px;font-weight:800';
      b.onclick=()=>{const c=scan();c.payload.items=[{index:1,question:norm(document.body.innerText).slice(0,7000),options:[],openResponse:true}];sendToApp(c)};
      body.append(fallback,b);return;
    }
    p.items.forEach((item,idx)=>{
      const box=document.createElement('div');box.style.cssText='border:1px solid #2a3346;border-radius:14px;padding:11px;margin:10px 0;background:#0c1119';
      const q=document.createElement('div');q.style.cssText='font-weight:800;line-height:1.35';q.textContent=(idx+1)+'. '+item.question.slice(0,650);box.appendChild(q);
      if(item.options.length){
        const choices=document.createElement('div');choices.style.cssText='margin-top:7px;color:#cbd5e1;font-size:12px';
        choices.textContent=item.options.map(o=>o.label+'. '+o.text).join(' • ');box.appendChild(choices);
      }
      const response=localResponse(item,p.context);
      const r=document.createElement('div');r.style.cssText='margin-top:9px;padding:9px;border-radius:10px;background:#141c29;white-space:pre-wrap;line-height:1.4';
      r.innerHTML='<strong>Response builder</strong><div style="margin-top:5px">'+esc(response.headline)+'</div><div style="margin-top:5px;color:#aeb8cb;font-size:12px">'+esc(response.detail)+'</div>';box.appendChild(r);
      const bar=document.createElement('div');bar.style.cssText='display:flex;gap:7px;margin-top:9px;flex-wrap:wrap';
      const open=document.createElement('button');open.type='button';open.textContent='Open deeper review';open.style.cssText='border:0;border-radius:10px;background:#806fff;color:#fff;padding:8px 10px;font-weight:800;touch-action:manipulation';open.onclick=()=>sendToApp(capture,item);
      const approve=document.createElement('button');approve.type='button';approve.textContent='Approve';approve.style.cssText='border:1px solid #3a455e;border-radius:10px;background:#1d2637;color:#fff;padding:8px 10px;font-weight:800;touch-action:manipulation';approve.onclick=()=>{box.style.borderColor='#4cbf9f';approve.textContent='Approved';approve.disabled=true};
      bar.append(open,approve);box.appendChild(bar);body.appendChild(box);
    });
    const all=document.createElement('button');all.type='button';all.textContent='Open all in Provenance';all.style.cssText='width:100%;margin-top:6px;border:0;border-radius:12px;background:#806fff;color:#fff;padding:10px;font-weight:800;touch-action:manipulation';all.onclick=()=>sendToApp(capture);body.appendChild(all);
  }

  let timer=0;
  const observer=new MutationObserver(muts=>{
    if(muts.every(m=>root.contains(m.target)))return;
    clearTimeout(timer);timer=setTimeout(()=>render(false),450);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-hidden','hidden','class']});
  root.querySelector('[data-a="close"]').onclick=()=>{observer.disconnect();root.remove()};
  root.querySelector('[data-a="scan"]').onclick=()=>render(true);
  window.addEventListener('popstate',()=>setTimeout(()=>render(true),250));
  window.addEventListener('hashchange',()=>setTimeout(()=>render(true),250));
  render(true);
})();