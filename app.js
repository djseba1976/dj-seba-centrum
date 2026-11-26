'use strict';
(() => {
  const CHANNEL='UCVlkGKFKA7mRI5zv8fhnjQA';
  const SCOPE='https://www.googleapis.com/auth/youtube.force-ssl';
  // Client ID jest publiczny i przypisany do domeny w Google Cloud. Nigdy nie umieszczaj tutaj Client Secret ani klucza API.
  const BUILTIN_CLIENT_ID='425024576216-s62ilp1k7hkeb5247s875fhq9q3dg5os.apps.googleusercontent.com';
  // Literówka w wersji 1.2 (n zamiast h) powodowała błąd 401 invalid_client na nowych urządzeniach.
  const LEGACY_BAD_CLIENT_ID='425024576216-s62ilp1k7hkeb5247s875fnq9q3dg5os.apps.googleusercontent.com';
  const $=id=>document.getElementById(id);
  const KEY='djseba_gis_client_id_v09';
  const SKIP='djseba_skipped_v09';
  const SONGS='djseba_spotify_v09';
  let token='', tokenExpires=0, logged=false, commentMap=new Map(), pageToken='', pages=0, historyComplete=false, selected='', filter='new';
  let videoTitles=new Map();
  const thanksCounts=new Map();
  let skipped=new Set();
  let songs=[];
  let playReports=[], distroRows=[];
  try { playReports=JSON.parse(localStorage.getItem('djseba_play_reports_v09')||'[]'); } catch {}
  try { distroRows=JSON.parse(localStorage.getItem('djseba_distro_rows_v09')||'[]'); } catch {}
  if(!Array.isArray(playReports))playReports=[]; if(!Array.isArray(distroRows))distroRows=[];
  let pendingPlay=[],activePlay=null;
  try { skipped=new Set(JSON.parse(localStorage.getItem(SKIP)||'[]')); } catch { skipped=new Set(); }
  try { songs=JSON.parse(localStorage.getItem(SONGS)||'null')||[]; } catch { songs=[]; }
  if (!Array.isArray(songs)) songs=[];
  // Brak sztucznych lub przestarzałych wyników: dane pojawią się dopiero po imporcie CSV.
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  let toastTimer;
  function toast(message){const t=$('toast');t.textContent=message;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),5500)}
  function notice(text,kind=''){const n=$('notice');n.textContent=text;n.className='notice '+(kind||'');}
  function setBusy(b){$('refresh').disabled=b||!logged;$('older').disabled=b||!logged||!pageToken; $('send').disabled=b||!logged; }
  const short=(s,n=80)=>String(s||'').length>n?String(s).slice(0,n)+'…':String(s||'');
  function urlFor(comment){return 'https://www.youtube.com/watch?v='+encodeURIComponent(comment.videoId)+'&lc='+encodeURIComponent(comment.id)}
  function authState(){
    logged=Boolean(token&&Date.now()<tokenExpires);
    $('auth-label').textContent=logged?'Połączono: kanał DJ SEBA':'Niepołączony';
    $('auth-label').className='status'+(logged?' online':'');
    $('connect').textContent=logged?'Odnów dostęp Google':'Połącz Google / YouTube';
    $('disconnect').hidden=!logged;
    setBusy(false);
  }
  async function youtube(path,query={},opts={}){
    if(!token||Date.now()>=tokenExpires){authState();throw Error('Sesja Google wygasła. Połącz ponownie konto.');}
    const url=new URL('https://www.googleapis.com/youtube/v3/'+path);
    for(const [k,v] of Object.entries(query)){if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));}
    let result;
    try {result=await fetch(url,{method:opts.method||'GET',headers:{'Authorization':'Bearer '+token,'Accept':'application/json',...(opts.body?{'Content-Type':'application/json'}:{})},...(opts.body?{body:JSON.stringify(opts.body)}:{})});}
    catch(e){throw Error('Błąd sieci lub ograniczenie przeglądarki: '+e.message);}
    const data=await result.json().catch(()=>({}));
    if(!result.ok){const reason=data.error?.message||('HTTP '+result.status);if(result.status===401){token='';tokenExpires=0;authState();}throw Error('YouTube ('+path+'): '+reason);}
    return data;
  }
  async function connect(){
    // Zawsze używamy zatwierdzonego klienta OAuth tej aplikacji.
    // PWA/skrót mogą mieć inną pamięć lokalną niż karta Chrome, dlatego stary zapis nigdy
    // nie może nadpisać identyfikatora używanego do logowania Google.
    const clientId=BUILTIN_CLIENT_ID;
    if($('client-id').value!==BUILTIN_CLIENT_ID) $('client-id').value=BUILTIN_CLIENT_ID;
    try { if(localStorage.getItem(KEY)!==BUILTIN_CLIENT_ID) localStorage.setItem(KEY,BUILTIN_CLIENT_ID); } catch {}
    if(!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {switchTab('settings');toast('Zapisz Client ID z Google Cloud (końcówka .apps.googleusercontent.com).');return;}
    if(location.protocol==='file:'){notice('Google OAuth nie działa poprawnie z pliku file://. Opublikuj stronę na GitHub Pages (HTTPS) albo uruchom na localhost.', 'error');switchTab('settings');return;}
    if(!window.google?.accounts?.oauth2){toast('Biblioteka Google jest niedostępna. Sprawdź internet i blokery skryptów.');return;}
    const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPE,callback:async reply=>{
      if(reply.error){toast('Google OAuth: '+(reply.error_description||reply.error));return;}
      token=reply.access_token;tokenExpires=Date.now()+(Number(reply.expires_in||3500)-80)*1000;
      notice('Sprawdzam uprawnienia do kanału DJ SEBA…');
      try{
        const channels=await youtube('channels',{part:'id',mine:'true'});
        if(!(channels.items||[]).some(x=>x.id===CHANNEL)){token='';tokenExpires=0;authState();notice('Zalogowane konto Google nie wskazuje kanału DJ SEBA ('+CHANNEL+'). Zmień konto/kanał w autoryzacji Google.', 'error');return;}
        authState();notice('Połączono właściwy kanał DJ SEBA. Możesz pobierać komentarze i publikować zatwierdzone odpowiedzi.', 'ok');
        await loadComments(false);
        window.DJSEBA_HUB?.refreshYoutubeStats?.().catch(e=>console.warn('Statystyki YouTube:',e.message));
      }catch(e){authState();notice('Nie udało się sprawdzić kanału: '+e.message,'error');}
    }});
    client.requestAccessToken({prompt:'consent'});
  }
  async function videoNames(ids){
    const missing=[...new Set(ids)].filter(x=>x&&!videoTitles.has(x));
    for(let i=0;i<missing.length;i+=50){const part=missing.slice(i,i+50);try{const d=await youtube('videos',{part:'snippet',id:part.join(',')});for(const v of d.items||[])videoTitles.set(v.id,v.snippet?.title||'Film YouTube');}catch(e){console.warn('Brak tytułów filmów:',e.message);}}
  }
  async function hasOwnerReply(parentId,sample,total){
    const found=(sample||[]).some(c=>c.snippet?.authorChannelId?.value===CHANNEL);
    if(found)return true;
    if(Number(total||0)===0)return false;
    if((sample||[]).length>=Number(total||0))return false;
    let next='',guard=0;
    do {
      const data=await youtube('comments',{part:'snippet',parentId,maxResults:100,textFormat:'plainText',...(next?{pageToken:next}:{})});
      if((data.items||[]).some(c=>c.snippet?.authorChannelId?.value===CHANNEL))return true;
      next=data.nextPageToken||'';
      guard++;
      if(guard>=30&&next)throw Error('Wątek z bardzo wieloma odpowiedziami wymaga osobnej weryfikacji.');
    }while(next);
    return false;
  }
  async function loadComments(older){
    if(!logged){toast('Najpierw połącz konto Google.');return;}
    if(older&&!pageToken){toast('Nie ma kolejnej strony do pobrania.');return;}
    setBusy(true);
    notice(older?'Pobieram starszą stronę komentarzy…':'Pobieram najnowsze komentarze z YouTube…');
    try{
      const previousCheck=window.DJSEBA_HUB?.getLastCommentCheck?.()||null;
      const data=await youtube('commentThreads',{part:'snippet,replies',allThreadsRelatedToChannelId:CHANNEL,maxResults:100,order:'time',textFormat:'plainText',...(older?{pageToken}:{})});
      const threads=data.items||[];
      const ids=threads.map(t=>t.snippet?.videoId).filter(Boolean);
      await videoNames(ids);
      const staged=[];
      for(const t of threads){
        const sn=t.snippet||{}, top=sn.topLevelComment||{}, info=top.snippet||{};
        if(!top.id||info.authorChannelId?.value===CHANNEL)continue;
        const sample=t.replies?.comments||[];
        let answered=false,unknown=false;
        try {answered=await hasOwnerReply(top.id,sample,sn.totalReplyCount);}catch(e){unknown=true;console.warn('Weryfikacja odpowiedzi: ',e.message)}
        staged.push({id:top.id,videoId:sn.videoId||'',videoTitle:videoTitles.get(sn.videoId)||'Film YouTube',author:info.authorDisplayName||'Słuchacz',body:info.textOriginal||info.textDisplay||'',published:info.publishedAt||'',answered,unknown});
      }
      for(const c of staged){const old=commentMap.get(c.id);if(old?.answered)c.answered=true;commentMap.set(c.id,c);}
      pageToken=data.nextPageToken||'';
      historyComplete=!pageToken;
      pages=older?pages+1:Math.max(pages,1);
      $('loaded-meta').textContent=`Wczytano ${commentMap.size} komentarzy • ${pages} stron • ${new Date().toLocaleString('pl-PL')}${historyComplete?' • koniec dostępnej historii':' • są starsze'}`;
      notice('Pobrano '+threads.length+' wątków YouTube. '+(pageToken?'Możesz pobrać starsze.':'Osiągnięto koniec dostępnej historii.'),'ok');
      renderComments();
      window.DJSEBA_HUB?.ingestComments?.([...commentMap.values()],previousCheck,older);
    }catch(e){notice('Nie udało się pobrać komentarzy: '+e.message,'error');}
    finally{setBusy(false)}
  }
  function status(c){return c.answered?'answered':c.unknown?'unknown':skipped.has(c.id)?'skipped':'new';}
  function renderComments(){
    const comments=[...commentMap.values()].sort((a,b)=>String(b.published).localeCompare(String(a.published)));
    $('m-all').textContent=comments.length;
    $('m-new').textContent=comments.filter(c=>status(c)==='new').length;
    $('m-answered').textContent=comments.filter(c=>status(c)==='answered').length;
    $('m-skipped').textContent=comments.filter(c=>status(c)==='skipped').length;
    const txt=$('search').value.toLocaleLowerCase('pl');
    const filtered=comments.filter(c=>(filter==='all'||status(c)===filter)&&(!txt||(c.body+' '+c.author+' '+c.videoTitle).toLocaleLowerCase('pl').includes(txt)));
    const list=$('comment-list');list.replaceChildren();
    if(!filtered.length){list.append(el('p','empty',comments.length?'Brak komentarzy spełniających filtr.':'Brak komentarzy. Połącz Google i kliknij „Odśwież najnowsze”.'));}
    for(const c of filtered){
      const btn=el('button','comment'+(selected===c.id?' selected':''));
      const row=el('div','row-between'),author=el('strong','',short(c.author,45)),date=el('small','',c.published?new Date(c.published).toLocaleDateString('pl-PL'):'');row.append(author,date);btn.append(row);
      btn.append(el('p','',short(c.body,420)),el('div','video','♫ '+short(c.videoTitle,80)),el('small','',status(c)==='answered'?'✓ Odpowiedziano':status(c)==='skipped'?'Pominięto lokalnie':status(c)==='unknown'?'Wymaga weryfikacji':'• Do odpowiedzi'));
      btn.addEventListener('click',()=>selectComment(c.id));list.append(btn);
    }
    $('older').disabled=!logged||!pageToken; $('check-all').disabled=!logged||commentMap.size===0;
    renderDetails();
  }
  // Kategorie rozpoznajemy z komentarza, a przy wrażliwych utworach także z tytułu.
  // Bez AI, bez wysyłki automatycznej. Przycisk wyłącznie podsuwa tekst do edycji.
  function emojiCategory(c){
    const msg=String(c.body||'').trim();
    const title=String(c.videoTitle||'').toLocaleLowerCase('pl');
    const sensitiveTrack=/córeczk|córeczko|tęsk|anioł|pożegnan|zanim się spotkali|serce dla|zawsze będziesz/.test(title);
    if(sensitiveTrack || /😢|😭|😔|😞|🥺|💔|🕯|🙏/.test(msg))return 'delicate';
    if(/😂|🤣|😆|😹|😅|😜|😁/.test(msg))return 'laugh';
    if(/💃|🕺|🔥|🎧|🎶|🎵|🔊|⚡|🥳|🎉|🚀/.test(msg))return 'dance';
    if(/❤️|❤|♥|💖|💗|💕|💓|💞|💝|🫶|😍|🥰|😘/.test(msg))return 'heart';
    if(/👏|🙌|👍|💪|👌|🤟/.test(msg))return 'applause';
    if(/😊|🙂|😃|😄|😀|😎|🤩|☺/.test(msg))return 'smile';
    return 'general';
  }
  const THANKS_TEXTS={
    delicate:[
      'Dziękuję za Twoją wrażliwość i obecność. ❤️',
      'Dziękuję za tę reakcję. Takie gesty naprawdę wiele znaczą. ❤️',
      'Bardzo dziękuję za okazane serce. ❤️',
      'Ciepło dziękuję za wysłuchanie i ten znak. 🫶',
      'Dziękuję. Są utwory, przy których emocje mówią więcej niż słowa. ❤️',
      'Dziękuję za wspólne przeżywanie tej muzyki. ❤️'
    ],
    laugh:[
      'Cieszę się, że wywołało uśmiech! 😂 Dzięki za reakcję!',
      'No i o taki dobry humor chodziło! 😄 Dzięki!',
      'Ha, uśmiech poszedł dalej! 😁 Dzięki za słuchanie!',
      'Takie reakcje poprawiają dzień! 😂 Pozdrawiam!',
      'Śmiech to też świetny rytm! 😄 Dzięki za komentarz!',
      'Dzięki za dawkę dobrego humoru! 🤣🎶'
    ],
    dance:[
      'Dzięki za energię! 🕺🔥 Niech muzyka gra dalej! 🎶',
      'Takie reakcje napędzają do działania! 🔥 Dzięki za słuchanie!',
      'Cieszę się, że rytm porwał! 💃🎧 Pozdrawiam!',
      'Dzięki! 🔊 Niech dobry bas towarzyszy Ci dalej! 😎',
      'Ale energia! 🎶🔥 Wielkie dzięki za ten znak!',
      'Dzięki za wspólny muzyczny klimat! 🎧🙌'
    ],
    heart:[
      'Dziękuję za serduszka! ❤️ Miło, że muzyka trafia do Ciebie.',
      'Tyle serca w jednym komentarzu! 🫶 Bardzo dziękuję!',
      'Dziękuję za ciepłą reakcję! ❤️🎶',
      'Pięknie dziękuję za te serca! ❤️ Pozdrawiam serdecznie!',
      'Ogromnie mi miło! ❤️ Dzięki za słuchanie!',
      'Takie serduszka mówią wiele. ❤️ Dziękuję!'
    ],
    applause:[
      'Dziękuję za wsparcie i wielki kciuk w górę! 👍🎶',
      'Brawa od słuchaczy to najlepsza motywacja! 👏 Dzięki!',
      'Wielkie dzięki za pozytywną reakcję! 🙌',
      'Dzięki! 💪 Cieszę się, że kawałek się podoba.',
      'Dzięki za znak uznania! 👍 Pozdrawiam!',
      'Miło dostać takie wsparcie! 👏🎧 Dzięki!'
    ],
    smile:[
      'Dzięki za uśmiech! 😊 Niech muzyka umila dzień!',
      'Ale miło zobaczyć taką reakcję! 😄 Dziękuję!',
      'Uśmiech wraca do Ciebie! 😊🎶 Dzięki za słuchanie!',
      'Dzięki za dobrą energię! 😎 Pozdrawiam!',
      'Cieszę się, że ten utwór wywołuje uśmiech! 🙂',
      'Bardzo dziękuję za pozytywny znak! 🎧😊'
    ],
    general:[
      'Dziękuję za komentarz i za słuchanie! 🎶',
      'Bardzo mi miło! Dzięki za poświęcony czas. 🎧',
      'Dzięki za odezwanie się! Serdecznie pozdrawiam! 😊',
      'Miło, że jesteś tutaj z muzyką DJ SEBA. Dzięki! 🎵',
      'Dziękuję za wsparcie! Niech muzyka gra dalej. 🎶',
      'Wielkie dzięki za reakcję! Pozdrawiam! 🙌'
    ]
  };
  function reactionOptions(c){return THANKS_TEXTS[emojiCategory(c)]}
  function stableOffset(c,n){
    let hash=0;for(const ch of String(c.id||c.author||''))hash=(hash*31+ch.codePointAt(0))>>>0;
    return hash % n;
  }
  function thankForComment(){
    const c=commentMap.get(selected);
    if(!c){toast('Najpierw wybierz komentarz.');return;}
    if(c.answered){toast('Ten komentarz ma już Twoją odpowiedź.');return;}
    const pool=reactionOptions(c), count=thanksCounts.get(c.id)||0;
    const text=pool[(stableOffset(c,pool.length)+count)%pool.length];
    thanksCounts.set(c.id,count+1);
    $('reply-text').value=text;
    $('reply-text').focus();
    $('thanks-hint').textContent='Propozycja '+(count%pool.length+1)+'/'+pool.length+' · Kliknij ponownie, by otrzymać inną. Możesz edytować przed wysłaniem.';
    toast('Przygotowano podziękowanie – nic nie zostało wysłane.');
  }
  function suggestions(c){
    const msg=String(c.body||'').trim();
    // Przy komentarzu z samych ikon nie używamy przypadkowo słów z tytułu utworu.
    if(/\p{Extended_Pictographic}/u.test(msg) && !/[\p{L}\p{N}]/u.test(msg)){
      const p=reactionOptions(c),offset=stableOffset(c,p.length);
      return [p[offset],p[(offset+1)%p.length],p[(offset+2)%p.length]];
    }
    const q=(c.body+' '+c.videoTitle).toLowerCase();
    if(/córeczk|córeczko|tęsk|anioł|łz|serc|brakuj|wspomnien|wspomnień/.test(q))return [
      'Dziękuję za te ciepłe słowa. ❤️ To dla mnie bardzo ważny utwór.',
      'Bardzo dziękuję. ❤️ Muzyka czasem wyraża to, czego nie da się powiedzieć słowami.',
      'Dziękuję za wysłuchanie i za okazane serce. ❤️'];
    if(/gaz|sztos|imprez|parkiet|kręci|🔥|dj/.test(q))return [
      'No i o taką energię chodzi! 😎🔥 Dzięki za słuchanie i pozdrawiam!',
      'Super, że czujesz ten klimat! 🎶🔥 Wielkie dzięki!',
      'Dzięki za wsparcie! Niech dobry rytm gra jak najdłużej! 🎧🙌'];
    return ['Bardzo dziękuję za tak miłe słowa! 🎶 Serdecznie pozdrawiam!','Cieszę się, że utwór się podoba. Dzięki za odsłuch! ❤️🎵','Dzięki za komentarz i pozytywną energię! 🎧'];
  }
  function selectComment(id){selected=id;$('reply-text').value='';$('thanks-hint').textContent='Kliknięcie przygotuje podziękowanie; kolejny klik da inną propozycję.';renderComments();}
  function renderDetails(){
    const c=commentMap.get(selected);$('reply-empty').hidden=Boolean(c);$('reply-view').hidden=!c;
    if(!c)return;
    $('d-video').textContent=c.videoTitle;
    $('d-author').textContent=c.author;
    $('d-comment').textContent=c.body;
    $('d-state').textContent=status(c)==='answered'?'✓ Odpowiedziano na YouTube':status(c)==='unknown'?'Nie udało się całkowicie sprawdzić odpowiedzi':status(c)==='skipped'?'Pominięto w tej przeglądarce':'Oczekuje na Twoją odpowiedź';
    const suggestionsEl=$('suggestions');suggestionsEl.replaceChildren();
    for(const s of suggestions(c)){const b=el('button','suggestion',s);b.addEventListener('click',()=>{$('reply-text').value=s;toast('Propozycja wpisana. Możesz ją edytować.')});suggestionsEl.append(b);}
    $('thanks').disabled=c.answered||c.unknown;
    $('send').disabled=!logged||c.answered||c.unknown;
    $('skip').disabled=c.answered;
    $('skip').textContent=skipped.has(c.id)?'Przywróć z pominiętych':'Pomiń lokalnie';
  }
  async function checkOne(id){
    const c=commentMap.get(id);if(!c)throw Error('Wybierz komentarz.');
    const check=await hasOwnerReply(id,[],1);
    c.answered=check;c.unknown=false;
    if(check)skipped.delete(id);
    saveSkips();renderComments();
    return check;
  }
  function clearReplyAfterHandled(expectedId){
    // W czasie zapytania nie kasujemy ewentualnego nowego wyboru użytkownika.
    if(selected!==expectedId)return;
    selected='';
    $('reply-text').value='';
    $('thanks-hint').textContent='Kliknięcie przygotuje podziękowanie; kolejny klik da inną propozycję.';
    // renderComments -> renderDetails ukryje reply-view i pokaże reply-empty.
  }
  async function sendReply(){
    const c=commentMap.get(selected);if(!c||!logged)return;
    const text=$('reply-text').value.trim();
    if(!text){toast('Wpisz treść odpowiedzi.');return;}
    if(!window.confirm('Opublikować tę odpowiedź publicznie jako DJ SEBA na YouTube?\n\n'+text.slice(0,350)))return;
    $('send').disabled=true;
    notice('Sprawdzam, czy odpowiedź nie została już wysłana…');
    try{
      const already=await checkOne(c.id);
      if(already){
        // Inna sesja lub YouTube Studio mogły już opublikować odpowiedź.
        // Nie wysyłamy duplikatu. Czyścimy panel tylko jeśli wciąż dotyczy tego komentarza.
        clearReplyAfterHandled(c.id);
        renderComments();
        notice('Ten komentarz ma już odpowiedź DJ SEBA w YouTube. Nie wysłano duplikatu.','ok');
        return;
      }
      const result=await youtube('comments',{part:'snippet'},{method:'POST',body:{snippet:{parentId:c.id,textOriginal:text}}});
      if(!result.id)throw Error('YouTube nie potwierdził publikacji odpowiedzi.');
      c.answered=true;skipped.delete(c.id);saveSkips();
      // Zniknięcie starej odpowiedzi i komentarza dopiero PO potwierdzeniu API.
      // Przy błędzie lub anulowaniu tekst pozostaje nienaruszony.
      clearReplyAfterHandled(c.id);
      renderComments();
      notice('Odpowiedź została opublikowana na YouTube. Możesz wybrać kolejny komentarz.','ok');
      toast('Wysłano odpowiedź DJ SEBA!');
    }catch(e){notice('Nie udało się wysłać: '+e.message,'error');}
    finally{renderDetails();}
  }
  function saveSkips(){localStorage.setItem(SKIP,JSON.stringify([...skipped]));}
  function switchTab(name){document.querySelectorAll('.tab').forEach(e=>e.classList.toggle('active',e.dataset.tab===name));document.querySelectorAll('.tab-panel').forEach(e=>e.classList.toggle('active',e.id===name));}
  function parseCsv(text){
    text=text.replace(/^\ufeff/,'');
    const delimiter=(text.split(/\r?\n/,1)[0].match(/;/g)||[]).length>(text.split(/\r?\n/,1)[0].match(/,/g)||[]).length?';':',';
    const rows=[],r=[];let field='',quoted=false;
    for(let i=0;i<text.length;i++){
      const x=text[i];
      if(quoted){if(x==='"'&&text[i+1]==='"'){field+='"';i++;}else if(x==='"'){quoted=false;}else field+=x;}
      else if(x==='"')quoted=true;
      else if(x===delimiter){r.push(field);field='';}
      else if(x==='\n'){r.push(field.replace(/\r$/,''));rows.push([...r]);r.length=0;field='';}
      else field+=x;
    }
    if(field||r.length){r.push(field);rows.push([...r]);}
    if(rows.length<2)throw Error('Plik CSV nie zawiera danych.');
    const headers=rows[0].map(s=>s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
    const column=names=>names.map(n=>headers.indexOf(n)).find(i=>i>=0);
    const it=column(['song','title','track','utwor','tytul']),ix=column(['streams','odtworzenia','plays']),il=column(['listeners','sluchacze']),is=column(['saves','zapisy','zapisania']);
    if(it===undefined||ix===undefined)throw Error('To nie jest zbiorcza tabela. Potrzebne są kolumny song i streams.');
    const n=v=>{const x=Number(String(v||'').replace(/\s/g,'').replace(',','.'));if(!Number.isFinite(x)||x<0||!Number.isInteger(x))throw Error('Błędna liczba w CSV.');return x;};
    const data=[];for(const row of rows.slice(1)){if(!row[it]?.trim())continue;data.push({title:row[it].trim(),streams:n(row[ix]),listeners:il===undefined?null:n(row[il]),saves:is===undefined?null:n(row[is]),source:'CSV • '+new Date().toLocaleDateString('pl-PL')});}
    if(!data.length)throw Error('Brak utworów w pliku.');return data;
  }
  function saveSongs(){localStorage.setItem(SONGS,JSON.stringify(songs));}
  function upsertSpotifyFromHub(items){for(const s of items){const k=songs.findIndex(x=>x.title===s.title);k>=0?songs[k]={...songs[k],...s}:songs.push(s);}saveSongs();renderSongs();}
  function renderSongs(){
    const count=songs.length,sum=k=>songs.reduce((p,s)=>p+(Number(s[k])||0),0);
    $('s-count').textContent=count;$('s-streams').textContent=sum('streams').toLocaleString('pl-PL');$('s-saves').textContent=sum('saves').toLocaleString('pl-PL');
    const list=$('songs');list.replaceChildren();
    const hdr=el('div','song song-header');for(const h of ['Utwór','Odtw.','Słuch.','Zapis.'])hdr.append(el('span','',h));list.append(hdr);
    for(const s of songs){const row=el('div','song');row.append(el('b','',s.title),el('span','',String(s.streams??'—')),el('span','',String(s.listeners??'—')),el('span','',String(s.saves??'—')));list.append(row)}
  }

  // Uniwersalny parser raportów CSV: przecinki, średniki, średniki w cudzysłowie.
  function rowsCSV(text){
    text=text.replace(/^\ufeff/,'');
    const first=text.split(/\r?\n/,1)[0]||'';
    const sep=first.includes('\t')?'\t':(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
    const arr=[];let row=[],field='',quote=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quote){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quote=false;else field+=c;}
      else if(c==='"')quote=true;
      else if(c===sep){row.push(field);field='';}
      else if(c==='\n'){row.push(field.replace(/\r$/,''));if(row.some(x=>x.trim()))arr.push(row);row=[];field='';}
      else field+=c;
    }
    if(field||row.length){row.push(field);if(row.some(x=>x.trim()))arr.push(row);}
    if(!arr.length)throw Error('Pusty plik CSV.');
    return arr;
  }
  function normalized(x){return String(x||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_-]+/g,' ');}
  function which(headers,tests){return headers.findIndex(x=>tests.some(t=>normalized(x).includes(t)));}
  function numOrNull(v){let s=String(v??'').trim().replace(/[\s\u00a0]/g,'').replace(/[£€$zł]/g,'');if(!s||s==='—'||s==='-')return null;
    if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
    else if(s.includes(',')&&/^[-+]?\d{1,3}(,\d{3})+$/.test(s))s=s.replace(/,/g,''); else if(s.includes(','))s=s.replace(',','.');
    const n=Number(s);return Number.isFinite(n)?n:null;
  }
  async function readCSVFile(f){const bytes=await f.arrayBuffer();const b=new Uint8Array(bytes);let encoding='utf-8';if(b.length>1&&b[0]===255&&b[1]===254)encoding='utf-16le';else if(b.length>1&&b[0]===254&&b[1]===255)encoding='utf-16be';
    return new TextDecoder(encoding).decode(bytes);
  }
  function table(target,head,rows){const wrap=$(target);wrap.replaceChildren();if(!rows.length){wrap.append(el('p','empty','Nie ma jeszcze wczytanych raportów.'));return;}
    const tab=el('table','data-table'),tr=el('tr');for(const h of head)tr.append(el('th','',h));const th=el('thead');th.append(tr);tab.append(th);
    const tb=el('tbody');for(const row of rows){const rr=el('tr');row.forEach((x,i)=>rr.append(el('td',i>0?'':'',String(x??'—'))));tb.append(rr);}tab.append(tb);wrap.append(tab);
  }
  function renderPlay(){const apps=new Set(playReports.map(x=>x.app));$('p-apps').textContent=apps.size||'—';$('p-reports').textContent=playReports.length||'—';
    $('p-latest').textContent=playReports.length?new Date(Math.max(...playReports.map(x=>Date.parse(x.imported)||0))).toLocaleDateString('pl-PL'):'—';
    table('play-report',['Aplikacja / pakiet','Metryka','Wartość','Zakres / plik'],playReports.slice().sort((a,b)=>b.imported.localeCompare(a.imported)).map(r=>[r.app,r.metric,r.value.toLocaleString('pl-PL')+' '+(r.kind==='stan'?'(stan)':'(suma pozycji)'),r.file]));
    $('play-info').textContent=playReports.length?`Zapisano ${playReports.length} raportów. Dane lokalne – ostatni import nie jest odczytem na żywo.`:'Jeszcze nie zaimportowano danych Google Play.';
  }
  function parsePlayFile(file,source){
    const rows=rowsCSV(source); if(rows.length<2)throw Error('Raport nie zawiera wierszy.');
    const headerIndex=rows.slice(0,20).findIndex(row=>row.some(x=>/^(date|day|package name|app name|daily user installs|install base|data|dzień|nazwa aplikacji)$/i.test(String(x).trim())));
    if(headerIndex>0)rows.splice(0,headerIndex);
    const headers=rows[0].map(x=>x.trim());
    const appI=which(headers,['package name','package','app name','app id','application id','nazwa pakietu','nazwa aplikacji','pakiet']);
    const dayI=which(headers,['date','day','data','dzień']);
    const options=[];
    for(let i=0;i<headers.length;i++){
      if(i===appI||i===dayI)continue;
      const vals=rows.slice(1).map(r=>numOrNull(r[i])).filter(v=>v!==null);
      if(vals.length&&vals.length>=Math.min(2,Math.max(1,rows.length-1))) options.push({idx:i,label:headers[i]});
    }
    if(!options.length)throw Error('Nie znaleziono kolumny liczbowej. W Play Console pobierz raport statystyk instalacji/pozyskania użytkowników.');
    let best=options.find(o=>/daily user installs|user acquisitions|daily device installs|device acquisition|install base|current user installs|total user installs|instalacj|pozyskan|installs/i.test(o.label))||options[0];
    return {file:file.name,headers,rows,appI,dayI,options,best:best.idx};
  }
  function setupNextPlay(){activePlay=pendingPlay.shift()||null;const box=$('play-preview');box.hidden=!activePlay;if(!activePlay)return;
    $('play-file').textContent=activePlay.file+' · '+(activePlay.rows.length-1)+' wierszy · '+(pendingPlay.length)+' kolejnych raportów';
    const sel=$('play-metric');sel.replaceChildren();for(const o of activePlay.options){const op=el('option','',o.label);op.value=String(o.idx);sel.append(op);}sel.value=String(activePlay.best);
  }
  function commitPlay(){if(!activePlay)return;const idx=Number($('play-metric').value),met=activePlay.headers[idx];
    const stock=/install base|current|total user|active device|baza|aktywn|łącznie|total devices/i.test(met);
    const groups=new Map();let skippedRows=0;
    for(const row of activePlay.rows.slice(1)){
      const v=numOrNull(row[idx]);if(v===null){skippedRows++;continue;}
      const app=(activePlay.appI>=0?row[activePlay.appI]:'')||activePlay.file.replace(/\.csv$/i,'');
      const date=activePlay.dayI>=0?String(row[activePlay.dayI]||''):'';
      const key=String(app).trim();const old=groups.get(key);
      if(stock){if(!old||date>=old.day)groups.set(key,{sum:v,day:date});}
      else groups.set(key,{sum:(old?.sum||0)+v,day:date});
    }
    if(groups.size===0){toast('Nie znaleziono liczbowych wyników w tej kolumnie.');return;}
    for(const [app,d] of groups){const entry={id:activePlay.file+'|'+app+'|'+met,app,metric:met,value:d.sum,kind:stock?'stan':'suma',imported:new Date().toISOString(),file:activePlay.file};
      const k=playReports.findIndex(r=>r.id===entry.id);if(k>=0)playReports[k]=entry;else playReports.push(entry);
    }
    localStorage.setItem('djseba_play_reports_v09',JSON.stringify(playReports));renderPlay();toast('Zapisano raport Play Console'+(skippedRows?' (pominięto '+skippedRows+' pustych wierszy).':''));setupNextPlay();
  }
  async function importDistro(file){
    if(file.size>10000000)throw Error('Raport przekracza 10 MB.');
    const rows=rowsCSV(await readCSVFile(file)), h=rows[0];
    const money=which(h,['earnings','revenue','royalty','amount','total earned','przychod','zarobk','kwota','net income']);
    const song=which(h,['song','track','title','utwor','tytul']);
    const currency=which(h,['currency','waluta']);
    if(money<0)throw Error('Brak kolumny przychodu: Earnings, Revenue, Royalty lub Amount.');
    let added=0;
    for(let i=1;i<rows.length;i++){
      const row=rows[i],v=numOrNull(row[money]);if(v===null)continue;
      const entry={id:file.name+'|'+i,title:(song>=0?row[song]:'')||'Bez tytułu w raporcie',amount:v,currency:(currency>=0?row[currency]:'')||'waluta raportu',source:file.name,imported:new Date().toISOString()};
      const k=distroRows.findIndex(x=>x.id===entry.id);if(k>=0)distroRows[k]=entry;else distroRows.push(entry);added++;
    }
    if(!added)throw Error('Nie ma poprawnych kwot w raporcie.');
    localStorage.setItem('djseba_distro_rows_v09',JSON.stringify(distroRows));renderDistro();window.DJSEBA_HUB?.ingestDistroRows?.(rows.slice(1),h,file.name);toast('Zaimportowano '+added+' pozycji DistroKid.');
  }
  function renderDistro(){const n=distroRows.length, groups=new Map();for(const r of distroRows){const key=r.title+'|'+r.currency;groups.set(key,(groups.get(key)||0)+r.amount)}
    const totals=new Map();for(const r of distroRows){totals.set(r.currency,(totals.get(r.currency)||0)+r.amount)}
    $('d-rows').textContent=n||'—';$('d-tracks').textContent=n?new Set(distroRows.map(x=>x.title)).size:'—';
    $('d-total').textContent=n&&totals.size===1?[...totals.values()][0].toFixed(2)+' '+[...totals.keys()][0]:'—';
    $('distro-info').textContent=n?`${n} wierszy ze źródeł CSV. Raporty mają opóźnienie względem odtworzeń.`:'Brak zaimportowanego raportu zarobków.';
    table('distro-report',['Utwór','Zarobek wg raportu','Waluta'],[...groups.entries()].map(([key,sum])=>[key.split('|')[0],sum.toFixed(4),key.split('|')[1]]));
  }
  async function checkVisible(){const ids=[...commentMap.values()].filter(c=>!c.answered).slice(0,100);
    if(!ids.length){toast('Brak komentarzy do sprawdzenia.');return;}setBusy(true);notice('Sprawdzam odpowiedzi dla '+ids.length+' komentarzy…');let found=0,errors=0;
    for(const c of ids){try{if(await hasOwnerReply(c.id,[],1)){c.answered=true;found++;}c.unknown=false;}catch(e){c.unknown=true;errors++;}}
    renderComments();notice(`Weryfikacja: ${found} nowych odpowiedzianych, ${errors} niezweryfikowanych.`,'ok');setBusy(false);
  }
  function backup(){const obj={kind:'djseba-backup',version:15,created:new Date().toISOString(),songs,playReports,distroRows,skipped:[...skipped],hub:window.DJSEBA_HUB?.exportState?.()||null};
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='DJ_SEBA_Centrum_Artysty_KOPIA_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  async function restore(file){if(file.size>5000000)throw Error('Plik za duży (maksymalnie 5 MB).');const d=JSON.parse(await file.text());if(d.kind!=='djseba-backup'||![9,15].includes(d.version))throw Error('Nieprawidłowa kopia DJ SEBA.');
    if(!Array.isArray(d.songs)||!Array.isArray(d.playReports)||!Array.isArray(d.distroRows)||!Array.isArray(d.skipped))throw Error('Niekompletna kopia danych.');
    if(!confirm('Wczytać kopię danych? Zastąpi lokalnie zapisane raporty i oznaczenia pominiętych.'))return;
    songs=d.songs;playReports=d.playReports;distroRows=d.distroRows;skipped=new Set(d.skipped);saveSongs();saveSkips();localStorage.setItem('djseba_play_reports_v09',JSON.stringify(playReports));localStorage.setItem('djseba_distro_rows_v09',JSON.stringify(distroRows));renderSongs();renderPlay();renderDistro();renderComments();if(d.hub)window.DJSEBA_HUB?.restoreState?.(d.hub);toast('Wczytano kopię danych.');
  }

  window.DJSEBA_CORE={
    isConnected:()=>Boolean(token&&Date.now()<tokenExpires),
    channelId:CHANNEL,
    api:(path,query,opts)=>youtube(path,query,opts),
    comments:()=>[...commentMap.values()].map(c=>({...c})),
    upsertSpotify:upsertSpotifyFromHub,
    exportLegacy:()=>({songs:structuredClone(songs),distroRows:structuredClone(distroRows),playReports:structuredClone(playReports)})
  };
  function init(){
    // Migracja ID ze starszych instalacji, bez czyszczenia raportów ani historii.
    let storedClientId='';
    try { storedClientId=localStorage.getItem(KEY)||''; } catch {}
    const fixedLegacyId=Boolean(storedClientId && storedClientId!==BUILTIN_CLIENT_ID);
    try { if(storedClientId!==BUILTIN_CLIENT_ID) localStorage.setItem(KEY,BUILTIN_CLIENT_ID); } catch {}
    $('client-id').value=BUILTIN_CLIENT_ID;
    $('client-id').readOnly=true;
    $('origin').textContent=location.origin==='null'?'https://NAZWA.github.io':location.origin;

    $('reset-client-id').addEventListener('click',()=>{
      $('client-id').value=BUILTIN_CLIENT_ID;
      try { localStorage.setItem(KEY,BUILTIN_CLIENT_ID); } catch {}
      toast('Przywrócono prawidłowy identyfikator Google dla DJ SEBA. Kliknij „Połącz Google / YouTube”.');
    });
    $('check-all').addEventListener('click',checkVisible);
    $('play-csv').addEventListener('change',async e=>{pendingPlay=[];for(const f of e.target.files){try{if(f.size>10000000)throw Error('Plik jest większy niż 10 MB.');pendingPlay.push(parsePlayFile(f,await readCSVFile(f)));}catch(err){toast(f.name+': '+err.message)}}setupNextPlay();e.target.value='';});
    $('play-confirm').addEventListener('click',commitPlay);$('play-cancel').addEventListener('click',()=>{pendingPlay=[];setupNextPlay()});
    $('distro-csv').addEventListener('change',async e=>{const f=e.target.files[0];if(f)try{await importDistro(f)}catch(err){toast('DistroKid: '+err.message)}e.target.value='';});
    $('backup-all').addEventListener('click',backup);
    $('restore-all').addEventListener('change',async e=>{const f=e.target.files[0];if(f)try{await restore(f)}catch(err){toast('Kopia: '+err.message)}e.target.value='';});
    $('connect').addEventListener('click',connect);
    $('disconnect').addEventListener('click',()=>{if(token&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(token,()=>{});token='';tokenExpires=0;logged=false;commentMap.clear();selected='';pageToken='';authState();renderComments();notice('Rozłączono Google. Token nie był przechowywany na dysku.');});
    document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
    document.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c===b));renderComments()}));
    $('refresh').addEventListener('click',()=>loadComments(false));$('older').addEventListener('click',()=>loadComments(true));$('search').addEventListener('input',renderComments);
    $('send').addEventListener('click',sendReply);
    $('thanks').addEventListener('click',thankForComment);
    $('verify').addEventListener('click',async()=>{if(!selected||!logged)return;try{const result=await checkOne(selected);toast(result?'Odpowiedź DJ SEBA istnieje na YouTube.':'Nie znaleziono odpowiedzi DJ SEBA.');}catch(e){toast('Weryfikacja: '+e.message)}});
    $('skip').addEventListener('click',()=>{if(!selected)return;const c=commentMap.get(selected);if(!c||c.answered)return;skipped.has(selected)?skipped.delete(selected):skipped.add(selected);saveSkips();renderComments();});
    $('copy-prompt').addEventListener('click',async()=>{const c=commentMap.get(selected);if(!c)return;const q=`Przygotuj 3 krótkie, naturalne, indywidualne odpowiedzi DJ SEBA na komentarz YouTube. Tytuł utworu: ${c.videoTitle}. Komentarz: ${c.body}. Dopasuj ton do emocji utworu. Bez autopromocji i bez zmyślania.`;try{await navigator.clipboard.writeText(q);toast('Pytanie skopiowane do ChatGPT.');}catch{toast('Przeglądarka nie pozwala kopiować. Użyj HTTPS.')}});
    $('copy-reply').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('reply-text').value);toast('Odpowiedź skopiowana.');}catch{toast('Kopiowanie niedostępne.')}});
    $('csv').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(file.size>4000000){toast('Maksymalny rozmiar CSV to 4 MB.');return;}try{const d=parseCsv(await file.text());for(const s of d){const i=songs.findIndex(x=>x.title===s.title);i>=0?songs[i]=s:songs.push(s);}saveSongs();renderSongs();window.DJSEBA_HUB?.ingestSpotifyBulk?.(d,file.name);$('csv-info').textContent=`Zaimportowano ${d.length} utworów z ${file.name}${/1year|12month|rok|year/i.test(file.name)?' (zakres: 12 miesięcy)':''}. Dane zapisano lokalnie w tej przeglądarce.`;toast('Import Spotify zakończony.');}catch(ex){toast('Import CSV: '+ex.message)}e.target.value='';});
    $('export-stats').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({exported:new Date().toISOString(),songs},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='DJ_SEBA_Spotify_kopia.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
    authState();renderComments();renderSongs();renderPlay();renderDistro();
    if(location.protocol!=='file:')notice(fixedLegacyId?'Zastąpiono wcześniejsze ustawienie poprawnym identyfikatorem Google OAuth. Kliknij „Połącz Google / YouTube”.':'Client ID ustawiony automatycznie. Kliknij „Połącz Google / YouTube”, aby wczytać komentarze.', 'ok');
    if(location.protocol==='file:')notice('To lokalny podgląd. Aby zalogować Google, opublikuj pliki na GitHub Pages (HTTPS).','error');
  }
  document.addEventListener('DOMContentLoaded',init);
})();
