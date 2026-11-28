/* DJ SEBA Facebook, dodatek v1.9. Bez tokenu Meta w frontendzie. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { worker:'', password:'', posts:[], comments:[], postAfter:null, commentAfter:null, selectedPost:null, filter:'all', loading:false, replyTo:null };
  const KEY_HANDLED = 'djseba_fb_handled_v1';
  const KEY_WORKER = 'djseba_fb_worker_url_v1';
  const KEY_REPLIED = 'djseba_fb_reply_count_v1';
  function readObject(key) { try { const x = JSON.parse(localStorage.getItem(key)||'{}'); return x && typeof x === 'object' ? x : {}; } catch { return {}; } }
  function handled() { return readObject(KEY_HANDLED); }
  function storeHandled(id, status) { const obj = handled(); if(status) obj[id] = {status, at:new Date().toISOString()}; else delete obj[id]; localStorage.setItem(KEY_HANDLED, JSON.stringify(obj)); }
  function datePL(date) { if(!date) return 'Bez daty'; const d=new Date(date); return Number.isNaN(+d) ? 'Bez daty' : d.toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'}); }
  function el(tag, cls, txt) { const n=document.createElement(tag); if(cls)n.className=cls; if(txt!==undefined)n.textContent=String(txt); return n; }
  function clear(n) { n.replaceChildren(); }
  function show(message, kind='info') { const n=$('notice'); n.hidden=false; n.className='notice '+kind; n.textContent=message; }
  function setConnected(ok) { $('connectionStatus').textContent=ok?'Połączono':'Niepołączony'; $('connectionStatus').className='status'+(ok?' ok':''); $('refreshButton').disabled=!ok; }
  function busy(value){state.loading=value; $('connectButton').disabled=value; $('refreshButton').disabled=value||!state.password; $('morePostsButton').disabled=value; $('moreCommentsButton').disabled=value;}
  function apiUrl(path, params) { const u=new URL(path,state.worker+'/'); for(const [k,v] of Object.entries(params||{})) if(v!=null)u.searchParams.set(k,String(v)); return u.toString(); }
  async function api(path,opts={}) {
    if(!state.worker || !state.password) throw Error('Najpierw połącz panel z serwerem.');
    const response=await fetch(apiUrl(path,opts.query),{method:opts.method||'GET',headers:{'X-Panel-Key':state.password,...(opts.body?{'Content-Type':'application/json'}:{})},body:opts.body?JSON.stringify(opts.body):undefined,cache:'no-store'});
    let payload; try{payload=await response.json();} catch {throw Error('Serwer nie zwrócił poprawnej odpowiedzi JSON. Sprawdź jego adres.');}
    if(!response.ok) throw Error(payload.error || 'Błąd serwera '+response.status);
    return payload;
  }
  function renderPosts(){
    const container=$('postList'); clear(container);
    if(!state.posts.length){container.append(el('p','empty','Brak postów dostępnych przez API.'));return;}
    for(const post of state.posts){
      const b=el('button','post'+(state.selectedPost===post.id?' active':'')); b.type='button';
      const title=el('span','headline',(post.message||'Post bez tekstu').trim().slice(0,180));
      b.append(title, el('small','',datePL(post.created_time)));
      const count=post.comments?.summary?.total_count;
      if(Number.isFinite(count)) b.append(el('span','count',`${count} komentarzy`));
      b.addEventListener('click',()=>selectPost(post)); container.append(b);
    }
  }
  function renderComments(){
    const container=$('commentList'); clear(container);
    const statuses=handled(); let shown=state.comments.filter(c=>state.filter==='all'||(state.filter==='handled'?Boolean(statuses[c.id]):!statuses[c.id]));
    $('selectedCount').textContent=state.selectedPost ? `${shown.length} wczytanych` : '';
    if(!state.selectedPost){container.append(el('p','empty','Wybierz post po lewej stronie.'));return;}
    if(!shown.length){container.append(el('p','empty',state.comments.length?'Brak komentarzy w wybranym filtrze.':'Pod tym postem nie ma dostępnych komentarzy.'));return;}
    for(const comment of shown){
      const card=el('article','comment-card'); const meta=el('div','meta');
      meta.append(el('span','',datePL(comment.created_time)),el('span','',statuses[comment.id]?'✓ Obsłużony':'Do obsługi'));
      card.append(meta,el('p','',comment.message||'[Komentarz bez tekstu]'));
      const actions=el('div','actions');
      const reply=el('button','primary',statuses[comment.id]?'✓ Już obsłużony':'Podziękuj / odpowiedz');reply.type='button';reply.disabled=!!statuses[comment.id];reply.title=statuses[comment.id]?'Aby odpowiedzieć ponownie, najpierw cofnij oznaczenie.':'';reply.addEventListener('click',()=>openReply(comment));actions.append(reply);
      const mark=el('button','secondary',statuses[comment.id]?'Cofnij oznaczenie':'Oznacz jako obsłużony');mark.type='button';mark.addEventListener('click',()=>{storeHandled(comment.id,statuses[comment.id]?null:'handled');renderComments();});actions.append(mark);
      card.append(actions);container.append(card);
    }
  }
  async function loadPosts(reset=true){
    busy(true);
    try{
      if(reset){state.posts=[];state.postAfter=null;state.selectedPost=null;state.comments=[];renderComments();}
      const payload=await api('/api/posts',{query:{limit:20,after:state.postAfter}});
      const ids=new Set(state.posts.map(p=>p.id)); for(const p of payload.data||[])if(p.id&&!ids.has(p.id)){state.posts.push(p);ids.add(p.id);}
      state.postAfter=payload.paging?.after||null;
      $('morePostsButton').hidden=!state.postAfter;
      $('postCount').textContent=state.posts.length;
      $('commentCount').textContent=state.posts.reduce((v,p)=>v+(Number(p.comments?.summary?.total_count)||0),0);
      renderPosts();show('Pobrano posty strony DJ SEBA. Wybierz post, aby zobaczyć komentarze.','success');
    }catch(err){show(err.message,'error');} finally{busy(false);}
  }
  async function selectPost(post){
    state.selectedPost=post.id;state.comments=[];state.commentAfter=null;renderPosts();renderComments();
    $('selectedPostTitle').textContent=(post.message||'Post bez tekstu').slice(0,130);
    await loadComments(true);
  }
  async function loadComments(reset){
    if(!state.selectedPost)return;
    const postId=state.selectedPost;
    busy(true);
    try{
      if(reset){state.comments=[];state.commentAfter=null;}
      const payload=await api('/api/comments',{query:{post_id:postId,limit:50,after:state.commentAfter}});
      if(state.selectedPost!==postId)return;
      const ids=new Set(state.comments.map(c=>c.id));for(const c of payload.data||[])if(c.id&&!ids.has(c.id)){state.comments.push(c);ids.add(c.id);}
      state.commentAfter=payload.paging?.after||null;$('moreCommentsButton').hidden=!state.commentAfter;
      renderComments();show(`Wczytano ${state.comments.length} komentarzy. Odpowiadanie wymaga ręcznego zatwierdzenia.`,'success');
    }catch(err){show(err.message,'error');}finally{busy(false);}
  }
  function openReply(comment){state.replyTo=comment;$('replyOriginal').textContent=comment.message||'[Komentarz bez tekstu]';$('replyMessage').value='Dziękujemy za komentarz! 🎵 Pozdrawia DJ SEBA.';$('replyDialog').showModal();}
  async function sendReply(){
    const comment=state.replyTo;const message=$('replyMessage').value.trim();
    if(!comment||!message)return;
    if(!window.confirm('Opublikować tę odpowiedź na Facebooku w imieniu DJ SEBA?')) return;
    $('submitReply').disabled=true;
    try{
      const result=await api('/api/reply',{method:'POST',body:{comment_id:comment.id,message}});
      if(!result.id)throw Error('Facebook nie zwrócił identyfikatora odpowiedzi.');
      storeHandled(comment.id,'replied');
      const count=Number(localStorage.getItem(KEY_REPLIED)||'0')+1;localStorage.setItem(KEY_REPLIED,String(count));$('replyCount').textContent=count;
      $('replyDialog').close();renderComments();show('Facebook potwierdził publikację odpowiedzi.','success');
    }catch(err){show('Nie udało się wysłać odpowiedzi: '+err.message,'error');}
    finally{$('submitReply').disabled=false;}
  }
  if(new URLSearchParams(location.search).has('embed')){
    document.documentElement.classList.add('fb-embedded');
    const reportHeight=()=>{
      if(window.parent===window || !/^https?:$/.test(window.location.protocol))return;
      const page=document.querySelector('.page');
      if(!page)return;
      const size=Math.ceil(Math.max(page.getBoundingClientRect().height,500));
      window.parent.postMessage({type:'djseba-facebook-height-v1',height:size},window.location.origin);
    };
    if('ResizeObserver' in window)new ResizeObserver(reportHeight).observe(document.querySelector('.page'));
    window.addEventListener('load',reportHeight);
    window.addEventListener('resize',reportHeight);
    reportHeight();
  }
  $('workerUrl').value=localStorage.getItem(KEY_WORKER)||'';
  $('replyCount').textContent=localStorage.getItem(KEY_REPLIED)||'0';
  $('connectForm').addEventListener('submit',async e=>{
    e.preventDefault();const addr=$('workerUrl').value.trim().replace(/\/+$/,'');
    let url;try{url=new URL(addr);if(url.protocol!=='https:')throw Error();}catch{show('Wpisz poprawny adres HTTPS serwera.','error');return;}
    state.worker=url.origin;state.password=$('panelKey').value;
    busy(true);
    try{const info=await api('/api/me');if(!info.ok)throw Error('Brak potwierdzenia połączenia.');
      localStorage.setItem(KEY_WORKER,state.worker);setConnected(true);$('panelKey').value='';show('Połączono z serwerem strony DJ SEBA.','success');
      await loadPosts(true);
    }catch(err){state.password='';setConnected(false);show('Błąd połączenia: '+err.message,'error');}
    finally{busy(false);}
  });
  $('disconnectButton').addEventListener('click',()=>{state.password='';state.posts=[];state.comments=[];state.selectedPost=null;state.postAfter=null;state.commentAfter=null;setConnected(false);$('postCount').textContent='—';$('commentCount').textContent='—';$('selectedPostTitle').textContent='Nie wybrano posta';$('morePostsButton').hidden=true;$('moreCommentsButton').hidden=true;renderPosts();renderComments();show('Rozłączono. Hasło dostępu zostało usunięte z pamięci tej strony.');});
  $('refreshButton').addEventListener('click',()=>loadPosts(true));
  $('morePostsButton').addEventListener('click',()=>loadPosts(false));
  $('moreCommentsButton').addEventListener('click',()=>loadComments(false));
  document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderComments();}));
  $('cancelReply').addEventListener('click',()=>$('replyDialog').close());
  $('replyForm').addEventListener('submit',async e=>{e.preventDefault();await sendReply();});
})();
