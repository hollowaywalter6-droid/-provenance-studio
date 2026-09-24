(()=>{
  'use strict';
  const OVERLAY_ID='provenance-canvas-lens-v1';
  if(document.getElementById(OVERLAY_ID)){document.getElementById(OVERLAY_ID).remove();return}

  const APP_URL='https://hollowaywalter6-droid.github.io/-provenance-studio/';
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const words=s=>(norm(s).toLowerCase().match(/[a-z0-9'-]{3,}/g)||[]).filter(w=>!new Set(['the','and','for','that','with','from','this','what','which','when','where','who','why','how','are','was','were','have','has','had','not','but','you','your','into','about','can','could','would','should']).has(w));
  const uniq=a=>[...new Set(a)];
  const overlap=(a,b)=>{
    const A=new Set(words(a)),B=words(b); if(!A.size||!B.length)return 0;
    return Math.round(B.filter(x=>A.has(x)).length/Math.max(1,Math.min(A.size,B.length))*100);
  };
  const visible=el=>{
    if(!el)return false;
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;
  };
  function getOptionText(input){
    const id=input.id;
    if(id){
      const lab=document.querySelector('label[for="'+CSS.escape(id)+'"]');
      if(lab)return norm(lab.innerText);
    }
    const lab=input.closest('label');
    if(lab)return norm(lab.innerText);
    const parent=input.parentElement;
    return norm(parent&&parent.innerText);
  }
  function detectQuestionNodes(){
    const selectors=[
      '.question','.quiz_question','[data-question-id]','[data-testid*="question"]',
      '.ic-QuestionInspector__Question','.question_holder'
    ];
    const raw=selectors.flatMap(s=>[...document.querySelectorAll(s)]).filter(visible);
    const out=[];
    raw.forEach(el=>{if(!out.some(x=>x===el||x.contains(el)))out.push(el)});
    if(out.length)return out;
    const inputs=[...document.querySelectorAll('input[type="radio"],input[type="checkbox"],textarea')].filter(visible);
    inputs.forEach(inp=>{
      const el=inp.closest('fieldset,.question,.quiz_question,[role="group"],form>div');
      if(el&&!out.includes(el))out.push(el);
    });
    return out;
  }
  function parseQuestion(el,index){
    const qSel=['.question_text','.question_name','legend','h1','h2','h3','h4','[data-testid*="question"]'];
    let q='';
    for(const s of qSel){const n=el.querySelector(s);if(n&&norm(n.innerText).length>3){q=norm(n.innerText);break}}
    if(!q){
      const clone=el.cloneNode(true);
      clone.querySelectorAll('input,button,select,textarea,script,style').forEach(n=>n.remove());
      q=norm(clone.innerText).slice(0,1200);
    }
    const opts=[...el.querySelectorAll('input[type="radio"],input[type="checkbox"]')].filter(visible)
      .map((input,i)=>({label:String.fromCharCode(65+i),text:getOptionText(input),type:input.type}))
      .filter(x=>x.text);
    const textarea=el.querySelector('textarea,input[type="text"]');
    return {index:index+1,question:q||('Question '+(index+1)),options:opts,openResponse:!!textarea};
  }
  function pageContext(questionNodes){
    const clone=document.body.cloneNode(true);
    clone.querySelectorAll('script,style,nav,header,footer,button,input,textarea,select').forEach(n=>n.remove());
    let text=norm(clone.innerText);
    questionNodes.forEach(q=>{const t=norm(q.innerText);if(t&&t.length<4000)text=text.replace(t,' ')});
    return norm(text).slice(0,16000);
  }
  function topEvidence(q,context){
    const ss=String(context||'').split(/(?<=[.!?])\s+/).map(norm).filter(x=>x.length>20&&x.length<500);
    return ss.map(s=>({text:s,score:overlap(q,s)})).sort((a,b)=>b.score-a.score).filter(x=>x.score>0).slice(0,3);
  }
  function localResponse(item,context){
    const ev=topEvidence(item.question,context);
    if(item.options.length){
      const base=item.question+' '+ev.map(x=>x.text).join(' ');
      const ranked=item.options.map(o=>({...o,score:overlap(o.text,base)})).sort((a,b)=>b.score-a.score);
      const best=ranked[0];
      return {
        headline:best&&best.score>0?'Top page-context match: '+best.label+' — '+best.text:'No reliable option match from visible page context.',
        detail:best&&best.score>0?'Context overlap '+best.score+'%. Treat this as a study signal, not a verified answer.':'Open in Provenance for a fuller review using the captured page context.',
        evidence:ev
      };
    }
    return {
      headline:ev.length?'Response notes from this page':'No supporting context found on this page.',
      detail:ev.length?ev.map(x=>'• '+x.text).join('\n'):'Open in Provenance to review the prompt with additional notes or source material.',
      evidence:ev
    };
  }
  function scan(){
    const nodes=detectQuestionNodes(),items=nodes.map(parseQuestion);
    const context=pageContext(nodes);
    return {title:document.title,url:location.href,gradedLike:/quiz|exam|test|assessment/i.test(document.title+' '+location.pathname),items,context};
  }
  function sendToApp(payload,item){
    const data={title:payload.title,url:payload.url,context:payload.context,items:item?[item]:payload.items};
    const encoded=encodeURIComponent(JSON.stringify(data));
    window.open(APP_URL+'#canvas='+encoded,'_blank','noopener');
  }

  const root=document.createElement('div');root.id=OVERLAY_ID;
  root.style.cssText='position:fixed;right:14px;bottom:14px;width:min(390px,calc(100vw - 28px));max-height:76vh;z-index:2147483647;background:#101520;color:#f6f7fb;border:1px solid #384259;border-radius:18px;box-shadow:0 22px 60px rgba(0,0,0,.5);font:14px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;overflow:hidden;';
  root.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#171d2a;border-bottom:1px solid #2a3244"><strong>Provenance Canvas Lens</strong><div><button data-a="scan">Scan</button><button data-a="close">×</button></div></div><div data-body style="padding:12px;overflow:auto;max-height:calc(76vh - 54px)"></div>';
  root.querySelectorAll('button').forEach(b=>b.style.cssText='margin-left:6px;border:1px solid #3a455e;border-radius:10px;background:#222b3e;color:#fff;padding:7px 10px;font-weight:700');
  document.documentElement.appendChild(root);
  const body=root.querySelector('[data-body]');

  function render(){
    const p=scan();
    body.innerHTML='';
    const meta=document.createElement('div');
    meta.style.cssText='font-size:12px;color:#aeb8cb;margin-bottom:10px';
    meta.textContent=(p.items.length?p.items.length+' question block'+(p.items.length===1?'':'s')+' detected':'No standard Canvas question blocks detected')+(p.gradedLike?' • Assessment-like page: review mode only':'');
    body.appendChild(meta);
    if(!p.items.length){
      const fallback=document.createElement('div');fallback.textContent='The page text can still be sent to Provenance for analysis.';
      const b=document.createElement('button');b.textContent='Analyze visible page';b.style.cssText='margin-top:10px;border:0;border-radius:10px;background:#806fff;color:#fff;padding:9px 11px;font-weight:800';b.onclick=()=>sendToApp({...p,items:[{index:1,question:norm(document.body.innerText).slice(0,6000),options:[],openResponse:true}]});
      body.append(fallback,b);return;
    }
    p.items.forEach((item,idx)=>{
      const box=document.createElement('div');box.style.cssText='border:1px solid #2a3346;border-radius:14px;padding:11px;margin:10px 0;background:#0c1119';
      const q=document.createElement('div');q.style.cssText='font-weight:800;line-height:1.35';q.textContent=item.index+'. '+item.question.slice(0,550);box.appendChild(q);
      const response=localResponse(item,p.context);
      const r=document.createElement('div');r.style.cssText='margin-top:9px;padding:9px;border-radius:10px;background:#141c29;white-space:pre-wrap;line-height:1.4';r.innerHTML='<strong>Response builder</strong><div style="margin-top:5px">'+esc(response.headline)+'</div><div style="margin-top:5px;color:#aeb8cb;font-size:12px">'+esc(response.detail)+'</div>';box.appendChild(r);
      const bar=document.createElement('div');bar.style.cssText='display:flex;gap:7px;margin-top:9px';
      const open=document.createElement('button');open.textContent='Open deeper review';open.style.cssText='border:0;border-radius:10px;background:#806fff;color:#fff;padding:8px 10px;font-weight:800';open.onclick=()=>sendToApp(p,item);
      const approve=document.createElement('button');approve.textContent='Approve';approve.style.cssText='border:1px solid #3a455e;border-radius:10px;background:#1d2637;color:#fff;padding:8px 10px;font-weight:800';approve.onclick=()=>{box.style.borderColor='#4cbf9f';approve.textContent='Approved';approve.disabled=true};
      bar.append(open,approve);box.appendChild(bar);body.appendChild(box);
    });
    const all=document.createElement('button');all.textContent='Open all in Provenance';all.style.cssText='width:100%;margin-top:6px;border:0;border-radius:12px;background:#806fff;color:#fff;padding:10px;font-weight:800';all.onclick=()=>sendToApp(p);body.appendChild(all);
  }
  root.querySelector('[data-a="close"]').onclick=()=>root.remove();
  root.querySelector('[data-a="scan"]').onclick=render;
  render();
})();