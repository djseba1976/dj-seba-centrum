'use strict';
/* DJ SEBA Centrum Artysty v1.8 – sortowanie filmów także wg polubień; zachowanie danych v1.4–v1.7. */
(() => {
  const $ = id => document.getElementById(id);
  const HUB_KEY='djseba_hub_v15';
  // Osobna preferencja interfejsu: nie zmieniamy formatu zapisanych danych statystyk.
  const YT_SORT_KEY='djseba_youtube_video_sort_v17';
  const YT_SORT_OPTIONS=[
    ['published_desc','Data publikacji: najnowsze'],
    ['published_asc','Data publikacji: najstarsze'],
    ['views_desc','Wyświetlenia: najwięcej'],
    ['views_asc','Wyświetlenia: najmniej'],
    ['likes_desc','Polubienia: najwięcej'],
    ['likes_asc','Polubienia: najmniej'],
    ['comments_desc','Komentarze: najwięcej'],
    ['comments_asc','Komentarze: najmniej']
  ];
  let ytVideoSort='published_desc';
  try{const v=localStorage.getItem(YT_SORT_KEY);if(YT_SORT_OPTIONS.some(x=>x[0]===v))ytVideoSort=v;}catch{}

  const PLATFORMS=['youtube','spotify','facebook','instagram','tiktok'];
  const LABEL={youtube:'YouTube',spotify:'Spotify',facebook:'Facebook',instagram:'Instagram',tiktok:'TikTok'};
  const fmt=n=>(n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n)))?Number(n).toLocaleString('pl-PL'):'—';
  const cash=(n,c='USD')=>(n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n)))?new Intl.NumberFormat('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2}).format(+n)+' '+c:'—';
  const now=()=>new Date().toISOString();
  const day=()=>new Date().toISOString().slice(0,10);
  const text=(tag,txt,cls)=>{let e=document.createElement(tag);e.textContent=txt===undefined?'':String(txt);if(cls)e.className=cls;return e};
  const norm=s=>String(s??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_-]+/g,' ');
  const safeUrl=s=>{try{const u=new URL(String(s||''));return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
  const number=v=>{const s=String(v??'').trim().replace(/\s|\u00a0/g,'').replace(/[€$£zł]/g,'');if(!s||['—','-','n/a'].includes(s.toLowerCase()))return null;let x=s;if(x.includes(',')&&x.includes('.'))x=x.lastIndexOf(',')>x.lastIndexOf('.')?x.replace(/\./g,'').replace(',','.'):x.replace(/,/g,'');else if(x.includes(',')&&/^[-+]?\d{1,3}(,\d{3})+$/.test(x))x=x.replace(/,/g,'');else x=x.replace(',','.');const n=Number(x);return Number.isFinite(n)?n:null};
  const dateFrom=s=>{const t=String(s??'').trim();if(!t)return '';if(/^\d{4}-\d\d-\d\d/.test(t))return t.slice(0,10);const pl=t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);if(pl)return [pl[3],pl[2].padStart(2,'0'),pl[1].padStart(2,'0')].join('-');const m=t.match(/^\d{4}-\d\d$/);if(m)return t+'-01';const serial=Number(t);if(serial>40000&&serial<80000){const d=new Date(Date.UTC(1899,11,30)+serial*86400000);return d.toISOString().slice(0,10)}const d=new Date(t);return !isNaN(d.getTime())?d.toISOString().slice(0,10):''};
  const empty=()=>({schema:15,entries:{youtube:[],facebook:[],instagram:[],tiktok:[]},measurements:[],spotify:{},spotifyDaily:{},finance:[],payouts:[],lastCommentsCheck:'',commentsNew:0,commentsLoaded:0,commentsPending:0,commentsAt:'',commentsApi:'',settings:{rate:3,fx:4,predStreams:1000,months:12},imports:[],updated:{}});
  function validate(s){if(!s||typeof s!=='object'||s.schema!==15)throw Error('Niewłaściwy format danych panelu v1.5.');for(const v of ['finance','payouts','measurements','imports'])if(!Array.isArray(s[v]))throw Error('Błędna sekcja '+v);if(!s.entries||!s.spotify||!s.spotifyDaily||!s.settings)throw Error('Niekompletny plik.');return s;}
  let state;try{state=validate(JSON.parse(localStorage.getItem(HUB_KEY)||'null'))}catch{state=empty()}
  let ready=false;
  const MAXMEASURES=15000;
  function save(){try{localStorage.setItem(HUB_KEY,JSON.stringify(state))}catch(e){message('Brak miejsca w pamięci przeglądarki. Pobierz kopię JSON i sprawdź wolne miejsce: '+e.message)}}
  function message(s,good=true){const n=$('hub-alert');if(n){n.textContent=s;n.className='hub-info'+(good?'':' warn')}const t=$('toast');if(t){t.textContent=s;t.classList.add('visible');setTimeout(()=>t.classList.remove('visible'),5300)}}
  function isFiniteNumber(n){return n!==null&&n!==undefined&&Number.isFinite(Number(n))}
  function snapshot(platform,id,values,source,at=now()){
    const obs={platform,id:String(id||'konto'),at:at||now(),source:source||'Wpis ręczny'};
    for(const k of ['views','likes','comments','shares','reach','followers','streams','listeners','saves'])if(isFiniteNumber(values[k]))obs[k]=Number(values[k]);
    const i=state.measurements.findIndex(r=>r.platform===obs.platform&&r.id===obs.id&&r.at===obs.at&&r.source===obs.source);
    if(i>=0)state.measurements[i]={...state.measurements[i],...obs};else state.measurements.push(obs);
    if(state.measurements.length>MAXMEASURES)state.measurements.splice(0,state.measurements.length-MAXMEASURES);
    state.updated[platform]=obs.at;
  }
  function upsert(platform,item,source='Wpis ręczny',at=now()){
    const values={};for(const k of ['views','likes','comments','shares','reach','followers'])values[k]=isFiniteNumber(item[k])?Math.max(0,Number(item[k])):null;
    const arr=state.entries[platform]||(state.entries[platform]=[]);const id=String(item.id||item.link||item.title||'').trim();if(!id)throw Error('Brak identyfikatora lub tytułu publikacji.');
    const v={id,title:String(item.title||'Bez tytułu'),published:dateFrom(item.published),link:safeUrl(item.link),thumb:safeUrl(item.thumb),...values,source,updated:at};
    const i=arr.findIndex(x=>x.id===id);const merged={...(i>=0?arr[i]:{}),...Object.fromEntries(Object.entries(v).filter(([k,x])=>x!==null&&x!=='')),id,title:v.title,source,updated:at};if(i>=0)arr[i]=merged;else arr.push(merged);
    snapshot(platform,id,values,source,at);
    save();
  }
  function setAccount(platform,followers,source,at=now()){
    if(!isFiniteNumber(followers))return;
    snapshot(platform,'konto',{followers},source,at);save();
  }
  function latest(platform,id){const arr=state.measurements.filter(x=>x.platform===platform&&x.id===id);return arr.sort((a,b)=>b.at.localeCompare(a.at))[0]||null;}
  function accountFollowers(platform){return latest(platform,'konto')?.followers??null}
  function reportStamp(platform){const a=state.updated[platform];return a?new Date(a).toLocaleString('pl-PL'):'Brak pomiaru'}
  function numbers(platform){const entries=state.entries[platform]||[];const known=entries.filter(x=>isFiniteNumber(x.views));return {views:known.length?known.reduce((s,x)=>s+Number(x.views||0),0):null,posts:entries.length,likes:entries.some(x=>isFiniteNumber(x.likes))?entries.reduce((s,x)=>s+Number(x.likes||0),0):null,followers:accountFollowers(platform)};}
  function legacySongs(){try{const s=JSON.parse(localStorage.getItem('djseba_spotify_v09')||'[]');return Array.isArray(s)?s:[]}catch{return []}}
  function spotifyTracks(){const map=new Map();for(const l of legacySongs())if(l.title)map.set(norm(l.title),{title:l.title,streams:l.streams,listeners:l.listeners,saves:l.saves,source:l.source||'CSV – starsza wersja',periodDays:null,reportedAt:'',published:'',url:''});for(const s of Object.values(state.spotify))map.set(norm(s.title),{...map.get(norm(s.title)),...s});return [...map.values()].sort((a,b)=>String(a.title).localeCompare(String(b.title),'pl'))}
  function addSpotify(item,source,reported=now()){
    if(!item.title)throw Error('Brak tytułu utworu.');const key=norm(item.title),old=state.spotify[key]||{};
    const rec={...old,title:item.title,source,reportedAt:reported,streams:isFiniteNumber(item.streams)?Math.max(0,Number(item.streams)):(old.streams??null),listeners:isFiniteNumber(item.listeners)?Math.max(0,Number(item.listeners)):(old.listeners??null),saves:isFiniteNumber(item.saves)?Math.max(0,Number(item.saves)):(old.saves??null),periodDays:item.periodDays===null?(old.periodDays??null):item.periodDays??old.periodDays??null,last12:isFiniteNumber(item.last12)?Number(item.last12):(old.last12??null),last12ReportedAt:isFiniteNumber(item.last12)?reported:(old.last12ReportedAt||''),lifetime:isFiniteNumber(item.lifetime)?Number(item.lifetime):(old.lifetime??null),published:dateFrom(item.published)||old.published||'',url:safeUrl(item.url)||old.url||'',playlist:item.playlist||old.playlist||''};
    if(rec.periodDays>=365&&isFiniteNumber(item.streams)){rec.last12=Number(item.streams);rec.last12ReportedAt=reported;}
    if(rec.periodDays===0&&isFiniteNumber(item.streams))rec.lifetime=Number(item.streams);
    state.spotify[key]=rec;
    snapshot('spotify',key,{streams:item.streams,listeners:item.listeners,saves:item.saves},source,reported);
    state.updated.spotify=reported;
    save();
  }
  function ingestSpotifyBulk(items,filename){const period=/1year|12months?|1rok|365/i.test(filename)?365:/28days?|28dni/i.test(filename)?28:null;for(const s of items)addSpotify({...s,periodDays:period},'Import CSV • '+filename);renderAll();}
  function parseCSV(str){str=String(str).replace(/^\ufeff/,'');const first=str.split(/\r?\n/)[0]||'',sep=first.includes('\t')?'\t':((first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',');let rows=[],r=[],val='',q=false;for(let i=0;i<str.length;i++){const x=str[i];if(q){if(x==='"'&&str[i+1]==='"'){val+='"';i++}else if(x==='"')q=false;else val+=x}else if(x==='"')q=true;else if(x===sep){r.push(val);val=''}else if(x==='\n'){r.push(val.replace(/\r$/,''));if(r.some(x=>String(x).trim()))rows.push(r);r=[];val=''}else val+=x;}if(val||r.length){r.push(val);if(r.some(x=>String(x).trim()))rows.push(r)}return rows}
  const col=(headers,names)=>headers.findIndex(h=>names.some(n=>norm(h)===norm(n)||norm(h).includes(norm(n))));
  const get=(r,h,names)=>{const i=col(h,names);return i<0?'':String(r[i]??'').trim()};
  const getNum=(r,h,names)=>number(get(r,h,names));
  const CSVALIASES={title:['tytul','nazwa filmu','tytul filmu','video title','post title','film','utwor','song','track','title','opis','description','video description','video_description'],id:['video id','video_id','post id','post_id','id'],link:['permalink','post url','video url','share_url','url','link','adres'],published:['publication date','publish date','date','created at','create_time','published','premiera','data publikacji','data'],views:['video views','video_view_count','views','view_count','wyswietlenia','odslony','odtworzenia filmu','plays'],likes:['reactions','likes','like_count','polubienia','reakcje'],comments:['comments','comment_count','komentarze'],shares:['shares','share_count','udostepnienia'],reach:['reach','zasieg'],followers:['followers','follower_count','obserwujacy','liczba obserwujacych'],thumb:['cover_image_url','thumbnail','miniatura','cover']};
  function filenameDate(name){const m=String(name).match(/20\d\d[-_]?[01]\d[-_]?[0-3]\d/);return m?dateFrom(m[0].replace(/_/g,'-').replace(/^(\d{4})(\d\d)(\d\d)$/,'$1-$2-$3')):''}
  function importSocial(platform,rows,file){if(rows.length<2)throw Error('Nie ma wierszy danych.');const h=rows[0];let n=0;const stamped=filenameDate(file)||day();for(const row of rows.slice(1)){
    const data={};for(const [k,aliases] of Object.entries(CSVALIASES))data[k]=['id','title','link','published','thumb'].includes(k)?get(row,h,aliases):getNum(row,h,aliases);
    const id=data.id||data.link||data.title;
    if(!id){if(isFiniteNumber(data.followers)){setAccount(platform,data.followers,'Import '+file,stamped+'T12:00:00Z');n++;}continue}
    if(data.id==='konto'||norm(data.title)==='konto'){setAccount(platform,data.followers,'Import '+file,stamped+'T12:00:00Z');n++;continue}
    upsert(platform,{...data,id},'Import '+file,stamped+'T12:00:00Z');n++;
    if(isFiniteNumber(data.followers))setAccount(platform,data.followers,'Import '+file,stamped+'T12:00:00Z');
  }if(!n)throw Error('Brak rozpoznanych publikacji. Wymagane np. Title, Views i Link.');logImport(platform,file,n);return n;}
  function importSpotifyRows(rows,file){if(rows.length<2)throw Error('Pusty plik.');const h=rows[0];const it=col(h,['song','track','title','utwor','tytul']);const stream=col(h,['streams','plays','odtworzenia','odsluchania']);const dateI=col(h,['date','day','data']);if(dateI>=0&&stream>=0&&it<0){const m=file.replace(/-timeline\.(csv|xlsx)$/i,'').replace(/^(DJ SEBA[-_])?/i,'').trim();let n=0;for(const row of rows.slice(1)){const date=dateFrom(row[dateI]),v=number(row[stream]);if(date&&isFiniteNumber(v)){const key=norm(m),arr=state.spotifyDaily[key]||(state.spotifyDaily[key]=[]);const i=arr.findIndex(x=>x.day===date);const rec={day:date,streams:Number(v),source:'Import '+file};i>=0?arr[i]=rec:arr.push(rec);n++;}}if(!n)throw Error('Brak danych dziennych.');if(!state.spotify[norm(m)])addSpotify({title:m,periodDays:null},'Import '+file);save();logImport('spotify',file,n);return n;}
    if(it<0||stream<0)throw Error('Tabela Spotify wymaga kolumn Title/Song i Streams.');let n=0;const period=/1year|12months?|365|1rok/i.test(file)?365:/28days?|28dni/i.test(file)?28:null;for(const row of rows.slice(1)){const title=row[it]?.trim();if(!title)continue;addSpotify({title,streams:number(row[stream]),listeners:getNum(row,h,['listeners','sluchacze']),saves:getNum(row,h,['saves','zapisania','zapisy']),periodDays:period,published:get(row,h,['release date','premiera','published']),url:get(row,h,['spotify url','link','url']),playlist:get(row,h,['playlist'])},'Import '+file);n++}if(!n)throw Error('Nie znaleziono piosenek.');window.DJSEBA_CORE?.upsertSpotify?.(rows.slice(1).filter(r=>r[it]?.trim()).map(r=>({title:r[it].trim(),streams:number(r[stream]),listeners:getNum(r,h,['listeners','sluchacze']),saves:getNum(r,h,['saves','zapisania','zapisy'])})));logImport('spotify',file,n);return n;
  }
  function logImport(platform,file,n){state.imports.unshift({platform,file,n,at:now()});state.imports=state.imports.slice(0,300);save()}
  // XLSX parser for ordinary Excel workbooks: native ZIP + XML (without external CDN).
  async function unzipXlsx(file){
    if(file.size>15e6)throw Error('Arkusz jest większy niż 15 MB.');
    const b=new Uint8Array(await file.arrayBuffer()),dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
    const u16=p=>dv.getUint16(p,true),u32=p=>dv.getUint32(p,true),dec=new TextDecoder('utf-8');
    let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(u32(i)===0x06054b50){end=i;break}
    if(end<0)throw Error('Nie znaleziono spisu plików XLSX.');
    const count=u16(end+10),pos=u32(end+16),files=new Map();if(count>1200)throw Error('Za dużo arkuszy i plików w Excel.');let p=pos;
    for(let i=0;i<count;i++){
      if(p+46>b.length||u32(p)!==0x02014b50)throw Error('Uszkodzona struktura XLSX.');
      const method=u16(p+10),csize=u32(p+20),usize=u32(p+24),n=u16(p+28),ex=u16(p+30),com=u16(p+32),local=u32(p+42),name=dec.decode(b.subarray(p+46,p+46+n));p+=46+n+ex+com;
      if(!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)$/.test(name))continue;
      if(usize>20e6||csize>15e6)throw Error('Zbyt duży arkusz XLSX.');
      if(u32(local)!==0x04034b50)throw Error('Brak wpisu arkusza w XLSX.');
      const start=local+30+u16(local+26)+u16(local+28),comp=b.subarray(start,start+csize);
      let payload;
      if(method===0)payload=comp;
      else if(method===8){
        if(!('DecompressionStream' in window))throw Error('Ta przeglądarka nie wspiera kompresji XLSX. Zapisz CSV.');
        const ds=new DecompressionStream('deflate-raw');const ab=await new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer();payload=new Uint8Array(ab);
      }else throw Error('Nieobsługiwane pakowanie Excel.');
      if(payload.length>20e6)throw Error('Plik Excel przekracza limit danych.');files.set(name,dec.decode(payload));
    }
    return files;
  }
  const xmlNodes=(p,tag)=>Array.from(p.getElementsByTagName(tag));
  async function parseXlsx(file){
    const files=await unzipXlsx(file);const parser=new DOMParser();
    const read=name=>{const txt=files.get(name);if(!txt)throw Error('Brak '+name+' w pliku Excel.');const doc=parser.parseFromString(txt,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('Nieprawidłowy XML w Excel.');return doc};
    const shared=[];if(files.has('xl/sharedStrings.xml'))for(const si of xmlNodes(read('xl/sharedStrings.xml'),'si'))shared.push(xmlNodes(si,'t').map(x=>x.textContent).join(''));
    // Resolve first worksheet through workbook rels, rather than assuming Excel sheet1.xml.
    let ws='xl/worksheets/sheet1.xml';
    if(files.has('xl/workbook.xml')&&files.has('xl/_rels/workbook.xml.rels')){
      const book=read('xl/workbook.xml'),sheet=xmlNodes(book,'sheet')[0],rId=sheet?.getAttribute('r:id');
      const rel=xmlNodes(read('xl/_rels/workbook.xml.rels'),'Relationship').find(x=>x.getAttribute('Id')===rId);
      if(rel){let target=rel.getAttribute('Target')||'';target=target.replace(/^\//,'').replace(/^\.\.\//,'');ws=target.startsWith('xl/')?target:'xl/'+target;}
    }
    if(!files.has(ws)){ws=[...files.keys()].find(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x));}
    if(!ws)throw Error('Nie znaleziono arkusza w Excel.');
    const doc=read(ws);let rows=[];
    for(const row of xmlNodes(doc,'row')){
      let arr=[];for(const cell of xmlNodes(row,'c')){
        const addr=cell.getAttribute('r')||'',letter=(addr.match(/^[A-Z]+/)||[])[0]||'A';let idx=0;for(const a of letter)idx=idx*26+(a.charCodeAt(0)-64);idx--;if(idx>200)continue;
        const type=cell.getAttribute('t')||'',vv=cell.getElementsByTagName('v')[0]?.textContent??'';
        const inline=cell.getElementsByTagName('is')[0];let val=type==='s'?shared[Number(vv)]??'':type==='inlineStr'&&inline?xmlNodes(inline,'t').map(x=>x.textContent).join(''):vv;
        arr[idx]=String(val);
      }if(arr.some(x=>String(x||'').trim()))rows.push(Array.from({length:arr.length},(_,i)=>arr[i]??''));
    }if(rows.length<1)throw Error('Excel nie zawiera danych.');return rows;
  }
  async function loadTable(file){
    if(file.size>15e6)throw Error('Zbyt duży plik (maksymalnie 15 MB).');
    if(/\.xlsx$/i.test(file.name))return await parseXlsx(file);
    if(/\.xls$/i.test(file.name))throw Error('Starszy format XLS nie jest obsługiwany. Zapisz plik jako XLSX lub CSV.');
    const bin=new Uint8Array(await file.arrayBuffer());let txt='';if(bin[0]===255&&bin[1]===254)txt=new TextDecoder('utf-16le').decode(bin);else txt=new TextDecoder('utf-8').decode(bin);
    return parseCSV(txt);
  }
  function financeRow(values,source){const id=values.id||source+'|'+JSON.stringify(values).slice(0,350);const i=state.finance.findIndex(x=>x.id===id);const row={...(i>=0?state.finance[i]:{}),...values,id,source};if(i>=0)state.finance[i]=row;else state.finance.push(row);}
  function importFinance(rows,filename){if(rows.length<2)throw Error('Pusty raport DistroKid.');const h=rows[0];const money=col(h,['earnings (usd)','earnings','revenue','royalty','amount','net income','zarobki','przychody','kwota']);if(money<0)throw Error('Nie ma kolumny przychodów (np. Earnings (USD)).');let n=0;const seen=new Map();
    const currencyHead=String(h[money]).toLowerCase();let defaultCurrency=currencyHead.includes('usd')?'USD':currencyHead.includes('pln')?'PLN':'';
    for(let i=1;i<rows.length;i++){
      const r=rows[i],amount=number(r[money]);if(amount===null)continue;
      let currency=get(r,h,['currency','waluta']).toUpperCase().trim()||defaultCurrency||'nieznana';
      const item={track:get(r,h,['song','track','title','utwor','tytul'])||'Bez tytułu',platform:get(r,h,['store','service','platform','serwis'])||'Nieokreślona',amount,currency,posted:dateFrom(get(r,h,['payment date','date paid','booking date','accounting date','data ksiegowania','sale month','reporting date','report month','month','date'])),available:dateFrom(get(r,h,['available date','data dostepnosci'])),paid:dateFrom(get(r,h,['payout date','withdrawal date','data wyplaty'])),fee:getNum(r,h,['fee','processing fee','oplata']),country:get(r,h,['country','kraj'])};const signature=JSON.stringify([item.track,item.platform,item.amount,item.currency,item.posted,item.available,item.paid,item.country,item.fee]);let hash=2166136261;for(let j=0;j<signature.length;j++){hash^=signature.charCodeAt(j);hash=Math.imul(hash,16777619)}const idx=seen.get(signature)||0;seen.set(signature,idx+1);item.id='distro-'+(hash>>>0).toString(16)+'-'+idx;financeRow(item,'Import CSV/Excel · '+filename);n++;
    }if(!n)throw Error('Brak liczbowych przychodów.');logImport('distrokid',filename,n);save();return n;
  }
  function ingestDistroRows(rows,h,file){try{importFinance([h,...rows],file);renderAll()}catch(e){console.warn('Rozszerzone dane DistroKid:',e.message)}}
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  function csvQuote(v){let x=String(v??'');if(/^(?:[=+@\t\r]|-(?!\d+(?:[.,]\d+)?$))/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"'}
  function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)}
  function financeExportRows(){return [['Utwór','Platforma','Kwota','Waluta','Data księgowania','Dostępne do wypłaty','Data wypłaty','Opłata','Źródło'],...state.finance.map(x=>[x.track,x.platform,x.amount,x.currency,x.posted||'',x.available||'',x.paid||'',x.fee??'',x.source])];}
  function exportCSV(){download('\ufeff'+financeExportRows().map(r=>r.map(csvQuote).join(';')).join('\r\n'),'DJ_SEBA_DistroKid_Finanse_'+day()+'.csv','text/csv;charset=utf-8')}
  // Excel export: minimal valid XLSX (inline strings) packaged as ZIP STORE; no remote dependency.
  const te=new TextEncoder();
  const crcTable=(()=>{const a=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;a[n]=c>>>0}return a})();
  const crc32=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0};
  const le16=(v)=>[v&255,(v>>8)&255],le32=v=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
  function zipStore(entries){let local=[],central=[],offset=0;for(const [name,source] of Object.entries(entries)){
    const nm=te.encode(name),data=te.encode(source),crc=crc32(data),size=data.length;
    const lh=new Uint8Array([80,75,3,4,20,0,0,0,0,0,0,0,0,0,...le32(crc),...le32(size),...le32(size),...le16(nm.length),0,0]);
    const ch=new Uint8Array([80,75,1,2,20,0,20,0,0,0,0,0,0,0,0,0,...le32(crc),...le32(size),...le32(size),...le16(nm.length),0,0,0,0,0,0,0,0,0,0,0,0,...le32(offset)]);
    local.push(lh,nm,data);central.push(ch,nm);offset+=lh.length+nm.length+data.length;
  }const cdSize=central.reduce((s,x)=>s+x.length,0);const n=Object.keys(entries).length;return new Blob([...local,...central,new Uint8Array([80,75,5,6,0,0,0,0,...le16(n),...le16(n),...le32(cdSize),...le32(offset),0,0])],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
  function exportXlsx(){const rows=financeExportRows(),addr=i=>{let x=i+1,s='';while(x){x--;s=String.fromCharCode(65+(x%26))+s;x=Math.floor(x/26)}return s};
    const data=rows.map((row,ri)=>'<row r="'+(ri+1)+'">'+row.map((x,ci)=>{const r=addr(ci)+(ri+1),n=typeof x==='number'&&Number.isFinite(x);return n?`<c r="${r}"><v>${x}</v></c>`:`<c r="${r}" t="inlineStr"><is><t>${esc(x)}</t></is></c>`}).join('')+'</row>').join('');
    const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data}</sheetData></worksheet>`;
    const files={
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="DistroKid" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml':sheet};const blob=zipStore(files);download(blob,'DJ_SEBA_DistroKid_Finanse_'+day()+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
  function deltaFor(platform,id,key,days){const hist=state.measurements.filter(x=>x.platform===platform&&x.id===id&&isFiniteNumber(x[key])).sort((a,b)=>a.at.localeCompare(b.at));if(hist.length<2)return null;const last=hist[hist.length-1];const cutoff=Date.parse(last.at)-days*864e5;const old=hist.filter(x=>Date.parse(x.at)<=cutoff).pop();return old?Number(last[key])-Number(old[key]):null}
  function deltaMarkup(platform,id,metric){return [1,7,30,365].map(d=>{const n=deltaFor(platform,id,metric,d);return `<span><b>${d===1?'Dzień':d===7?'Tydzień':d===30?'Miesiąc':'Rok'}</b><br>${n===null?'—':(n>0?'+':'')+fmt(n)}</span>`}).join('')}
  function chart(target,points,yKey='views'){
    const container=typeof target==='string'?$(target):target;if(!container)return;container.replaceChildren();const good=points.filter(x=>isFiniteNumber(x[yKey])&&x.at);if(!good.length){container.append(text('p','Wczytaj kilka pomiarów, aby zobaczyć wykres.','muted'));return}
    const limited=good.slice(-75),nums=limited.map(x=>Number(x[yKey])),max=Math.max(1,...nums),min=0,W=720,H=205,px=42,py=23,innerW=W-2*px,innerH=H-2*py;
    let svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','Wykres statystyk');svg.style.width='100%';svg.style.height='auto';
    function s(tag,attr,txt){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attr||{}))e.setAttribute(k,v);if(txt!==undefined)e.textContent=txt;svg.append(e);return e}
    for(let k=0;k<=4;k++){let y=py+innerH*k/4;s('line',{x1:px,y1:y,x2:W-px,y2:y,stroke:'rgba(255,255,255,.10)'});s('text',{x:4,y:y+4,fill:'#9cbecb','font-size':'11'},fmt(Math.round(max*(1-k/4))))}
    const coordinates=limited.map((v,i)=>({x:px+(limited.length===1?.5:i/(limited.length-1))*innerW,y:py+innerH-(Number(v[yKey])-min)/(max-min)*innerH}));s('polyline',{fill:'none',stroke:'#20d1c6','stroke-width':'3','stroke-linejoin':'round',points:coordinates.map(p=>`${p.x},${p.y}`).join(' ')});
    for(const [i,p] of coordinates.entries())s('circle',{cx:p.x,cy:p.y,r:limited.length<=20?3:2,fill:'#20d1c6'});
    s('text',{x:px,y:H-4,fill:'#9cbecb','font-size':11},limited[0].at.slice(0,10));s('text',{x:W-px,y:H-4,fill:'#9cbecb','font-size':11,'text-anchor':'end'},limited[limited.length-1].at.slice(0,10));container.append(svg)
  }
  function renderPlatformEditor(platform){const root=document.querySelector(`[data-hub-platform="${platform}"]`);if(!root)return;const isTik=platform==='tiktok';
    const youtubeSort=platform==='youtube'?`<div class="hub-youtube-sort"><label for="hub-sort-youtube">Sortuj filmy<select id="hub-sort-youtube" aria-label="Sortowanie filmów YouTube">${YT_SORT_OPTIONS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><small class="muted" id="hub-sort-count-youtube" aria-live="polite"></small><small class="muted">Daty to daty publikacji udostępniane przez YouTube. Polubienia i komentarze dotyczą danego filmu (nie Twoich odpowiedzi). Brakujące wartości zawsze na końcu.</small></div>`:'';
    root.innerHTML=`<div class="hub-row hub-wrap hub-actions"><label class="hub-upload">Importuj CSV / Excel<input type="file" accept=".csv,.xlsx,.xls" multiple data-import="${platform}"></label><button class="ghost" data-manual="${platform}" type="button">+ Dodaj film / wpis</button><button class="ghost" data-account="${platform}" type="button">+ Liczba obserwujących</button><button class="ghost" data-export="${platform}" type="button">↓ Eksport CSV</button></div><div class="hub-box hub-manual" id="hub-form-${platform}" hidden><h3>Dodaj lub zaktualizuj publikację</h3><div class="hub-form-grid"><label>Tytuł / opis<input name="title" maxlength="300" required></label><label>ID publikacji (opcjonalnie)<input name="id" maxlength="160"></label><label>Data publikacji<input type="date" name="published"></label><label>Bezpośredni link<input type="url" name="link" placeholder="https://..."></label><label>Miniatura (URL)<input type="url" name="thumb" placeholder="https://..."></label><label>Wyświetlenia<input type="number" min="0" name="views"></label><label>Polubienia / reakcje<input type="number" min="0" name="likes"></label><label>Komentarze<input type="number" min="0" name="comments"></label><label>Udostępnienia<input type="number" min="0" name="shares"></label><label>Zasięg<input type="number" min="0" name="reach"></label></div><div class="hub-row hub-wrap"><button class="primary" type="button" data-save="${platform}">Zapisz pomiar</button><button class="ghost" type="button" data-hide="${platform}">Anuluj</button></div></div><div class="hub-grid four" id="hub-metrics-${platform}"></div><div class="hub-box"><div class="hub-row hub-between"><h3>Publikacje i ich statystyki</h3><small id="hub-meta-${platform}" class="muted">Brak pomiarów</small></div><div class="hub-search-row"><input type="search" id="hub-search-${platform}" placeholder="Filtruj filmy i posty..." aria-label="Szukaj publikacji"></div>${youtubeSort}<div id="hub-list-${platform}"></div></div><div class="hub-box"><h3>Historia pomiarów wyświetleń</h3><div id="hub-chart-${platform}" class="hub-chart"></div><p class="muted hub-small">Przyrost wyliczamy z dwóch lub więcej pomiarów, nie z jednej wartości.</p></div>`;
    root.querySelector(`[data-import="${platform}"]`).addEventListener('change',async e=>{await importFiles(platform,[...e.target.files]);e.target.value=''});
    root.querySelector(`[data-manual="${platform}"]`).addEventListener('click',()=>{$(`hub-form-${platform}`).hidden=false});
    root.querySelector(`[data-hide="${platform}"]`).addEventListener('click',()=>{$(`hub-form-${platform}`).hidden=true});
    root.querySelector(`[data-save="${platform}"]`).addEventListener('click',()=>{const box=$(`hub-form-${platform}`),fields=Object.fromEntries([...box.querySelectorAll('[name]')].map(x=>[x.name,x.value]));if(!fields.title.trim()){message('Wpisz tytuł publikacji.',false);return}for(const k of ['views','likes','comments','shares','reach'])fields[k]=number(fields[k]);fields.id=fields.id||fields.link||fields.title;try{upsert(platform,fields);box.hidden=true;box.querySelectorAll('input').forEach(x=>x.value='');renderAll();message('Zapisano '+LABEL[platform]+' – ręczny pomiar.')}catch(e){message(e.message,false)}});
    root.querySelector(`[data-account="${platform}"]`).addEventListener('click',()=>{const n=prompt('Aktualna liczba obserwujących na '+LABEL[platform]+' (wartość z panelu platformy):');if(n===null)return;const v=number(n);if(v===null||v<0){message('Podaj nieujemną liczbę.',false);return}setAccount(platform,v,'Wpis ręczny');renderAll()});
    root.querySelector(`[data-export="${platform}"]`).addEventListener('click',()=>{const rows=[['ID','Tytuł','Data','Link','Miniatura','Wyświetlenia','Polubienia','Komentarze','Udostępnienia','Zasięg','Źródło','Ostatni pomiar'],...(state.entries[platform]||[]).map(x=>[x.id,x.title,x.published,x.link,x.thumb,x.views??'',x.likes??'',x.comments??'',x.shares??'',x.reach??'',x.source,x.updated])];download('\ufeff'+rows.map(r=>r.map(csvQuote).join(';')).join('\r\n'),'DJ_SEBA_'+platform+'_'+day()+'.csv','text/csv;charset=utf-8')});
    if(platform==='youtube'){
      const select=$('hub-sort-youtube');select.value=ytVideoSort;
      select.addEventListener('change',()=>{
        if(!YT_SORT_OPTIONS.some(x=>x[0]===select.value))return;
        ytVideoSort=select.value;
        try{localStorage.setItem(YT_SORT_KEY,ytVideoSort)}catch{}
        renderPlatform('youtube');
      });
    }
    $(`hub-search-${platform}`).addEventListener('input',()=>renderPlatform(platform));
  }
  function sortYoutubeVideos(a,b){
    const [field,direction]=ytVideoSort.split('_');
    const key=['views','likes','comments'].includes(field)?field:'published';
    const extract=x=>key==='published'?(x.published||''):isFiniteNumber(x[key])?Number(x[key]):null;
    const x=extract(a),y=extract(b);
    const missingX=x===null||x==='',missingY=y===null||y==='';
    // Nieważne, czy rosnąco, czy malejąco: nieznane liczniki/daty zawsze na końcu.
    if(missingX!==missingY)return missingX?1:-1;
    if(!missingX){
      const diff=key==='published'?String(x).localeCompare(String(y)):x-y;
      if(diff)return direction==='asc'?diff:-diff;
    }
    // Remis: nowe filmy najpierw, następnie stabilnie po tytule i ID.
    const da=a.published||'',db=b.published||'';
    if(da!==db)return !da?1:!db?-1:db.localeCompare(da);
    const t=String(a.title||'').localeCompare(String(b.title||''),'pl',{sensitivity:'base'});
    return t||String(a.id||'').localeCompare(String(b.id||''));
  }
  function renderPlatform(platform){const n=numbers(platform),labels=[['Wyświetlenia',n.views],['Polubienia',n.likes],[platform==='youtube'?'Subskrybenci':'Obserwujący',n.followers],['Publikacje',n.posts]];$(`hub-metrics-${platform}`).innerHTML=labels.map(x=>`<div class="hub-kpi"><b>${fmt(x[1])}</b><small>${x[0]}</small></div>`).join('');$(`hub-meta-${platform}`).textContent='Ostatni pomiar: '+reportStamp(platform);
    const query=norm($(`hub-search-${platform}`).value),list=$(`hub-list-${platform}`);
    const items=[...(state.entries[platform]||[])].filter(x=>norm(x.title).includes(query));
    if(platform==='youtube'){
      items.sort(sortYoutubeVideos);
      $('hub-sort-count-youtube').textContent=`Wyświetlane: ${fmt(items.length)} z ${fmt((state.entries.youtube||[]).length)} filmów`;
    }else items.sort((a,b)=>(b.updated||'').localeCompare(a.updated||''));
    list.replaceChildren();
    if(!items.length){list.append(text('p','Nie ma pasujących publikacji. Zaimportuj plik CSV/Excel lub dodaj pierwszy wpis.','muted'));}
    for(const x of items){const wrap=text('div','','hub-entry');const thumb=x.thumb?safeUrl(x.thumb):'';if(thumb){const img=document.createElement('img');img.src=thumb;img.alt='Miniatura';img.loading='lazy';img.referrerPolicy='no-referrer';wrap.append(img)}
      const body=text('div','','hub-entry-body'),title=text('b',x.title);body.append(title,text('small',`${x.published||'Bez daty'} • ${x.source} • ${x.updated?.slice(0,10)||'—'}`,'muted'));
      const counters=text('div','', 'hub-counts');for(const [name,key] of [['Wyśw.','views'],['Lajki','likes'],['Koment.','comments'],['Udost.','shares'],['Zasięg','reach']])counters.append(text('span',`${name}: ${fmt(x[key])}`));body.append(counters);
      const all=state.measurements.filter(m=>m.platform===platform&&m.id===x.id&&isFiniteNumber(m.views)).sort((a,b)=>a.at.localeCompare(b.at));const dv=all.length>=2?Number(all.at(-1).views)-Number(all.at(-2).views):null;body.append(text('small','Zmiana od poprzedniego pomiaru: '+(dv===null?'brak porównywalnego pomiaru':(dv>0?'+':'')+fmt(dv)),'muted'));
      if(x.link){const a=document.createElement('a');a.href=x.link;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Otwórz publikację ↗';body.append(a)}wrap.append(body);list.append(wrap)}
    const history=state.measurements.filter(x=>x.platform===platform&&x.id!=='konto'&&isFiniteNumber(x.views));const grouped=new Map();for(const h of history){const d=h.at.slice(0,10),prior=grouped.get(d)||new Map();prior.set(h.id,h.views);grouped.set(d,prior)}
    const points=[...grouped.keys()].sort().map(d=>{let total=0,seen=0;for(const x of state.entries[platform]||[]){const hist=state.measurements.filter(m=>m.platform===platform&&m.id===x.id&&m.at.slice(0,10)<=d&&isFiniteNumber(m.views)).sort((a,b)=>b.at.localeCompare(a.at));if(hist.length){total+=hist[0].views;seen++;}}return {at:d,views:seen?total:null}});chart(`hub-chart-${platform}`,points);
  }
  async function importFiles(platform,files){let count=0,errors=[];for(const f of files){try{const rows=await loadTable(f);let n;if(platform==='spotify')n=importSpotifyRows(rows,f.name);else if(platform==='distrokid')n=importFinance(rows,f.name);else n=importSocial(platform,rows,f.name);count+=n}catch(e){errors.push(f.name+': '+e.message)}}renderAll();message(count?`Zaimportowano ${count} wierszy z ${files.length} plików.${errors.length?' Uwaga: '+errors.join('; '):''}`:'Nie udało się zaimportować: '+errors.join('; '),count>0)}
  async function refreshYoutubeStats(){
    const core=window.DJSEBA_CORE;if(!core?.isConnected()){message('Najpierw połącz konto YouTube.');return}
    message('Pobieram statystyki Twojego kanału YouTube...');
    const channels=await core.api('channels',{part:'id,statistics,contentDetails',mine:'true'});const channel=(channels.items||[]).find(x=>x.id===core.channelId);if(!channel)throw Error('Konto nie ma dostępu do kanału DJ SEBA.');
    const stat=channel.statistics||{};setAccount('youtube',number(stat.subscriberCount),'Automatyczne API YouTube');
    const uploads=channel.contentDetails?.relatedPlaylists?.uploads;if(!uploads)throw Error('Brak playlisty przesłanych filmów.');
    let page='',ids=[],iterations=0;do{const r=await core.api('playlistItems',{part:'contentDetails,snippet',playlistId:uploads,maxResults:50,...(page?{pageToken:page}:{})});ids.push(...(r.items||[]).map(v=>v.contentDetails?.videoId).filter(Boolean));page=r.nextPageToken||'';iterations++;}while(page&&iterations<40);
    for(let i=0;i<ids.length;i+=50){const r=await core.api('videos',{part:'statistics,snippet',id:ids.slice(i,i+50).join(',')});for(const v of r.items||[]){const a=v.statistics||{},sn=v.snippet||{};upsert('youtube',{id:v.id,title:sn.title||v.id,published:sn.publishedAt||'',thumb:sn.thumbnails?.default?.url||'',link:'https://www.youtube.com/watch?v='+v.id,views:number(a.viewCount),likes:number(a.likeCount),comments:number(a.commentCount)},'Automatyczne API YouTube')}}
    if(!ids.length){snapshot('youtube','konto',{followers:number(stat.subscriberCount),views:number(stat.viewCount)},'Automatyczne API YouTube')}
    save();renderAll();message(`YouTube: zaktualizowano ${ids.length} filmów. ${page?'Pozostałe filmy wymagają kolejnego pobrania.':'Dane dostępne z API.'}`);
  }
  function refreshCommentStatus(comments){state.commentsPending=comments.filter(x=>!x.answered&&!x.unknown).length;state.commentsLoaded=comments.length;save();if(ready)renderDashboard()}
  function ingestComments(comments,previousCheck,older){const current=now();if(!older){if(previousCheck){state.commentsNew=comments.filter(x=>x.published&&x.published>previousCheck).length}else state.commentsNew=0;state.lastCommentsCheck=current}state.commentsLoaded=comments.length;state.commentsPending=comments.filter(x=>!x.answered&&!x.unknown).length;state.commentsAt=current;state.commentsApi='Automatyczne API YouTube';save();renderDashboard()}
  function platformTotalHistory(platform){
    const metric=platform==='spotify'?'streams':'views';
    const history=state.measurements.filter(x=>x.platform===platform&&x.id!=='konto'&&isFiniteNumber(x[metric]));
    if(!history.length)return [];
    const days=[...new Set(history.map(x=>x.at.slice(0,10)))].sort();
    return days.map(d=>{
      const byId=new Map();for(const x of history.filter(h=>h.at.slice(0,10)<=d).sort((a,b)=>a.at.localeCompare(b.at)))byId.set(x.id,Number(x[metric]));
      return {at:d,value:[...byId.values()].reduce((sum,v)=>sum+v,0)};
    });
  }
  function platformGrowthView(platform){
    const hist=platformTotalHistory(platform),n=hist.length?hist.at(-1):null;
    const names={1:'Dzień',7:'Tydzień',30:'Miesiąc',365:'Rok'};
    $('hub-growth').innerHTML=[1,7,30,365].map(d=>{
      const prev=n?hist.filter(x=>Date.parse(x.at)<=Date.parse(n.at)-d*86400000).at(-1):null;
      const diff=prev?n.value-prev.value:null;
      return `<span><b>${names[d]}</b><br>${diff===null?'—':(diff>0?'+':'')+fmt(diff)}</span>`;
    }).join('');
    chart('hub-growth-chart',hist.map(x=>({at:x.at,views:x.value})),'views');
  }
  function renderDashboard(){const root=$('hub-platform-cards');if(!root)return;root.replaceChildren();let videoSum=0,videoKnown=0;
    for(const p of PLATFORMS){const n=p==='spotify'?{views:spotifyTracks().length?spotifyTracks().reduce((s,x)=>s+Number(x.streams||0),0):null,posts:spotifyTracks().length,followers:null}:numbers(p);if(p!=='spotify'&&n.views!==null){videoSum+=n.views;videoKnown++;}
      const card=text('div','','hub-kpi');const header=text('b',LABEL[p]);const metric=p==='spotify'?'Odsłuchania – zakres raportów':'Wyświetlenia z dostępnych filmów';card.append(header,text('strong',fmt(n.views)),text('small',metric),text('small','Aktualizacja: '+reportStamp(p),'muted'));root.append(card)}
    $('hub-video-total').textContent=videoKnown?fmt(videoSum):'—';const ts=spotifyTracks();$('hub-stream-total').textContent=ts.length?fmt(ts.reduce((s,x)=>s+Number(x.streams||0),0)):'—';
    const sel=$('hub-growth-platform').value;platformGrowthView(sel);
    const top=[];for(const p of ['youtube','facebook','instagram','tiktok'])for(const e of state.entries[p]||[])if(isFiniteNumber(e.views))top.push({title:e.title,views:e.views,source:p,url:e.link});for(const s of ts)if(isFiniteNumber(s.streams))top.push({title:s.title,views:s.streams,source:'spotify',url:s.url});top.sort((a,b)=>b.views-a.views);
    const tl=$('hub-top');tl.replaceChildren();if(!top.length)tl.append(text('p','Brak pomiarów – zaimportuj pierwsze dane.','muted'));for(const t of top.slice(0,7)){const e=text('div','','hub-top-row');e.append(text('span',`${LABEL[t.source]} · ${t.title}`),text('b',fmt(t.views)));tl.append(e)}
    $('hub-newcomments').textContent=state.commentsAt?`${fmt(state.commentsNew)} nowych od ostatniego sprawdzenia • ${fmt(state.commentsPending)} do odpowiedzi w pobranych wątkach • aktualizacja ${new Date(state.commentsAt).toLocaleString('pl-PL')}`:'Brak synchronizacji komentarzy YouTube w tej sesji.';
  }
  function rolling12(track){const daily=state.spotifyDaily[norm(track.title)]||[];if(daily.length){const cutoff=Date.now()-365*86400000;const n=daily.filter(x=>Date.parse(x.day+'T00:00:00Z')>=cutoff).reduce((s,x)=>s+Number(x.streams||0),0);return {value:n,method:'Suma znanych dni z CSV • częściowe dane',completeness:'częściowy pomiar'}}
    if(isFiniteNumber(track.last12))return {value:Number(track.last12),method:'Raport „12 miesięcy” • '+(track.last12ReportedAt?track.last12ReportedAt.slice(0,10):'data nieznana'),completeness:'raport punktowy'};
    return {value:null,method:'Brak raportu ostatnich 12 miesięcy',completeness:'niezweryfikowany'};
  }
  function renderMonetization(){const tracks=spotifyTracks(),list=$('hub-spotify-list');list.replaceChildren();if(!tracks.length)list.append(text('p','Brak utworów. Zaimportuj Spotify for Artists lub dodaj utwór.','muted'));
    for(const s of tracks){const {value:recent,method,completeness}=rolling12(s),progress=recent===null?0:Math.min(recent/1000*100,100),remaining=recent===null?null:Math.max(0,1000-recent);
      const eligible=recent===null?'Nie można ocenić – brak danych 12m':recent<1000?'Poniżej progu liczbowego':completeness==='częściowy pomiar'?'Próg liczbowy – niepełna historia, wymagane potwierdzenie':'Próg liczbowy osiągnięty – wymóg słuchaczy niezweryfikowany';
      const el1=text('article','','hub-song');const header=text('div','','hub-row hub-between');const title=text('div','','hub-song-title');title.append(text('b',s.title),text('small',`Premiera: ${s.published||'brak daty'} · źródło: ${s.source||'Starszy import'}`,'muted'));header.append(title,text('strong',recent===null?'—':fmt(recent)+' / 1000'));el1.append(header);if(s.playlist)el1.append(text('p','Playlisty / informacje z raportu: '+s.playlist,'hub-small muted'));
      const track=document.createElement('div');track.className='hub-progress';const inner=document.createElement('div');inner.style.width=progress+'%';track.append(inner);el1.append(track);
      const details=text('div','','hub-song-line');details.append(text('span',`Odtworzenia ogółem: ${fmt(s.lifetime)}`),text('span',`Ostatnie 12m: ${fmt(recent)}`),text('span',`Do progu: ${fmt(remaining)}`),text('span',`Słuchacze w raporcie: ${fmt(s.listeners)}`));el1.append(details);
      el1.append(text('p','Status (szacunkowy): '+eligible,'hub-badge'));el1.append(text('p',method,'muted hub-small'));
      const expected=recent===null?null:recent/1000*Number(state.settings.rate||0),ft=text('div','','hub-row hub-between hub-wrap');ft.append(text('span','Symulacja brutto przy założonej stawce: '+(expected===null?'—':cash(expected)),'muted'));
      if(s.url){const a=document.createElement('a');a.href=s.url;a.target='_blank';a.rel='noopener';a.textContent='Otwórz utwór ↗';ft.append(a)}el1.append(ft);list.append(el1)
    }
    const sel=$('hub-spotify-chart-song'),old=sel.value;sel.replaceChildren();for(const s of tracks){const o=document.createElement('option');o.value=norm(s.title);o.textContent=s.title;sel.append(o)}if([...sel.options].some(x=>x.value===old))sel.value=old;renderSpotifyChart();renderPrediction();
  }
  function renderSpotifyChart(){const key=$('hub-spotify-chart-song').value,daily=state.spotifyDaily[key]||[];
    const grouped=new Map();for(const d of daily){const month=d.day.slice(0,7);grouped.set(month,(grouped.get(month)||0)+Number(d.streams||0))}
    const points=[...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([at,streams])=>({at:at+'-01',streams}));chart('hub-spotify-chart',points,'streams');
  }
  function renderPrediction(){const s=state.settings,r=Number(s.rate||0),fx=Number(s.fx||0),n=Math.max(0,Number(s.predStreams||0)),months=Math.max(1,Number(s.months||12));
    const usd=n*r/1000;const rows=[['Miesięcznie',cash(usd),cash(usd*fx,'PLN')],['Rocznie (12 mies.)',cash(usd*12),cash(usd*12*fx,'PLN')],[`W okresie ${months} mies.`,cash(usd*months),cash(usd*months*fx,'PLN')]];
    $('hub-prediction').innerHTML='<div class="hub-table"><table><thead><tr><th>Okres</th><th>USD</th><th>PLN wg założonego kursu</th></tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  function setSettings(){const fields=[['hub-rate','rate'],['hub-fx','fx'],['hub-pred-streams','predStreams'],['hub-months','months']];for(const [id,key] of fields){$(id).value=state.settings[key]??{rate:3,fx:4,predStreams:1000,months:12}[key];$(id).addEventListener('input',()=>{const val=number($(id).value);if(val!==null&&val>=0){state.settings[key]=val;save();renderPrediction()}})} }
  function setupSpotifyForm(){const target=$('hub-spotify-edit').parentElement;const f=text('div','','hub-box hub-manual');f.id='hub-spotify-form';f.hidden=true;f.innerHTML=`<h3>Utwór – dane ręczne</h3><div class="hub-form-grid"><label>Tytuł<input name="title" maxlength="200"></label><label>Data premiery<input type="date" name="published"></label><label>Link Spotify<input type="url" name="url"></label><label>Odtworzenia ogółem (jeśli znane)<input type="number" min="0" name="lifetime"></label><label>Odtworzenia w ostatnich 12 miesiącach<input type="number" min="0" name="last12"></label><label>Słuchacze<input type="number" min="0" name="listeners"></label><label>Playlisty (tekst, opcjonalnie)<input type="text" name="playlist"></label></div><div class="hub-row hub-wrap"><button class="primary" id="hub-save-spotify">Zapisz dane Spotify</button><button class="ghost" id="hub-cancel-spotify">Anuluj</button></div>`;
    target.insertAdjacentElement('afterend',f);$('hub-spotify-edit').addEventListener('click',()=>{f.hidden=false});$('hub-cancel-spotify').addEventListener('click',()=>{f.hidden=true});$('hub-save-spotify').addEventListener('click',()=>{const vals=Object.fromEntries([...f.querySelectorAll('[name]')].map(x=>[x.name,x.value]));if(!vals.title.trim()){message('Uzupełnij tytuł utworu.',false);return}vals.last12=number(vals.last12);vals.lifetime=number(vals.lifetime);vals.listeners=number(vals.listeners);addSpotify(vals,'Wpis ręczny');f.hidden=true;f.querySelectorAll('input').forEach(x=>x.value='');renderAll();message('Zapisano utwór.')});
  }
  function financeRows(){if(state.finance.length)return state.finance;try{const old=JSON.parse(localStorage.getItem('djseba_distro_rows_v09')||'[]');return(Array.isArray(old)?old:[]).map(x=>({id:x.id,track:x.title,amount:Number(x.amount)||0,currency:x.currency||'nieznana',platform:'Nieokreślona',source:'CSV – v1.4',posted:'',available:'',paid:'',fee:null}))}catch{return []}}
  function renderFinance(){const rows=financeRows(),fx=Number(state.settings.fx||4);const byCurr=new Map();for(const r of rows){const c=r.currency||'nieznana';byCurr.set(c,(byCurr.get(c)||0)+Number(r.amount||0))}
    const USD=byCurr.get('USD'),PLN=byCurr.get('PLN'),grossUSD=USD??null,fmtMoney=(v,c)=>v===null?'—':cash(v,c);
    $('hub-fin-stats').innerHTML=[['Wiersze',rows.length],['Przychody USD',fmtMoney(grossUSD,'USD')],['Przychody PLN',fmtMoney(PLN??null,'PLN')],['USD w PLN (symulacja)',grossUSD===null?'—':fmtMoney(grossUSD*fx,'PLN')]].map(([t,v])=>`<div class="hub-kpi"><b>${esc(v)}</b><small>${t}</small></div>`).join('');
    const group=(key)=>{const m=new Map();for(const r of rows){const name=(r[key]||'Nieokreślone')+' • '+(r.currency||'nieznana');m.set(name,(m.get(name)||0)+Number(r.amount||0))}return [...m].sort((a,b)=>b[1]-a[1])};
    const into=(id,data)=>{const el1=$(id);el1.replaceChildren();if(!data.length)el1.append(text('p','Brak danych z Bank DistroKid.','muted'));for(const [name,v] of data.slice(0,30)){const div=text('div','','hub-top-row');div.append(text('span',name),text('b',fmt(v)));el1.append(div)}};into('hub-fin-platform',group('platform'));into('hub-fin-tracks',group('track'));
    const e=$('hub-fin-rows');e.replaceChildren();if(!rows.length)e.append(text('p','Zaimportuj rozliczenia z DistroKid. Nie pokazujemy fikcyjnych przychodów.','muted'));else{
      const w=text('div','','hub-table'),t=document.createElement('table'),headers=['Utwór','Platforma','Kwota','Data księgowania','Dostępne','Wypłata','Źródło'];const head=document.createElement('thead');head.innerHTML='<tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr>';t.append(head);const body=document.createElement('tbody');for(const r of rows.slice(-500).reverse()){const tr=document.createElement('tr');for(const v of [r.track,r.platform,cash(r.amount,r.currency),r.posted||'—',r.available||'—',r.paid||'—',r.source])tr.append(text('td',v));body.append(tr)}t.append(body);w.append(t);e.append(w)}
    const payouts=$('hub-fin-payouts');payouts.replaceChildren();if(!state.payouts.length)payouts.append(text('p','Nie dodano żadnych potwierdzonych wypłat ani odczytów salda.','muted'));for(const p of [...state.payouts].reverse()){const div=text('div','','hub-top-row');div.append(text('span',`${p.kind==='saldo'?'Saldo':'Wypłata'} • ${p.date||'data nieznana'} • ${p.source}`),text('b',`${cash(p.amount,p.currency)}${p.kind==='wyplata'&&isFiniteNumber(p.fee)?' · opłata: '+cash(p.fee,p.currency):''}`));payouts.append(div)}
    const groupedByPeriod=(length)=>{const map=new Map();for(const r of rows){if(!r.posted)continue;const period=r.posted.slice(0,length),key=period+' • '+(r.currency||'nieznana');map.set(key,(map.get(key)||0)+Number(r.amount||0))}return [...map].sort((a,b)=>a[0].localeCompare(b[0]))};into('hub-fin-month',groupedByPeriod(7));into('hub-fin-year',groupedByPeriod(4));
  }
  function setupPayoutForm(){const parent=$('hub-add-payout').closest('.hub-row');const f=text('div','','hub-box hub-manual');f.id='hub-payout-form';f.hidden=true;f.innerHTML=`<h3>Wypłata lub stan salda z DistroKid Bank</h3><div class="hub-form-grid"><label>Rodzaj<select name="kind"><option value="saldo">Saldo dostępne</option><option value="wyplata">Wypłata</option></select></label><label>Data odczytu / wypłaty<input type="date" name="date"></label><label>Kwota<input type="number" step="0.01" name="amount"></label><label>Waluta<select name="currency"><option>USD</option><option>PLN</option><option>EUR</option></select></label><label>Opłata za wypłatę<input type="number" step="0.01" min="0" name="fee"></label><label>Źródło / uwagi<input maxlength="150" name="source" value="Wpis ręczny – DistroKid Bank"></label></div><div class="hub-row hub-wrap"><button id="hub-save-payout" class="primary">Zapisz wpis</button><button id="hub-cancel-payout" class="ghost">Anuluj</button></div>`;parent.insertAdjacentElement('afterend',f);
    $('hub-add-payout').addEventListener('click',()=>{f.hidden=false});$('hub-cancel-payout').addEventListener('click',()=>{f.hidden=true});$('hub-save-payout').addEventListener('click',()=>{const v=Object.fromEntries([...f.querySelectorAll('[name]')].map(x=>[x.name,x.value]));const amount=number(v.amount),fee=number(v.fee);if(amount===null){message('Wprowadź poprawną kwotę.',false);return}state.payouts.push({...v,amount,fee,date:dateFrom(v.date),added:now()});save();renderFinance();f.hidden=true;message('Zapisano potwierdzoną kwotę.')});
  }
  function renderAll(){if(!ready)return;renderDashboard();for(const p of ['youtube','facebook','instagram','tiktok'])renderPlatform(p);renderMonetization();renderFinance();}
  function ingestYoutube(items,source){for(const item of items)upsert('youtube',item,source);renderAll();}
  function updatePlatformStatsIfAuthorized(){refreshYoutubeStats().catch(e=>message('YouTube: '+e.message,false))}
  function restoreState(backup){validate(backup);if(!confirm('Wczytać też dane pięciu platform i nowe raporty v1.5 z kopii? Zastąpi to bieżące dane v1.5 na tym urządzeniu.'))return;state=backup;save();renderAll()}
  window.DJSEBA_HUB={refreshYoutubeStats,ingestYoutube,ingestComments,refreshCommentStatus,getLastCommentCheck:()=>state.lastCommentsCheck,ingestSpotifyBulk,ingestDistroRows,exportState:()=>JSON.parse(JSON.stringify(state)),restoreState};
  function init(){
    ready=true;for(const p of ['youtube','facebook','instagram','tiktok'])renderPlatformEditor(p);
    setupSpotifyForm();setupPayoutForm();setSettings();
    $('hub-growth-platform').addEventListener('change',renderDashboard);$('hub-refresh-youtube').addEventListener('click',updatePlatformStatsIfAuthorized);
    $('hub-refresh').addEventListener('click',async()=>{if(window.DJSEBA_CORE?.isConnected())await updatePlatformStatsIfAuthorized();else {renderAll();message('Odświeżono lokalne raporty. Połącz Google, żeby pobrać dane YouTube; pozostałe platformy wymagają importu.')}});
    $('hub-spotify-files').addEventListener('change',async e=>{await importFiles('spotify',[...e.target.files]);e.target.value=''});
    $('hub-spotify-chart-song').addEventListener('change',renderSpotifyChart);
    $('hub-finance-import').addEventListener('change',async e=>{await importFiles('distrokid',[...e.target.files]);e.target.value=''});
    $('hub-export-fin-csv').addEventListener('click',exportCSV);
    $('hub-export-fin-xlsx').addEventListener('click',exportXlsx);
    const yo=$('refresh');if(yo){const lab=text('label','Import statystyk filmów YouTube CSV / XLSX','hub-upload');const input=document.createElement('input');input.type='file';input.accept='.csv,.xlsx,.xls';input.multiple=true;input.id='hub-youtube-import';lab.append(input);yo.parentElement.append(lab);input.addEventListener('change',async e=>{await importFiles('youtube',[...e.target.files]);e.target.value=''})}
    // Preserve and display the v1.4 Spotify and DistroKid datasets; no reset on update.
    renderAll();
  }
  document.addEventListener('DOMContentLoaded',init);
})();
