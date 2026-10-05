(function(){
  'use strict';
  /* Search Engine v3 — v7.10.149 Phase C2 posting-accelerated production profile.
     Persistent truth: IndexedDB. Runtime accelerator: compact in-memory postings.
     Correctness rule: postings only produce candidates; final matching is exact. */
  var DB='booknote-local-index', VER=9, DOCS='docs', TERMS='terms', META='meta', SECTIONS='sections', SECTION_TERMS='section_terms';
  var dbPromise=null, mem=null, buildPromise=null, searchWorker=null, workerSeq=0, activeWorkerJob=null;

  function open(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise(function(resolve,reject){
      var r=indexedDB.open(DB,VER);
      r.onupgradeneeded=function(){
        var d=r.result;
        if(!d.objectStoreNames.contains(DOCS))d.createObjectStore(DOCS,{keyPath:'id'});
        if(!d.objectStoreNames.contains(TERMS))d.createObjectStore(TERMS,{keyPath:'term'});
        if(!d.objectStoreNames.contains(META))d.createObjectStore(META,{keyPath:'key'});
        if(!d.objectStoreNames.contains(SECTIONS))d.createObjectStore(SECTIONS,{keyPath:'id'});
        if(!d.objectStoreNames.contains(SECTION_TERMS))d.createObjectStore(SECTION_TERMS,{keyPath:'term'});
        /* v6: section/chapter/TOC search index. Existing stores are preserved; section stores are derived and rebuildable.
           No raw BookLibraryDB data is touched by this migration. */
        /* v5: persistent body snapshot. SearchDB is derived/cache data, but the upgrade itself must never clear raw BookLibraryDB data.
           Existing v4 derived records are intentionally rebuilt by ensure() when schema=5 is detected. */
      };
      r.onsuccess=function(){var db=r.result;db.onversionchange=function(){db.close();dbPromise=null;mem=null;};resolve(db);};
      r.onerror=function(){dbPromise=null;reject(r.error||new Error('Search DB open failed'));};
    });
    return dbPromise;
  }

  function bytesToText(bytes){return new TextDecoder('utf-8',{fatal:false}).decode(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes));}
  /* v7.10.135: one normalization contract for query and corpus.
     NFKC handles compatibility/full-width forms; default-ignorable characters
     are removed; whitespace is collapsed. Mapping is kept at grapheme-cluster
     granularity so normalized hits can still be projected back to original text. */
  var INVISIBLE_RE=/[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\u206a-\u206f\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g;
  function normalizeUnit(s){
    var x=String(s==null?'':s);
    try{x=x.normalize('NFKC');}catch(_){}
    x=x.replace(INVISIBLE_RE,'');
    return x.toLocaleLowerCase();
  }
  function graphemes(s){
    var str=String(s==null?'':s),out=[];
    try{
      if(typeof Intl!=='undefined'&&Intl.Segmenter){
        var seg=new Intl.Segmenter(undefined,{granularity:'grapheme'});
        for(var it=seg.segment(str)[Symbol.iterator](),step;!(step=it.next()).done;)out.push({text:step.value.segment,start:step.value.index,end:step.value.index+step.value.segment.length});
        return out;
      }
    }catch(_){}
    for(var i=0;i<str.length;){var cp=str.codePointAt(i),len=cp>0xffff?2:1;out.push({text:str.slice(i,i+len),start:i,end:i+len});i+=len;}
    return out;
  }
  function normalize(s){
    var gs=graphemes(s),out='',pendingSpace=false;
    for(var i=0;i<gs.length;i++){
      var x=normalizeUnit(gs[i].text);
      if(/\s/.test(x)){if(out)pendingSpace=true;continue;}
      if(pendingSpace){out+=' ';pendingSpace=false;}
      out+=x;
    }
    return out.trim();
  }
  function normalizedWithMap(s){
    var str=String(s==null?'':s),gs=graphemes(str),out='',mapStart=[],mapEnd=[],pendingSpace=false,pendingStart=-1,pendingEnd=-1;
    for(var i=0;i<gs.length;i++){
      var g=gs[i],x=normalizeUnit(g.text);
      if(!x)continue;
      if(/\s/.test(x)){
        if(out&&!pendingSpace){pendingSpace=true;pendingStart=g.start;pendingEnd=g.end;}
        continue;
      }
      if(pendingSpace){out+=' ';mapStart.push(pendingStart);mapEnd.push(pendingEnd);pendingSpace=false;}
      out+=x;for(var j=0;j<x.length;j++){mapStart.push(g.start);mapEnd.push(g.end);}
    }
    while(out.endsWith(' ')){out=out.slice(0,-1);mapStart.pop();mapEnd.pop();}
    return {text:out,map:mapStart,mapEnd:mapEnd};
  }
  function isCjk(ch){return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(ch);}
  var segmenter=null;
  function getSegmenter(){
    if(segmenter!==null)return segmenter;
    try{segmenter=(typeof Intl!=='undefined'&&Intl.Segmenter)?new Intl.Segmenter(undefined,{granularity:'word'}):false;}catch(_){segmenter=false;}
    return segmenter;
  }
  function terms(s){
    s=normalize(s);var out=[],seen=Object.create(null);
    function add(x){x=String(x||'');if(!x||seen[x])return;seen[x]=1;out.push(x);}
    var seg=getSegmenter();
    if(seg){try{for(var it=seg.segment(s)[Symbol.iterator](),step;!(step=it.next()).done;){var x=step.value;if(x.isWordLike)add(x.segment);}}catch(_){ }}
    (s.match(/[a-z0-9][a-z0-9_'-]*/g)||[]).forEach(add);
    var run=[];
    function flushRun(){if(!run.length)return;for(var x=0;x<run.length;x++)add(run[x]);for(var y=0;y<run.length-1;y++)add(run[y]+run[y+1]);run=[];}
    for(var i=0;i<s.length;i++){var ch=s.charAt(i);if(isCjk(ch))run.push(ch);else flushRun();}flushRun();
    /* Keep non-CJK short/mixed strings searchable even when segmentation is unavailable. */
    if(!out.length&&s)add(s);
    return out;
  }
  function bookText(n){return [n.documentTitle,n.name,n.documentAuthor,n.documentPublisher,n.documentDescription,n.category,n.documentFileName].filter(Boolean).join('\n');}
  function bookBodyText(n){return String(n.documentOriginalText||n.noteText||'');}
  async function loadBookContent(id){if(globalThis.BookLibraryDB){var c=await BookLibraryDB.getContent(id);return c?String(c.text||''):'';}return '';}
  function annotationText(a){return [a.text,a.note,a.chapterLabel,(a.tags||[]).join(' ')].filter(Boolean).join('\n');}
  function allAnnotations(){return globalThis.BookNoteAnnotations?BookNoteAnnotations.list().catch(function(){return [];}):Promise.resolve([]);}
  function hash(s){var h=2166136261; s=String(s||'');for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);h=h>>>0;}return ('00000000'+h.toString(16)).slice(-8);}
  function signature(books,annotations){
    var a=(books||[]).map(function(n){return 'b:'+String(n.id)+'|'+String(n.updatedAt||n.createdAt||'')+'|m:'+hash(bookText(n));});
    var b=(annotations||[]).map(function(n){return 'a:'+String(n.id)+'|'+String(n.updatedAt||n.createdAt||'')+'|'+hash(annotationText(n));});
    return a.concat(b).sort().join('§');
  }
  function stamp(v){var n=Number(v);if(Number.isFinite(n))return n;var t=Date.parse(String(v||''));return Number.isFinite(t)?t:0;}
  function yieldNow(){return new Promise(function(resolve){setTimeout(resolve,0);});}
  var MAX_STORED_MATCHES_PER_BOOK=256;
  /* Display samples may remain bounded, but complete compact positions are authoritative. */
  var BIGRAM_BITS=65536, BIGRAM_BYTES=BIGRAM_BITS>>>3;
  function hashBigram(a,b,seed){var h=(2166136261^seed)>>>0;h^=a;h=Math.imul(h,16777619);h^=b;h=Math.imul(h,16777619);h^=h>>>13;h=Math.imul(h,0x85ebca6b);h^=h>>>16;return h>>>0;}
  function setBit(bits,idx){bits[idx>>>3]|=1<<(idx&7);}
  function hasBit(bits,idx){return (bits[idx>>>3]&(1<<(idx&7)))!==0;}
  function buildBigramBits(text){var t=normalize(text),bits=new Uint8Array(BIGRAM_BYTES);for(var i=0;i<t.length-1;i++){var a=t.charCodeAt(i),b=t.charCodeAt(i+1);setBit(bits,hashBigram(a,b,0)%BIGRAM_BITS);setBit(bits,hashBigram(a,b,0x9e3779b9)%BIGRAM_BITS);}return bits.buffer;}
  function hasBigram(bits,a,b){return hasBit(bits,hashBigram(a,b,0)%BIGRAM_BITS)&&hasBit(bits,hashBigram(a,b,0x9e3779b9)%BIGRAM_BITS);}
  function buildBigramPostingIndex(docs,bookCount){
    var words=Math.max(1,Math.ceil(Math.max(0,bookCount)/32));
    var postings=new Uint32Array(BIGRAM_BITS*words);
    for(var i=0;i<docs.length;i++){
      var rec=docs[i];
      if(!rec||rec.kind!=="book"||rec.ordinal>=bookCount||!rec.bigramBits)continue;
      var bits=rec.bigramBits instanceof ArrayBuffer?new Uint8Array(rec.bigramBits):new Uint8Array(rec.bigramBits.buffer,rec.bigramBits.byteOffset||0,rec.bigramBits.byteLength);
      var ord=Number(rec.ordinal)||0,word=ord>>>5,mask=1<<(ord&31);
      for(var byte=0;byte<bits.length;byte++){
        var v=bits[byte];if(!v)continue;
        for(var bit=0;bit<8;bit++){if(!(v&(1<<bit)))continue;var idx=(byte<<3)+bit;if(idx>=BIGRAM_BITS)continue;postings[idx*words+word]|=mask;}
      }
    }
    return {data:postings,words:words,bookCount:bookCount};
  }
  function postingCount(data,words,bit,bookCount){
    var total=0,wordsN=Math.max(1,Math.ceil(bookCount/32));
    for(var w=0;w<wordsN;w++){var v=data[bit*words+w]>>>0;if(w===wordsN-1&&bookCount%32)v&=(1<<(bookCount%32))-1;total+=popcount32(v);}
    return total;
  }
  function popcount32(x){x=x>>>0;x=x-((x>>>1)&0x55555555);x=(x&0x33333333)+((x>>>2)&0x33333333);return (((x+(x>>>4))&0x0F0F0F0F)*0x01010101)>>>24;}
  function intersectPostingTerms(ranked,postings,words,bookCount){
    var wordsN=Math.max(1,Math.ceil(bookCount/32)),out=new Uint32Array(wordsN);
    for(var w=0;w<wordsN;w++){var v=0xFFFFFFFF;if(w===wordsN-1&&bookCount%32)v=(1<<(bookCount%32))-1;for(var i=0;i<ranked.length;i++){var a=ranked[i].a,b=ranked[i].b;v&=postings[a*words+w];v&=postings[b*words+w];if(v===0)break;}out[w]=v>>>0;}
    return out;
  }
  function postingBookIds(bits,bookCount,books){
    var ids=new Set();for(var w=0;w<bits.length;w++){var v=bits[w]>>>0;while(v){var lsb=v&-v,bit=31-Math.clz32(lsb>>>0),ord=(w<<5)+bit;if(ord<bookCount&&books[ord]&&books[ord].id)ids.add(String(books[ord].id));v=(v-lsb)>>>0;}}return ids;
  }
  function queryCovered(bits,nq){for(var i=0;i<nq.length-1;i++)if(!hasBigram(bits,nq.charCodeAt(i),nq.charCodeAt(i+1)))return false;return true;}
  async function makeRecord(n,ord){
    var body=await loadBookContent(n.id), text=bookText(n), content=null, chapters=[];
    try{content=globalThis.BookLibraryDB?await BookLibraryDB.getContent(n.id):null;chapters=content&&Array.isArray(content.chapters)?content.chapters.map(function(ch,i){return {index:Number(ch.index!=null?ch.index:i),label:String(ch.label||''),href:String(ch.href||''),textStart:Number(ch.textStart||0),textEnd:Number(ch.textEnd!=null?ch.textEnd:body.length||0)};}):[];}catch(_){chapters=[];}
    return {id:'book:'+String(n.id),ordinal:ord,kind:'book',bookId:String(n.id),title:String(n.documentTitle||n.name||n.documentFileName||''),author:String(n.documentAuthor||''),format:String(n.documentFormat||''),text:text,bodyText:body,bodyUpdatedAt:String(n.updatedAt||n.createdAt||''),bodyHash:hash(body),chapters:chapters};
  }
  function makeSectionRecords(rec,startOrd){
    var body=String(rec.bodyText||''),chs=Array.isArray(rec.chapters)?rec.chapters:[],out=[];
    if(!chs.length){
      if(body.trim())out.push({id:'section:'+rec.bookId+':0',ordinal:startOrd,kind:'book',bookId:rec.bookId,title:rec.title,author:rec.author,format:rec.format,text:'',bodyText:body,bodyUpdatedAt:rec.bodyUpdatedAt,bodyHash:hash(body),chapterIndex:0,chapterLabel:'',href:'',textStart:0,textEnd:body.length});
      return out;
    }
    for(var i=0;i<chs.length;i++){
      var ch=chs[i],st=Math.max(0,Number(ch.textStart)||0),en=Number(ch.textEnd);
      if(!Number.isFinite(en)||en<=st)en=i<chs.length-1?Math.max(st,Number(chs[i+1].textStart)||st):body.length;
      en=Math.min(body.length,Math.max(st,en));
      var txt=body.slice(st,en);
      if(!txt.trim())continue;
      out.push({id:'section:'+rec.bookId+':'+String(ch.index!=null?ch.index:i),ordinal:startOrd+out.length,kind:'book',bookId:rec.bookId,title:rec.title,author:rec.author,format:rec.format,text:'',bodyText:txt,bodyUpdatedAt:rec.bodyUpdatedAt,bodyHash:hash(txt),chapterIndex:Number(ch.index!=null?ch.index:i),chapterLabel:String(ch.label||''),href:String(ch.href||''),textStart:st,textEnd:en});
    }
    return out;
  }
  function makeAnnotationRecord(a,ord){
    var text=annotationText(a);
    return {id:'annotation:'+String(a.id),ordinal:ord,kind:'annotation',annotationId:String(a.id),bookId:String(a.bookId||''),type:String(a.type||'note'),title:String(a.chapterLabel||''),author:'',format:'',text:text,bodyText:text,updatedAt:String(a.updatedAt||a.createdAt||'')};
  }
  function bigramTerms(s){
    /* Lightweight recall index: every normalized 2-code-unit window is a
       necessary condition for any 2-10 character exact phrase. We deliberately
       do NOT store full book bodies, sections, or Intl.Segmenter output here. */
    var t=normalize(s),out=[],seen=new Set();
    if(t.length<2)return out;
    for(var i=0;i<t.length-1;i++){
      var g=t.slice(i,i+2);if(!seen.has(g)){seen.add(g);out.push(g);}
    }
    return out;
  }
  async function clearAndBuild(books,annotations){
    if(buildPromise)return buildPromise;
    buildPromise=(async function(){
      var db=await open(),records=[],listBooks=books||[],listAnnotations=annotations||[],ord=0;
      /* Fixed-size per-book Bloom-style bitsets: collisions only create false positives.
         They can never create false negatives because every stored/query bigram uses the
         same deterministic hashes. This keeps the index memory bounded even for very large books. */
      for(var i=0;i<listBooks.length;i++){
        var n=listBooks[i],body='';
        try{body=await loadBookContent(n.id);}catch(_){body='';}
        var rec={id:'book:'+String(n.id),ordinal:ord,kind:'book',bookId:String(n.id),title:String(n.documentTitle||n.name||n.documentFileName||''),author:String(n.documentAuthor||''),format:String(n.documentFormat||''),text:bookText(n),bodyText:'',bodyUpdatedAt:String(n.updatedAt||n.createdAt||''),bodyHash:hash(body),chapters:[],bigramBits:buildBigramBits(body)};
        records.push(rec);ord++;
        body='';
        if((i%1)===0)await yieldNow();
      }
      /* Annotation search remains supported, but annotations are tiny compared with books. */
      for(var j=0;j<listAnnotations.length;j++){
        var ar=listAnnotations[j],txt=annotationText(ar);
        if(txt.trim()){
          var arec={id:'annotation:'+String(ar.id),ordinal:ord,kind:'annotation',annotationId:String(ar.id),bookId:String(ar.bookId||''),title:String(ar.chapterLabel||''),updatedAt:String(ar.updatedAt||ar.createdAt||''),bigramBits:buildBigramBits(txt)};
          records.push(arec);ord++;
        }
        if((j%10)===9)await yieldNow();
      }
      var sig=signature(listBooks,listAnnotations),t=db.transaction([DOCS,TERMS,META,SECTIONS,SECTION_TERMS],'readwrite'),d=t.objectStore(DOCS),tm=t.objectStore(TERMS),m=t.objectStore(META),sd=t.objectStore(SECTIONS),stm=t.objectStore(SECTION_TERMS);
      d.clear();tm.clear();sd.clear();stm.clear();
      records.forEach(function(rec){d.put(rec);});
      var meta={key:'version',schema:9,bookCount:listBooks.length,annotationCount:listAnnotations.length,signature:sig,builtAt:Date.now(),docCount:records.length,termCount:0,sectionCount:0,sectionTermCount:0,bodySnapshot:false,compactBigramIndexV2:true,bigramBits:BIGRAM_BITS};
      m.put(meta);
      await new Promise(function(resolve,reject){t.oncomplete=function(){resolve();};t.onerror=function(){reject(t.error||new Error('Search index build failed'));};t.onabort=function(){reject(t.error||new Error('Search index build aborted'));}});
      mem={docs:records,sections:[],docById:new Map(),sectionByOrdinal:new Map(),postings:new Map(),sectionPostings:new Map(),docCount:records.length,termCount:0,sectionCount:0,signature:sig,builtAt:meta.builtAt,bigramBits:BIGRAM_BITS,bigramPostingIndex:null};
      records.forEach(function(r){mem.docById.set(r.id,r);});
      return records.length;
    })().finally(function(){buildPromise=null;});
    return buildPromise;
  }
  async function loadMemory(){
    if(mem)return mem;
    var db=await open();
    var data=await new Promise(function(resolve,reject){
      var t=db.transaction([DOCS,TERMS,META],'readonly'),d=t.objectStore(DOCS),m=t.objectStore(META),docs,meta;
      var rd=d.getAll(),rm=m.get('version');
      rd.onsuccess=function(){docs=rd.result||[];};rm.onsuccess=function(){meta=rm.result||{};};
      t.oncomplete=function(){resolve({docs:docs||[],meta:meta||{}});};
      t.onerror=function(){reject(t.error||new Error('Search index load failed'));};
    });
    mem={docs:data.docs,sections:[],docById:new Map(),sectionByOrdinal:new Map(),postings:new Map(),sectionPostings:new Map(),docCount:data.docs.length,termCount:0,sectionCount:0,signature:String(data.meta.signature||''),builtAt:Number(data.meta.builtAt)||0,bigramBits:Number(data.meta.bigramBits)||BIGRAM_BITS,bigramPostingIndex:null};
    data.docs.forEach(function(r){mem.docById.set(r.id,r);});
    return mem;
  }
  function bitmapAnd(lists){
    if(!lists.length)return null;
    var bits=lists[0]||BigInt(0);for(var i=1;i<lists.length;i++){bits=bits&(lists[i]||BigInt(0));if(bits===BigInt(0))break;}return bits;
  }
  function terminateSearchWorker(){
    /* Lifecycle invariant: never abandon a pending worker Promise.
       Worker.terminate() stops the worker immediately, so settle the active
       job first; otherwise the caller can remain pending forever. */
    if(activeWorkerJob){
      var job=activeWorkerJob;
      activeWorkerJob=null;
      try{job.reject(new DOMException('Search worker terminated','AbortError'));}
      catch(_){try{job.reject(new Error('Search worker terminated'));}catch(__){}}
    }
    if(searchWorker){try{searchWorker.terminate();}catch(_){}searchWorker=null;}
  }
  function getSearchWorker(){
    if(searchWorker)return searchWorker;
    try{searchWorker=new Worker('js/booknote-search-worker.js');}
    catch(_){searchWorker=null;return null;}
    searchWorker.onmessage=function(ev){
      var d=ev&&ev.data||{};
      if(!activeWorkerJob||d.id!==activeWorkerJob.id)return;
      var job=activeWorkerJob;activeWorkerJob=null;
      if(d.type==='exact-success')job.resolve({starts:d.starts||new Uint32Array(0),ends:d.ends||new Uint32Array(0),count:Number(d.count)||0});
      else if(d.type==='error')job.reject(new Error(d.message||'Search worker error'));
    };
    searchWorker.onerror=function(e){if(activeWorkerJob){var job=activeWorkerJob;activeWorkerJob=null;job.reject(e&&e.error||new Error('Search worker failed'));}terminateSearchWorker();};
    return searchWorker;
  }
  function workerExactMatches(text,q){
    var worker=getSearchWorker();
    if(!worker)return Promise.reject(new Error('SEARCH_WORKER_UNAVAILABLE'));
    if(activeWorkerJob){terminateSearchWorker();worker=getSearchWorker();}
    var id='exact-'+(++workerSeq);
    return new Promise(function(resolve,reject){
      activeWorkerJob={id:id,resolve:resolve,reject:reject};
      try{worker.postMessage({type:'search',id:id,payload:{mode:'exact-normalized',text:String(text==null?'':text),query:String(q==null?'':q),limit:Infinity}});}
      catch(e){activeWorkerJob=null;reject(e);}
    });
  }

  function findMatchPositions(text,q){
    /* Phase A: one authoritative normalization pass per book. Positions are kept
       in compact typed arrays so search does not allocate one JS object per hit.
       The result is complete; there is deliberately no occurrence cap here. */
    var source=String(text==null?'':text),nm=normalizedWithMap(source),nq=normalize(q),starts=[],ends=[],from=0,p;
    if(!nq)return {starts:new Uint32Array(0),ends:new Uint32Array(0),count:0};
    while((p=nm.text.indexOf(nq,from))>=0){
      var endPos=p+nq.length-1;
      starts.push(Number(nm.map[p]||0));
      ends.push(Number(endPos<nm.mapEnd.length?nm.mapEnd[endPos]:source.length));
      from=p+1;
    }
    var sa=new Uint32Array(starts.length),ea=new Uint32Array(ends.length);
    for(var i=0;i<starts.length;i++){sa[i]=starts[i]>>>0;ea[i]=ends[i]>>>0;}
    starts=null;ends=null;nm=null;
    return {starts:sa,ends:ea,count:sa.length};
  }
  function matchesFromPositions(text,positions,max){
    var source=String(text==null?'':text),starts=positions&&positions.starts||new Uint32Array(0),ends=positions&&positions.ends||new Uint32Array(0),cap=max==null?Infinity:Math.max(0,Number(max)),out=[],n=Math.min(starts.length,ends.length);
    for(var i=0;i<n&&out.length<cap;i++){var st=starts[i]>>>0,en=ends[i]>>>0;out.push({start:st,end:en,text:source.slice(st,en)});}
    out.totalCount=n;out.truncated=n>out.length;return out;
  }
  function exactMatches(text,q,max){return findMatches(text,q,max);}
  function findMatches(text,q,max){
    var pos=findMatchPositions(text,q),out=matchesFromPositions(text,pos,max);
    /* Keep the complete compact coordinates attached for downstream paragraph
       extraction and diagnostics; callers that only need the display sample can
       continue using the normal array interface. */
    out.positions=pos;return out;
  }
  async function resultFor(rec,q){
    var content=null;
    var body=String(rec.bodyText||'');
    var bodyMatches=exactMatches(body,q,20);if(!bodyMatches.length)bodyMatches=findMatches(body,q,20);var metaMatches=[];
    if(!bodyMatches.length&&rec.kind==='book')metaMatches=findMatches(rec.text||'',q,10);
    var matches=bodyMatches.length?bodyMatches:metaMatches;if(!matches.length)return null;
    var first=matches[0],src=bodyMatches.length?'body':'metadata',sourceText=bodyMatches.length?body:(rec.text||'');
    var nm=normalizedWithMap(sourceText),normStart=nm.text.indexOf(normalize(q)),normEnd=normStart<0?0:normStart+normalize(q).length;
    var snippetStart=Math.max(0,normStart<0?0:normStart-90),snippetEnd=Math.min(nm.text.length,normStart<0?180:normEnd+180),snippet=normStart<0?sourceText.slice(0,180):sourceText.slice(nm.map[snippetStart]||0,(snippetEnd<nm.map.length?nm.map[snippetEnd]+1:sourceText.length));
    var chapterIndex=null,chapterLabel="",chapters=Array.isArray(rec.chapters)?rec.chapters:[];
    if(rec.chapterIndex!=null){chapterIndex=Number(rec.chapterIndex);chapterLabel=String(rec.chapterLabel||'');}else if(src==='body'&&chapters.length){for(var ci=0;ci<chapters.length;ci++){var ch=chapters[ci];if(first.start>=Number(ch.textStart||0)&&first.start<Number(ch.textEnd||0)){chapterIndex=Number(ch.index!=null?ch.index:ci);chapterLabel=String(ch.label||"");break;}}}
    var base=Number(rec.textStart)||0;return Object.assign({},rec,{matchSource:src,matches:matches,matchStart:first.start+base,matchEnd:first.end+base,matchLocalStart:first.start,matchLocalEnd:first.end,matchText:first.text,snippet:snippet,chapterIndex:chapterIndex,chapterLabel:chapterLabel,locator:{version:4,bookId:String(rec.bookId||''),chapterIndex:chapterIndex,chapterLabel:chapterLabel,start:first.start+base,end:first.end+base,quote:first.text}});
  }
  function findParagraphBoundary(chapter,localStart){
    var ps=chapter&&Array.isArray(chapter.paragraphs)?chapter.paragraphs:[];
    if(!ps.length)return -1;
    var x=Math.max(0,Number(localStart)||0),lo=0,hi=ps.length;
    while(lo<hi){var mid=(lo+hi)>>1,p=ps[mid]||{},end=Number(p.end)||0;if(end<=x)lo=mid+1;else hi=mid;}
    if(lo<ps.length){var p0=ps[lo];if(Number(p0.start)<=x&&x<Number(p0.end))return lo;}
    return lo<ps.length?lo:ps.length-1;
  }
  function extractBlockByIndex(html,index){
    if(index<0)return null;var doc=sanitizeExtractHtml(html),root=doc.body||doc,blocks=Array.prototype.slice.call(root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote,li,pre,dt,dd'));if(!blocks.length)blocks=Array.prototype.slice.call(root.children);var b=blocks[index];return b?{html:b.outerHTML,text:String(b.textContent||'')}:null;
  }

  function blockText(el){return String(el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function sanitizeExtractHtml(html){var d=new DOMParser().parseFromString(String(html||''),'text/html');d.querySelectorAll('script,iframe,object,embed,form,link,meta,base').forEach(function(n){n.remove();});d.querySelectorAll('*').forEach(function(n){Array.prototype.slice.call(n.attributes).forEach(function(a){if(/^on/i.test(a.name)||a.name.toLowerCase()==='srcdoc')n.removeAttribute(a.name);});});return d;}
  function extractBlockForOffset(html,localStart,localEnd,matchText,chapterText){
    var doc=sanitizeExtractHtml(html),root=doc.body||doc,blocks=Array.prototype.slice.call(root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote,li,pre,dt,dd'));
    if(!blocks.length)blocks=Array.prototype.slice.call(root.children);
    var targetStart=Math.max(0,Number(localStart)||0),qnorm=normalize(matchText||''),best=null;
    var chapterNorm=normalizedWithMap(String(chapterText||'')),chapterProbe=chapterNorm.text;
    var canonicalTarget=-1;
    if(chapterProbe){
      var rawTarget=targetStart;
      canonicalTarget=Math.max(0,Math.min(chapterProbe.length,rawTarget));
      /* canonical chapter offsets may differ from normalized offsets; locate the nearest normalized position. */
      if(chapterNorm.map&&chapterNorm.map.length){
        var lo=0,hi=chapterNorm.map.length;
        while(lo<hi){var mid=(lo+hi)>>1;if(Number(chapterNorm.map[mid]||0)<rawTarget)lo=mid+1;else hi=mid;}
        canonicalTarget=Math.max(0,Math.min(chapterProbe.length,lo));
      }
    }
    var cursor=0;
    for(var i=0;i<blocks.length;i++){
      var b=blocks[i],raw=String(b.textContent||''),norm=normalize(raw),probe=normalizedWithMap(raw),qpos=qnorm?probe.text.indexOf(qnorm):-1;
      var score=-Infinity;
      if(qnorm&&qpos>=0){
        score=100000;
        /* Build a normalized block coordinate so we can compare with the canonical chapter offset. */
        var blockStart=cursor,blockEnd=cursor+probe.text.length;
        if(canonicalTarget>=0){
          var dist=canonicalTarget<blockStart?blockStart-canonicalTarget:canonicalTarget>blockEnd?canonicalTarget-blockEnd:0;
          score-=Math.min(dist,100000);
        }
        score-=Math.min(Math.abs(qpos),1000)*0.01;
      }
      if(score>-Infinity){
        if(!best||score>best.score)best={score:score,html:b.outerHTML,text:raw};
      }
      cursor+=probe.text.length+1;
    }
    /* 最后的安全条件：摘出的段落必须实际包含命中词组；否则宁可不摘取，也不能产生错误段落。 */
    if(best&&qnorm&&normalize(best.text).indexOf(qnorm)<0)return null;
    return best?{html:best.html,text:best.text}:null;
  }
  function forEachExactMatch(text,q,callback){
    var source=String(text==null?'':text),nm=normalizedWithMap(source),nq=normalize(q),from=0,p,total=0;
    if(!nq)return 0;
    while((p=nm.text.indexOf(nq,from))>=0){
      var endPos=p+nq.length-1,startOrig=nm.map[p],endOrig=endPos<nm.mapEnd.length?nm.mapEnd[endPos]:source.length;
      total++;callback({start:startOrig,end:endOrig,text:source.slice(startOrig,endOrig),ordinal:total});from=p+1;
    }
    return total;
  }
  async function extractParagraphs(results,options){
    options=options||{};
    var limit=Number(options.limit),selected=Array.isArray(results)?(limit>0?results.slice(0,limit):results.slice()):[],out=[],seen=new Set();
    /* Phase A reuses the complete compact match coordinates produced by search.
       This avoids a second full normalization pass over the same book while still
       extracting every matching paragraph. If coordinates are unavailable (legacy
       result), fall back to the authoritative exact rescan. */
    for(var ri=0;ri<selected.length;ri++){
      var r=selected[ri];if(!r||r.kind!=='book'||!r.bookId)continue;
      var bookId=String(r.bookId),content=null,meta=null;
      try{content=await BookLibraryDB.getContent(bookId);meta=await BookLibraryDB.getMeta(bookId);}catch(_){content=null;meta=null;}
      var body=content?String(content.text||''):'';if(!body)continue;
      var chapters=content&&Array.isArray(content.chapters)?content.chapters:[];
      var source=null,sourceLoaded=false,chapterHtmlCache=new Map(),q=String(options.query||r.matchText||'');
      if(!q)q=String(r.matchText||'');
      var processMatch=async function(m){
        var chapterIndex=null,chapterLabel='';
        for(var ci=0;ci<chapters.length;ci++){var ch0=chapters[ci];if(Number(m.start)>=Number(ch0.textStart||0)&&Number(m.start)<Number(ch0.textEnd||body.length)){chapterIndex=Number(ch0.index!=null?ch0.index:ci);chapterLabel=String(ch0.label||'');break;}}
        var ch=chapterIndex==null?null:chapters.find(function(x,idx){return Number(x.index!=null?x.index:idx)===chapterIndex;});
        var html='';
        if(ch&&String(meta&&meta.documentFormat||'').toLowerCase()==='epub'){
          var href=String(ch.href||'');
          if(chapterHtmlCache.has(href))html=chapterHtmlCache.get(href)||'';
          else{
            if(!sourceLoaded){try{source=await BookLibraryDB.getSource(bookId);}catch(_){source=null;}sourceLoaded=true;}
            if(source&&source.blob){var ab=await source.blob.arrayBuffer();var entries=await unzipRequested(ab,href);html=entries?entries.html:'';chapterHtmlCache.set(href,html);entries=null;ab=null;}
          }
        }else if(content)html=String(content.html||'');
        var localStart=Number(m.start)||0,localEnd=Number(m.end)||localStart;
        if(ch){localStart-=Number(ch.textStart||0);localEnd-=Number(ch.textStart||0);}
        var chapterRaw=ch?body.slice(Number(ch.textStart||0),Number(ch.textEnd||body.length)):body;
        var boundaryIndex=ch?findParagraphBoundary(ch,localStart):-1;var block=boundaryIndex>=0?extractBlockByIndex(html,boundaryIndex):null;if(block&&normalize(block.text).indexOf(normalize(String(m.text||r.matchText||q)))<0)block=null;if(!block)block=extractBlockForOffset(html,localStart,localEnd,String(m.text||r.matchText||q),chapterRaw);
        if(block){var key=bookId+'|'+String(chapterIndex)+'|'+normalize(block.text);if(!seen.has(key)){seen.add(key);out.push({bookId:bookId,bookTitle:String(r.title||meta&&meta.documentTitle||meta&&meta.name||''),chapterIndex:chapterIndex,chapterLabel:chapterLabel,start:Number(m.start)||0,end:Number(m.end)||0,paragraphHtml:block.html,paragraphText:block.text,matchText:String(m.text||r.matchText||q)});}}
      };
      /* Stream through matches. Awaiting every match prevents a large Promise.all
         from retaining hundreds/thousands of DOM results at once. */
      var pos=r.matchPositions||null,total=0;
      if(pos&&pos.starts&&pos.ends){
        var npos=Math.min(pos.starts.length,pos.ends.length);
        for(var pi=0;pi<npos;pi++){
          var so=pos.starts[pi]>>>0,eo=pos.ends[pi]>>>0;
          total++;
          await processMatch({start:so,end:eo,text:body.slice(so,eo),ordinal:total});
          if((total%16)===0)await yieldNow();
        }
      }else{
        var nm=normalizedWithMap(body),nq=normalize(q),from=0,p;
        if(nq){
          while((p=nm.text.indexOf(nq,from))>=0){
            var ep=p+nq.length-1,so2=nm.map[p],eo2=ep<nm.mapEnd.length?nm.mapEnd[ep]:body.length;
            total++;await processMatch({start:so2,end:eo2,text:body.slice(so2,eo2),ordinal:total});
            from=p+1;
            if((total%16)===0)await yieldNow();
          }
        }
        nm=null;
      }
      pos=null;body='';source=null;chapterHtmlCache.clear();content=null;meta=null;
      await yieldNow();
    }
    return out;
  }
  async function unzipRequested(buffer,name){
    var view=new DataView(buffer),u8=new Uint8Array(buffer),dec=new TextDecoder('utf-8'),e=-1;
    for(var i=view.byteLength-22;i>=Math.max(0,view.byteLength-65557);i--){if(view.getUint32(i,true)===0x06054b50){e=i;break;}}
    if(e<0)return null;var count=view.getUint16(e+10,true),off=view.getUint32(e+16,true),pos=off;
    function u16(o){return view.getUint16(o,true)}function u32(o){return view.getUint32(o,true)}
    for(var n=0;n<count;n++){if(u32(pos)!==0x02014b50)break;var flags=u16(pos+8),method=u16(pos+10),csize=u32(pos+20),nl=u16(pos+28),el=u16(pos+30),cl=u16(pos+32),lo=u32(pos+42),entry=dec.decode(u8.slice(pos+46,pos+46+nl));pos+=46+nl+el+cl;if(entry!==name)continue;var ln=u16(lo+26),le=u16(lo+28),data=u8.slice(lo+30+ln+le,lo+30+ln+le+csize),raw;if(method===0)raw=data;else if(method===8){var ds=new DecompressionStream('deflate-raw');raw=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer());}else return null;var text=bytesToText(raw);var d=new DOMParser().parseFromString(text,'text/html');return {html:d.body?d.body.innerHTML:text};}
    return null;
  }
  async function getIndexedCandidateBookIds(q, books){
    /* The per-book Bloom-style bitsets remain the durable recall guard. This in-memory
       transposed posting index accelerates AND by query term instead of scanning every
       book for every 2-Gram. Collisions can only add candidates; exact body matching
       remains authoritative, so this layer cannot create false negatives. */
    var m=await loadMemory(),nq=normalize(q),queryTerms=bigramTerms(nq);
    if(nq.length<2||!queryTerms.length)return {ready:true,ids:null,reason:'short-query'};
    var bookCount=books.filter(function(b){return b&&b.id;}).length;
    if(!bookCount)return {ready:true,ids:new Set(),reason:'no-books'};
    if(!m.bigramPostingIndex||m.bigramPostingIndex.bookCount!==bookCount){
      for(var i=0,seen=0;i<books.length;i++){var b=books[i];if(!b||!b.id)continue;var rec=m.docById.get('book:'+String(b.id)),bits=rec&&rec.bigramBits;if(!bits)return {ready:true,ids:null,reason:'index-coverage-unknown'};var u=bits instanceof ArrayBuffer?new Uint8Array(bits):(bits&&bits.buffer instanceof ArrayBuffer?new Uint8Array(bits.buffer,bits.byteOffset||0,bits.byteLength):null);if(!u||u.byteLength!==BIGRAM_BYTES)return {ready:true,ids:null,reason:'index-bitset-invalid'};if(Number(rec.ordinal)!==seen)return {ready:true,ids:null,reason:'index-ordinal-invalid'};seen++;}
      m.bigramPostingIndex=buildBigramPostingIndex(m.docs,bookCount);
    }
    var pi=m.bigramPostingIndex,ranked=[];
    for(var t=0;t<queryTerms.length;t++){
      var term=queryTerms[t],a=hashBigram(term.charCodeAt(0),term.charCodeAt(1),0)%BIGRAM_BITS,b=hashBigram(term.charCodeAt(0),term.charCodeAt(1),0x9e3779b9)%BIGRAM_BITS;
      var ca=postingCount(pi.data,pi.words,a,bookCount),cb=postingCount(pi.data,pi.words,b,bookCount),count=Math.min(ca,cb);
      ranked.push({term:term,a:a,b:b,count:count});
      if(count===0)return {ready:true,ids:new Set(),reason:'posting-empty',termStats:ranked};
    }
    ranked.sort(function(a,b){return a.count-b.count||a.term.localeCompare(b.term);});
    var candidateBits=intersectPostingTerms(ranked,pi.data,pi.words,bookCount);
    var ids=postingBookIds(candidateBits,bookCount,books);
    return {ready:true,ids:ids,reason:'posting-frequency-ordered',termStats:ranked,candidateCount:ids.size};
  }
  async function fullBodySearch(q,books){
    var out=[];
    for(var i=0;i<books.length;i++){
      var meta=books[i];
      if(!meta||!meta.id)continue;
      var content=null;
      try{content=await BookLibraryDB.getContent(String(meta.id));}catch(_){content=null;}
      var body=content?String(content.text||''):'';
      if(body){
        var pos;
        try{pos=await workerExactMatches(body,q);}catch(_){pos=findMatchPositions(body,q);}
        if(pos.count){var matches=matchesFromPositions(body,pos,MAX_STORED_MATCHES_PER_BOOK);var result=makeSearchResult(meta,content,body,matches,q);result.totalMatches=pos.count;result.matchesTruncated=pos.count>matches.length;result.matchPositions=pos;out.push(result);}
      }
      content=null;body='';
      if(i%2===1)await yieldNow();
    }
    return out;
  }
  function makeSearchResult(meta,content,body,matches){
    var first=matches[0],chapters=content&&Array.isArray(content.chapters)?content.chapters:[],chapterIndex=null,chapterLabel='';
    for(var ci=0;ci<chapters.length;ci++){
      var ch=chapters[ci];
      if(first.start>=Number(ch.textStart||0)&&first.start<Number(ch.textEnd||body.length)){
        chapterIndex=Number(ch.index!=null?ch.index:ci);chapterLabel=String(ch.label||'');break;
      }
    }
    /* First-match coordinates are already authoritative; do not normalize the whole body again just to build a snippet. */
    var snippetStart=Math.max(0,Number(first.start||0)-180),snippetEnd=Math.min(body.length,Number(first.end||first.start||0)+180);
    var snippet=body.slice(snippetStart,snippetEnd);
    return {
      id:'book:'+String(meta.id),kind:'book',bookId:String(meta.id),
      title:String(meta.documentTitle||meta.name||meta.documentFileName||''),
      author:String(meta.documentAuthor||''),format:String(meta.documentFormat||''),
      text:'',bodyText:'',chapters:chapters,matchSource:'body',matches:matches,
      matchStart:first.start,matchEnd:first.end,matchLocalStart:first.start,matchLocalEnd:first.end,
      matchText:first.text,snippet:snippet,chapterIndex:chapterIndex,chapterLabel:chapterLabel,
      bodyUpdatedAt:String(content&&content.updatedAt||meta.updatedAt||meta.createdAt||''),
      locator:{version:4,bookId:String(meta.id),chapterIndex:chapterIndex,chapterLabel:chapterLabel,start:first.start,end:first.end,quote:first.text}
    };
  }
  async function search(q,limit){
    terminateSearchWorker();
    q=String(q||'').trim();
    /* 完整性硬规则：limit 不截断匹配书籍；高频词的 occurrence 对象采用有界样本以保护浏览器内存，并保留 totalMatches。 */
    limit=Infinity;
    if(!q||!globalThis.BookLibraryDB)return [];
    var books=await BookLibraryDB.listMeta(),bookById=new Map();
    books.forEach(function(b){if(b&&b.id)bookById.set(String(b.id),b);});

    var candidates=null,indexUsable=false;
    try{
      var c=await getIndexedCandidateBookIds(q,books);
      /* null means the query has no indexable terms (e.g. punctuation), so scan all bodies. */
      if(c&&c.ids!==null){candidates=c.ids;indexUsable=true;}
    }catch(_){
      candidates=null;indexUsable=false;
    }

    /*
     * Completeness safeguard:
     * A candidate index is allowed to accelerate only when its coverage is known
     * complete. ensure() establishes that invariant. If anything is uncertain,
     * search every book. This preserves zero false-negative behavior.
     */
    if(!indexUsable){var fallback=await fullBodySearch(q,books);terminateSearchWorker();return fallback;}

    var out=[];
    for(var i=0;i<books.length;i++){
      var meta=books[i];
      if(!meta||!meta.id||!candidates.has(String(meta.id)))continue;
      var content=null;
      try{content=await BookLibraryDB.getContent(String(meta.id));}catch(_){content=null;}
      var body=content?String(content.text||''):'';
      if(body){
        /* Final authority: exact normalized substring search over the real body. */
        var pos;
        try{pos=await workerExactMatches(body,q);}catch(_){pos=findMatchPositions(body,q);}
        if(pos.count){var matches=matchesFromPositions(body,pos,MAX_STORED_MATCHES_PER_BOOK);var result=makeSearchResult(meta,content,body,matches,q);result.totalMatches=pos.count;result.matchesTruncated=pos.count>matches.length;result.matchPositions=pos;out.push(result);}
      }
      content=null;body='';
      if(i%4===3)await yieldNow();
    }

    /*
     * Defensive zero-false-negative audit: if the index is unexpectedly incomplete
     * for any reason, verify against the full body scan. Normally this is skipped.
     */
    if(indexUsable){
      var idx=await loadMemory(),indexedBooks=new Set();
      idx.docs.forEach(function(d){if(d&&d.kind==='book'&&d.bookId)indexedBooks.add(String(d.bookId));});
      if(indexedBooks.size<books.filter(function(b){return b&&b.id;}).length){
        var fallback2=await fullBodySearch(q,books);terminateSearchWorker();return fallback2;
      }
    }
    terminateSearchWorker();
    return out;
  }
  async function ensure(books){
    if(globalThis.BookLibraryDB&&BookLibraryDB.ensure)await BookLibraryDB.ensure();
    var list=Array.isArray(books)?books:await BookLibraryDB.listMeta();
    var annotations=await allAnnotations();
    var sig=signature(list,annotations),db=await open();
    var meta=await new Promise(function(resolve,reject){var t=db.transaction([META],'readonly'),r=t.objectStore(META).get('version');r.onsuccess=function(){resolve(r.result||{});};r.onerror=function(){reject(r.error);};});
    var valid=Number(meta.schema)===9&&Number(meta.bookCount)===list.length&&String(meta.signature||'')===sig&&meta.compactBigramIndexV2===true&&Number(meta.bigramBits)===BIGRAM_BITS;
    if(valid){mem=null;await loadMemory();return false;}
    mem=null;
    await clearAndBuild(list,annotations);
    return true;
  }
  function rebuild(books){return allAnnotations().then(function(a){mem=null;return clearAndBuild(Array.isArray(books)?books:[],a);});}
  function xmlEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
  function odtInline(node){
    if(node.nodeType===3)return xmlEsc(node.nodeValue||'');
    if(node.nodeType!==1)return '';
    var inner='';Array.prototype.forEach.call(node.childNodes,function(c){inner+=odtInline(c);});
    var t=String(node.tagName||'').toUpperCase();
    if(t==='BR')return '<text:line-break/>';
    if(t==='STRONG'||t==='B')return '<text:span text:style-name="GN_B">'+inner+'</text:span>';
    if(t==='EM'||t==='I')return '<text:span text:style-name="GN_I">'+inner+'</text:span>';
    if(t==='U')return '<text:span text:style-name="GN_U">'+inner+'</text:span>';
    if(t==='S'||t==='DEL')return '<text:span text:style-name="GN_S">'+inner+'</text:span>';
    return inner;
  }
  /* v7.10.142 Formatter Contract
     Canonical pipeline: GroupedResult -> format blocks -> text / ODT.
     The formatter never searches, reorders source paragraphs, or rewrites paragraph text.
     A raw item array is accepted only as a compatibility adapter into GroupedResult. */
  function normalizeGroupedResult(input){
    if(input&&input.kind==='grouped-search-result'&&Array.isArray(input.books))return input;
    var source=Array.isArray(input)?input:[];
    var booksMap=new Map();
    source.forEach(function(x){
      if(!x)return;
      var bk=String(x.bookId||x.bookTitle||'未命名书籍');
      var book=booksMap.get(bk);
      if(!book){book={bookId:bk,title:String(x.bookTitle||'未命名书籍'),chapters:[],_chapterMap:new Map()};booksMap.set(bk,book);}
      var ck=String(x.chapterIndex!=null?x.chapterIndex:(x.chapterLabel||'document'));
      var ch=book._chapterMap.get(ck);
      if(!ch){ch={chapterKey:ck,index:x.chapterIndex!=null?Number(x.chapterIndex):null,label:String(x.chapterLabel||''),paragraphs:[]};book._chapterMap.set(ck,ch);book.chapters.push(ch);}
      var text=String(x.paragraphText==null?'':x.paragraphText);
      if(normalize(text))ch.paragraphs.push({start:x.start!=null?Number(x.start):0,end:x.end!=null?Number(x.end):0,html:String(x.paragraphHtml||''),text:text,matchText:String(x.matchText||'')});
    });
    booksMap.forEach(function(book){
      book.chapters.sort(function(a,b){
        if(a.index!=null&&b.index!=null)return a.index-b.index;
        if(a.index!=null)return -1;
        if(b.index!=null)return 1;
        return String(a.label).localeCompare(String(b.label),'zh-CN');
      });
      delete book._chapterMap;
    });
    return {kind:'grouped-search-result',version:1,query:'',sourceResults:source,books:Array.from(booksMap.values()),paragraphCount:Array.from(booksMap.values()).reduce(function(n,b){return n+b.chapters.reduce(function(m,c){return m+c.paragraphs.length;},0);},0)};
  }
  function buildGroupedResult(results,items,q){
    var source=Array.isArray(results)?results:[],grouped=normalizeGroupedResult(items);
    grouped.query=String(q||'');
    /* Match positions are an internal transport representation. Do not retain
       them in the long-lived UI result once paragraph extraction has completed. */
    grouped.sourceResults=source.map(function(r){var x=Object.assign({},r);delete x.matchPositions;return x;});
    return grouped;
  }
  function formatterBlocks(input){
    var grouped=normalizeGroupedResult(input),blocks=[];
    (grouped.books||[]).forEach(function(book){
      (book.chapters||[]).forEach(function(chapter){
        blocks.push({
          title:String(book.title||'未命名书籍'),
          chapter:String(chapter.label||'未标注章节'),
          paragraphs:(chapter.paragraphs||[]).map(function(p){return {html:String(p.html||''),text:String(p.text==null?'':p.text),matchText:String(p.matchText||'')};})
        });
      });
    });
    return blocks;
  }
  function buildTemplateText(input){
    var blocks=formatterBlocks(input),out=[];
    blocks.forEach(function(block){
      out.push('《'+block.title+'》');
      out.push('章节：'+block.chapter);
      block.paragraphs.forEach(function(p){out.push(p.text);});
      out.push('              《'+block.title+'》');
      out.push('');
    });
    while(out.length&&out[out.length-1]==='')out.pop();
    return out.join('\n');
  }
  
  /* Unified ODT paragraph indentation contract:
     explicit non-zero text-indent -> preserve; missing/zero -> 2em.
     margin-left/padding-left are never converted into indentation.
     Titles/chapters use fixed zero-indent styles. */
  function odtSourceTextIndent(source){
    /* ODF fo:text-indent is a real length. CSS em/rem/ex/% are converted to
       absolute points here because several ODT consumers do not render CSS
       relative units in fo:text-indent. Base font is the export's fixed 12pt. */
    var raw='';
    try{
      if(source&&source.nodeType===1) raw=String(source.getAttribute('style')||'');
      else if(source&&typeof source==='object') raw=String(source.textIndent||source['text-indent']||'');
      else raw=String(source||'');
    }catch(_){raw='';}
    var m=raw.match(/(?:^|;)\s*text-indent\s*:\s*([^;]+)/i);
    if(m)raw=String(m[1]||'').replace(/\s*!important\s*$/i,'').trim();
    else if(source&&source.nodeType===1&&source.style&&source.style.textIndent)raw=String(source.style.textIndent).trim();
    else return '24pt';
    if(!raw||/^(normal|auto|initial|inherit|unset|revert)$/i.test(raw))return '24pt';
    var z=raw.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(px|pt|pc|cm|mm|in|em|rem|ex|%)?$/i);
    if(!z)return '24pt';
    var n=Number(z[1]);if(!Number.isFinite(n)||n===0)return '24pt';
    var unit=(z[2]||'').toLowerCase();
    if(unit==='em'||unit==='rem')return String(n*12)+'pt';
    if(unit==='ex')return String(n*6)+'pt';
    if(unit==='%')return String(n*0.12)+'pt';
    if(unit==='px')return String(n*0.75)+'pt';
    return String(z[1])+(unit||'pt');
  }
  function odtIndentStyleName(indent){return 'BN_P_'+String(indent||'2em').replace(/[^a-zA-Z0-9_.-]/g,'_');}
  function odtParagraphStyle(name,indent,align){
    var pp='fo:text-indent="'+xmlEsc(indent||'2em')+'"';
    if(align)pp+=' fo:text-align="'+align+'"';
    return '<style:style style:name="'+name+'" style:family="paragraph"><style:paragraph-properties '+pp+'/><style:text-properties fo:font-size="12pt"/></style:style>';
  }
function paragraphsToOdtXml(input,q){
    var blocks=formatterBlocks(input),styleMap=new Map(),body=[];
    var grouped=normalizeGroupedResult(input),sourceResults=Array.isArray(grouped.sourceResults)?grouped.sourceResults:[];
    var occurrenceCount=sourceResults.length||blocks.reduce(function(n,b){return n+(b.paragraphs||[]).length;},0);
    var paragraphCount=blocks.reduce(function(n,b){return n+(b.paragraphs||[]).length;},0);
    var sourceBooks=[];
    blocks.forEach(function(b){var t=String(b.title||'未命名书籍').trim();if(t&&sourceBooks.indexOf(t)<0)sourceBooks.push(t);});
    body.push('<text:p text:style-name="BN_STAT">'+xmlEsc('搜索内容：'+String(q||grouped.query||'').trim())+'</text:p>');
    body.push('<text:p text:style-name="BN_STAT">'+xmlEsc('出现次数：共 '+occurrenceCount+' 次')+'</text:p>');
    body.push('<text:p text:style-name="BN_STAT">'+xmlEsc('段落：共 '+paragraphCount+' 段')+'</text:p>');
    body.push('<text:p text:style-name="BN_STAT">'+xmlEsc('分别来自：'+(sourceBooks.length?'全部'+sourceBooks.map(function(t){return '《'+t.replace(/^《|》$/g,'')+'》';}).join('、'):'无'))+'</text:p>');
    body.push('<text:p/>');
    function addIndentStyle(indent){var name=odtIndentStyleName(indent);if(!styleMap.has(name))styleMap.set(name,odtParagraphStyle(name,indent,'start'));return name;}
    blocks.forEach(function(block){
      body.push('<text:p text:style-name="BN_BOOK_START">'+xmlEsc('《'+block.title+'》')+'</text:p>');
      if(block.chapter)body.push('<text:p text:style-name="BN_CHAPTER">'+xmlEsc('章节：'+block.chapter)+'</text:p>');
      block.paragraphs.forEach(function(p){
        var d=new DOMParser().parseFromString(String(p.html||'<p>'+xmlEsc(p.text)+'</p>'),'text/html'),el=d.body&&d.body.firstElementChild;
        if(!el){var nm=addIndentStyle('2em');body.push('<text:p text:style-name="'+nm+'" xml:space="preserve">'+xmlEsc(p.text)+'</text:p>');return;}
        var t=String(el.tagName||'').toUpperCase(),inl=odtInline(el);
        if(/^H[1-6]$/.test(t))body.push('<text:p text:style-name="BN_CHAPTER" xml:space="preserve">'+inl+'</text:p>');
        else {var ind=odtSourceTextIndent(el),nm=addIndentStyle(ind);body.push('<text:p text:style-name="'+nm+'" xml:space="preserve">'+inl+'</text:p>');}
      });
      body.push('<text:p text:style-name="BN_BOOK_END">'+xmlEsc('《'+block.title+'》')+'</text:p>');
    });
    var fixedStyles='<style:style style:name="BN_STAT" style:family="paragraph"><style:paragraph-properties fo:text-indent="0" fo:text-align="start"/><style:text-properties fo:font-size="12pt"/></style:style><style:style style:name="BN_BOOK_START" style:family="paragraph"><style:paragraph-properties fo:text-indent="0" fo:text-align="start"/><style:text-properties fo:font-size="12pt"/></style:style><style:style style:name="BN_CHAPTER" style:family="paragraph"><style:paragraph-properties fo:text-indent="0" fo:text-align="start"/><style:text-properties fo:font-size="12pt"/></style:style><style:style style:name="BN_BOOK_END" style:family="paragraph"><style:paragraph-properties fo:text-indent="0" fo:text-align="end"/><style:text-properties fo:font-size="12pt"/></style:style>'+Array.from(styleMap.values()).join('');
    var content='<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:automatic-styles><style:style style:name="GN_B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style><style:style style:name="GN_I" style:family="text"><style:text-properties fo:font-style="italic"/></style:style><style:style style:name="GN_U" style:family="text"><style:text-properties style:text-underline-style="solid"/></style:style><style:style style:name="GN_S" style:family="text"><style:text-properties style:text-line-through-style="solid"/></style:style>'+fixedStyles+'</office:automatic-styles><office:body><office:text>'+body.join('')+'</office:text></office:body></office:document-content>';
    return content;
  }
function u16(n){return new Uint8Array([n&255,(n>>>8)&255]);}
  function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}
  function cat(){var a=Array.prototype.slice.call(arguments),len=0;a.forEach(function(x){len+=x.length;});var o=new Uint8Array(len),p=0;a.forEach(function(x){o.set(x,p);p+=x.length;});return o;}
  function crc32(data){var c=~0;for(var i=0;i<data.length;i++){c^=data[i];for(var k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return (~c)>>>0;}
  function zipStored(entries){var enc=new TextEncoder(),ls=[],cs=[],off=0;entries.forEach(function(e){var name=enc.encode(e.name),data=e.data instanceof Uint8Array?e.data:enc.encode(e.data),crc=crc32(data),local=cat(new Uint8Array([80,75,3,4]),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data),central=cat(new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(off),name);ls.push(local);cs.push(central);off+=local.length;});var central=cat.apply(null,cs),locals=cat.apply(null,ls);return cat(locals,central,cat(new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(central.length),u32(locals.length),u16(0)));}
  function safeOdtFilename(q){var n=String(q||'搜索摘取').replace(/[\\/:*?"<>|]+/g,'_').replace(/[\x00-\x1f]/g,'_').trim();return (n||'搜索摘取').slice(0,180)+'.odt';}
  function buildOdtBlob(items,q){var content=paragraphsToOdtXml(items,q),styles='<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2"><office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles></office:document-styles>',manifest='<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/></manifest:manifest>',zip=zipStored([{name:'mimetype',data:'application/vnd.oasis.opendocument.text'},{name:'content.xml',data:content},{name:'styles.xml',data:styles},{name:'META-INF/manifest.xml',data:manifest}]);return new Blob([zip],{type:'application/vnd.oasis.opendocument.text'});}
  function referenceFindMatches(text,q){
    /* 独立参考实现：只做规范化 + indexOf 全量扫描，不调用正式 findMatches。 */
    var source=String(text==null?'':text), nm=normalizedWithMap(source), nq=normalize(q), out=[];
    if(!nq)return out;
    var from=0,p;
    while((p=nm.text.indexOf(nq,from))>=0){
      var endPos=p+nq.length-1;
      var startOrig=nm.map[p];
      var endOrig=endPos<nm.mapEnd.length?nm.mapEnd[endPos]:source.length;
      out.push({start:startOrig,end:endOrig,text:source.slice(startOrig,endOrig)});
      from=p+1;
    }
    return out;
  }
  async function referenceScan(q){
    q=String(q||'').trim();if(!q||!globalThis.BookLibraryDB)return {query:q,booksScanned:0,booksMatched:0,totalMatches:0,occurrences:[]};
    var books=await BookLibraryDB.listMeta(),occurrences=[],booksMatched=0;
    for(var i=0;i<books.length;i++){
      var b=books[i];if(!b||!b.id)continue;
      var c=null;try{c=await BookLibraryDB.getContent(String(b.id));}catch(_){c=null;}
      var body=c?String(c.text||''):'';
      var ms=referenceFindMatches(body,q);
      if(ms.length){booksMatched++;ms.forEach(function(m){occurrences.push({bookId:String(b.id),start:m.start,end:m.end,text:m.text});});}
      c=null;body='';if(i%2===1)await yieldNow();
    }
    return {query:q,booksScanned:books.length,booksMatched:booksMatched,totalMatches:occurrences.length,occurrences:occurrences};
  }
  function occurrenceKey(x){return String(x.bookId)+'|'+String(x.start)+'|'+String(x.end)+'|'+String(x.text||'');}
  async function verifySearch(q){
    var expected=await referenceScan(q),actualRaw=await search(q),actual=[];
    for(var ri=0;ri<(actualRaw||[]).length;ri++){
      var r=actualRaw[ri];
      if(r.matchPositions&&r.matchPositions.starts&&r.matchPositions.ends){
        var c=null,body='';
        try{c=await BookLibraryDB.getContent(String(r.bookId));body=c?String(c.text||''):'';}catch(_){body='';}
        var st=r.matchPositions.starts,en=r.matchPositions.ends,n=Math.min(st.length,en.length);
        for(var mi=0;mi<n;mi++){var a=st[mi]>>>0,b=en[mi]>>>0;actual.push({bookId:String(r.bookId),start:a,end:b,text:body.slice(a,b)});}
        c=null;body='';
      }else{
        (r.matches||[]).forEach(function(m){actual.push({bookId:String(r.bookId),start:Number(m.start)||0,end:Number(m.end)||0,text:String(m.text||'')});});
      }
    }
    var eSet=new Set(expected.occurrences.map(occurrenceKey)),aSet=new Set(actual.map(occurrenceKey)),missing=[],extra=[];
    eSet.forEach(function(k){if(!aSet.has(k))missing.push(k);});aSet.forEach(function(k){if(!eSet.has(k))extra.push(k);});
    return {query:String(q||''),expected:expected,actual:{booksMatched:new Set(actual.map(function(x){return x.bookId;})).size,totalMatches:actual.length,occurrences:actual},missing:missing,extra:extra,pass:missing.length===0&&extra.length===0};
  }
  globalThis.BookNoteSearchIndex={ensure:ensure,rebuild:rebuild,search:search,referenceScan:referenceScan,verifySearch:verifySearch,extractParagraphs:extractParagraphs,terms:terms,normalize:normalize,findMatches:findMatches,stats:function(){return mem?{docCount:mem.docCount,termCount:mem.termCount,sectionCount:mem.sectionCount,builtAt:mem.builtAt}:null;},buildOdtBlob:buildOdtBlob,buildGroupedResult:buildGroupedResult,buildTemplateText:buildTemplateText,formatterBlocks:formatterBlocks,safeOdtFilename:safeOdtFilename};
})();
