// Default cover layout: 12% top / 48% title / 24% pattern / 16% bottom; backgrounds remain fully visible at 2:3.
(function(){
 "use strict";
 var browser=globalThis.browser, KEY="booknoteNotes", CATKEY="booknoteShelfCategories";
 var state={books:[],states:{},query:"",format:"all",category:"all",sort:"updated",view:"grid",status:"all",selected:new Set(),extractSelected:new Set(),detail:null,indexReady:false,indexResults:null,searchError:""};
 var $=function(id){return document.getElementById(id);};
 function bnIcon(name,cls){return '<img class="bn-icon ' +(cls||'') +'" src="'+browser.runtime.getURL("img/ui/"+name+".png")+'" alt="" aria-hidden="true">';}
 var THEME_LABELS={nord:"北欧冷色",atom:"原子深色",everforest:"森林深色",onehalf:"单色深黑",dracula:"德古拉"};
 function readThemeState(){return globalThis.BookNoteGlobalTheme?BookNoteGlobalTheme.get():browser.storage.local.get("booknotePanelState").then(function(r){var st=r.booknotePanelState||{};return {themeName:THEME_LABELS[st.themeName]?st.themeName:"everforest",themeMode:st.themeMode==="night"?"night":"day"};});}
 function applyShelfTheme(t){t=t||{themeName:"everforest",themeMode:"day"};document.body.dataset.theme=t.themeName;document.body.dataset.mode=t.themeMode;var tb=$("shelfTheme"),mb=$("shelfMode");if(tb)tb.innerHTML=bnIcon("theme","sm")+" "+(THEME_LABELS[t.themeName]||"主题");if(mb)mb.innerHTML=bnIcon(t.themeMode==="night"?"moon":"sun","sm")+(t.themeMode==="night"?" 夜晚":" 白天");}
 function saveShelfTheme(patch){return globalThis.BookNoteGlobalTheme?BookNoteGlobalTheme.update(patch):browser.storage.local.get("booknotePanelState").then(function(r){var st=r.booknotePanelState||{};st.themeName=patch.themeName||st.themeName||"everforest";st.themeMode=patch.themeMode||st.themeMode||"day";applyShelfTheme({themeName:st.themeName,themeMode:st.themeMode});return browser.storage.local.set({booknotePanelState:st}).then(function(){return {themeName:st.themeName,themeMode:st.themeMode};});});}
 function esc(s){return String(s==null?"":s).replace(/[&<>\"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
 function isBook(n){return n&&n.categoryType==="document"&&n.sourceType==="imported-document";}
 function format(n){
 var raw=String(n.documentFormat||((n.documentFileName||"").split(".").pop())||"doc").trim().toLowerCase().replace(/^\./,"");
 if(raw==="text/html"||raw==="application/xhtml+xml"||raw==="xhtml"||raw==="htm"||raw==="html5")return "html";
 if(raw==="text/markdown"||raw==="markdown")return "md";
 return raw;
}
 function title(n){return n.documentTitle||n.title||n.name||n.documentFileName||"未命名书籍";}
 function sortTitleSource(n){
  var candidates=[
    String(n&&n.documentTitle||''),
    String(n&&n.title||''),
    String(n&&n.name||''),
    String(n&&n.documentFileName||'')
  ].map(function(v){return v.trim();}).filter(Boolean);
  /* EPUB metadata is not reliable: many volumes expose only the series name
     in dc:title while the filename contains the real volume/part number.
     Prefer the first candidate that actually carries a supported sequence. */
  for(var i=0;i<candidates.length;i++){
    if(extractBookSequence(candidates[i]))return candidates[i];
  }
  return candidates[0]||'';
 }
 function normalizeBookTitleForSort(value){
  var s=String(value==null?'':value).replace(/\uFEFF/g,'').replace(/[\u3000\t\r\n]+/g,' ').trim();
  s=s.replace(/\.(?:epub|pdf|odt|docx|txt|html?|md)$/i,'').trim();
  var seqInfo=extractBookSequence(s);
  if(seqInfo){
    var base=seqInfo.base.replace(/[\s\u3000_\-—–·+:：]+$/g,'').trim();
    /* If a trailing 《书名》 is present after the sequence, it is the most
       reliable logical book-name alias for EPUBs whose metadata is polluted
       by "名称+第一卷+《书名》" style titles. */
    var alias=seqInfo.alias;
    if(alias)base=alias;
    base=base.replace(/^《+|》+$/g,'').replace(/[\s\u3000]+/g,'').trim();
    return {base:base,seq:seqInfo.seq,hasSeq:true,kind:seqInfo.kind,raw:s};
  }
  s=s.replace(/^《+|》+$/g,'').trim();
  return {base:s.replace(/[\s\u3000]+/g,''),seq:Number.MAX_SAFE_INTEGER,hasSeq:false,kind:'',raw:s};
 }
 function extractBookSequence(value){
  var s=String(value==null?'':value).replace(/\uFEFF/g,'').replace(/\.(?:epub|pdf|odt|docx|txt|html?|md)$/i,'').trim();
  /* EPUB metadata can append the real book name after the volume marker, for
     example: "名称+第一卷 +《书名》".  Therefore the sequence is no longer
     required to be the final token.  We still require the marker to be a
     clear卷/集/辑 token and only accept harmless trailing aliases/punctuation.
  */
  var re=/(?:^|[\s_\-—–·+:：\(\[【（+》])第?\s*([0-9一二三四五六七八九十百千万零〇两]+)\s*(卷|集|辑)(?=$|[\s_\-—–·+:：\)\]】）+]*|《[^》]{1,200}》\s*$)/i;
  var m=re.exec(s);
  if(!m)return null;
  var seq=parseChineseNumber(m[1]);
  if(!Number.isFinite(seq)||seq<0)return null;
  var before=s.slice(0,m.index).replace(/[\s\u3000_\-—–·+:：\(\[【（+]+$/g,'').trim();
  var after=s.slice(m.index+m[0].length).trim();
  var aliasMatch=after.match(/^[+\-—–·:：,，、\s]*《([^》]{1,200})》\s*$/);
  var alias=aliasMatch?aliasMatch[1].trim():'';
  /* Also handle 《书名》第一卷: the bracketed title is the logical base. */
  var leadingAlias=before.match(/^《([^》]{1,200})》$/);
  if(leadingAlias)before=leadingAlias[1].trim();
  if(!before && !alias)return null;
  if(!before)before=alias;
  return {base:before,seq:seq,kind:String(m[2]).toLowerCase(),alias:alias};
 }
 function parseChineseNumber(value){
  var s=String(value||'').replace(/[〇○]/g,'零').trim();
  if(/^\d+$/.test(s))return Number(s);
  var map={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  var units={十:10,百:100,千:1000,万:10000};
  if(!s)return Number.MAX_SAFE_INTEGER;
  if(s.length===1){if(map[s]!==undefined)return map[s];if(units[s]!==undefined)return units[s];return Number.MAX_SAFE_INTEGER;}
  var total=0,section=0,num=0;
  for(var i=0;i<s.length;i++){
   var ch=s[i];
   if(units[ch]){
    var unit=units[ch];
    if(unit===10000){
     if(num===0&&section===0)section=1;
     else section+=num;
     total+=section*unit;section=0;num=0;
    }else{
     if(num===0)num=1;
     section+=num*unit;num=0;
    }
   }else if(map[ch]!==undefined){num=map[ch];}
   else{return Number.MAX_SAFE_INTEGER;}
  }
  return total+section+num;
 }
 function compareBookTitles(a,b){
  var A=normalizeBookTitleForSort(sortTitleSource(a)),B=normalizeBookTitleForSort(sortTitleSource(b));
  var collator=new Intl.Collator('zh-CN',{usage:'sort',numeric:true,sensitivity:'base',ignorePunctuation:true});
  var base=collator.compare(A.base,B.base);
  if(base)return base;
  /* For the same logical book, numbered editions always come before the
     unnumbered base entry, and then use the parsed numeric sequence only. */
  if(A.hasSeq!==B.hasSeq)return A.hasSeq?1:-1;
  if(A.hasSeq&&B.hasSeq&&A.seq!==B.seq)return A.seq-B.seq;
  /* Same numeric sequence is a tie. Do not let 卷/集/辑 create a second
     ordering dimension; use deterministic source text/id only as a final tie
     breaker so browser/JS stable-sort differences cannot reshuffle imports. */
  if(A.hasSeq&&B.hasSeq){
    var raw=collator.compare(A.raw,B.raw);if(raw)return raw;
  }
  var af=String(a&&a.documentFileName||a&&a.name||'');
  var bf=String(b&&b.documentFileName||b&&b.name||'');
  var fc=collator.compare(af,bf);if(fc)return fc;
  return String(a&&a.id||'').localeCompare(String(b&&b.id||''),'zh-CN');
 }
 function author(n){return n.documentAuthor||n.author||"";}
 function cover(n){return n.documentCoverThumb&&n.documentCoverThumbMime?"data:"+n.documentCoverThumbMime+";base64,"+n.documentCoverThumb:n.coverThumb&&n.coverThumbMime?"data:"+n.coverThumbMime+";base64,"+n.coverThumb:"";}
 function bytes(n){var x=Number(n.documentFileSize||0);if(!x)return "";if(x<1024*1024)return Math.round(x/1024)+" KB";return (x/1024/1024).toFixed(1)+" MB";}
 function fmtTime(v){if(!v)return "";var d=new Date(v);if(isNaN(d.getTime()))return "";return d.toLocaleDateString("zh-CN",{year:"numeric",month:"numeric",day:"numeric"});}
 function showToast(s){var t=$("toast");t.textContent=s;t.classList.add("show");clearTimeout(showToast.timer);showToast.timer=setTimeout(function(){t.classList.remove("show")},1800);}
 function focusOrCreate(url,match){return browser.tabs.query({url:match||url}).then(function(tabs){if(tabs&&tabs.length){return browser.tabs.update(tabs[0].id,{url:url,active:true}).then(function(t){return browser.windows.update(t.windowId,{focused:true});});}return browser.tabs.create({url:url,active:true});});}
 function openPanel(mode){var u=browser.runtime.getURL("booknote/panel.html")+(mode?"?"+mode:"");return focusOrCreate(u,browser.runtime.getURL("booknote/panel.html")+"*");}
 function getCategories(){return browser.storage.local.get(CATKEY).then(function(r){var c=Array.isArray(r[CATKEY])?r[CATKEY]:[];if(c.length)return c;var derived=["未分类"];(state.books||[]).forEach(function(n){var k=String(n&&n.category||"未分类").trim()||"未分类";if(derived.indexOf(k)<0)derived.push(k);});return browser.storage.local.set((function(o){o[CATKEY]=derived;return o;})(Object.create(null))).then(function(){return derived;});});}
 function setCategories(c){var o={};o[CATKEY]=c;return browser.storage.local.set(o);}
 function allBooks(){return Promise.all([BookLibraryDB.listMeta().catch(function(){return []; }),browser.storage.local.get(KEY).catch(function(){return {};})]).then(function(pair){var metas=Array.isArray(pair[0])?pair[0]:[],legacy=Array.isArray(pair[1][KEY])?pair[1][KEY]:[],legacyBooks=legacy.filter(isBook),byId=Object.create(null);metas.forEach(function(n){if(n&&n.id)byId[String(n.id)]=n;});legacyBooks.forEach(function(n){var id=String(n.id||"" );if(id&&!byId[id])byId[id]=n;});return Object.keys(byId).map(function(id){return byId[id];});});}
 function allNotes(){return BookLibraryDB.listNotes();}
 function readingStates(books){var keys=books.map(function(n){return "booknoteReadingState:"+String(n.id)});if(!keys.length)return Promise.resolve({});return browser.storage.local.get(keys).then(function(r){var out={};books.forEach(function(n){out[n.id]=r["booknoteReadingState:"+String(n.id)]||{};});return out;});}
 function progressOf(n){var st=state.states[n.id]||{};return Math.max(0,Math.min(1,Number(st.progress)||0));}
 function statusOf(n){var explicit=String(n.readingStatus||"").toLowerCase();if(explicit==="finished"||explicit==="reading"||explicit==="unread")return explicit;var p=progressOf(n);if(p<=0.005)return "unread";if(p>=0.995)return "finished";return "reading";}
 function statusLabel(s){return s==="finished"?"已读":s==="reading"?"阅读中":"未读";}
 function filtered(){var q=state.query.toLowerCase(),a=state.books.filter(function(n){var grouped=state.indexResults&&state.indexResults.kind==="grouped-search-result"?state.indexResults:null;if(grouped&&q&&!((grouped.books||[]).some(function(x){return String(x.bookId)===String(n.id);})))return false;var f=format(n);if(state.format!=="all"&&f!==state.format)return false;if(state.category==="__reading__"){if(statusOf(n)!=="reading")return false;}else if(state.category!=="all"&&(n.category||"未分类")!==state.category)return false;if(state.status!=="all"&&statusOf(n)!==state.status)return false;if(!q)return true;return [title(n),author(n),n.documentFileName,n.category].join(" ").toLowerCase().indexOf(q)>=0;});
 a.sort(function(a,b){var sa=state.states[a.id]||{},sb=state.states[b.id]||{},pa=progressOf(a),pb=progressOf(b),va,vb;if(state.sort==="title")return compareBookTitles(a,b);if(state.sort==="author")return author(a).localeCompare(author(b),"zh-CN");if(state.sort==="format")return format(a).localeCompare(format(b));if(state.sort==="progress")return pb-pa;if(state.sort==="recent"){va=Number(sa.updatedAt)||0;vb=Number(sb.updatedAt)||0;return vb-va;}va=new Date(a.updatedAt||a.createdAt||0).getTime();vb=new Date(b.updatedAt||b.createdAt||0).getTime();return vb-va;});return a;}
 /* v7.18.01: shelf-cover order is fixed to the reference image, left-to-right then top-to-bottom.
  01 ODT, 02 DOCX, 03 TXT, 04 EPUB, 05 PDF, 06 DM, 07 HTML.
  Backgrounds and format marks are separate assets; TXT and HTML never share a background. */
 var DEFAULT_COVER_CONFIG={
  odt:{label:"ODT",background:"img/default-covers/shelf-cover-01-odt.png",icon:"img/default-covers/icon-odt.png",base:"#223A5E",ink:"#F4E8C7",accent:"#D9C28A"},
  docx:{label:"DOCX",background:"img/default-covers/shelf-cover-02-docx.png",icon:"img/default-covers/icon-docx.png",base:"#185ABD",ink:"#F4E8C7",accent:"#D9C28A"},
  txt:{label:"TXT",background:"img/default-covers/shelf-cover-03-txt.png",icon:"img/default-covers/icon-txt.png",base:"#D8C8A8",ink:"#3C332B",accent:"#8B7354"},
  epub:{label:"EPUB",background:"img/default-covers/shelf-cover-04-epub.png",icon:"img/default-covers/icon-epub.png",base:"#176B45",ink:"#F6E8B8",accent:"#E4C56E"},
  pdf:{label:"PDF",background:"img/default-covers/shelf-cover-05-pdf.png",icon:"img/default-covers/icon-pdf.png",base:"#8F1722",ink:"#F7E7C2",accent:"#E0BF69"},
  dm:{label:"DM",background:"img/default-covers/shelf-cover-06-dm.png",icon:"img/default-covers/icon-dm.png",base:"#5A176F",ink:"#F6E8B8",accent:"#E4C56E"},
  md:{label:"DM",background:"img/default-covers/shelf-cover-06-dm.png",icon:"img/default-covers/icon-dm.png",base:"#5A176F",ink:"#F6E8B8",accent:"#E4C56E"},
  markdown:{label:"DM",background:"img/default-covers/shelf-cover-06-dm.png",icon:"img/default-covers/icon-dm.png",base:"#5A176F",ink:"#F6E8B8",accent:"#E4C56E"},
  html:{label:"HTML",background:"img/default-covers/shelf-cover-07-html.png",icon:"img/default-covers/icon-html.png",base:"#0F7F83",ink:"#E5FFFF",accent:"#9CE6E6"},
  htm:{label:"HTML",background:"img/default-covers/shelf-cover-07-html.png",icon:"img/default-covers/icon-html.png",base:"#0F7F83",ink:"#E5FFFF",accent:"#9CE6E6"}
 };
 function defaultCoverIcon(f){
  var cfg=DEFAULT_COVER_CONFIG[f]||DEFAULT_COVER_CONFIG.txt;
  return '<img src="'+cfg.icon+'" alt="" aria-hidden="true">';
 }
 function defaultCover(n,small){
  var rawFormat=format(n),coverFormat=DEFAULT_COVER_CONFIG[rawFormat]?rawFormat:"txt",cfg=DEFAULT_COVER_CONFIG[coverFormat];
  var t=esc(title(n)||n.documentFileName||"未命名书籍"),f=cfg.label,cls=small?" default-cover-small":"";
  return '<div class="default-cover default-cover-'+coverFormat+cls+'" data-default-cover="1" role="img" aria-label="'+t+' · '+f+' 默认封面" style="--default-cover-base:'+cfg.base+';--default-cover-ink:'+cfg.ink+';--default-cover-accent:'+cfg.accent+';--default-cover-background:url(\''+cfg.background+'\')">'+
    '<div class="default-cover-scene" aria-hidden="true"></div><div class="default-cover-content">'+
    '<div class="default-cover-title">'+t+'</div>'+
    '<img class="default-cover-divider default-cover-divider-top" src="img/default-covers/divider-line.png" alt="" aria-hidden="true">'+
    '<div class="default-cover-format-row">'+defaultCoverIcon(coverFormat)+'<span class="default-cover-format-separator" aria-hidden="true"></span><span class="default-cover-format">'+f+'</span></div>'+
    '<img class="default-cover-divider default-cover-divider-bottom" src="img/default-covers/divider-line.png" alt="" aria-hidden="true">'+
    '</div></div>';
 }
 function cardCover(n,small){var src=cover(n);return src?'<img '+(small?'':'loading="lazy" ')+'class="cover cover-image" data-cover-fallback="1" src="'+src+'" alt="'+esc(title(n)||"")+'">':defaultCover(n,small);}
 function bindCoverFallback(root){(root||document).querySelectorAll('img[data-cover-fallback]').forEach(function(img){img.addEventListener('error',function(){var wrap=img.closest('.cover-wrap,.detail-cover');if(!wrap)return;var id=img.getAttribute('data-book-id'),book=id?state.books.find(function(n){return String(n.id)===String(id);}):null;if(book){img.outerHTML=defaultCover(book,wrap.classList.contains('detail-cover'));}});});}
 function renderFilters(){
  var formats=Array.from(new Set(state.books.map(format))).filter(Boolean).sort(),fs=["all"].concat(formats);
  $("filters").innerHTML=fs.map(function(f){
    var count=f==="all"?state.books.length:state.books.filter(function(n){return format(n)===f;}).length;
    return '<button class="filter '+(state.format===f?"active":"")+'" data-format="'+esc(f)+'" data-active="'+(state.format===f?"true":"false")+'" aria-pressed="'+(state.format===f?"true":"false")+'" title="'+esc(f==="all"?"显示全部格式":f.toUpperCase()+" · "+count+" 本")+'">'+(f==="all"?"全部格式":f.toUpperCase())+' <span class="filter-count">'+count+'</span></button>';
  }).join("");
  getCategories().then(function(cats){
    cats=Array.isArray(cats)&&cats.length?cats:["未分类"];
    var all=["all"].concat(cats);
    var readingCount=state.books.filter(function(n){return statusOf(n)==="reading";}).length;
    $("categories").innerHTML='<div class="category-scroll" role="tablist" aria-label="书籍分类">'+all.map(function(c){
      var count=c==="all"?state.books.length:state.books.filter(function(n){return (n.category||"未分类")===c;}).length;
      return '<button class="category-chip '+(state.category===c?"active":"")+'" data-category="'+esc(c)+'" data-active="'+(state.category===c?"true":"false")+'" draggable="false" role="tab" aria-selected="'+(state.category===c?'true':'false')+'" title="'+esc(c==="all"?"显示全部分类":c+" · "+count+" 本")+'">'+(c==="all"?bnIcon("bookshelf")+" 全部分类":bnIcon("bookshelf")+" "+esc(c))+' <span class="category-count">'+count+'</span></button>';
    }).join('')+'<button class="category-chip '+(state.category==="__reading__"?"active":"")+'" data-category="__reading__" data-active="'+(state.category==="__reading__"?"true":"false")+'" draggable="false" role="tab" aria-selected="'+(state.category==="__reading__"?'true':'false')+'" title="正在阅读 · '+readingCount+' 本">'+bnIcon("bookshelf")+' 正在阅读 <span class="category-count">'+readingCount+'</span></button></div><div class="category-actions"><button class="category-batch" id="selectAll" type="button" title="批量选择书籍" aria-pressed="false"><span class="batch-header-icon" aria-hidden="true">+</span><span>批量选择</span></button><button class="category-manage" id="manageCategories" type="button" title="独立管理、创建、重命名或删除分类">⚙ 分类管理</button></div>';
    $("batchCategory").innerHTML='<option value="">移动到分类…</option>'+cats.map(function(c){return '<option value="'+esc(c)+'">'+esc(c)+'</option>';}).join("");
  });
 }
 function highlightSnippet(text,q,matchText){text=String(text||"");var needle=String(matchText||q||"");var low=text.toLocaleLowerCase(),pos=low.indexOf(needle.toLocaleLowerCase());if(pos<0){needle=String(q||"");pos=low.indexOf(needle.toLocaleLowerCase());}if(pos<0)return esc(text);return esc(text.slice(0,pos))+"<mark class=\"search-hit-mark\">"+esc(text.slice(pos,pos+needle.length))+"</mark>"+esc(text.slice(pos+needle.length));}
 function openSearchBookResult(bookId,chapterIndex,start,end){
  if(!bookId)return;
  /* Search hits open the standalone Reader directly; it has a deterministic boot path and avoids panel launch blank-state. */
  var u=browser.runtime.getURL("reader/reader.html")+"?bookId="+encodeURIComponent(String(bookId))+
    "&chapterIndex="+encodeURIComponent(chapterIndex==null?0:chapterIndex)+
    "&annotationStart="+encodeURIComponent(start==null?0:start)+
    "&annotationEnd="+encodeURIComponent(end==null?start||0:end)+"&searchResult=1";
  focusOrCreate(u,browser.runtime.getURL("reader/reader.html")+"*");
 }
 function openSearchAnnotationResult(a){
  if(!a||!a.bookId)return;
  /* Annotation hits also use the standalone Reader so the annotation locator is restored in the same reader context. */
  var u=browser.runtime.getURL("reader/reader.html")+"?bookId="+encodeURIComponent(String(a.bookId))+
    (a.id?"&annotationId="+encodeURIComponent(String(a.id)):"")+
    "&chapterIndex="+encodeURIComponent(a.chapterIndex==null?0:a.chapterIndex)+
    (a.start!=null?"&annotationStart="+encodeURIComponent(a.start):"")+
    (a.end!=null?"&annotationEnd="+encodeURIComponent(a.end):"")+"&searchResult=1";
  focusOrCreate(u,browser.runtime.getURL("reader/reader.html")+"*");
 }
 function renderSearchResults(grouped){
  var box=$("searchResults"),grid=$("grid");
  if(!state.query||!grouped||grouped.kind!=="grouped-search-result"){box.hidden=true;return;}
  var results=grouped.sourceResults||[],books=grouped.books||[],annotations=grouped.annotationResults||[],selected=state.extractSelected;
  box.hidden=false;grid.hidden=false;
  var main=box.closest(".main"),summary=main&&main.querySelector(".summary");
  if(main)main.classList.add("search-mode");
  if(summary)summary.hidden=true;
  var rows=books.map(function(book){
   var src=results.find(function(r){return String(r.bookId)===String(book.bookId);})||{},id=String(src.id||("book:"+book.bookId)),checked=selected.has(id),chapters=book.chapters||[];
   var content=chapters.map(function(ch){return '<section class="search-result-chapter"><div class="search-result-meta">'+esc('章节：'+(ch.label||'未标注章节'))+'</div>'+(ch.paragraphs||[]).map(function(par){return '<div class="search-result-snippet search-result-jump" data-book-id="'+esc(book.bookId)+'" data-chapter-index="'+esc(ch.index==null?0:ch.index)+'" data-search-start="'+esc(par.start==null?0:par.start)+'" data-search-end="'+esc(par.end==null?0:par.end)+'" role="button" tabindex="0" title="打开并定位到原文">'+highlightSnippet(par.text||'',state.query,par.matchText||state.query)+'</div>';}).join('')+'</section>';}).join('');
   return '<article class="search-result"><div class="search-result-icon"><input type="checkbox" class="search-extract-check" data-extract-id="'+esc(id)+'" '+(checked?'checked':'')+' aria-label="选择此书搜索内容"></div><div class="search-result-main"><div class="search-result-title search-result-jump" data-book-id="'+esc(book.bookId)+'" data-chapter-index="'+esc((chapters[0]&&chapters[0].index)!=null?chapters[0].index:(src.chapterIndex==null?0:src.chapterIndex))+'" data-search-start="'+esc(src.matchStart==null?0:src.matchStart)+'" data-search-end="'+esc(src.matchEnd==null?src.matchStart||0:src.matchEnd)+'" role="button" tabindex="0" title="打开并定位到原文">'+bnIcon("bookshelf")+' · '+esc(book.title||'未命名书籍')+'</div>'+content+'</div><div class="search-result-book">'+chapters.length+' 章 · '+chapters.reduce(function(n,c){return n+(c.paragraphs||[]).length;},0)+' 段</div></article>';
  }).join('');
  var annRows=annotations.map(function(a){return '<article class="search-annotation-result search-result-jump" data-annotation-id="'+esc(a.id||'')+'" data-book-id="'+esc(a.bookId||'')+'" data-chapter-index="'+esc(a.chapterIndex==null?0:a.chapterIndex)+'" data-search-start="'+esc(a.start==null?0:a.start)+'" data-search-end="'+esc(a.end==null?a.start||0:a.end)+'" role="button" tabindex="0" title="打开并定位到标记">'+iconForAnnotation(a.type)+' <strong>'+esc(a.bookTitle||'未命名书籍')+'</strong><span> · '+esc(annotationTypeLabel(a.type))+' · '+esc(a.chapterLabel||'正文')+'</span><div>'+highlightSnippet(a.text||a.note||'',state.query,state.query)+'</div></article>';}).join('');
  var annHead=annotations.length?'<div class="search-results-subhead">标记 <span>'+annotations.length+' 条</span></div>':'';
  box.innerHTML='<div class="search-results-head"><div class="search-results-title-block"><strong>搜索结果</strong><span class="count">'+books.length+' 本书 · '+String(grouped.paragraphCount||0)+' 段'+(annotations.length?' · '+annotations.length+' 条标记':'')+'</span><span class="search-results-data-note">搜索结果数据 · 可导出搜索内容或保存摘要笔记</span></div><span class="search-results-actions"><span class="search-results-action-group"><b>导出</b><button type="button" id="extractAllOdt" '+(books.length?'':'disabled')+'>'+bnIcon("export")+' 全部搜索内容</button><button type="button" id="extractOdt" '+(selected.size?'':'disabled')+'>☑ 选中搜索内容（'+selected.size+'/20）</button></span><span class="search-results-action-group save"><b>保存</b><button type="button" id="saveSummaryAll" '+(books.length?'':'disabled')+'>'+bnIcon("note")+' 全部保存到我的笔记</button><button type="button" id="saveSummarySelected" '+(selected.size?'':'disabled')+'>☑ 选中保存到我的笔记（'+selected.size+'/20）</button></span><span class="search-results-scroll-controls shelf-scrollbar-inner" aria-label="搜索结果控制"><button type="button" id="searchResultsTop" title="搜索结果置顶" aria-label="搜索结果置顶">↑ 置顶</button><button type="button" id="searchResultsPrev" title="上一个书籍结果" aria-label="上一个书籍结果">← 上一个</button><button type="button" id="searchResultsNext" title="下一个书籍结果" aria-label="下一个书籍结果">下一个 →</button><button type="button" id="searchResultsBottom" title="搜索结果置底" aria-label="搜索结果置底">↓ 置底</button></span><button type="button" id="searchResultsClose" class="search-results-close" title="关闭搜索结果" aria-label="关闭搜索结果">×</button></span></div><div class="search-results-list" id="searchResultsList" tabindex="0" aria-label="搜索结果列表">'+(rows||'<div class="empty"><strong>没有找到匹配正文</strong></div>')+annHead+annRows+'</div>';
  var closeBtn=$("searchResultsClose");
  if(closeBtn)closeBtn.onclick=function(e){e.preventDefault();e.stopPropagation();closeSearchResults();};
  box.querySelectorAll('.search-result-jump').forEach(function(el){
   var jump=function(e){if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return;if(e.type==='keydown')e.preventDefault();if(el.dataset.annotationId)openSearchAnnotationResult({id:el.dataset.annotationId,bookId:el.dataset.bookId,chapterIndex:Number(el.dataset.chapterIndex),start:Number(el.dataset.searchStart),end:Number(el.dataset.searchEnd)});else openSearchBookResult(el.dataset.bookId,Number(el.dataset.chapterIndex),Number(el.dataset.searchStart),Number(el.dataset.searchEnd));};
   el.onclick=jump;el.onkeydown=jump;
  });
  var searchList=$("searchResultsList"),topBtn=$("searchResultsTop"),prevBtn=$("searchResultsPrev"),nextBtn=$("searchResultsNext"),bottomBtn=$("searchResultsBottom");
  var searchBookNavIndex=0;
  function searchBookItems(){return searchList?Array.prototype.slice.call(searchList.querySelectorAll(".search-result")):[];}
  function currentSearchBookIndex(){
   var items=searchBookItems();if(!items.length)return -1;
   var y=(searchList.scrollTop||0)+8,best=0,bestTop=-Infinity;
   items.forEach(function(el,i){var top=el.offsetTop;if(top<=y&&top>bestTop){bestTop=top;best=i;}});
   return best;
  }
  function updateSearchResultScrollButtons(){
   if(!searchList)return;
   var max=Math.max(0,searchList.scrollHeight-searchList.clientHeight),y=searchList.scrollTop||0,eps=3,items=searchBookItems();
   if(items.length){var idx=currentSearchBookIndex();if(idx>=0)searchBookNavIndex=idx;}else searchBookNavIndex=0;
   if(topBtn)topBtn.disabled=max<=eps||y<=eps;
   if(bottomBtn)bottomBtn.disabled=max<=eps||y>=max-eps;
   if(prevBtn)prevBtn.disabled=!items.length||searchBookNavIndex<=0;
   if(nextBtn)nextBtn.disabled=!items.length||searchBookNavIndex>=items.length-1;
  }
  function scrollSearchResults(edge){if(!searchList)return;searchList.scrollTo({top:edge==="bottom"?searchList.scrollHeight:0,behavior:"smooth"});}
  function scrollSearchBook(delta){
   var items=searchBookItems();if(!items.length)return;
   var idx=currentSearchBookIndex();if(idx<0)idx=searchBookNavIndex||0;
   var target=Math.max(0,Math.min(items.length-1,idx+delta));searchBookNavIndex=target;
   items[target].scrollIntoView({block:"start",behavior:"smooth"});
   showToast((delta<0?"上一个":"下一个")+"书籍："+(target+1)+" / "+items.length);
   requestAnimationFrame(updateSearchResultScrollButtons);
  }
  if(topBtn)topBtn.onclick=function(){showToast("搜索内容已置顶");scrollSearchResults("top");};
  if(prevBtn)prevBtn.onclick=function(){scrollSearchBook(-1);};
  if(nextBtn)nextBtn.onclick=function(){scrollSearchBook(1);};
  if(bottomBtn)bottomBtn.onclick=function(){showToast("搜索内容已置底");scrollSearchResults("bottom");};
  if(searchList)searchList.onscroll=updateSearchResultScrollButtons;
  requestAnimationFrame(updateSearchResultScrollButtons);
  box.querySelectorAll('[data-extract-id]').forEach(function(el){el.onclick=function(e){e.stopPropagation();var id=String(el.dataset.extractId);if(el.checked){if(selected.size>=20){el.checked=false;showToast('最多选择 20 个搜索结果');return;}selected.add(id);}else selected.delete(id);renderSearchResults(state.indexResults);};});
  var ea=$("extractAllOdt");if(ea)ea.onclick=function(){showToast("正在准备全部搜索内容…");exportAllSearchParagraphs(grouped);};var eb=$("extractOdt");if(eb)eb.onclick=function(){if(!state.extractSelected.size){showToast("请先选择搜索结果");return;}showToast("正在准备选中的搜索内容…");exportSelectedSearchParagraphs(grouped);};var sa=$("saveSummaryAll");if(sa)sa.onclick=function(){showToast("正在生成全部摘要笔记…");saveLibrarySearchSummary(grouped,false);};var ss=$("saveSummarySelected");if(ss)ss.onclick=function(){if(!state.extractSelected.size){showToast("请先选择搜索结果");return;}showToast("正在生成选中摘要笔记…");saveLibrarySearchSummary(grouped,true);};
 }
 function iconForAnnotation(t){return bnIcon(t==='highlight'?'highlight':t==='bookmark'?'bookmark':t==='quote'?'note':'note');}
 function annotationTypeLabel(t){return t==='highlight'?'高亮':t==='bookmark'?'书签':t==='quote'?'摘录':t==='note'?'笔记':String(t||'标记');}

 function exportAllSearchParagraphs(grouped){if(!grouped||grouped.kind!=="grouped-search-result"||!grouped.books.length){showToast("当前没有可导出的搜索内容");return;}var blob=BookNoteSearchIndex.buildOdtBlob(grouped,state.query),url=URL.createObjectURL(blob),filename=BookNoteSearchIndex.safeOdtFilename(state.query);browser.downloads.download({url:url,filename:filename,saveAs:true,conflictAction:"uniquify"}).then(function(){setTimeout(function(){URL.revokeObjectURL(url);},10000);showToast("已生成全部搜索内容："+grouped.paragraphCount+" 个段落");}).catch(function(e){showToast("导出失败："+(e&&e.message||"未知错误"));});}
 function exportSelectedSearchParagraphs(grouped){var ids=state.extractSelected,source=(grouped.sourceResults||[]).filter(function(r){return ids.has(String(r.id));}),books=(grouped.books||[]).filter(function(b){return source.some(function(r){return String(r.bookId)===String(b.bookId);});});if(!books.length){showToast("请先选择要导出的搜索结果");return;}var subset={kind:"grouped-search-result",version:grouped.version,query:grouped.query,sourceResults:source,books:books,paragraphCount:books.reduce(function(n,b){return n+(b.chapters||[]).reduce(function(m,c){return m+(c.paragraphs||[]).length;},0);},0)},blob=BookNoteSearchIndex.buildOdtBlob(subset,state.query),url=URL.createObjectURL(blob),filename=BookNoteSearchIndex.safeOdtFilename(state.query);browser.downloads.download({url:url,filename:filename,saveAs:true,conflictAction:"uniquify"}).then(function(){setTimeout(function(){URL.revokeObjectURL(url);},10000);state.extractSelected.clear();renderSearchResults(state.indexResults);showToast("已生成 "+subset.paragraphCount+" 个段落的 ODT");}).catch(function(e){showToast("导出失败："+(e&&e.message||"未知错误"));});}
 function librarySearchSummaryLine(r,extracted){var t=String(r&&r.title||"未命名").trim(),c=String(r&&r.chapterLabel||"").trim(),src=[t,c].filter(Boolean).join(" · ");var body=String(extracted||r&&r.paragraphText||r&&r.matchText||r&&r.snippet||r&&r.text||"").replace(/\s+\n/g,"\n").trim();return {source:src||"搜索结果",body:body};}
function buildLibrarySearchSummaryText(items,term){return globalThis.BookNoteSearchIndex&&typeof BookNoteSearchIndex.buildTemplateText==="function"?BookNoteSearchIndex.buildTemplateText(items):"";}
function saveLibrarySearchSummary(grouped,selectedOnly){if(!grouped||grouped.kind!=="grouped-search-result"||!grouped.books.length){showToast("当前没有搜索结果");return;}var target=grouped;if(selectedOnly){var ids=state.extractSelected,books=(grouped.books||[]).filter(function(b){return (grouped.sourceResults||[]).some(function(r){return ids.has(String(r.id))&&String(r.bookId)===String(b.bookId);});});if(!books.length){showToast("请先选择要保存的搜索结果");return;}target={kind:"grouped-search-result",version:grouped.version,query:grouped.query,sourceResults:(grouped.sourceResults||[]).filter(function(r){return ids.has(String(r.id));}),books:books,paragraphCount:books.reduce(function(n,b){return n+(b.chapters||[]).reduce(function(m,c){return m+(c.paragraphs||[]).length;},0);},0)};}var term=String(state.query||"").trim(),text=BookNoteSearchIndex.buildTemplateText(target),now=new Date().toISOString(),id="search-summary-"+Date.now()+"-"+Math.random().toString(36).slice(2,10),name=(term||"未命名搜索"),cat=(term||"未命名搜索"),pageTitle="搜索内容："+(term||"未命名搜索"),sourceItems=[];(target.books||[]).forEach(function(book){(book.chapters||[]).forEach(function(ch){(ch.paragraphs||[]).forEach(function(par){sourceItems.push({bookId:String(book.bookId||""),sourceBook:"《"+String(book.title||"未命名书籍").replace(/^《|》$/g,"")+"》",sourceChapter:String(ch.label||""),sourceFooter:"《"+String(book.title||"未命名书籍").replace(/^《|》$/g,"")+"》",start:Number(par.start)||0,end:Number(par.end)||0,text:String(par.text||""),matchText:String(par.matchText||term)});});});});var note={id:id,name:name,pageTitle:pageTitle,pageUrl:"",createdAt:now,updatedAt:now,category:cat,categoryType:"summary",sourceType:"search-summary",searchQuery:term,summaryMode:selectedOnly?"selected":"all",summaryResultCount:target.paragraphCount,sourceItemCount:sourceItems.length,sourceItems:sourceItems,selectedText:text,noteText:"",noteHtml:"",documentFormat:"",documentFileName:"",tags:[],pinned:false,favorite:false};showToast("正在生成"+(selectedOnly?"选中":"全部")+"摘要笔记…");browser.storage.local.get([KEY,"booknoteCategories"]).then(function(r){var ns=Array.isArray(r[KEY])?r[KEY]:[],cats=Array.isArray(r.booknoteCategories)?r.booknoteCategories.slice():[];if(!cats.length)cats=["未分类"];if(cats.indexOf(cat)<0)cats.push(cat);ns.unshift(note);var o={};o[KEY]=ns;o.booknoteCategories=cats;return browser.storage.local.set(o);}).then(function(){state.extractSelected.clear();showToast("已保存到我的笔记："+(term||"未命名搜索")+"；原文段落已保存，分类为搜索内容");}).catch(function(e){console.error("save library search summary",e);showToast("保存摘要笔记失败："+(e&&e.message||"未知错误"));});}
function updateShelfHeaderHeight(){var h=$("shelfHeader")||document.querySelector(".header");if(h){document.documentElement.style.setProperty("--shelf-header-height",Math.max(0,h.getBoundingClientRect().height)+"px");}}
function render(books){if(state.query){if(state.indexResults&&state.indexResults.kind==="grouped-search-result"){renderSearchResults(state.indexResults);$("count").textContent=state.books.length+" 本书籍";$("summaryStrong").textContent="";$("summary").textContent="";}else{var sb=$("searchResults"),sg=$("grid"),main=document.querySelector(".main"),summary=main&&main.querySelector(".summary");if(main)main.classList.add("search-mode");if(summary)summary.hidden=true;if(sb){sb.hidden=false;sb.innerHTML='<div class="search-results-head"><strong>搜索结果</strong><span class="count">搜索中…</span></div><div class="empty" style="padding:36px 20px"><strong>正在搜索本地书籍…</strong><span>正在从本地索引定位书名、正文和标记。</span></div>';}if(sg)sg.hidden=false;$("summaryStrong").textContent="";$("summary").textContent="正在搜索本地索引";}return;}var main=document.querySelector(".main"),summary=main&&main.querySelector(".summary");if(main)main.classList.remove("search-mode");if(summary)summary.hidden=false;var arr=filtered(),grid=$("grid");grid.classList.toggle("list",state.view==="list");$("count").textContent=state.books.length+" 本书籍";$("summaryStrong").textContent=arr.length+" 本";$("summary").textContent=(arr.length===state.books.length?"当前书架":"当前筛选结果")+" · 搜索结果可导出或保存为摘要笔记";if(!arr.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1"><strong>暂无匹配书籍</strong><span>可以导入 EPUB、PDF、TXT、Markdown、ODT、DOCX 后在这里集中管理。</span></div>';return;}
 grid.innerHTML=arr.map(function(n){var p=Math.round(progressOf(n)*100),f=format(n),st=statusOf(n),sel=state.selected.has(n.id),hasProgress=p>0&&p<100;return '<article class="card '+(sel?"selected":"")+'" draggable="true" data-id="'+esc(n.id)+'"><div class="cover-wrap" data-open="1" role="button" tabindex="0" title="点击封面阅读">'+(cover(n)?'<img class="cover cover-image" data-cover-fallback="1" data-book-id="'+esc(n.id)+'" loading="lazy" src="'+cover(n)+'" alt="'+esc(title(n)||"")+'">':defaultCover(n,false))+'<button class="select-check" data-select="1">'+(sel?"✓":"")+'</button><span class="status-pill">'+statusLabel(st)+'</span><span class="cover-open-hint">▶ 阅读</span></div><div class="card-body"><div><div class="book-title" title="'+esc(title(n))+'">'+esc(title(n))+'</div><div class="author">'+esc(author(n)||n.documentFileName||"未填写作者")+'</div></div><div class="meta"><span class="badge">'+esc(f.toUpperCase())+'</span>'+(bytes(n)?'<span class="badge">'+esc(bytes(n))+'</span>':"")+'<span class="time">'+esc(fmtTime((state.states[n.id]||{}).updatedAt)||"")+'</span></div><div><div class="progress"><i style="width:'+p+'%"></i></div><div class="progress-row"><span>'+(p>0&&p<100?"继续阅读":p>=100?"已完成":"尚未阅读")+'</span><b>'+p+'%</b></div></div><div class="actions"><button type="button" class="open-reading" data-open="1" title="'+(hasProgress?'继续阅读：打开并恢复阅读位置':'打开阅读器：从当前书籍开始阅读')+'" aria-label="'+(hasProgress?'继续阅读：打开并恢复阅读位置':'打开阅读器：从当前书籍开始阅读')+'"><span>阅读</span></button><button type="button" data-detail="1" title="查看书籍完整信息" aria-label="查看书籍完整信息"><span>书籍</span></button><button type="button" class="danger icon-only-delete" data-delete="1" title="删除书籍" aria-label="删除书籍"><img class="bn-icon sm" src="img/ui/delete.png" alt="" aria-hidden="true"></button></div></div></article>';}).join("");bindCoverFallback(grid);updateShelfScrollControls();}
 function openBookForReading(n){if(!n||!n.id)return;var id=String(n.id),u=browser.runtime.getURL("reader/reader.html")+"?bookId="+encodeURIComponent(id);var st=state.states[id]||{};var mark=BookLibraryDB.getMeta(id).then(function(meta){if(!meta)return;var next=Object.assign({},meta);if(statusOf(n)!=="finished")next.readingStatus="reading";return BookLibraryDB.putMeta(next);}).catch(function(e){console.warn("mark reading state",e);});return mark.then(function(){return focusOrCreate(u,browser.runtime.getURL("reader/reader.html")+"*");}).then(function(){showToast((Number(st.progress)||0)>0?"继续阅读："+title(n):"已打开阅读器："+title(n));});}
 function updateShelfScrollControls(){
  var top=$("shelfScrollTop"),bottom=$("shelfScrollBottom"),grid=$("grid");
  if(!top||!bottom||!grid)return;
  var maxY=Math.max(0,grid.scrollHeight-grid.clientHeight),y=grid.scrollTop||0,epsilon=4,scrollable=maxY>epsilon;
  top.disabled=!scrollable||y<=epsilon;
  bottom.disabled=!scrollable||y>=maxY-epsilon;
 }
 function scrollShelfTo(edge){
  var grid=$("grid");if(!grid)return;
  var target=edge==="bottom"?Math.max(0,grid.scrollHeight-grid.clientHeight):0;
  grid.scrollTo({top:target,behavior:"smooth"});
 }
 function renderSelection(){var n=state.selected.size;var bar=$("selectionbar"),count=$("selectedCount"),top=$("selectAll");bar.classList.toggle("open",n>0);if(count){var label=count.querySelector("span:last-child");if(label)label.textContent="已选择 "+n+" 本";}if(top){top.classList.toggle("is-active",n>0);top.innerHTML='<span class="batch-header-icon" aria-hidden="true">'+(n?'✓':'+')+'</span><span>批量选择</span>';top.setAttribute("aria-pressed",n>0?"true":"false");}} var searchIndexPromise=null;
 function ensureSearchIndex(){
  if(state.indexReady)return Promise.resolve();
  if(searchIndexPromise)return searchIndexPromise;
  showToast("正在建立本地搜索索引…");
  searchIndexPromise=Promise.resolve()
   .then(function(){return globalThis.BookNoteAnnotations?BookNoteAnnotations.migrateAll():null;})
   .catch(function(){return null;})
   .then(function(){return BookNoteSearchIndex.ensure(state.books);})
   .then(function(){state.indexReady=true;})
   .finally(function(){searchIndexPromise=null;});
  return searchIndexPromise;
 }
 function resetShelfToDefault(){
  /* v7.10.152: Refresh means reload the bookshelf and return to its normal default state. */
  var i=$("search");
  if(i)i.value="";
  updateSearchClear();
  hideSearchHistory();
  clearTimeout(searchTimer);
  ++searchSeq;
  state.query="";
  state.indexResults=null;
  state.searchError="";
  state.extractSelected.clear();
  state.selected.clear();
  state.format="all";
  state.category="all";
  state.status="all";
  /* v7.18.34: refresh must not reset the user's manual sort choice. */
  var sort=$("sort");
  state.sort=state.sort||"updated";
  if(sort)sort.value=state.sort;
  state.view="grid";
  var modal=$("modal");
  if(modal)modal.hidden=true;
 }
 function reload(preserveShelfState){
  var savedShelfState=preserveShelfState?{format:state.format,category:state.category,status:state.status,sort:state.sort,view:state.view}:null;
  resetShelfToDefault();
  if(savedShelfState){
   state.format=savedShelfState.format||"all";
   state.category=savedShelfState.category||"all";
   state.status=savedShelfState.status||"all";
   state.sort=savedShelfState.sort||"updated";
   state.view=savedShelfState.view||"grid";
   var preservedSort=$("sort");
   if(preservedSort)preservedSort.value=state.sort;
  }
  return Promise.all([allBooks().catch(function(){return []; }),getCategories().catch(function(){return ["未分类"];})])
   .then(function(r){
    state.books=Array.isArray(r[0])?r[0]:[];
    state.indexResults=null;state.indexReady=false;state.searchError="";
    state.states={};
    renderFilters();render(state.books);renderSelection();
    return readingStates(state.books).then(function(st){state.states=st||{};renderFilters();render(state.books);renderSelection();showToast("书架已刷新");}).catch(function(e){
     console.warn("BookNote shelf reading-state load skipped",e);state.states={};renderFilters();render(state.books);renderSelection();showToast("书架已刷新");
    });
   });
 }
 function persistBooks(updateFn){return BookLibraryDB.listNotes().then(function(ns){var books=ns.filter(isBook);updateFn(books);return BookLibraryDB.saveNotes(books.concat(ns.filter(function(n){return !isBook(n);})));}).then(function(){return reload(true);});}
 function removeIds(ids){if(!ids.length)return;var names=state.books.filter(function(n){return ids.indexOf(n.id)>=0;}).map(title).join("、");if(!confirm("确认删除 "+ids.length+" 本书籍？\n\n"+names.slice(0,160)+(names.length>160?"…":"")+"\n\n删除后会同时清理阅读进度与书签。"))return;var keys=ids.map(function(id){return "booknoteReadingState:"+String(id)});return Promise.all(ids.map(function(id){return BookLibraryDB.removeBook(id);})).then(function(){return keys.length?browser.storage.local.remove(keys):null;}).then(function(){return globalThis.BookNoteAnnotations?Promise.all(ids.map(function(id){return BookNoteAnnotations.removeBook(id).catch(function(){return 0;});})):null;}).then(function(){ids.forEach(function(id){state.selected.delete(id)});showToast("已删除 "+ids.length+" 本书籍");return reload();});}
 function setStatus(status){var ids=Array.from(state.selected);if(!ids.length||!status)return;return persistBooks(function(bs){bs.forEach(function(n){if(ids.indexOf(n.id)>=0)n.readingStatus=status;});}).then(function(){state.selected.clear();showToast("状态已更新");});}
 function moveSelected(cat){var ids=Array.from(state.selected);if(!ids.length||!cat)return;return persistBooks(function(bs){bs.forEach(function(n){if(ids.indexOf(n.id)>=0)n.category=cat;});}).then(function(){state.selected.clear();showToast("已移动到「"+cat+"」");});}
 function moveBook(id,cat){return persistBooks(function(bs){bs.forEach(function(n){if(n.id===id)n.category=cat;});}).then(function(){showToast("已移动到「"+cat+"」");});}
 function detail(n){state.detail=n;var c=$("detail"),src=cover(n),p=Math.round(progressOf(n)*100),st=statusOf(n);c.innerHTML=(src?'<div class="detail-cover"><img class="detail-cover-image" data-cover-fallback="1" data-book-id="'+esc(n.id)+'" src="'+src+'" alt="'+esc(title(n)||"")+'"></div>':'<div class="detail-cover">'+defaultCover(n,true)+'</div>')+'<dl><dt>书名</dt><dd>'+esc(title(n))+'</dd><dt>作者</dt><dd>'+esc(author(n)||"未填写")+'</dd><dt>状态</dt><dd>'+statusLabel(st)+" · "+p+"%"+'</dd><dt>格式</dt><dd>'+esc(format(n).toUpperCase())+'</dd><dt>文件名</dt><dd>'+esc(n.documentFileName||"")+'</dd><dt>文件大小</dt><dd>'+esc(bytes(n)||"未知")+'</dd><dt>分类</dt><dd>'+esc(n.category||"未分类")+'</dd><dt>导入时间</dt><dd>'+esc(fmtTime(n.createdAt)||"未知")+'</dd><dt>最后阅读</dt><dd>'+esc(fmtTime((state.states[n.id]||{}).updatedAt)||"尚未阅读")+'</dd><dt>修改状态</dt><dd>'+((n.documentModified)?"已编辑":"原文件")+'</dd></dl>';bindCoverFallback(c);$('modal').hidden=false;}
 function createCategory(){
  var name=prompt("新建书架分类名称：","");name=String(name||"").trim();if(!name)return;
  getCategories().then(function(c){if(c.indexOf(name)>=0){showToast("分类已存在");return null;}c.push(name);return setCategories(c);}).then(function(){if(!name)return;state.category=name;return reload(true);}).then(function(){if(name)showToast("分类已创建："+name);});
 }
 function renderCategoryManager(){
  var box=$("categoryManagerList");if(!box)return;
  getCategories().then(function(cats){
   cats=Array.isArray(cats)&&cats.length?cats:["未分类"];
   box.innerHTML=cats.map(function(c){var count=state.books.filter(function(n){return (n.category||"未分类")===c;}).length;return '<div class="category-manager-row" data-manager-category="'+esc(c)+'"><span class="category-manager-name">'+bnIcon("bookshelf","sm")+'<strong>'+esc(c)+'</strong><em>'+count+' 本</em></span><span class="category-manager-actions"><button type="button" data-rename-category="'+esc(c)+'">重命名</button><button type="button" class="danger" data-delete-category="'+esc(c)+'" '+(c==="未分类"?'disabled title="默认分类不能删除"':'')+'>删除</button></span></div>';}).join("");
  });
 }
 function openCategoryManager(){var m=$("categoryManager");if(!m)return;renderCategoryManager();m.hidden=false;}
 function closeCategoryManager(){var m=$("categoryManager");if(m)m.hidden=true;}
 function renameCategory(oldName){var name=prompt("重命名分类：",oldName);name=String(name||"").trim();if(!name||name===oldName)return;getCategories().then(function(cats){if(cats.indexOf(name)>=0){showToast("分类已存在");return null;}var i=cats.indexOf(oldName);if(i<0)return null;cats[i]=name;return setCategories(cats).then(function(){return persistBooks(function(bs){bs.forEach(function(n){if((n.category||"未分类")===oldName)n.category=name;});});});}).then(function(){renderCategoryManager();showToast("分类已重命名");});}
 function deleteCategory(name){if(name==="未分类")return;var count=state.books.filter(function(n){return (n.category||"未分类")===name;}).length;if(!confirm("删除分类「"+name+"」？\n\n"+count+" 本书将转入「未分类」，书籍本身不会删除。"))return;getCategories().then(function(cats){cats=cats.filter(function(c){return c!==name;});return setCategories(cats);}).then(function(){return persistBooks(function(bs){bs.forEach(function(n){if((n.category||"未分类")===name)n.category="未分类";});});}).then(function(){if(state.category===name)state.category="all";renderCategoryManager();showToast("分类已删除，书籍已转入未分类");});}

 var searchHistory=[],searchSeq=0,searchTimer=0;
 /* v7.10.151 P1: compact UI-ready search-result cache. Never cache full book bodies. */
 var SEARCH_CACHE_MAX_ENTRIES=5,SEARCH_CACHE_MAX_BYTES=6*1024*1024;
 var searchCache=new Map(),searchCacheBytes=0,searchCacheVersion="",searchCacheHits=0,searchCacheMisses=0;
 function searchCacheVersionOf(books,annotations){
  var a=(books||state.books||[]).map(function(n){return String(n&&n.id||"")+"|"+String(n&&n.updatedAt||n&&n.createdAt||"")+"|"+String(n&&n.documentFileSize||0)+"|"+(n&&n.documentModified?1:0);});
  var an=(annotations||[]).map(function(n){return String(n&&n.id||"")+"|"+String(n&&n.updatedAt||n&&n.createdAt||"")+"|"+String(n&&n.text||"")+"|"+String(n&&n.note||"")+"|"+String(n&&n.chapterIndex||0)+"|"+String(n&&n.start||"")+"|"+String(n&&n.end||"");});
  an.sort();
  var x=a.join("§")+"¶"+an.join("§"),h=2166136261;
  for(var i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619);}
  return String(a.length)+":"+(h>>>0).toString(16);
 }
 function clearSearchResultCache(){searchCache.clear();searchCacheBytes=0;searchCacheVersion="";}
 function touchSearchCache(key,entry){searchCache.delete(key);searchCache.set(key,entry);}
 function estimateSearchResultBytes(grouped){try{return JSON.stringify(grouped).length*2;}catch(_){return 0;}}
 function putSearchResultCache(key,version,grouped){
  var bytes=estimateSearchResultBytes(grouped);
  if(!bytes||bytes>SEARCH_CACHE_MAX_BYTES)return false;
  if(searchCacheVersion!==version){clearSearchResultCache();searchCacheVersion=version;}
  var old=searchCache.get(key);if(old){searchCacheBytes-=old.bytes;searchCache.delete(key);}
  while(searchCache.size>=SEARCH_CACHE_MAX_ENTRIES||searchCacheBytes+bytes>SEARCH_CACHE_MAX_BYTES){var first=searchCache.keys().next();if(first.done)break;var ev=searchCache.get(first.value);searchCache.delete(first.value);searchCacheBytes-=ev&&ev.bytes||0;}
  searchCache.set(key,{version:version,grouped:grouped,bytes:bytes,createdAt:Date.now()});searchCacheBytes+=bytes;return true;
 }
 function getSearchResultCache(key,version){
  if(searchCacheVersion!==version){clearSearchResultCache();searchCacheVersion=version;return null;}
  var entry=searchCache.get(key);if(!entry||entry.version!==version)return null;
  touchSearchCache(key,entry);return entry.grouped;
 }
 globalThis.BookNoteSearchCache={clear:clearSearchResultCache,stats:function(){return {entries:searchCache.size,bytes:searchCacheBytes,maxEntries:SEARCH_CACHE_MAX_ENTRIES,maxBytes:SEARCH_CACHE_MAX_BYTES,hits:searchCacheHits,misses:searchCacheMisses,version:searchCacheVersion};}};
 function loadSearchHistory(){return browser.storage.local.get("booknoteSearchHistory").then(function(r){searchHistory=Array.isArray(r.booknoteSearchHistory)?r.booknoteSearchHistory.filter(function(x){return typeof x==="string"&&x.trim();}).slice(0,5):[];});}
 function saveSearchHistory(q){q=String(q||"").trim();if(!q)return;searchHistory=searchHistory.filter(function(x){return x!==q;});searchHistory.unshift(q);searchHistory=searchHistory.slice(0,5);var o={booknoteSearchHistory:searchHistory};void browser.storage.local.set(o);}
 function renderSearchHistory(filter){var box=$("searchHistory");if(!box)return;var q=String(filter||"").trim().toLocaleLowerCase(),items=q?searchHistory.filter(function(x){return x.toLocaleLowerCase().indexOf(q)>=0;}):searchHistory;box.innerHTML='<div class="search-history-head"><span>搜索历史</span><button type="button" id="clearSearchHistory" title="清空搜索记录">清空记录</button></div>'+(items.length?items.map(function(x){return '<button type="button" class="search-history-item" data-history-query="'+esc(x)+'"><span>🕘</span><span>'+esc(x)+'</span></button>';}).join(''):'<div class="search-history-empty">'+(searchHistory.length&&q?'没有匹配的历史记录':'暂无搜索历史')+'</div>');var clear=$("clearSearchHistory");if(clear)clear.onclick=function(e){e.preventDefault();e.stopPropagation();searchHistory=[];void browser.storage.local.remove("booknoteSearchHistory");renderSearchHistory("");};box.querySelectorAll("[data-history-query]").forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();$("search").value=b.getAttribute("data-history-query")||"";hideSearchHistory();runSearch(true);};});}
 function showSearchHistory(){var box=$("searchHistory");if(!box)return;box.hidden=false;renderSearchHistory($("search").value);}
 function hideSearchHistory(){var box=$("searchHistory");if(box)box.hidden=true;}
 function updateSearchClear(){var b=$("searchClear"),i=$("search");if(!b||!i)return;b.classList.toggle("visible",!!String(i.value||""));}
 function resetSearchUI(opts){opts=opts||{};var i=$("search");if(i)i.value="";updateSearchClear();state.query="";state.indexResults=null;state.searchError="";state.extractSelected.clear();++searchSeq;clearTimeout(searchTimer);hideSearchHistory();var box=$("searchResults");if(box){box.hidden=true;box.innerHTML="";}var main=document.querySelector(".main"),summary=main&&main.querySelector(".summary");if(main)main.classList.remove("search-mode");if(summary)summary.hidden=false;render(state.books);if(opts.focus&&i)i.focus();}
 function closeSearchResults(){resetSearchUI({focus:false});showToast("已关闭搜索结果");}
 function clearSearch(){resetSearchUI({focus:true});}
 function runSearch(save){
  var q=$("search").value.trim();updateSearchClear();state.query=q;state.indexResults=null;state.searchError="";state.extractSelected.clear();var seq=++searchSeq;hideSearchHistory();
  if(!q){resetSearchUI({focus:false});return;}
  var key=BookNoteSearchIndex.normalize(q)||q.toLocaleLowerCase(),started=performance.now();
  Promise.all([BookLibraryDB.listMeta(),globalThis.BookNoteAnnotations?BookNoteAnnotations.search(q):Promise.resolve([])]).then(function(pair){
    var freshBooks=pair[0]||[],annotations=pair[1]||[];
    if(seq!==searchSeq||state.query!==q)return null;
    var version=searchCacheVersionOf(freshBooks,annotations),cached=getSearchResultCache(key,version);
    if(cached){
      searchCacheHits++;state.indexResults=Object.assign({},cached,{query:q});
      console.info("[BookNote Search Cache] HIT",{query:q,results:(cached.books||[]).length,paragraphs:Number(cached.paragraphCount)||0,annotations:(cached.annotationResults||[]).length,timeMs:Math.round(performance.now()-started),cache:globalThis.BookNoteSearchCache.stats()});
      saveSearchHistory(q);render(state.books);return null;
    }
    searchCacheMisses++;console.info("[BookNote Search Cache] MISS",{query:q});render(state.books);
    return ensureSearchIndex().then(function(){if(seq!==searchSeq||state.query!==q)return null;return Promise.all([BookNoteSearchIndex.search(q),Promise.resolve(annotations)]);}).then(function(pair2){
      if(seq!==searchSeq||state.query!==q||!pair2)return null;
      return BookNoteSearchIndex.extractParagraphs(pair2[0],{limit:0,query:q}).then(function(items){
        if(seq!==searchSeq||state.query!==q)return null;
        var grouped=BookNoteSearchIndex.buildGroupedResult(pair2[0],items,q);
        grouped.annotationResults=(pair2[1]||[]).map(function(a){var b=freshBooks.find(function(x){return String(x.id)===String(a.bookId);})||{};return {id:String(a.id),bookId:String(a.bookId||''),bookTitle:title(b),type:String(a.type||'note'),chapterIndex:a.chapterIndex,chapterLabel:String(a.chapterLabel||''),start:a.start,end:a.end,text:String(a.text||''),note:String(a.note||''),tags:Array.isArray(a.tags)?a.tags.slice():[]};});
        return grouped;
      });
    }).then(function(grouped){
      if(seq!==searchSeq||state.query!==q||!grouped)return;
      putSearchResultCache(key,version,grouped);state.indexResults=grouped;saveSearchHistory(q);render(state.books);
      console.info("[BookNote Search Cache] STORE",{query:q,results:(grouped.books||[]).length,paragraphs:Number(grouped.paragraphCount)||0,annotations:(grouped.annotationResults||[]).length,timeMs:Math.round(performance.now()-started),cache:globalThis.BookNoteSearchCache.stats()});
    });
  }).catch(function(e){if(seq!==searchSeq)return;state.searchError=e&&e.message||"索引异常";state.indexResults=null;render(state.books);showToast("搜索失败："+state.searchError);});
 }

 $("search").oninput=function(){updateSearchClear();showSearchHistory();clearTimeout(searchTimer);searchTimer=setTimeout(function(){runSearch(false);},90);};
 $("search").onfocus=function(){updateSearchClear();showSearchHistory();};
 $("searchClear").onclick=function(e){e.preventDefault();e.stopPropagation();clearSearch();};
 $("searchSubmit").onclick=function(e){e.preventDefault();e.stopPropagation();clearTimeout(searchTimer);runSearch(true);$("search").focus();};
 $("search").onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();clearTimeout(searchTimer);runSearch(true);}else if(e.key==="Escape"){hideSearchHistory();}};
 document.addEventListener("mousedown",function(e){var w=$("searchHistory"),wrap=document.querySelector(".search-wrap");if(w&&wrap&&!wrap.contains(e.target))hideSearchHistory();});
 $("filters").addEventListener("click",function(e){var b=e.target.closest("[data-format]");if(!b)return;state.format=b.dataset.format||"all";state.selected.clear();renderFilters();render(state.books);renderSelection();});
 $("categories").addEventListener("click",function(e){var select=e.target.closest("#selectAll");if(select){e.preventDefault();e.stopPropagation();var arr=filtered();if(state.selected.size===arr.length&&arr.length){state.selected.clear();}else{arr.forEach(function(n){state.selected.add(n.id);});}render(state.books);renderSelection();return;}var manage=e.target.closest("#manageCategories");if(manage){e.preventDefault();e.stopPropagation();return openCategoryManager();}var b=e.target.closest("[data-category]");if(!b)return;state.category=b.dataset.category||"all";state.selected.clear();renderFilters();render(state.books);renderSelection();});
 $("categoryManager").addEventListener("click",function(e){var close=e.target.closest("[data-category-manager-close]");if(close)return closeCategoryManager();var create=e.target.closest("#categoryManagerCreate");if(create)return createCategory();var ren=e.target.closest("[data-rename-category]");if(ren)return renameCategory(ren.getAttribute("data-rename-category"));var del=e.target.closest("[data-delete-category]");if(del&&!del.disabled)return deleteCategory(del.getAttribute("data-delete-category"));if(e.target===$("categoryManager"))closeCategoryManager();});
 $("categories").addEventListener("dragover",function(e){var b=e.target.closest("[data-category]");if(b){e.preventDefault();b.classList.add("drop-target");}});$("categories").addEventListener("dragleave",function(e){var b=e.target.closest("[data-category]");if(b)b.classList.remove("drop-target");});$("categories").addEventListener("drop",function(e){var b=e.target.closest("[data-category]");if(!b)return;e.preventDefault();b.classList.remove("drop-target");var id=e.dataTransfer.getData("text/booknote-id");if(id&&b.dataset.category&&b.dataset.category!=="all")moveBook(id,b.dataset.category);});
 $("grid").addEventListener("click",function(e){var card=e.target.closest(".card");if(!card)return;var n=state.books.find(function(x){return x.id===card.dataset.id;});if(!n)return;if(e.target.closest("[data-select]")){if(state.selected.has(n.id))state.selected.delete(n.id);else state.selected.add(n.id);render(state.books);renderSelection();return;}if(e.target.closest("[data-open]")){return openBookForReading(n);}if(e.target.closest("[data-detail]"))return detail(n);if(e.target.closest("[data-delete]"))return removeIds([n.id]);});
 $("grid").addEventListener("keydown",function(e){if(e.key!=="Enter"&&e.key!==" ")return;var target=e.target.closest("[data-open]");if(!target)return;e.preventDefault();var card=target.closest(".card"),n=card&&state.books.find(function(x){return x.id===card.dataset.id;});if(n)openBookForReading(n);});
 $("grid").addEventListener("dragstart",function(e){var card=e.target.closest(".card");if(!card)return;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/booknote-id",card.dataset.id);card.style.opacity=".55";});$("grid").addEventListener("dragend",function(e){var card=e.target.closest(".card");if(card)card.style.opacity="";});
 $("selectNone").onclick=function(){state.selected.clear();render(state.books);renderSelection();};$("batchDelete").onclick=function(){removeIds(Array.from(state.selected));};$("batchStatus").onchange=function(){var v=this.value;this.value="";setStatus(v);};$("batchCategory").onchange=function(){var v=this.value;this.value="";moveSelected(v);};
 $("sort").onchange=function(){state.sort=this.value||"updated";state.selected.clear();render(state.books);renderSelection();};
 $("gridView").onclick=function(){state.view="grid";render(state.books);updateShelfScrollControls();};$("listView").onclick=function(){state.view="list";render(state.books);updateShelfScrollControls();};$("refresh").onclick=reload;
 var shelfScrollTop=$("shelfScrollTop"),shelfScrollBottom=$("shelfScrollBottom");
 if(shelfScrollTop)shelfScrollTop.onclick=function(){scrollShelfTo("top");};
 if(shelfScrollBottom)shelfScrollBottom.onclick=function(){scrollShelfTo("bottom");};
 var shelfGrid=$("grid");if(shelfGrid)shelfGrid.addEventListener("scroll",updateShelfScrollControls,{passive:true});
 window.addEventListener("resize",updateShelfHeaderHeight,{passive:true});
 updateShelfHeaderHeight();
 window.addEventListener("resize",updateShelfScrollControls);

 var homeNav=$("homeNav");if(homeNav)homeNav.onclick=function(){openPanel("");};
 var readerNav=$("readerNav");if(readerNav)readerNav.onclick=function(){var first=(state.books||[])[0];if(first){browser.tabs.create({url:browser.runtime.getURL("reader/reader.html")+"?bookId="+encodeURIComponent(String(first.id)),active:true});}else{showToast("书架暂无可阅读书籍");}};$("back").onclick=function(){if(history.length>1)history.back();else openPanel("");};$("close").onclick=$("detailClose").onclick=function(){$("modal").hidden=true;};$("modal").onclick=function(e){if(e.target===$("modal"))$("modal").hidden=true;};
 browser.storage.onChanged.addListener(function(changes,area){if(area!=="local"||!changes.booknotePanelState)return;var st=changes.booknotePanelState.newValue||{};applyShelfTheme({themeName:THEME_LABELS[st.themeName]?st.themeName:"everforest",themeMode:st.themeMode==="night"?"night":"day"});});
 var shelfIO=$("shelfIO"),shelfIOModal=$("shelfIOModal"),shelfIOClose=$("shelfIOClose");
 var shelfImportProgress=$("shelfImportProgress"),shelfImportProgressTitle=$("shelfImportProgressTitle"),shelfImportProgressCount=$("shelfImportProgressCount"),shelfImportProgressBar=$("shelfImportProgressBar"),shelfImportProgressFile=$("shelfImportProgressFile"),shelfImportProgressHideTimer=0;
 function updateShelfImportProgress(d){
  if(!shelfImportProgress)return;
  var total=Math.max(0,Number(d&&d.total)||0),current=Math.max(0,Math.min(total,Number(d&&d.current)||0)),pct=total?Math.round(current/total*100):0,phase=String(d&&d.phase||"importing"),status=String(d&&d.status||"");
  shelfImportProgress.hidden=false;
  shelfImportProgressTitle.textContent=phase==="starting"?"准备导入书籍":phase==="done"?"书籍导入完成":"正在导入书籍";
  shelfImportProgressCount.textContent=current+" / "+total;
  shelfImportProgressBar.style.width=pct+"%";
  shelfImportProgressFile.textContent=d&&d.fileName?(status==="failed"?"失败：":"正在处理：")+d.fileName:(phase==="done"?"正在刷新书架…":"准备中…");
  clearTimeout(shelfImportProgressHideTimer);
  if(phase==="done")shelfImportProgressHideTimer=setTimeout(function(){shelfImportProgress.hidden=true;},3200);
 }
 window.addEventListener("message",function(e){
  var d=e&&e.data||{},frame=$("shelfIOFrame");
  if(frame&&e.source&&e.source!==frame.contentWindow)return;
  if(!d)return;
  if(d.type==="booknote-shelf-import-progress"){updateShelfImportProgress(d);return;}
  if(d.type!=="booknote-shelf-import-complete")return;
  var count=Math.max(0,Number(d.count)||0),failed=Math.max(0,Number(d.failed)||0);
  if(count>0){
   if(shelfIOModal)shelfIOModal.hidden=true;
   reload().then(function(){showToast("已导入 "+count+" 本书籍，书架已自动刷新"+(failed?"；失败 "+failed+" 本":""));}).catch(function(err){console.error("shelf import refresh failed",err);showToast("已导入 "+count+" 本，但书架刷新失败");});
  }else if(failed){
   showToast("书籍导入失败："+failed+" 本");
  }
 });
 if(shelfIO)shelfIO.onclick=function(){if(shelfIOModal)shelfIOModal.hidden=false;};
 if(shelfIOClose)shelfIOClose.onclick=function(){if(shelfIOModal)shelfIOModal.hidden=true;};
 if(shelfIOModal)shelfIOModal.addEventListener("click",function(e){if(e.target===shelfIOModal)shelfIOModal.hidden=true;});
var shelfTheme=$("shelfTheme"),shelfMode=$("shelfMode");
 if(shelfTheme)shelfTheme.onclick=function(){readThemeState().then(function(t){var names=Object.keys(THEME_LABELS),i=Math.max(0,names.indexOf(t.themeName));return saveShelfTheme({themeName:names[(i+1)%names.length],themeMode:t.themeMode});});};
 if(shelfMode)shelfMode.onclick=function(){return (globalThis.BookNoteGlobalTheme?BookNoteGlobalTheme.toggleMode():readThemeState().then(function(t){return saveShelfTheme({themeName:t.themeName,themeMode:t.themeMode==="night"?"day":"night"});})).then(applyShelfTheme);};
 Promise.all([
  loadSearchHistory().catch(function(){searchHistory=[];}),
  readThemeState().then(applyShelfTheme).catch(function(){applyShelfTheme({themeName:"everforest",themeMode:"day"});})
 ]).then(function(){
  return reload();
 }).then(function(){
  updateShelfScrollControls();
  document.body.classList.remove("booting");
  /* Warm DB migration and persistent search cache only after the shelf is visible. */
  var warm=function(){if(globalThis.BookLibraryDB&&typeof BookLibraryDB.ensure==="function"){BookLibraryDB.ensure().catch(function(e){console.warn("BookLibraryDB background migration skipped",e);});}ensureSearchIndex().catch(function(e){console.warn("BookNote search index warm-up skipped",e);});};
  if(typeof requestIdleCallback==="function")requestIdleCallback(warm,{timeout:1500});
  else setTimeout(warm,0);
 }).catch(function(e){
  console.error("BookNote shelf initial render failed",e);
  document.body.classList.remove("booting");
 });
})();
