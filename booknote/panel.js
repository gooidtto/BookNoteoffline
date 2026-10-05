/* v146-refresh-layout: refresh remains functionally unchanged; header is CSS-only. */
var browser=globalThis.browser;
try{if(new URLSearchParams(location.search).get("embeddedIO")==="1")document.body.setAttribute("data-embedded-io","1");}catch(_){ }
var q=document.getElementById("q"),list=document.getElementById("list"),status=document.getElementById("status");
var fileInput=document.getElementById("file"), toastEl=document.getElementById("toast");
var view="all",bookFilter="",categoryFilter="";
var activeSearch="";
var panelSearchResults=null,panelSearchSeq=0,panelSearchTimer=0,panelExtractSelected=new Set();
var cache=[];
function bnIcon(name,cls){return '<img class="bn-icon '+(cls||'')+'" src="'+browser.runtime.getURL("img/ui/"+name+".png")+'" alt="" aria-hidden="true">';}

function applySectionStates(st){
 var states=(st&&st.navSections)||{};
 [["sectionQuick","quick"],["sectionCategories","categories"],["sectionBooks","books"],["sectionExport","export"]].forEach(function(pair){
  var sec=document.getElementById(pair[0]); if(!sec)return;
  var collapsed=Boolean(states[pair[1]]);
  sec.classList.toggle("collapsed",collapsed);
  var b=sec.querySelector(".section-toggle");
  if(b)b.textContent=collapsed?"⌄":"⌃";
 });
}
function toggleSection(key){
 return browser.storage.local.get("booknotePanelState").then(function(r){
  var st=r.booknotePanelState||{};
  st.navSections=st.navSections||{};
  st.navSections[key]=!Boolean(st.navSections[key]);
  applySectionStates(st);
  return browser.storage.local.set({booknotePanelState:st});
 });
}
function saveUiState(extra){
 return browser.storage.local.get("booknotePanelState").then(function(r){
  var st=r.booknotePanelState||{};
  if(extra)Object.keys(extra).forEach(function(k){st[k]=extra[k];});
  return browser.storage.local.set({booknotePanelState:st});
 });
}
const THEME_NAMES_ZH = {
  nord:"北欧冷色",
  atom:"原子深色",
  everforest:"森林深色",
  onehalf:"单色深黑",
  dracula:"德古拉"
};
function themeNameZh(name){ return THEME_NAMES_ZH[name] || "北欧冷色"; }

function applyThemeState(st){
 var n=globalThis.BookNoteGlobalTheme?BookNoteGlobalTheme.normalize(st):{themeName:(st&&st.themeName)||"everforest",themeMode:(st&&st.themeMode)==="night"?"night":"day"};
 var theme=n.themeName,mode=n.themeMode;
 document.body.setAttribute("data-theme",theme);
 document.body.setAttribute("data-mode",mode);
 var main=document.getElementById("themeMain");
 var modeBtn=document.getElementById("themeMode");
 var picker=document.getElementById("themePicker");
 var labels={nord:"北欧冷色",atom:"原子深色",everforest:"森林深色",onehalf:"单色深黑",dracula:"德古拉"};
 if(main)main.innerHTML='<span class="color-icon">'+bnIcon('theme','sm')+'</span> '+(labels[theme]||"主题");
 if(modeBtn){modeBtn.innerHTML=bnIcon(mode==='night'?'moon':'sun','sm')+'<span class="theme-mode-label">'+(mode==='night'?'黑夜':'白天')+'</span>';modeBtn.title=mode==='night'?'切换到白天':'切换到黑夜';modeBtn.setAttribute('aria-label',mode==='night'?'黑夜':'白天');}
 document.querySelectorAll(".theme-option").forEach(function(el){el.classList.toggle("active",el.dataset.themeChoice===theme);});
 if(picker)picker.classList.remove("open");
}
function saveThemeState(theme,mode){
 if(globalThis.BookNoteGlobalTheme)return BookNoteGlobalTheme.update({themeName:theme,themeMode:mode});
 return browser.storage.local.get("booknotePanelState").then(function(r){var st=r.booknotePanelState||{};st.themeName=theme||st.themeName||"everforest";st.themeMode=mode||st.themeMode||"day";return browser.storage.local.set({booknotePanelState:st}).then(function(){return st;});});
}
function applyUiState(st){
 var nav=document.querySelector(".nav");
 if(nav)nav.classList.toggle("collapsed",!!(st&&st.navCollapsed));
 var nb=document.getElementById("navToggle");
 if(nb){
  var c=!!(st&&st.navCollapsed);
  nb.title=c?"展开左侧栏":"收起左侧栏";
  nb.innerHTML='<span class="svg-icon-wrap '+(c?'expanded':'')+'"><svg class="svg-icon svg-collapse" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7V5z"/></svg></span><span class="nav-toggle-text">'+(c?'展开':'收起')+'</span>';
 }
}
function getPanelState(){
 return browser.storage.local.get("booknotePanelState").then(function(r){
  var st=r.booknotePanelState;
  if(!st||typeof st!=="object") return null;
  return st;
 });
}
function savePanelState(){
 return browser.storage.local.get("booknotePanelState").then(function(r){
  var st=r.booknotePanelState||{};
  st.view=view;
  st.bookFilter=bookFilter;
  st.categoryFilter=categoryFilter;
    return browser.storage.local.set({booknotePanelState:st});
 });
}

function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}

function getSearchHistory(){
 return browser.storage.local.get("booknoteSearchHistory").then(function(r){
  return Array.isArray(r.booknoteSearchHistory)?r.booknoteSearchHistory.filter(function(x){return typeof x==="string"&&x.trim();}):[];
 });
}
function saveSearchHistory(term){
 term=String(term||"").trim();
 if(!term)return Promise.resolve();
 return getSearchHistory().then(function(items){
  items=items.filter(function(x){return x!==term;});
  items.unshift(term);
  items=items.slice(0,5);
  return browser.storage.local.set({booknoteSearchHistory:items}).then(renderSearchHistory);
 });
}

function clearSearchHistory(){
  return browser.storage.local.remove("booknoteSearchHistory").then(function(){
    renderSearchHistory();
    if(typeof toast==="function")toast("搜索历史已清空");
  });
}
var clearSearchHistoryBound = false;
function bindClearSearchHistory(){
  if(clearSearchHistoryBound)return;
  var b=document.getElementById("clearSearchHistory");
  if(!b)return;
  clearSearchHistoryBound=true;
  b.addEventListener("click",function(e){
    e.preventDefault();
    e.stopPropagation();
    clearSearchHistory();
  });
}
function renderSearchHistory(){
 var box=document.getElementById("searchHistory");
 if(!box)return Promise.resolve();
 return getSearchHistory().then(function(items){
  box.innerHTML='<div class="search-history-head"><span>搜索历史</span><button id="clearSearchHistory" type="button" title="清空搜索记录">清空记录</button></div>'+
   (items.length?items.map(function(x){
    return '<button type="button" class="search-history-item" data-search="'+esc(x)+'">'+bnIcon('search')+'<span>'+esc(x)+'</span></button>';
   }).join(""):'<div class="search-history-empty">暂无搜索历史</div>')+
   '';
  var clearBtn=box.querySelector("#clearSearchHistory");
  if(clearBtn) clearBtn.onclick=function(e){
   e.preventDefault();e.stopPropagation();
   clearSearchHistory();
  };
  box.querySelectorAll(".search-history-item").forEach(function(el){
   el.onclick=function(e){
    e.preventDefault();e.stopPropagation();
    var term=el.getAttribute("data-search")||"";
    q.value=term;
    box.classList.remove("open");
    runPanelLocalSearch(term);
   };
  });
 });
}
function commitSearch(){
 var term=q.value.trim();
 if(!term){activeSearch="";panelSearchResults=null;panelExtractSelected.clear();render();return;}
 runPanelLocalSearch(term);
 var box=document.getElementById("searchHistory");
 if(box)box.classList.remove("open");
}

function get(){return globalThis.BookLibraryDB?BookLibraryDB.listNotes():browser.storage.local.get("booknoteNotes").then(function(r){return Array.isArray(r.booknoteNotes)?r.booknoteNotes:[];});}
function set(ns){return globalThis.BookLibraryDB?BookLibraryDB.saveNotes(ns):browser.storage.local.set({booknoteNotes:ns});}
function getCategories(){return browser.storage.local.get("booknoteCategories").then(function(r){var c=Array.isArray(r.booknoteCategories)?r.booknoteCategories:[];if(!c.length)c=["未分类"];return c;});}
function setCategories(c){return browser.storage.local.set({booknoteCategories:c});}
function renderCategoryManagePanel(categories){
 var body=document.getElementById("categoryManageBody");
 if(!body)return;
 var cats=Array.isArray(categories)?categories:["未分类"];
 body.innerHTML=cats.map(function(name){
  return '<div class="category-manage-row"><span>'+esc(name)+'</span><span class="category-actions"><button type="button" class="category-action" data-manage-rename="'+esc(name)+'" title="重命名">✏️</button><button type="button" class="category-action" data-manage-delete="'+esc(name)+'" title="删除">🗑️</button></span></div>';
 }).join("");
 body.querySelectorAll("[data-manage-rename]").forEach(function(b){b.onclick=function(){renameCategory(b.getAttribute("data-manage-rename"));};});
 body.querySelectorAll("[data-manage-delete]").forEach(function(b){b.onclick=function(){deleteCategory(b.getAttribute("data-manage-delete"));};});
}
function noteCategory(n){return n.category||"未分类";}
function noteName(n){return n.name||n.pageTitle||"未命名笔记";}
function normalizeSearchSummaryNames(ns){
 var changed=false,arr=Array.isArray(ns)?ns:[];
 arr.forEach(function(n){
  if(!n||n.sourceType!=="search-summary")return;
  var term=String(n.searchQuery||"").trim();
  if(!term)return;
  var desiredName=term,desiredPageTitle="搜索内容："+term;
  if(n.name!==desiredName){n.name=desiredName;changed=true;}
  if(n.pageTitle!==desiredPageTitle){n.pageTitle=desiredPageTitle;changed=true;}
  if(n.category!==term){n.category=term;changed=true;}
 });
 return browser.storage.local.get("booknoteCategories").then(function(r){var cats=Array.isArray(r.booknoteCategories)?r.booknoteCategories.slice():[];if(!cats.length)cats=["未分类"];arr.forEach(function(n){if(n&&n.sourceType==="search-summary"){var c=String(n.category||n.searchQuery||"").trim();if(c&&cats.indexOf(c)<0){cats.push(c);changed=true;}}});var saveCats=browser.storage.local.set({booknoteCategories:cats});return changed?Promise.all([set(arr),saveCats]).then(function(){return arr;}):saveCats.then(function(){return arr;});});
}
function toast(msg){toastEl.textContent=msg;toastEl.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(function(){toastEl.classList.remove("show");},1800);}
function notifyShelfImportComplete(count,failed){try{if(window.parent&&window.parent!==window)window.parent.postMessage({type:"booknote-shelf-import-complete",count:Number(count)||0,failed:Number(failed)||0},"*");}catch(e){console.warn("shelf import refresh notify skipped",e);}}
function notifyShelfImportProgress(current,total,phase,fileName,status){try{if(window.parent&&window.parent!==window)window.parent.postMessage({type:"booknote-shelf-import-progress",current:Number(current)||0,total:Number(total)||0,phase:String(phase||"importing"),fileName:String(fileName||""),status:String(status||"")},"*");}catch(e){console.warn("shelf import progress notify skipped",e);}}
function fmt(t){if(!t)return "";try{return new Date(t).toLocaleString();}catch(e){return String(t);}}

function buildBooks(ns){
 var excerptNs=ns.filter(function(n){return !isImportedDocument(n);});
 var documentNs=ns.filter(function(n){return isImportedDocument(n);});
 function renderCategoryGroup(boxId,items,emptyText){
  var box=document.getElementById(boxId);
  if(!box)return;
  var catMap={};
  items.forEach(function(n){var k=noteCategory(n);catMap[k]=(catMap[k]||0)+1;});
  var keys=Object.keys(catMap).sort(function(a,b){return a.localeCompare(b,"zh-CN");});
  if(!keys.length){
   box.innerHTML='<div style="padding:8px 10px;color:var(--muted);font-size:12px">'+emptyText+'</div>';
   return;
  }
  box.innerHTML=keys.map(function(k){
   return '<div class="category '+(categoryFilter===k?"active":"")+'" data-cat="'+esc(k)+'">'+
    '<span class="cat-main"><img class="bn-icon" src="../img/ui/bookshelf.png" alt=""> '+esc(k)+'</span>'+
    '<span class="cat-count">'+(catMap[k]||0)+'</span>'+
    '<span class="category-actions">'+
    '<button class="category-action cat-rename" title="重命名"><svg class="svg-icon svg-edit" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z"/><path d="m13.8 6.7 3.5 3.5"/><path d="m18 4 2 2"/></svg></button>'+
    '<button class="category-action cat-delete" title="删除"><span class="color-icon icon-delete">🗑️</span></button>'+
    '</span></div>';
  }).join("");
  box.querySelectorAll(".category[data-cat]").forEach(function(el){
   el.onclick=function(e){
    if(e.target.closest&&e.target.closest(".category-action"))return;
    categoryFilter=el.dataset.cat;view="category";bookFilter="";updateNav();savePanelState();render();
   };
   var rename=el.querySelector(".cat-rename"),del=el.querySelector(".cat-delete");
   if(rename)rename.onclick=function(e){e.stopPropagation();renameCategory(el.dataset.cat);};
   if(del)del.onclick=function(e){e.stopPropagation();deleteCategory(el.dataset.cat);};
  });
 }
 renderCategoryGroup("categories",excerptNs,"暂无摘录分类");
 renderCategoryGroup("documentCategories",documentNs,"暂无导入文档");
 var docItems=document.getElementById("documentManagementItems");
 if(docItems){
  var imported=documentNs.slice().sort(function(a,b){return String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||""));});
  docItems.innerHTML=imported.length?imported.map(function(n){
   var f=String(n.documentFormat||((n.documentFileName||"").split(".").pop())||"doc").toUpperCase();
   return '<div class="document-management-item" data-document-id="'+esc(n.id)+'">'+
    '<span class="document-management-item-name">'+esc(n.documentFileName||n.name||"未命名文档")+'</span>'+
    '<span class="document-management-item-meta">'+esc(f)+'</span>'+
    '<button type="button" class="document-management-reader" title="在阅读器中打开"><img class="bn-icon" src="../img/ui/reader.png" alt=""> 阅读器</button><button type="button" class="document-management-delete" title="删除"><img class="bn-icon" src="../img/ui/delete.png" alt=""></button></div>';
  }).join(""):'<div style="padding:8px 6px;color:var(--muted);font-size:11px">暂无已导入文档</div>';
  docItems.querySelectorAll("[data-document-id]").forEach(function(row){
   var id=row.dataset.documentId,open=row.querySelector(".document-management-reader"),del=row.querySelector(".document-management-delete");
   if(open)open.onclick=function(e){e.preventDefault();e.stopPropagation();openStandaloneReader(id);};
   if(del)del.onclick=function(e){e.preventDefault();e.stopPropagation();deleteImportedDocument(id);};
  });
 }

 var map={};
 ns.forEach(function(n){var k=n.pageTitle||"未命名页面";map[k]=(map[k]||0)+1;});
 var keys=Object.keys(map).sort(function(a,b){return a.localeCompare(b,"zh-CN");});
 var box=document.getElementById("books");
 box.innerHTML=keys.length?keys.map(function(k){return '<div class="book '+(bookFilter===k?"active":"")+'" data-book="'+esc(k)+'"><img class="bn-icon" src="../img/ui/reader.png" alt=""> '+esc(k)+' <span style="float:right;color:var(--muted);font-size:11px">'+map[k]+'</span></div>';}).join(""):'<div style="padding:10px;color:var(--muted);font-size:12px">暂无书籍/页面</div>';
 box.querySelectorAll(".book").forEach(function(el){el.onclick=function(){bookFilter=el.dataset.book;categoryFilter="";view="book";updateNav();savePanelState();render();};});
 document.getElementById("countAll").textContent=ns.length;
 document.getElementById("countFav").textContent=ns.filter(function(n){return n.favorite;}).length;
 document.getElementById("countPin").textContent=ns.filter(function(n){return n.pinned;}).length;
 var ec=document.getElementById("countExcerpts");if(ec)ec.textContent=ns.filter(function(n){return !isImportedDocument(n);}).length;
}
function updateNav(){
 document.querySelectorAll(".nav-item").forEach(function(el){
  el.classList.toggle("active",el.dataset.view===view);
 });
 var title=view==="excerpts"?"摘录管理":view==="favorite"?"收藏":view==="pinned"?"点赞":view==="book"?bookFilter:view==="category"?categoryFilter:"全部笔记";
 document.getElementById("viewTitle").textContent=title;
 var main=document.querySelector(".main");
 if(main){
  ["all","excerpts","favorite","pinned","category","book"].forEach(function(v){
   main.classList.toggle(v+"-view",view===v);
  });
  main.classList.toggle("category-view",view==="category");
  main.classList.toggle("all-view",view==="all");
 }
}
function highlightSearch(value,term){
 var raw=String(value==null?"":value);
 var t=String(term==null?"":term).trim();
 if(!t)return esc(raw);

 // 关键修复：在原始文本上匹配，再分别转义“命中/未命中”片段。
 // V7.9 原实现的正则转义表达式有误，导致 RegExp 构造失败后直接返回普通文本。
 var pattern=t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
 var rx;
 try{rx=new RegExp(pattern,"giu");}
 catch(err){return esc(raw);}

 var out="",last=0,m;
 while((m=rx.exec(raw))!==null){
   out+=esc(raw.slice(last,m.index));
   out+='<span class="search-hit">'+esc(m[0])+"</span>";
   last=m.index+m[0].length;
   if(m[0].length===0)rx.lastIndex++;
 }
 return out+esc(raw.slice(last));
}

function searchMatchPreview(value,term){
 var raw=String(value==null?"":value), t=String(term==null?"":term).trim();
 if(!t)return "";
 var pattern=t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"), rx;
 try{rx=new RegExp(pattern,"giu");}catch(e){return "";}
 var out="",last=0,m,found=false;
 while((m=rx.exec(raw))!==null){
   found=true;
   out+=esc(raw.slice(last,m.index));
   out+='<span class="search-hit-content">'+esc(m[0])+'</span>';
   last=m.index+m[0].length;
   if(!m[0].length)rx.lastIndex++;
 }
 if(!found)return "";
 out+=esc(raw.slice(last));
 return '<div class="search-content-highlight" aria-label="搜索命中">'+out+'</div>';
}

function panelSearchStyles(){
 if(document.getElementById("v71070-panel-search-styles"))return;
 var st=document.createElement("style");st.id="v71070-panel-search-styles";st.textContent=".v71070-search-results{margin:0 0 16px}.v71070-search-head{display:flex;align-items:center;gap:8px;margin:0 0 9px;padding:0 2px}.v71070-search-head strong{font-size:14px}.v71070-search-head .count{opacity:.65;font-size:11px}.v71070-search-actions{margin-left:auto;display:flex;gap:7px;flex-wrap:wrap;align-items:center}.v71070-search-action-group{display:flex;align-items:center;gap:5px;padding:3px 5px;border:1px solid var(--border2);border-radius:8px;background:var(--surface2)}.v71070-search-action-group b{font-size:11px;color:var(--muted);font-weight:600}.v71070-search-action-group.save{border-color:rgba(90,130,70,.45)}.v71070-search-head button{margin-left:0;border:1px solid var(--border2);border-radius:7px;background:var(--surface2);color:inherit;padding:5px 9px;cursor:pointer}.v71070-search-head button:disabled{opacity:.45;cursor:not-allowed}.v71070-search-item{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:8px;align-items:start;padding:9px 10px;margin:6px 0;border:1px solid var(--border2);border-radius:9px;background:var(--surface);cursor:pointer}.v71070-search-item:hover{background:var(--hover)}.v71070-search-check{padding-top:2px}.v71070-search-title{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v71070-search-meta{font-size:11px;color:var(--muted);margin-top:3px}.v71070-search-snippet{font-size:12px;line-height:1.55;margin-top:5px;color:var(--text2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.v71070-search-snippet mark{background:rgba(250,204,21,.45);color:inherit;border-radius:3px;padding:0 2px}.v71070-search-open{font-size:11px;color:var(--muted);white-space:nowrap}.v71070-search-empty{padding:45px 20px;text-align:center;border:1px dashed var(--border);border-radius:12px;color:var(--muted);background:var(--surface)}";document.head.appendChild(st);
}
function panelSearchHighlight(text,q){var raw=String(text||""),t=String(q||"").trim();if(!t)return esc(raw);var p=t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),rx;try{rx=new RegExp(p,"giu");}catch(_){return esc(raw);}var out="",last=0,m;while((m=rx.exec(raw))!==null){out+=esc(raw.slice(last,m.index))+"<mark>"+esc(m[0])+"</mark>";last=m.index+m[0].length;if(!m[0].length)rx.lastIndex++;}return out+esc(raw.slice(last));}
function renderPanelSearchResults(){
 panelSearchStyles();
 var results=Array.isArray(panelSearchResults)?panelSearchResults:[],term=activeSearch.trim(),picked=panelExtractSelected;
 status.textContent="🔎 本地搜索："+term+"　|　找到 "+results.length+" 条结果　|　正文命中可选择摘取";
 list.innerHTML='<div class="v71070-search-results"><div class="v71070-search-head"><strong>搜索结果</strong><span class="count">'+results.length+' 条</span><span class="v71070-search-actions"><span class="v71070-search-action-group"><b>导出</b><button type="button" id="v71070-panel-extract-all" '+(results.length?'':'disabled')+'>'+bnIcon('export')+' 全部搜索结果</button><button type="button" id="v71070-panel-extract-selected" '+(picked.size?'':'disabled')+'>☑ 选中（'+picked.size+'/20）</button></span><span class="v71070-search-action-group save"><b>保存</b><button type="button" id="v71070-panel-save-summary-all" '+(results.length?'':'disabled')+'>'+bnIcon('note')+' 全部保存到我的笔记</button><button type="button" id="v71070-panel-save-summary-selected" '+(picked.size?'':'disabled')+'>☑ 选中保存到我的笔记（'+picked.size+'/20）</button></span></span></div>'+(results.length?results.map(function(r){var can=r.kind==="book"&&r.matchSource==="body",checked=picked.has(String(r.id)),label=can?"📚 书籍正文":(r.type==="highlight"?"🟡 高亮":r.type==="bookmark"?"🔖 书签":r.type==="quote"?"✂️ 摘录":(r.categoryType==="summary"||r.sourceType==="selection-summary"?"📝 摘要笔记":"📝 笔记"));var meta=[r.format&&String(r.format).toUpperCase(),r.author,r.chapterLabel].filter(Boolean).join(" · ");return '<article class="v71070-search-item" data-panel-search-id="'+esc(r.id)+'"><div class="v71070-search-check">'+(can?'<input type="checkbox" data-panel-extract-id="'+esc(r.id)+'" '+(checked?'checked':'')+' aria-label="选择此段落">':label.split(" ")[0])+'</div><div><div class="v71070-search-title">'+esc(label+" · "+(r.title||"未命名"))+'</div><div class="v71070-search-meta">'+esc(meta)+(r.matchSource?" · "+esc(r.matchSource==="body"?"正文命中":"资料命中"):"")+'</div><div class="v71070-search-snippet">'+panelSearchHighlight(r.snippet||r.matchText||r.text||"",term)+'</div></div><div class="v71070-search-open">打开 ›</div></article>';}).join(""):'<div class="v71070-search-empty"><strong>没有找到匹配内容</strong><br><span>搜索覆盖书名、书籍正文、高亮、书签、摘录和笔记。</span></div>')+'</div>';
 list.querySelectorAll("[data-panel-extract-id]").forEach(function(el){el.onclick=function(e){e.stopPropagation();var id=String(el.getAttribute("data-panel-extract-id"));if(el.checked){if(picked.size>=20){el.checked=false;toast("最多选择 20 个段落");return;}picked.add(id);}else picked.delete(id);renderPanelSearchResults();};});
 list.querySelectorAll("[data-panel-search-id]").forEach(function(el){el.onclick=function(e){if(e.target&&e.target.closest&&e.target.closest("input"))return;var r=results.find(function(x){return String(x.id)===String(el.getAttribute("data-panel-search-id"));});if(!r||!r.bookId)return;var u=browser.runtime.getURL("reader/reader.html")+"?bookId="+encodeURIComponent(r.bookId);if(r.chapterIndex!=null)u+="&chapterIndex="+encodeURIComponent(r.chapterIndex);if(r.matchStart!=null)u+="&annotationStart="+encodeURIComponent(r.matchStart);if(r.matchEnd!=null)u+="&annotationEnd="+encodeURIComponent(r.matchEnd);if(r.kind==="book"&&r.matchSource==="body")u+="&searchTerm="+encodeURIComponent(term);browser.tabs.create({url:u,active:true});};});
 var b=document.getElementById("v71070-panel-extract-all");if(b)b.onclick=function(e){e.preventDefault();e.stopPropagation();exportPanelSearchAll(results);};var b2=document.getElementById("v71070-panel-extract-selected");if(b2)b2.onclick=function(e){e.preventDefault();e.stopPropagation();exportPanelSearchSelection(results);};var b3=document.getElementById("v71070-panel-save-summary-all");if(b3)b3.onclick=function(e){e.preventDefault();e.stopPropagation();savePanelSearchSummary(results,false);};var b4=document.getElementById("v71070-panel-save-summary-selected");if(b4)b4.onclick=function(e){e.preventDefault();e.stopPropagation();savePanelSearchSummary(results,true);};
}
function exportPanelSearchAll(results){var all=(results||[]).filter(function(r){return r&&r.kind==="book"&&r.matchSource==="body";});if(!all.length){toast("当前没有可摘取的书籍正文搜索结果");return;}toast("正在摘取全部 "+all.length+" 个搜索结果…");BookNoteSearchIndex.extractParagraphs(all,{limit:0}).then(function(items){if(!items.length)throw new Error("没有找到可摘取的段落");var blob=BookNoteSearchIndex.buildOdtBlob(items,activeSearch),url=URL.createObjectURL(blob);return browser.downloads.download({url:url,filename:BookNoteSearchIndex.safeOdtFilename(activeSearch),saveAs:true,conflictAction:"uniquify"}).then(function(){setTimeout(function(){URL.revokeObjectURL(url);},10000);toast("已生成全部搜索结果："+items.length+" 个段落");});}).catch(function(e){toast("摘取失败："+(e&&e.message||"未知错误"));});}
function exportPanelSearchSelection(results){var chosen=(results||[]).filter(function(r){return panelExtractSelected.has(String(r.id))&&r.kind==="book"&&r.matchSource==="body";}).slice(0,20);if(!chosen.length){toast("请先选择要摘取的段落");return;}toast("正在摘取所选 "+chosen.length+" 个段落…");BookNoteSearchIndex.extractParagraphs(chosen,{limit:20}).then(function(items){if(!items.length)throw new Error("没有找到可摘取的段落");var blob=BookNoteSearchIndex.buildOdtBlob(items,activeSearch),url=URL.createObjectURL(blob);return browser.downloads.download({url:url,filename:BookNoteSearchIndex.safeOdtFilename(activeSearch),saveAs:true,conflictAction:"uniquify"}).then(function(){setTimeout(function(){URL.revokeObjectURL(url);},10000);panelExtractSelected.clear();renderPanelSearchResults();toast("已生成所选搜索结果："+items.length+" 个段落");});}).catch(function(e){toast("摘取失败："+(e&&e.message||"未知错误"));});}
function searchSummaryLine(r,extracted){var title=String(r&&r.title||"未命名").trim();var chapter=String(r&&r.chapterLabel||"").trim();var source=[title,chapter].filter(Boolean).join(" · ");var body=String(extracted||r&&r.paragraphText||r&&r.matchText||r&&r.snippet||r&&r.text||"").replace(/\s+\n/g,"\n").trim();return {source:source||"搜索结果",body:body};}
function buildSearchSummaryText(items,term){var out=[String(term||"BookNote 搜索").trim()||"BookNote 搜索",""];(items||[]).forEach(function(x,i){if(!x)return;out.push((i+1)+". "+String(x.bookTitle||"未命名书籍"));if(x.chapterLabel)out.push("章节："+String(x.chapterLabel));if(x.paragraphText)out.push(String(x.paragraphText));out.push("");});return out.join("\n").trim();}
function savePanelSearchSummary(results,selectedOnly){var source=Array.isArray(results)?results.slice():[];if(selectedOnly){source=source.filter(function(r){return panelExtractSelected.has(String(r.id));}).slice(0,20);if(!source.length){toast("请先选择要保存的搜索结果");return;}}if(!source.length){toast("当前没有搜索结果");return;}var term=String(activeSearch||"").trim();var bookRows=source.filter(function(r){return r&&r.kind==="book"&&r.matchSource==="body";});if(!bookRows.length){toast("当前没有可保存的书籍正文搜索结果");return;}toast("正在生成"+(selectedOnly?"选中":"全部")+"搜索摘要笔记…");var extraction=BookNoteSearchIndex.extractParagraphs(bookRows,{limit:selectedOnly?20:0});extraction.then(function(items){if(!items.length)throw new Error("没有找到可保存的段落");var text=buildSearchSummaryText(items,term),now=new Date().toISOString(),id="search-summary-"+Date.now()+"-"+Math.random().toString(36).slice(2,10),name=(term||"未命名搜索"),pageTitle="搜索内容："+(term||"未命名搜索"),cat=(term||"未命名搜索");var note={id:id,name:name,pageTitle:pageTitle,pageUrl:"",createdAt:now,updatedAt:now,category:cat,categoryType:"summary",sourceType:"search-summary",searchQuery:term,summaryMode:selectedOnly?"selected":"all",summaryResultCount:items.length,selectedText:text,noteText:"",noteHtml:"",documentFormat:"",documentFileName:"",tags:[],pinned:false,favorite:false};return browser.storage.local.get(["booknoteNotes","booknoteCategories"]).then(function(r){var ns=Array.isArray(r.booknoteNotes)?r.booknoteNotes:[],cats=Array.isArray(r.booknoteCategories)?r.booknoteCategories.slice():[];if(!cats.length)cats=["未分类"];if(cats.indexOf(cat)<0)cats.push(cat);ns.unshift(note);return browser.storage.local.set({booknoteNotes:ns,booknoteCategories:cats});}).then(function(){panelExtractSelected.clear();panelSearchResults=null;toast("已保存搜索摘要笔记，内容与导出一致");return render();});}).catch(function(e){console.error("save search summary",e);toast("保存摘要笔记失败："+(e&&e.message||"未知错误"));});}
function runPanelLocalSearch(term){
 term=String(term||"").trim();
 activeSearch=term;
 // 首页搜索的唯一范围是“全部笔记”，不继承分类/页面/文档管理筛选。
 if(term){view="all";bookFilter="";categoryFilter="";"";updateNav();}
 panelSearchResults=null;
 panelExtractSelected.clear();
 var seq=++panelSearchSeq;
 if(!term){render();return;}
 // 首页搜索严格限定为“全部笔记/笔记摘取”。
 // 不读取导入文档，也不建立/触碰 BookNoteSearchIndex；render() 直接显示笔记卡片，
 // 并复用现有标题、原文摘录、我的笔记高亮逻辑。
 Promise.resolve(render()).then(function(){
   if(seq!==panelSearchSeq||activeSearch!==term)return;
   saveSearchHistory(term);
   var count=list.querySelectorAll(".note").length;
   status.textContent="🔎 笔记搜索："+term+"　|　当前显示："+count+" 条";
 }).catch(function(e){
   if(seq!==panelSearchSeq)return;
   console.error("panel note search",e);
   status.textContent="🔎 笔记搜索失败";
   list.innerHTML='<div class="empty">搜索失败，请重试。<br><br>'+esc(e&&e.message||"未知错误")+'</div>';
 });
}
function filtered(ns){
 var term=activeSearch.trim().toLowerCase();
 return ns.filter(function(n){
  // 首页搜索只属于“全部笔记/笔记摘取”范围。导入文档由独立文档管理区块负责。
  if(term && isImportedDocument(n))return false;
  if(view==="excerpts"&&isImportedDocument(n))return false;
  if(view==="favorite"&&!n.favorite)return false;
  if(view==="pinned"&&!n.pinned)return false;
  if(view==="book"&&(n.pageTitle||"未命名页面")!==bookFilter)return false;
  if(view==="category"&&noteCategory(n)!==categoryFilter)return false;
  if(term)return JSON.stringify(n).toLocaleLowerCase().indexOf(term)>=0;
  return true;
 }).sort(function(a,b){return Number(b.pinned)-Number(a.pinned)||Number(b.favorite)-Number(a.favorite)||String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||""));});
}
function renderNoteActions(n){
 return '<button class="jump"><span class="ui-icon">↗</span>跳转原文</button>'+
   '<button class="edit"><svg class="svg-icon svg-edit" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z"/><path d="m13.8 6.7 3.5 3.5"/><path d="m18 4 2 2"/></svg>编辑</button>'+
   '<button class="save">保存</button>'+
   '<button class="pin">'+(n.pinned?"取消点赞":'<svg class="svg-icon svg-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.8 2.5Z"/></svg> 点赞')+'</button>'+
   '<button class="fav">'+(n.favorite?"取消收藏":'<svg class="svg-icon svg-star" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg> 收藏')+'</button>'+
   '<button class="del danger"><span class="ui-icon">×</span>删除</button>';
}

function hydrateImportedCardContent(card,n){
 if(!card||!n||!isImportedDocument(n)||!globalThis.BookLibraryDB)return Promise.resolve();
 var ed=card.querySelector('.imported-document-text');
 if(!ed)return Promise.resolve();
 // Metadata is intentionally lightweight. Load the body only for the visible card.
 return BookLibraryDB.getContent(n.id).then(function(c){
   if(!c)return;
   var current=cache.find(function(x){return x&&String(x.id)===String(n.id);})||n;
   // Do not overwrite an editor that the user has already modified in this DOM.
   if(ed.dataset.contentHydrated==='true')return;
   current.noteHtml=String(c.html||'');
   current.noteText=String(c.text||'');
   current.documentOriginalHtml=current.noteHtml;
   current.documentOriginalText=current.noteText;
   renderImportedDocumentContent(ed,current);
   ed.dataset.contentHydrated='true';
 }).catch(function(e){
   console.warn('BookNote imported document content load failed',n&&n.id,e);
 });
}
function hydrateImportedCards(cards){
 var arr=Array.prototype.slice.call(cards||[]).filter(function(c){return c&&c.dataset&&c.dataset.importedDocument==='true';});
 // Sequential loading avoids creating a simultaneous full-document memory spike.
 return arr.reduce(function(chain,card){
   return chain.then(function(){
     var n=cache.find(function(x){return x&&String(x.id)===String(card.dataset.id);});
     return n?hydrateImportedCardContent(card,n):null;
   });
 },Promise.resolve());
}

function render(){
 if(activeSearch.trim() && Array.isArray(panelSearchResults)){renderPanelSearchResults();return Promise.resolve();}
 return get().then(function(ns){
  return getCategories().then(function(categories){
  cache=ns;buildBooks(ns,categories);renderCategoryManagePanel(categories);updateNav();
  var fs=filtered(ns);
  var searchTerm=activeSearch.trim();
  status.textContent="📦 本地笔记："+ns.length+" 条　|　当前显示："+fs.length+" 条　|　Firefox 扩展本地存储";
  if(!fs.length){list.innerHTML='<div class="empty">暂无匹配笔记。<br><br>在网页选中文字后使用浮动栏的「📝 笔记」创建记录。</div>';return;}
  return getCategories().then(function(cats){
   list.innerHTML=fs.map(function(n){
    var options=cats.slice();if(options.indexOf(noteCategory(n))<0)options.push(noteCategory(n));
    // Bottom actions are rendered once, at the card footer. Keeping them outside
    // the two content columns prevents floating/overflow and keeps imported and
    // normal notes on the same layout contract.
    var action='<div class="note-actions-below">'+renderNoteActions(n)+'</div>';
    return '<article class="note '+(n.pinned?"pinned ":"")+(n.favorite?"favorite":"")+(isImportedDocument(n)?" imported-document-card":"")+'" data-id="'+esc(n.id)+'"'+(isImportedDocument(n)?' data-imported-document="true"':'')+'>'+
    '<div class="note-head"><div class="note-title">'+highlightSearch(noteName(n),searchTerm)+'<span class="url">'+highlightSearch(n.pageUrl||"",searchTerm)+'</span></div>'+
    '<div class="note-meta"><label>分类</label><select class="categorySelect">'+options.map(function(c){return '<option value="'+esc(c)+'" '+(noteCategory(n)===c?"selected":"")+'>'+esc(c)+'</option>';}).join("")+'</select><label>命名</label><input class="nameInput" value="'+esc(noteName(n))+'" placeholder="笔记名称"></div>'+ 
    '<div class="badges">'+(n.categoryType==="summary"||n.sourceType==="selection-summary"?'<span class="badge"><span class="ui-icon">📝</span> 摘要笔记</span>':"")+(n.pinned?'<span class="badge"><span class="ui-icon">●</span> 点赞</span>':"")+(n.favorite?'<span class="badge"><svg class="svg-icon svg-star" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg> 收藏</span>':"")+'</div></div>'+ 
    (isImportedDocument(n) ?
      '<div class="note-grid"><div class="block imported-document-block"><div class="label excerpt-label"><span>'+bnIcon('reader')+' 导入文档（可编辑）</span><button type="button" class="imported-document-reader-btn" data-imported-reader-id="'+esc(n.id)+'" title="在阅读器中打开这本导入文档">'+bnIcon('reader')+' 阅读器</button></div><div class="imported-document-editor note-editor-wrap"><div class="text note-editor-content imported-document-text" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false" data-placeholder="编辑导入文档内容…"></div></div></div></div>' :
            '<div class="note-grid normal-note-grid"><div class="block normal-pane excerpt-pane"><div class="label excerpt-label"><span>'+bnIcon('reader')+' 原文摘录（只读）</span></div><div class="quote" tabindex="0" role="textbox" aria-readonly="true">'+highlightSearch(n.selectedText||"",searchTerm)+'</div><div class="excerpt-controls-below"><div class="excerpt-read-actions"><button type="button" class="excerpt-read" data-read-action="voice-settings">'+bnIcon('voice-settings','sm')+' 语音设置</button><button type="button" class="excerpt-read" data-read-action="read-home">'+bnIcon('speaker','sm')+' 从开头朗读</button><button type="button" class="excerpt-read" data-read-action="read-current">'+bnIcon('speaker','sm')+' 从选中位置朗读</button><button type="button" class="excerpt-read" data-read-action="read-selection">'+bnIcon('speaker','sm')+' 只朗读选中内容</button><button type="button" class="excerpt-read" data-read-action="read-toggle">'+bnIcon('pause','sm')+' 暂停 / 继续</button><button type="button" class="excerpt-read" data-read-action="read-stop">'+bnIcon('stop','sm')+' 停止</button></div><div class="excerpt-read-actions excerpt-other-actions"><button type="button" class="excerpt-highlight-control" data-highlight-action="yellow" title="柔和黄色">🟡</button><button type="button" class="excerpt-highlight-control" data-highlight-action="green" title="柔和绿色">🟢</button><button type="button" class="excerpt-highlight-control" data-highlight-action="blue" title="柔和蓝色">🔵</button><button type="button" class="excerpt-highlight-control" data-highlight-action="purple" title="柔和紫色">🟣</button><button type="button" class="excerpt-highlight-control" data-highlight-action="red" title="柔和红色">🔴</button><button type="button" class="excerpt-highlight-control" data-highlight-action="clear" title="取消高亮">↩️</button><button type="button" class="excerpt-font-control" data-font-action="decrease" title="缩小原文摘录文字">A-</button><button type="button" class="excerpt-font-control" data-font-action="reset" title="恢复默认文字大小">A</button><button type="button" class="excerpt-font-control" data-font-action="increase" title="放大原文摘录文字">A+</button></div></div></div><div class="block normal-pane note-pane"><div class="label">'+bnIcon('note')+' 我的笔记（可编辑）</div><div class="note-excerpt-controls"><div class="excerpt-read-actions note-read-actions"><button type="button" class="excerpt-read" data-read-action="voice-settings">'+bnIcon('voice-settings','sm')+' 语音设置</button><button type="button" class="excerpt-read" data-read-action="read-home">'+bnIcon('speaker','sm')+' 从开头朗读</button><button type="button" class="excerpt-read" data-read-action="read-current">'+bnIcon('speaker','sm')+' 从选中位置朗读</button><button type="button" class="excerpt-read" data-read-action="read-selection">'+bnIcon('speaker','sm')+' 只朗读选中内容</button><button type="button" class="excerpt-read" data-read-action="read-toggle">'+bnIcon('pause','sm')+' 暂停 / 继续</button><button type="button" class="excerpt-read" data-read-action="read-stop">'+bnIcon('stop','sm')+' 停止</button></div><div class="excerpt-read-actions excerpt-other-actions"><button type="button" class="excerpt-highlight-control" data-highlight-action="yellow" title="柔和黄色">🟡</button><button type="button" class="excerpt-highlight-control" data-highlight-action="green" title="柔和绿色">🟢</button><button type="button" class="excerpt-highlight-control" data-highlight-action="blue" title="柔和蓝色">🔵</button><button type="button" class="excerpt-highlight-control" data-highlight-action="purple" title="柔和紫色">🟣</button><button type="button" class="excerpt-highlight-control" data-highlight-action="red" title="柔和红色">🔴</button><button type="button" class="excerpt-highlight-control" data-highlight-action="clear" title="取消高亮">↩️</button><button type="button" class="excerpt-font-control" data-font-action="decrease" title="缩小原文摘录文字">A-</button><button type="button" class="excerpt-font-control" data-font-action="reset" title="恢复默认文字大小">A</button><button type="button" class="excerpt-font-control" data-font-action="increase" title="放大原文摘录文字">A+</button></div></div><div class="note-editor-wrap'+(searchTerm?" has-search-highlight":"")+'"><div class="text note-editor-content" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false" data-placeholder="输入或修改你的笔记…"></div></div>'+'</div></div></div>')+
    '<div class="note-foot"><span class="time">分类：'+esc(noteCategory(n))+'　创建：'+esc(fmt(n.createdAt))+'　更新：'+esc(fmt(n.updatedAt||n.createdAt))+'</span>'+action+'</div></article>';
   }).join("");
   list.querySelectorAll(".note-editor-content").forEach(function(ed){
    var card=ed.closest(".note"), n=cache.find(function(x){return x.id===card.dataset.id;})||{};
    if(isImportedDocument(n)) renderImportedDocumentContent(ed,n); else { renderNoteEditorContent(ed,n); applyUnifiedBookNoteTypography(card,n); }
    ed.addEventListener("input",function(){
      var nn=cache.find(function(x){return x.id===card.dataset.id;})||{};
      rememberContentEditableSelection(ed);
      nn.noteText=noteEditorText(ed);
      if(isImportedDocument(nn)){ nn.noteHtml=sanitizeImportedHtml(ed.innerHTML); nn.documentModified=true; }
      syncNoteHighlightsFromDOM(ed,nn);
    });
    ["mouseup","keyup","select","focus","blur"].forEach(function(ev){ed.addEventListener(ev,function(){rememberContentEditableSelection(ed);});});
   });
   bindNoteCards();
   list.querySelectorAll("[data-imported-reader-id]").forEach(function(btn){btn.onclick=function(e){e.preventDefault();e.stopPropagation();openStandaloneReader(btn.getAttribute("data-imported-reader-id"));};});
   void hydrateImportedCards(list.querySelectorAll(".note[data-imported-document=\"true\"]"));
  });
  });
 });
}

function saveNote(card,id){
  return get().then(function(ns){
    var n=ns.find(function(x){return x.id===id;});
    if(!n){toast("找不到这条笔记");return;}
    var ta=card.querySelector(".note-editor-content, .text");
    var nameInput=card.querySelector(".nameInput");
    var catSelect=card.querySelector(".categorySelect");

    var newText=ta ? (ta.classList.contains("note-editor-content") ? noteEditorText(ta) : ta.value) : (n.noteText||"");
    var rawName=nameInput ? nameInput.value.trim() : "";
    var newCategory=catSelect ? (catSelect.value||"未分类") : noteCategory(n);

    // If the user leaves the name as the generated page title, don't
    // unnecessarily convert it into a permanent custom name.
    var generatedName=n.pageTitle||"未命名笔记";
    if(rawName && rawName!==generatedName) n.name=rawName;
    else if(!rawName) delete n.name;
    else if(n.name===generatedName) delete n.name;

    n.noteText=newText;
    if(isImportedDocument(n) && ta && ta.classList.contains("note-editor-content")){ var savedHtml=sanitizeImportedHtml(ta.innerHTML); if(savedHtml!==String(n.noteHtml||"")) n.documentModified=true; n.noteHtml=savedHtml; }
    if(ta && ta.classList.contains('note-editor-content') && ta.dataset.importedFontSize){
      var ifs=parseFloat(ta.dataset.importedFontSize);
      if(isFinite(ifs)) n.noteFontSize=ifs;
    }
    n.category=newCategory;
    n.updatedAt=new Date().toISOString();

    return set(ns).then(function(){
      toast("💾 已保存修改");
      return render();
    });
  }).catch(function(e){
    console.error(e);
    toast("保存失败");
  });
}

function saveAll(){
  // V7.9.35：一次性保存当前视图中的所有可编辑字段。
  // 读取 DOM 当前值，不依赖 blur/input 时机；成功后才重新渲染，避免编辑内容被提前覆盖。
  var btn=document.getElementById("saveAll");
  if(btn&&btn.disabled)return Promise.resolve();
  if(btn){btn.disabled=true;btn.setAttribute("aria-busy","true");}

  return get().then(function(ns){
    var cards=Array.prototype.slice.call(list.querySelectorAll(".note"));
    var changed=0;
    cards.forEach(function(card){
      var id=card.dataset.id;
      var n=ns.find(function(x){return x.id===id;});
      if(!n)return;

      var editor=card.querySelector(".note-editor-content, textarea.text");
      var nameInput=card.querySelector(".nameInput");
      var catSelect=card.querySelector(".categorySelect");
      var beforeText=String(n.noteText||"");
      var beforeName=n.name;
      var beforeCategory=n.category;

      if(editor){
        n.noteText=editor.classList.contains("note-editor-content") ? noteEditorText(editor) : String(editor.value||"");
        if(isImportedDocument(n) && editor.classList.contains("note-editor-content")){ var savedImportedHtml=sanitizeImportedHtml(editor.innerHTML); if(savedImportedHtml!==String(n.noteHtml||"")) n.documentModified=true; n.noteHtml=savedImportedHtml; }
        if(editor.classList.contains("note-editor-content") && editor.dataset.importedFontSize){
          var ifs=parseFloat(editor.dataset.importedFontSize);
          if(isFinite(ifs)) n.noteFontSize=ifs;
        }
      }
      if(catSelect)n.category=catSelect.value||"未分类";

      if(nameInput){
        var rawName=String(nameInput.value||"").trim();
        var generatedName=n.pageTitle||"未命名笔记";
        if(rawName && rawName!==generatedName)n.name=rawName;
        else delete n.name;
      }

      // 同步当前笔记的持久高亮数据，但不碰左侧原文摘录的高亮状态。
      if(editor&&editor.classList.contains("note-editor-content"))syncNoteHighlightsFromDOM(editor,n);

      var afterText=String(n.noteText||"");
      var afterCategory=n.category;
      var nameChanged=(beforeName||"")!==(n.name||"");
      var categoryChanged=(beforeCategory||"未分类")!==(afterCategory||"未分类");
      if(beforeText!==afterText||nameChanged||categoryChanged)changed++;
      n.updatedAt=new Date().toISOString();
    });

    return set(ns).then(function(){
      toast(changed ? "💾 已保存全部修改（"+changed+" 条）" : "没有可保存的笔记修改");
      return render();
    });
  }).catch(function(e){
    console.error("saveAll failed",e);
    toast("保存全部修改失败：请检查本地存储权限");
  }).then(function(result){
    if(btn){btn.disabled=false;btn.removeAttribute("aria-busy");}
    return result;
  },function(e){
    if(btn){btn.disabled=false;btn.removeAttribute("aria-busy");}
    throw e;
  });
}

function toggleFlag(id,field){
 if(field!=="pinned" && field!=="favorite") return;
 return get().then(function(ns){
  var n=ns.find(function(x){return x.id===id;});
  if(!n){toast("找不到这条笔记");return;}
  n[field]=!Boolean(n[field]);
  n.updatedAt=new Date().toISOString();
  return set(ns).then(function(){
   toast(n[field] ? (field==="pinned"?"❤️ 已点赞":"⭐ 已收藏") : (field==="pinned"?"已取消点赞":"已取消收藏"));
   return render();
  });
 }).catch(function(e){
  console.error(e);
  toast(field==="pinned"?"点赞失败":"收藏失败");
 });
}

function deleteNote(id){
 if(!id) return;
 return get().then(function(ns){
  var n=ns.find(function(x){return x.id===id;});
  if(!n){toast("找不到这条笔记");return;}
  var title=noteName(n);
  if(!confirm("确定删除这条笔记？\n\n"+title+"\n\n删除后无法从当前存储中恢复，建议先导出 JSON 备份。")) return;
  var next=ns.filter(function(x){return x.id!==id;});
  return set(next).then(function(){
   toast("已删除");
   return render();
  });
 }).catch(function(e){
  console.error(e);
  toast("删除失败");
 });
}


function continueEditorFormat(textarea){
  if(!textarea) return;
  textarea.addEventListener("keydown",function(e){
    if(e.key!=="Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

    var value=textarea.value;
    var pos=textarea.selectionStart;
    var lineStart=value.lastIndexOf("\n",pos-1)+1;
    var line=value.slice(lineStart,pos);

    // Preserve common Markdown prefixes when pressing Enter:
    // ## Heading, > quote, -/*/+ list, and 1. / 1) numbered list.
    var m=line.match(/^(\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+))/);
    if(!m) return;

    var prefix=m[1];
    var content=line.slice(prefix.length);

    // If the current formatted line is empty, a second Enter exits
    // the format instead of creating an endless prefix.
    if(!content.trim()){
      e.preventDefault();
      var before=value.slice(0,pos-prefix.length);
      var after=value.slice(pos);
      textarea.value=before+"\n"+after;
      var newPos=before.length+1;
      textarea.selectionStart=textarea.selectionEnd=newPos;
      textarea.dispatchEvent(new Event("input",{bubbles:true}));
      return;
    }

    e.preventDefault();
    var before=value.slice(0,pos);
    var after=value.slice(pos);

    // Continue the exact Markdown prefix on the new line.
    textarea.value=before+"\n"+prefix+after;
    var newPos=pos+1+prefix.length;
    textarea.selectionStart=textarea.selectionEnd=newPos;
    textarea.dispatchEvent(new Event("input",{bubbles:true}));
  });
}


// V6.6: 直接对每条“📖 原文摘录（只读）”下方的摘录文本执行朗读。
// 不跳转原文、不打开新标签；按钮只作用于当前笔记卡片中的 .quote。

// V7.0 persistent, soft-color highlights for each read-only excerpt.
var EXCERPT_HIGHLIGHT_COLORS={
  yellow:"#F3E7A6", green:"#C9DDC5", blue:"#C9DDE8",
  purple:"#D8CBE3", red:"#E7C8C2"
};
function excerptHighlightData(note){
  return Array.isArray(note&&note.excerptHighlights)?note.excerptHighlights:[];
}
function excerptSelectedRange(card){
  var q=card&&card.querySelector(".quote"),sel=window.getSelection();
  if(!q||!sel||sel.rangeCount===0||sel.isCollapsed)return null;
  var r=sel.getRangeAt(0);
  if(!q.contains(r.commonAncestorContainer))return null;
  var pre=document.createRange();pre.selectNodeContents(q);
  pre.setEnd(r.startContainer,r.startOffset);
  var start=pre.toString().length, picked=sel.toString();
  if(!picked)return null;
  return {start:start,end:start+picked.length};
}
function applySearchHighlightsToElement(root,term){
  if(!root)return;
  var t=String(term==null?"":term).trim();
  if(!t)return;
  var pattern=t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),rx;
  try{rx=new RegExp(pattern,"giu");}catch(_){return;}
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
  var nodes=[],node;
  while((node=walker.nextNode()))nodes.push(node);
  nodes.forEach(function(n){
    if(!n.parentNode)return;
    var raw=n.nodeValue||"",last=0,m,frag=null,changed=false;
    rx.lastIndex=0;
    while((m=rx.exec(raw))!==null){
      if(!frag)frag=document.createDocumentFragment();
      changed=true;
      if(m.index>last)frag.appendChild(document.createTextNode(raw.slice(last,m.index)));
      var span=document.createElement("span");
      span.className="search-hit";
      span.textContent=m[0];
      frag.appendChild(span);
      last=m.index+m[0].length;
      if(m[0].length===0)rx.lastIndex++;
    }
    if(changed){
      if(last<raw.length)frag.appendChild(document.createTextNode(raw.slice(last)));
      n.parentNode.replaceChild(frag,n);
    }
  });
}

function renderExcerptHighlights(card,note){
  var q=card&&card.querySelector(".quote");if(!q)return;
  var text=String(q.textContent||""),hs=excerptHighlightData(note).slice().sort(function(a,b){return a.start-b.start;});
  q.textContent="";var pos=0;
  hs.forEach(function(h){
    var a=Math.max(pos,Number(h.start)||0),b=Math.min(text.length,Number(h.end)||0);
    if(a>pos)q.appendChild(document.createTextNode(text.slice(pos,a)));
    if(b>a){
      var mark=document.createElement("mark");
      mark.className="excerpt-highlight";mark.dataset.color=h.color||"yellow";
      mark.style.setProperty("--excerpt-highlight-base",EXCERPT_HIGHLIGHT_COLORS[h.color]||EXCERPT_HIGHLIGHT_COLORS.yellow);
      mark.textContent=text.slice(a,b);q.appendChild(mark);pos=b;
    }
  });
  if(pos<text.length)q.appendChild(document.createTextNode(text.slice(pos)));
  applySearchHighlightsToElement(q,activeSearch);
}
function saveExcerptHighlights(note){
  return browser.storage.local.get(["booknoteNotes"]).then(function(r){
    var ns=Array.isArray(r.booknoteNotes)?r.booknoteNotes:[],i=ns.findIndex(function(x){return x&&x.id===note.id;});
    if(i<0){toast("高亮保存失败：找不到笔记");return;}
    ns[i]=Object.assign({},ns[i],{excerptHighlights:note.excerptHighlights||[]});
    return browser.storage.local.set({booknoteNotes:ns});
  });
}
function addExcerptHighlight(card,note,color){
  var range=excerptSelectedRange(card);
  if(!range){toast("请先在原文摘录中选中文字");return;}
  note.excerptHighlights=excerptHighlightData(note).filter(function(h){
    return !(h.end>range.start&&h.start<range.end);
  });
  note.excerptHighlights.push({start:range.start,end:range.end,color:color});
  saveExcerptHighlights(note).then(function(){renderExcerptHighlights(card,note);window.getSelection().removeAllRanges();toast("高亮已保存");});
}
function clearExcerptHighlight(card,note){
  var range=excerptSelectedRange(card);
  if(!range){toast("请先选中要取消的高亮");return;}
  note.excerptHighlights=excerptHighlightData(note).filter(function(h){
    return !(h.end>range.start&&h.start<range.end);
  });
  saveExcerptHighlights(note).then(function(){renderExcerptHighlights(card,note);window.getSelection().removeAllRanges();toast("高亮已取消");});
}

var excerptSpeechState = {
  synth: null, utterance: null, card: null, controlsRoot: null, target: null,
  mode: "", status: "idle", cancelled: false
};


/* V7.9.46：统一朗读状态机。
   “朗读目标”由各内容按钮决定；“暂停/继续/停止”只操作这个全局状态机。
   所有朗读入口必须登记任务，避免出现“正在朗读但控制器认为没有任务”。 */
window.booknoteSpeechController = window.booknoteSpeechController || {
  active:false,
  paused:false,
  token:0,
  source:null,
  task:null
};
function booknoteSpeechBegin(source,task){
  var c=window.booknoteSpeechController;
  c.active=true;
  c.paused=false;
  c.stopped=false;
  c.source=source||"unknown";
  c.task=task||null;
  c.token++;
  return c.token;
}
function booknoteSpeechPauseResume(){
  var c=window.booknoteSpeechController;
  if(!c.active && !(window.speechSynthesis && window.speechSynthesis.speaking)){
    return false;
  }
  try{
    if(window.speechSynthesis){
      if(window.speechSynthesis.paused){
        window.speechSynthesis.resume();
        c.paused=false;
      }else{
        window.speechSynthesis.pause();
        c.paused=true;
      }
    }
  }catch(e){}
  return true;
}
function booknoteSpeechStopAll(){
  var c=window.booknoteSpeechController;
  c.token++;
  c.active=false;
  c.paused=false;
  c.stopped=true;
  c.source=null;
  c.task=null;
  try{ if(window.speechSynthesis) window.speechSynthesis.cancel(); }catch(e){}
  /* 兼容旧版队列变量；如果存在则一并清空。 */
  try{ if(typeof speechQueue!=="undefined" && Array.isArray(speechQueue)) speechQueue.length=0; }catch(e){}
  try{ if(typeof currentSpeech!=="undefined") currentSpeech=null; }catch(e){}
  try{ if(typeof speechTask!=="undefined") speechTask=null; }catch(e){}
}
function booknoteSpeechFinish(token){
  var c=window.booknoteSpeechController;
  if(token!==c.token)return;
  c.active=false;
  c.paused=false;
  c.source=null;
  c.task=null;
}
function booknoteSpeechHasTask(){
  var c=window.booknoteSpeechController;
  return !!(c.active || (window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.paused)));
}
function booknotePauseAllSpeech(){
  return booknoteSpeechPauseResume();
}
function booknoteResumeAllSpeech(){
  var c=window.booknoteSpeechController;
  if(window.speechSynthesis){
    try{window.speechSynthesis.resume();}catch(e){}
  }
  c.active=true;
  c.paused=false;
  return true;
}
function booknoteStopAllSpeech(){
  booknoteSpeechStopAll();
}
function booknoteSpeechGuard(token){
  return token===window.booknoteSpeechController.token && !window.booknoteSpeechController.stopped;
}

function speechControlsRoot(btnOrRoot){
  if(!btnOrRoot)return null;
  return btnOrRoot.closest ? (btnOrRoot.closest(".excerpt-controls-below,.note-excerpt-controls") || btnOrRoot) : btnOrRoot;
}
function speechTargetFromRoot(root){
  if(!root)return null;
  var block=root.closest ? root.closest(".block") : null;
  if(!block)return null;
  if(root.classList && root.classList.contains("note-excerpt-controls")){
    return block.querySelector(".note-editor-wrap .note-editor-content, .note-editor-wrap textarea.text");
  }
  return block.querySelector(".quote");
}
function speechTextFromTarget(target){
  if(!target)return "";
  if(target.tagName==="TEXTAREA")return excerptNormalize(String(target.value||""));
  if(target.classList && target.classList.contains("note-editor-content")){
    return excerptNormalize(noteEditorText(target));
  }
  return excerptNormalize(String(target.innerText||target.textContent||""));
}
function speechSelectedTextFromTarget(target){
  if(!target)return "";
  if(target.tagName==="TEXTAREA"){
    var ts=Number.isFinite(target.__booknoteSelectionStart)?target.__booknoteSelectionStart:target.selectionStart;
    var te=Number.isFinite(target.__booknoteSelectionEnd)?target.__booknoteSelectionEnd:target.selectionEnd;
    if(ts!==te && Number.isFinite(ts) && Number.isFinite(te)){
      return excerptNormalize(String(target.value||"").slice(Math.min(ts,te),Math.max(ts,te)));
    }
    return "";
  }
  if(target.classList && target.classList.contains("note-editor-content")){
    var na=Number.isFinite(target.__booknoteSelectionStart)?target.__booknoteSelectionStart:null;
    var nb=Number.isFinite(target.__booknoteSelectionEnd)?target.__booknoteSelectionEnd:null;
    var nt=noteEditorText(target);
    if(na!==null&&nb!==null&&na!==nb){
      return excerptNormalize(nt.slice(Math.min(na,nb),Math.max(na,nb)));
    }
    var nsel=window.getSelection();
    if(nsel&&nsel.rangeCount&&!nsel.isCollapsed&&target.contains(nsel.anchorNode)&&target.contains(nsel.focusNode)){
      return excerptNormalize(nsel.toString());
    }
    return "";
  }
  var sel=window.getSelection();
  if(sel&&sel.rangeCount&&!sel.isCollapsed&&target.contains(sel.anchorNode)&&target.contains(sel.focusNode)){
    return excerptNormalize(sel.toString());
  }
  return "";
}

function excerptNormalize(s){
  return String(s||"").replace(/\s+/g," ").trim();
}

function excerptFindVoice(settings){
  var synth=window.speechSynthesis;
  var voices=synth && synth.getVoices ? synth.getVoices() : [];
  if(!voices.length)return null;
  var wanted=settings && settings.voiceName ? String(settings.voiceName) : "";
  if(wanted){
    var v=voices.find(function(x){
      return x && (String(x.voiceName||"")===wanted || String(x.name||"")===wanted);
    });
    if(v)return v;
  }
  return voices.find(function(x){return x && x.localService;}) || voices[0] || null;
}

function excerptReadSettings(){
  return browser.storage.local.get(["voiceName","rate","pitch","volume"]).then(function(r){
    return {
      voiceName:r.voiceName||"",
      rate:Number(r.rate)||1,
      pitch:typeof r.pitch==="number"?r.pitch:1,
      volume:typeof r.volume==="number"?r.volume:1
    };
  });
}

function updateExcerptSpeechButtons(card,status,root){
  if(!card)return;
  root=root||speechControlsRoot(card.querySelector(".excerpt-controls-below"));
  if(!root)return;
  var toggle=root.querySelector('.excerpt-read[data-read-action="read-toggle"]');
  var stop=root.querySelector('.excerpt-read[data-read-action="read-stop"]');
  if(toggle){var paused=status==="paused",icon=paused?"play":"pause",label=paused?"继续":"暂停 / 继续";toggle.innerHTML=bnIcon(icon,"sm")+label;}
  if(stop){stop.disabled=status==="idle";stop.innerHTML=bnIcon("stop","sm")+"停止";}
  root.classList.toggle("excerpt-reading",status!=="idle");
}

function stopExcerptSpeech(){
  var st=excerptSpeechState;
  st.cancelled=true;
  try{ booknoteSpeechStopAll(); }catch(_){ try{ if(window.speechSynthesis)window.speechSynthesis.cancel(); }catch(__){} }
  if(st.card)updateExcerptSpeechButtons(st.card,"idle",st.controlsRoot);
  excerptSpeechState={
    synth:window.speechSynthesis||null,utterance:null,card:null,controlsRoot:null,target:null,mode:"",status:"idle",cancelled:false
  };
}

function startExcerptSpeech(card, mode, controlsRoot){
  var synth=window.speechSynthesis;
  if(!synth){toast("系统语音不可用");return;}

  controlsRoot=speechControlsRoot(controlsRoot);
  var target=speechTargetFromRoot(controlsRoot);
  var allText=speechTextFromTarget(target);
  if(!allText){toast(controlsRoot && controlsRoot.classList.contains("note-excerpt-controls") ? "我的笔记没有可朗读内容" : "该条原文摘录没有可朗读内容");return;}

  // 新任务先绝对停止旧任务，避免两个区域同时朗读。
  stopExcerptSpeech();

  var text=allText;
  var selected=excerptNormalize(speechSelectedTextFromTarget(target));
  if(!selected && controlsRoot && controlsRoot.__excerptSelectionText){
    selected=excerptNormalize(controlsRoot.__excerptSelectionText);
  }

  if(mode==="read-selection"){
    if(!selected){
      toast(controlsRoot && controlsRoot.classList.contains("note-excerpt-controls")
        ? "请先在“我的笔记（可编辑）”中选中要朗读的内容"
        : "请先在“原文摘录（只读）”中选中要朗读的内容");
      return;
    }
    text=selected;
  }else if(mode==="read-current"){
    if(!selected){
      toast(controlsRoot && controlsRoot.classList.contains("note-excerpt-controls")
        ? "请先在“我的笔记（可编辑）”中选中朗读起点"
        : "请先在“原文摘录（只读）”中选中朗读起点");
      return;
    }
    var pos=excerptNormalize(allText).indexOf(selected);
    if(pos<0){toast("无法确认当前选中位置");return;}
    text=excerptNormalize(allText).slice(pos);
  }else if(mode==="read-home"){
    text=allText;
  }

  var st={
    synth:synth,utterance:null,card:card,controlsRoot:controlsRoot,target:target,mode:mode,status:"speaking",cancelled:false,controllerToken:0
  };
  try{ st.controllerToken=booknoteSpeechBegin("excerpt",{card:card,mode:mode}); }catch(_){ st.controllerToken=0; }
  excerptSpeechState=st;
  updateExcerptSpeechButtons(card,"speaking",controlsRoot);

  excerptReadSettings().then(function(settings){
    if(excerptSpeechState!==st || st.cancelled || (st.controllerToken && !booknoteSpeechGuard(st.controllerToken)))return;

    var u=new SpeechSynthesisUtterance(text);
    var v=excerptFindVoice(settings);
    if(v)u.voice=v;
    if(v && v.lang)u.lang=v.lang;
    if(isFinite(settings.rate) && settings.rate>0)u.rate=settings.rate;
    if(isFinite(settings.pitch) && settings.pitch>=0)u.pitch=settings.pitch;
    if(isFinite(settings.volume) && settings.volume>=0)u.volume=Math.min(1,settings.volume);

    st.utterance=u;

    u.onend=function(){
      if(excerptSpeechState!==st)return;
      st.status="idle";
      if(st.controllerToken)booknoteSpeechFinish(st.controllerToken);
      updateExcerptSpeechButtons(card,"idle",controlsRoot);
      excerptSpeechState={
        synth:synth,utterance:null,card:null,controlsRoot:null,target:null,mode:"",status:"idle",cancelled:false
      };
    };
    u.onerror=function(){
      if(excerptSpeechState!==st)return;
      st.status="idle";
      if(st.controllerToken)booknoteSpeechFinish(st.controllerToken);
      updateExcerptSpeechButtons(card,"idle",controlsRoot);
      excerptSpeechState={
        synth:synth,utterance:null,card:null,controlsRoot:null,target:null,mode:"",status:"idle",cancelled:false
      };
    };
    synth.speak(u);
  }).catch(function(){
    if(excerptSpeechState===st){
      if(st.controllerToken)booknoteSpeechFinish(st.controllerToken);
      updateExcerptSpeechButtons(card,"idle",controlsRoot);
      excerptSpeechState={
        synth:synth,utterance:null,card:null,controlsRoot:null,target:null,mode:"",status:"idle",cancelled:false
      };
    }
    toast("朗读设置读取失败");
  });
}

function bindExcerptSelectionTracking(card){
  var q=card.querySelector(".quote");
  if(!q)return;
  q.addEventListener("mouseup",function(){
    setTimeout(function(){
      var sel=window.getSelection();
      if(!sel || sel.isCollapsed)return;
      var text=excerptNormalize(sel.toString());
      if(!text)return;
      try{
        var node=sel.anchorNode;
        if(node && (node===q || q.contains(node))){
          card.__excerptSelection=text;
          var cr=card.querySelector(".excerpt-controls-below");
          if(cr)cr.__excerptSelectionText=text;
        }
      }catch(_){}
    },20);
  },true);
  q.addEventListener("keyup",function(){
    setTimeout(function(){
      var sel=window.getSelection();
      if(!sel || sel.isCollapsed)return;
      var text=excerptNormalize(sel.toString());
      if(text)card.__excerptSelection=text;
    },20);
  },true);
}

function noteHighlightData(note){return Array.isArray(note&&note.noteHighlights)?note.noteHighlights:[];}
function noteEditorText(ed){
  if(!ed)return "";
  return String(ed.innerText||"").replace(/\u00a0/g," ").replace(/\r\n/g,"\n").replace(/\n+$/," ").replace(/ $/,"");
}
function contentEditableTextLength(node){
  if(!node)return 0;
  if(node.nodeType===3)return String(node.nodeValue||"").length;
  if(node.nodeType!==1)return 0;
  if(node.tagName==="BR")return 1;
  var total=0;
  Array.prototype.forEach.call(node.childNodes,function(ch){total+=contentEditableTextLength(ch);});
  return total;
}
function contentEditableOffset(root,node,offset){
  if(!root||!node||!root.contains(node)&&root!==node)return 0;
  var total=0,found=false;
  function walk(parent){
    if(found)return;
    if(parent===node){
      if(parent.nodeType===3) total+=String(parent.nodeValue||"").slice(0,offset).length;
      else if(parent.nodeType===1 && parent.tagName==="BR") total+=Math.min(1,offset);
      else {
        var kids=Array.prototype.slice.call(parent.childNodes,0,offset);
        kids.forEach(function(ch){total+=contentEditableTextLength(ch);});
      }
      found=true; return;
    }
    if(parent.nodeType!==1 && parent.nodeType!==3)return;
    var kids=parent.childNodes||[];
    for(var i=0;i<kids.length;i++){
      var ch=kids[i];
      if(ch===node){walk(ch);return;}
      var before=total;
      walk(ch);
      if(found)return;
      total=before+contentEditableTextLength(ch);
    }
  }
  walk(root);
  return total;
}
function noteSelectedRange(ed){
  if(!ed)return null;
  if(ed.classList.contains("note-editor-content")){
    var a=Number.isFinite(ed.__booknoteSelectionStart)?ed.__booknoteSelectionStart:null;
    var b=Number.isFinite(ed.__booknoteSelectionEnd)?ed.__booknoteSelectionEnd:null;
    if(a!==null&&b!==null&&a!==b)return {start:Math.min(a,b),end:Math.max(a,b)};
    var sel=window.getSelection();
    if(sel&&sel.rangeCount&&ed.contains(sel.anchorNode)&&ed.contains(sel.focusNode)){
      var r=sel.getRangeAt(0),x=contentEditableOffset(ed,r.startContainer,r.startOffset),y=contentEditableOffset(ed,r.endContainer,r.endOffset);
      if(x!==y)return {start:Math.min(x,y),end:Math.max(x,y)};
    }
    return null;
  }
  var start=Number.isFinite(ed.__booknoteSelectionStart)?ed.__booknoteSelectionStart:ed.selectionStart;
  var end=Number.isFinite(ed.__booknoteSelectionEnd)?ed.__booknoteSelectionEnd:ed.selectionEnd;
  if(start===end)return null;
  return {start:Math.min(start,end),end:Math.max(start,end)};
}

function rememberExcerptSelection(root){
  var target=resolveExcerptReaderTarget(root);
  if(!target)return;
  var sel=window.getSelection();
  if(sel&&sel.rangeCount&&!sel.isCollapsed&&target.contains(sel.anchorNode)&&target.contains(sel.focusNode)){
    root.__excerptSelectionText=sel.toString();
    try{root.__excerptSelectionRange=sel.getRangeAt(0).cloneRange();}catch(e){}
  }
}

function rememberNoteSelection(ed){
  if(!ed)return;
  if(ed.classList.contains("note-editor-content")){rememberContentEditableSelection(ed);return;}
  ed.__booknoteSelectionStart=ed.selectionStart;
  ed.__booknoteSelectionEnd=ed.selectionEnd;
}
function rememberContentEditableSelection(ed){
  if(!ed)return;
  var sel=window.getSelection();
  if(!sel||!sel.rangeCount||!ed.contains(sel.anchorNode)||!ed.contains(sel.focusNode))return;
  try{
    ed.__booknoteSelectionStart=contentEditableOffset(ed,sel.anchorNode,sel.anchorOffset);
    ed.__booknoteSelectionEnd=contentEditableOffset(ed,sel.focusNode,sel.focusOffset);
  }catch(_){}
}
function applyUnifiedBookNoteTypography(card,note){
  if(!card||!note||isImportedDocument(note))return;
  var quote=card.querySelector('.normal-note-grid > .excerpt-pane > .quote');
  var editor=card.querySelector('.normal-note-grid > .note-pane > .note-editor-wrap > .note-editor-content');
  if(!quote||!editor)return;
  var size=parseFloat(note.noteFontSize);
  if(!isFinite(size))size=14;
  size=Math.max(10,Math.min(36,size));
  [quote,editor].forEach(function(el){
    el.style.setProperty('font-size',size+'px','important');
    el.dataset.booknoteUnifiedFontSize=String(size);
  });
}

function renderNoteEditorContent(ed,note,preserveSelection){
  if(!ed)return;
  var saved=null;
  if(preserveSelection!==false){
    var r=noteSelectedRange(ed);
    if(r)saved={start:r.start,end:r.end,scrollTop:ed.scrollTop,scrollLeft:ed.scrollLeft};
  }
  var text=String(note&&note.noteText||"");
  var hs=noteHighlightData(note).slice().sort(function(a,b){return a.start-b.start;});
  var term=activeSearch.trim();
  var frag=document.createDocumentFragment(),pos=0;
  function appendText(raw){
    if(!raw)return;
    if(!term){frag.appendChild(document.createTextNode(raw));return;}
    var pattern=term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),rx;
    try{rx=new RegExp(pattern,"giu");}catch(_){frag.appendChild(document.createTextNode(raw));return;}
    var last=0,m;
    while((m=rx.exec(raw))!==null){
      if(m.index>last)frag.appendChild(document.createTextNode(raw.slice(last,m.index)));
      var sh=document.createElement("span");sh.className="search-hit";sh.textContent=m[0];frag.appendChild(sh);
      last=m.index+m[0].length;if(!m[0].length)rx.lastIndex++;
    }
    if(last<raw.length)frag.appendChild(document.createTextNode(raw.slice(last)));
  }
  function appendChunk(a,b,h){
    if(b<=a)return;
    var raw=text.slice(a,b);
    if(!h){appendText(raw);return;}
    var mark=document.createElement("mark");
    mark.className="note-highlight";
    mark.dataset.color=h.color||"yellow";
    mark.style.setProperty("--excerpt-highlight-base",EXCERPT_HIGHLIGHT_COLORS[h.color]||EXCERPT_HIGHLIGHT_COLORS.yellow);
    if(!term){mark.textContent=raw;}else{
      var pattern=term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),rx;
      try{rx=new RegExp(pattern,"giu");}catch(_){mark.textContent=raw;frag.appendChild(mark);return;}
      var last=0,m;
      while((m=rx.exec(raw))!==null){
        if(m.index>last)mark.appendChild(document.createTextNode(raw.slice(last,m.index)));
        var sh=document.createElement("span");sh.className="search-hit";sh.textContent=m[0];mark.appendChild(sh);
        last=m.index+m[0].length;if(!m[0].length)rx.lastIndex++;
      }
      if(last<raw.length)mark.appendChild(document.createTextNode(raw.slice(last)));
    }
    frag.appendChild(mark);
  }
  hs.forEach(function(h){
    var a=Math.max(pos,Number(h.start)||0),b=Math.min(text.length,Number(h.end)||0);
    if(a>pos)appendChunk(pos,a,null);
    appendChunk(a,b,h);pos=b;
  });
  appendChunk(pos,text.length,null);
  ed.replaceChildren(frag);
  ed.classList.toggle("has-search-highlight",!!term);
  ed.classList.toggle("has-note-highlight",hs.length>0);
  // V7.9.91：高亮重绘后重新建立当前“我的笔记”字号局部覆盖，
  // 防止 DOM 重建后字号回到默认值。
  var noteCard=ed.closest(".note");
  var oldNoteScope=noteCard&&noteCard.querySelector('style[data-note-font-scope]');
  if(oldNoteScope)oldNoteScope.remove();
  var noteSize=note&&parseFloat(note.noteFontSize);
  if(isFinite(noteSize)){
    ed.style.setProperty("font-size",noteSize+"px","important");
    ed.setAttribute("data-note-font-size-active","true");
    if(noteCard){
      var noteScope=document.createElement("style");
      noteScope.setAttribute("data-note-font-scope","true");
      noteScope.textContent='.note-pane .note-editor-content[data-note-font-size-active="true"], .note-pane .note-editor-content[data-note-font-size-active="true"] *{font-size:inherit !important;}';
      noteCard.appendChild(noteScope);
    }
  }else{
    ed.style.removeProperty("font-size");
    ed.removeAttribute("data-note-font-size-active");
  }
  if(saved){
    restoreContentEditableSelection(ed,saved.start,saved.end);
    ed.scrollTop=saved.scrollTop;ed.scrollLeft=saved.scrollLeft;
  }
}

function restoreContentEditableSelection(ed,start,end){
  if(!ed)return false;
  function locate(target){
    var walker=document.createTreeWalker(target,NodeFilter.SHOW_TEXT,null),node,total=0;
    while((node=walker.nextNode())){
      var len=String(node.nodeValue||"").length;
      if(total+len>=start){return {node:node,offset:Math.max(0,start-total)};}
      total+=len;
    }
    return {node:target,offset:target.childNodes.length};
  }
  function locateAt(offset){
    var walker=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT,null),node,total=0,last=null;
    while((node=walker.nextNode())){
      last=node;var len=String(node.nodeValue||"").length;
      if(total+len>=offset)return {node:node,offset:Math.max(0,offset-total)};
      total+=len;
    }
    return last?{node:last,offset:String(last.nodeValue||"").length}:{node:ed,offset:ed.childNodes.length};
  }
  try{
    var sel=window.getSelection(),r=document.createRange(),a=locateAt(Math.max(0,start)),b=locateAt(Math.max(0,end));
    r.setStart(a.node,a.offset);r.setEnd(b.node,b.offset);sel.removeAllRanges();sel.addRange(r);
    ed.__booknoteSelectionStart=start;ed.__booknoteSelectionEnd=end;
    return true;
  }catch(_){return false;}
}
function syncNoteHighlightsFromDOM(ed,note){
  if(!ed||!note)return;
  var text=noteEditorText(ed),ranges=[],offset=0;
  function walk(node){
    if(node.nodeType===3){offset+=node.nodeValue.length;return;}
    if(node.nodeType!==1)return;
    var start=offset;Array.prototype.forEach.call(node.childNodes,walk);
    if(node.classList&&node.classList.contains("note-highlight")){ranges.push({start:start,end:offset,color:node.dataset.color||"yellow"});}
  }
  Array.prototype.forEach.call(ed.childNodes,walk);
  note.noteText=text;note.noteHighlights=ranges;
}
function syncNoteMirrorMetrics(ta,mirror){
  if(!ta||!mirror)return;
  // textarea 是真实的鼠标选择/插入光标载体；mirror 只负责绘制持久高亮。
  // 两者必须使用完全相同的排版参数，否则选区背景会落在“另一套文字”上。
  try{
    var cs=window.getComputedStyle(ta);
    var props=[
      "font-family","font-size","font-weight","font-style","font-variant",
      "line-height","letter-spacing","word-spacing","text-align","text-indent",
      "text-transform","white-space","tab-size","direction","unicode-bidi"
    ];
    props.forEach(function(prop){
      var v=cs.getPropertyValue(prop);
      if(v)mirror.style.setProperty(prop,v,"important");
    });
    ["padding-top","padding-right","padding-bottom","padding-left"].forEach(function(prop){
      var pv=parseFloat(cs.getPropertyValue(prop))||0;
      var bv=parseFloat(cs.getPropertyValue(prop.replace("padding","border").replace("-top","-top-width").replace("-right","-right-width").replace("-bottom","-bottom-width").replace("-left","-left-width")))||0;
      mirror.style.setProperty(prop,(pv+bv)+"px","important");
    });
    mirror.style.setProperty("box-sizing","border-box","important");
  }catch(_){}
}

function renderNoteEditorMirror(card,note){
  var wrap=card&&card.querySelector(".note-editor-wrap"),ta=wrap&&wrap.querySelector(".note-editor-content, textarea.text");
  if(!wrap||!ta)return;
  if(ta.classList.contains("note-editor-content")){renderNoteEditorContent(ta,note);return;}
  var mirror=wrap.querySelector(".note-editor-highlight");
  if(!mirror)return;
  syncNoteMirrorMetrics(ta,mirror);
  var text=String(ta.value||""), hs=noteHighlightData(note).slice().sort(function(a,b){return a.start-b.start;}), pos=0;
  mirror.innerHTML="";
  hs.forEach(function(h){
    var a=Math.max(pos,Number(h.start)||0),b=Math.min(text.length,Number(h.end)||0);
    if(a>pos)mirror.appendChild(document.createTextNode(text.slice(pos,a)));
    if(b>a){var m=document.createElement("mark");m.className="note-highlight";m.dataset.color=h.color||"yellow";m.style.setProperty("--excerpt-highlight-base",EXCERPT_HIGHLIGHT_COLORS[h.color]||EXCERPT_HIGHLIGHT_COLORS.yellow);m.textContent=text.slice(a,b);mirror.appendChild(m);pos=b;}
  });
  if(pos<text.length)mirror.appendChild(document.createTextNode(text.slice(pos)));
  applySearchHighlightsToElement(mirror,activeSearch);
  wrap.classList.toggle("has-search-highlight",!!activeSearch.trim());
  wrap.classList.toggle("has-note-highlight",hs.length>0);
  var size=ta.dataset.noteFontSize;
  if(size){mirror.style.fontSize=size+"px";}
  // 镜像层必须与 textarea 保持同一滚动位置，否则高亮会看起来“消失/错位”。
  mirror.scrollTop=ta.scrollTop;
  mirror.scrollLeft=ta.scrollLeft;
}
// V7.9.16：笔记高亮采用“先更新界面、后台持久化”，避免点击颜色按钮后等待 storage I/O。
var noteHighlightSaveTimers=Object.create(null);
var noteHighlightSaveBusy=Object.create(null);
function saveNoteHighlights(note){
  var id=note&&note.id;if(!id)return Promise.resolve();
  clearTimeout(noteHighlightSaveTimers[id]);
  return new Promise(function(resolve){
    noteHighlightSaveTimers[id]=setTimeout(function(){
      var payload=Array.isArray(note.noteHighlights)?note.noteHighlights.map(function(h){return {start:h.start,end:h.end,color:h.color};}):[];
      noteHighlightSaveBusy[id]={payload:payload,resolve:resolve};
      browser.storage.local.get("booknoteNotes").then(function(r){
        var ns=Array.isArray(r.booknoteNotes)?r.booknoteNotes:[],i=ns.findIndex(function(x){return x&&x.id===id;});
        if(i<0){delete noteHighlightSaveBusy[id];resolve();return;}
        ns[i]=Object.assign({},ns[i],{noteHighlights:payload});
        return browser.storage.local.set({booknoteNotes:ns});
      }).then(function(){
        var job=noteHighlightSaveBusy[id];delete noteHighlightSaveBusy[id];if(job)job.resolve();
      }).catch(function(){
        var job=noteHighlightSaveBusy[id];delete noteHighlightSaveBusy[id];if(job)job.resolve();
        toast("笔记高亮保存失败");
      });
    },80);
  });
}
function addNoteHighlight(card,note,color){
  var ta=card&&card.querySelector(".note-editor-wrap .note-editor-content, .note-editor-wrap textarea.text"),range=noteSelectedRange(ta);
  if(!range){toast("请先在“我的笔记（可编辑）”中选中文字");return;}
  note.noteHighlights=noteHighlightData(note).filter(function(h){return !(h.end>range.start&&h.start<range.end);});
  note.noteHighlights.push({start:range.start,end:range.end,color:color});
  // 先立即重绘当前笔记，再异步保存；左右原文摘录完全不参与。
  renderNoteEditorContent(ta,note,true);
  // 保留原生 contenteditable 选区；按钮本身不抢焦点。
  saveNoteHighlights(note);
}
function clearNoteHighlight(card,note){
  var ta=card&&card.querySelector(".note-editor-wrap .note-editor-content, .note-editor-wrap textarea.text"),range=noteSelectedRange(ta);
  if(!range){toast("请先选中要取消的笔记高亮");return;}
  note.noteHighlights=noteHighlightData(note).filter(function(h){return !(h.end>range.start&&h.start<range.end);});
  renderNoteEditorContent(ta,note,true);
  // 清除高亮同样保留编辑区选区状态。
  saveNoteHighlights(note);
}

function bindNoteCards(){
 list.querySelectorAll(".note").forEach(function(c){
  var id=c.dataset.id;
  c.querySelector(".jump").onclick=function(){var n=cache.find(function(x){return x.id===id;});if(n)openSource(n);};
  bindExcerptSelectionTracking(c);
  var excerptNote=cache.find(function(x){return x.id===id;})||{};
  renderExcerptHighlights(c,excerptNote);
  renderNoteEditorMirror(c,excerptNote);
  var noteWrap=c.querySelector(".note-editor-wrap"), noteTa=noteWrap&&noteWrap.querySelector(".note-editor-content, textarea.text");
  if(noteTa){
    ["mouseup","keyup","focus","blur","input","select"].forEach(function(ev){
      noteTa.addEventListener(ev,function(){rememberNoteSelection(noteTa);});
    });
    noteTa.addEventListener("mousedown",function(){ rememberNoteSelection(noteTa); },true);
    noteTa.addEventListener("keydown",function(){
      setTimeout(function(){rememberNoteSelection(noteTa);},0);
    },true);
  }
  c.querySelectorAll(".excerpt-controls-below .excerpt-highlight-control").forEach(function(btn){
    btn.onclick=function(e){e.preventDefault();e.stopPropagation();var n=cache.find(function(x){return x.id===id;})||{};var color=btn.getAttribute("data-highlight-action");if(color==="clear")clearExcerptHighlight(c,n);else addExcerptHighlight(c,n,color);};
  });
  c.querySelectorAll(".note-excerpt-controls .excerpt-highlight-control").forEach(function(btn){
    btn.onclick=function(e){e.preventDefault();e.stopPropagation();var n=cache.find(function(x){return x.id===id;})||{};var color=btn.getAttribute("data-highlight-action");if(color==="clear")clearNoteHighlight(c,n);else addNoteHighlight(c,n,color);};
  });
  // 颜色按钮/清除按钮按下时禁止按钮本身抢走编辑区原生选区。
  c.querySelectorAll(".note-excerpt-controls .excerpt-highlight-control, .note-excerpt-controls .excerpt-font-control").forEach(function(btn){
    btn.addEventListener("mousedown",function(e){e.preventDefault();},true);
  });

  // V7.12.96：A-/A/A+ 统一调整当前普通笔记左右正文的字号，保持同一 Typography。
  var excerptFontStep = 1;
  c.querySelectorAll(".excerpt-font-control").forEach(function(btn){
    btn.onclick=function(e){
      e.preventDefault();
      e.stopPropagation();
      var action=btn.getAttribute("data-font-action")||"";
      var q=c.querySelector(".normal-note-grid > .excerpt-pane > .quote");
      var ed=c.querySelector(".normal-note-grid > .note-pane > .note-editor-wrap > .note-editor-content");
      if(!q||!ed)return false;
      var n2=cache.find(function(x){return x.id===id;})||{};
      var current=parseFloat(n2.noteFontSize||q.dataset.booknoteUnifiedFontSize||ed.dataset.booknoteUnifiedFontSize||"");
      if(!isFinite(current))current=parseFloat(window.getComputedStyle(q).fontSize)||14;
      if(action==="reset"){
        delete n2.noteFontSize;
        [q,ed].forEach(function(el){
          el.style.removeProperty("font-size");
          delete el.dataset.booknoteUnifiedFontSize;
        });
        return false;
      }
      if(action==="increase")current += excerptFontStep;
      else if(action==="decrease")current -= excerptFontStep;
      else return false;
      current=Math.max(10,Math.min(36,current));
      n2.noteFontSize=current;
      [q,ed].forEach(function(el){
        el.dataset.booknoteUnifiedFontSize=String(current);
        el.style.setProperty("font-size",current+"px","important");
      });
      return false;
    };
  });

  c.querySelectorAll(".excerpt-read-actions .excerpt-read").forEach(function(btn){
    btn.addEventListener("mousedown",function(e){
      var action=btn.getAttribute("data-read-action")||"";
      if(action==="read-home" || action==="read-current" || action==="read-selection" || action==="read-toggle" || action==="read-stop"){
        e.preventDefault();
      }
    },true);
    btn.onclick=function(e){
      e.preventDefault();
      e.stopPropagation();
      var n=cache.find(function(x){return x.id===id;});
      if(!n)return;
      var action=btn.getAttribute("data-read-action")||"";
      var controlsRoot=speechControlsRoot(btn);
      if(action==="voice-settings"){
        browser.runtime.sendMessage({type:"booknote-open-voice-settings"}).catch(function(){toast("无法打开语音朗读设置");});
        return;
      }
      if(action==="read-home" || action==="read-current" || action==="read-selection"){
        startExcerptSpeech(c,action,controlsRoot);
        return;
      }
      if(action==="read-toggle"){
        var st=excerptSpeechState;
        if(!st || st.card!==c || st.controlsRoot!==controlsRoot || !st.utterance){
          toast("当前区域没有朗读任务");
          return;
        }
        try{
          if(!booknoteSpeechHasTask()){
            updateExcerptSpeechButtons(c,"idle",controlsRoot);
            return;
          }
          booknoteSpeechPauseResume();
          st.status=window.speechSynthesis && window.speechSynthesis.paused ? "paused" : "speaking";
          updateExcerptSpeechButtons(c,st.status,controlsRoot);
        }catch(_){toast("暂停/继续失败");}
        return;
      }
      if(action==="read-stop"){
        if(excerptSpeechState && excerptSpeechState.card===c && excerptSpeechState.controlsRoot===controlsRoot){
          stopExcerptSpeech();
        }
        return;
      }
    };
  });
  updateExcerptSpeechButtons(c,"idle",speechControlsRoot(c.querySelector(".excerpt-controls-below,.note-excerpt-controls")));
  c.querySelector(".edit").onclick=function(){var ta=c.querySelector(".text");ta.focus();ta.scrollIntoView({behavior:"smooth",block:"center"});};
  c.querySelector(".save").onclick=function(){saveNote(c,id);};
  c.querySelector(".pin").onclick=function(){toggleFlag(id,"pinned");};
  c.querySelector(".fav").onclick=function(){toggleFlag(id,"favorite");};
  c.querySelector(".del").onclick=function(){deleteNote(id);};
 });
}
function addCategory(){
 var name=prompt("新建笔记分类名称：");
 if(name===null)return;
 name=name.trim();
 if(!name)return;
 getCategories().then(function(cats){
  if(cats.indexOf(name)>=0){
   toast("分类已存在");
   return null;
  }
  cats.push(name);
  return setCategories(cats).then(function(){
   return getCategories();
  }).then(function(savedCats){
   return {created:true,categories:savedCats};
  });
 }).then(function(result){
  if(!result || !result.created)return;
  toast("已新增笔记分类");
  // Re-read persisted data before rendering so the newly created
  // category is visible immediately without a manual page refresh.
  return render().then(function(){
   if(typeof renderCategories === "function"){
    return renderCategories(result.categories);
   }
  });
 }).catch(function(){
  toast("分类保存失败");
 });
}

function renameCategory(old){
 if(!old || old==="未分类"){toast("“未分类”不能重命名");return;}
 getCategories().then(function(cats){
  if(cats.indexOf(old)<0){toast("未找到该分类");return;}
  var nn=prompt("重命名分类：",old);
  if(nn===null)return;
  nn=nn.trim();
  if(!nn || nn===old)return;
  if(nn==="未分类"){toast("不能使用“未分类”作为新名称");return;}
  if(cats.indexOf(nn)>=0){toast("新名称已存在");return;}
  var next=cats.map(function(x){return x===old?nn:x;});
  return get().then(function(ns){
   ns.forEach(function(n){if(noteCategory(n)===old)n.category=nn;});
   return set(ns).then(function(){return setCategories(next);});
  }).then(function(){
   if(categoryFilter===old)categoryFilter=nn;
   savePanelState();
   toast("分类已重命名");
   render();
  });
 });
}

function deleteCategory(name){
 if(!name || name==="未分类"){toast("“未分类”不能删除");return;}
 if(!confirm("确定删除分类“"+name+"”？\\n该分类下的笔记不会删除，将移动到“未分类”。"))return;
 getCategories().then(function(cats){
  if(cats.indexOf(name)<0){toast("未找到该分类");return;}
  var next=cats.filter(function(x){return x!==name;});
  if(next.indexOf("未分类")<0)next.unshift("未分类");
  return get().then(function(ns){
   ns.forEach(function(n){if(noteCategory(n)===name)n.category="未分类";});
   return set(ns).then(function(){return setCategories(next);});
  }).then(function(){
   if(categoryFilter===name)categoryFilter="";
   view=categoryFilter?"category":"all";
   savePanelState();
   toast("分类已删除，笔记已移至未分类");
   render();
  });
 });
}

function manageCategories(){
 getCategories().then(function(cats){
  var text=cats.map(function(c,i){return (i+1)+". "+c;}).join("\\n");
  alert("分类管理\\n\\n"+text+"\\n\\n可直接点击每个分类右侧的 ✏️ 重命名 / 🗑️ 删除。");
 });
}

function openSource(note){
 if(!note||!note.pageUrl)return Promise.reject(new Error("missing url"));
 return browser.runtime.sendMessage({type:"booknote-jump",url:note.pageUrl,selectedText:note.selectedText||"",noteId:note.id||""})
 .then(function(){toast("正在打开原文…");}).catch(function(){alert("无法打开原文页面。");});
}

function downloadText(text,mime,filename){
 var u=URL.createObjectURL(new Blob([text],{type:mime}));
 return browser.downloads.download({url:u,filename:filename,saveAs:true,conflictAction:"uniquify"}).then(function(){setTimeout(function(){URL.revokeObjectURL(u);},10000);});
}
function currentExportSet(ns){
 return filtered(ns);
}

function exportFileName(prefix,ext){
 var scope="全部";
 if(view==="category")scope=categoryFilter||"分类";
 else if(view==="book")scope=bookFilter||"页面";
 else if(view==="excerpts")scope="摘录";
 else if(view==="favorite")scope="收藏";
 else if(view==="pinned")scope="点赞";
 else if(activeSearch.trim())scope="搜索";
 var safe=String(scope).replace(/[\\/:*?"<>|]+/g,"_").slice(0,60);
 return "BookNote-"+safe+"-"+new Date().toISOString().slice(0,10)+"."+ext;
}


function isImportedDocument(n){return n&&n.categoryType==="document"&&n.sourceType==="imported-document";}
function deleteImportedDocument(id){
 var target=cache.find(function(n){return n&&n.id===id;});
 if(!target)return;
 var label=target.documentFileName||target.name||"该文档";
 if(!confirm("确认删除导入文档「"+label+"」？\n该操作会同时删除阅读进度与书签。"))return;
 Promise.resolve(globalThis.BookLibraryDB?BookLibraryDB.removeBook(id):null).then(function(){return browser.storage.local.remove("booknoteReadingState:"+String(id));}).then(function(){return globalThis.BookNoteAnnotations?BookNoteAnnotations.removeBook(id).catch(function(){return 0;}):null;}).then(function(){toast("已删除："+label);return render();});
}

function documentCategoryName(fileName){
 var s=String(fileName||"").replace(/\.[^.]+$/,"").trim();
 return s||"导入文档";
}
function isDecimalSectionLabel(label){
 var t=String(label||'').replace(/\s+/g,' ').trim();
 return /^\d+(?:\.\d+)+(?:\s*(?:[、.\-:]\s*)?.*)?$/.test(t);
}
function isOfficeTocMetadataParent(label){
 var t=String(label||"").replace(/\s+/g," ").trim();
 return /(?:^|[\s\u3000])(书籍元数据|元数据|metadata)(?:$|[\s\u3000])/i.test(t);
}
function isOfficeTocNoiseHeading(label,level,parentHeading){
 var t=String(label||"").replace(/\s+/g," ").trim();
 if(!t)return true;
 /* Office metadata is content, not a TOC leaf. Keep the metadata section itself,
    but never promote its field rows (书名/作者/ISBN/语言/分类...). */
 if(parentHeading&&isOfficeTocMetadataParent(parentHeading.label)&&Number(level)>Number(parentHeading.level||1))return true;
 if(/^(?:\d+(?:\.\d+)+[\s、.-]*)?(?:书名|作者|副标题|ISBN|语言|分类|标签(?:\/分类)?|出版信息|出版日期|日期|版本|封面|文件名|文件格式|文件大小|编码|出版社)(?:\s*[:：].*)?$/i.test(t))return true;
 return false;
}
function buildImportedDocumentChapters(html,text,title){
 var source=String(text||""),safeHtml=String(html||"");
 if(!source.trim() && !safeHtml.trim())return [{index:0,label:String(title||"正文"),href:"",textStart:0,textEnd:0,text:"",html:"",isNavigation:false}];
 var doc=new DOMParser().parseFromString("<div id=\"__bn_ch_root\">"+safeHtml+"</div>","text/html"),root=doc.getElementById("__bn_ch_root"),blocks=root?Array.prototype.slice.call(root.children):[],allHeads=blocks.filter(function(el){return /^H[1-6]$/.test(el.tagName);});
 function foldHeadingTitle(v){return String(v||"").replace(/\.[^.]+$/,'').replace(/[（(]\d+[）)]$/,'').replace(/[“”‘’「」『』]/g,'').replace(/\s+/g,'').trim().toLowerCase();}
 var titleKey=foldHeadingTitle(title),heads=[],officeParentStack=[];
 allHeads.forEach(function(el,idx){
   var level=parseInt(String(el.tagName||"").slice(1),10)||1,label=String(el.textContent||"").replace(/\s+/g," ").trim();
   /* Canonical TOC contract: only headings explicitly marked as navigation
    * evidence may become TOC nodes. Presentation headings without this marker
    * (metadata labels, title-page artifacts, legacy headings) stay in the body. */
   var navAttr=String(el.getAttribute('data-txt-nav')||'');
   var genericTitlePage=/^Title\s*Page$/i.test(label);
   if(navAttr==='0'||genericTitlePage||isDecimalSectionLabel(label))return;
   while(officeParentStack.length&&officeParentStack[officeParentStack.length-1].level>=level)officeParentStack.pop();
   var parent=officeParentStack.length?officeParentStack[officeParentStack.length-1]:null;
   var sameAsTitle=!!(titleKey&&heads.length===0&&foldHeadingTitle(label)===titleKey);
   if(!sameAsTitle&&!isOfficeTocNoiseHeading(label,level,parent))heads.push(el);
   if(!isOfficeTocNoiseHeading(label,level,parent))officeParentStack.push({level:level,label:label});
 });
 if(!heads.length)return [ensureImportedChapterParagraphs({index:0,label:String(title||"正文"),href:"",textStart:0,textEnd:source.length,text:source,html:safeHtml,paragraphs:buildImportedParagraphBoundaries(safeHtml,source),paragraphSourceHash:paragraphSourceHash(source),headingLevel:0,isNavigation:false})];
 var chapters=[],cursor=0;
 function fold(x){return String(x||"").replace(/\u00a0/g," ").replace(/\r\n|\r/g,"\n").replace(/\s+/g," ").trim();}
 function rawOffsetForFolded(pos){var folded=fold(source),fi=0,raw=0;for(var i=0;i<source.length&&fi<pos;i++){var ch=source.charAt(i);if(/\s/.test(ch)){while(i+1<source.length&&/\s/.test(source.charAt(i+1)))i++;if(fi<pos)fi++;}else fi++;raw=i+1;}return Math.max(0,Math.min(source.length,raw));}
 var foldedSource=fold(source),foldedCursor=0;
 function pushChapter(label,st,en,chHtml,level,isNavigation){st=Math.max(0,Math.min(source.length,Number(st)||0));en=Math.max(st,Math.min(source.length,Number(en)||0));var chapterText=source.slice(st,en);if(!chapterText.trim() && !String(chHtml||'').trim())return;chapters.push(ensureImportedChapterParagraphs({index:chapters.length,label:String(label||title||"正文"),href:"",textStart:st,textEnd:en,text:chapterText,html:String(chHtml||""),paragraphs:buildImportedParagraphBoundaries(chHtml,chapterText),paragraphSourceHash:paragraphSourceHash(chapterText),headingLevel:Number(level)||0,isNavigation:!!isNavigation}));}
 heads.forEach(function(head,idx){
   var headingText=fold(head.innerText||head.textContent||"");
   var atFold=headingText?foldedSource.indexOf(headingText,foldedCursor):-1;
   var st=atFold>=0?rawOffsetForFolded(atFold):cursor;
   var next=idx+1<heads.length?heads[idx+1]:null,nextText=next?fold(next.innerText||next.textContent||""):"",nextFold=nextText?foldedSource.indexOf(nextText,Math.max(foldedCursor,atFold>=0?atFold+headingText.length:foldedCursor)):-1;
   var en=nextFold>=0?rawOffsetForFolded(nextFold):source.length;
   if(idx===0 && st>0){
     var preHtml=blocks.slice(0,blocks.indexOf(head)).map(function(x){return x.outerHTML;}).join("");
     pushChapter(title||"正文",0,st,preHtml,0,false);
   }
   var startBlock=blocks.indexOf(head),endBlock=next?blocks.indexOf(next):blocks.length,chunk=startBlock>=0?blocks.slice(startBlock,Math.max(startBlock+1,endBlock)):[];
   var chHtml=chunk.map(function(x){return x.outerHTML;}).join("");
   pushChapter(headingText||("第 "+(idx+1)+" 节"),st,en,chHtml,Number(head.tagName.slice(1))||1,true);
   cursor=en;foldedCursor=nextFold>=0?nextFold:foldedSource.length;
 });
 if(!chapters.length)return [{index:0,label:String(title||"正文"),href:"",textStart:0,textEnd:source.length,text:source,html:safeHtml,headingLevel:0,isNavigation:false}];
 return chapters;
}
function makeImportedDocument(fileName,text,meta){
 var now=new Date().toISOString(), id="doc-"+Date.now()+"-"+Math.random().toString(36).slice(2,10);
 var cat=documentCategoryName(fileName), m=meta||{};
 var html=String(m.html||plainTextToImportedHtml(text)||"");
 return {
   id:id,name:String(m.title||fileName||cat),pageTitle:String(m.title||fileName||cat),
   pageUrl:"",createdAt:now,updatedAt:now,
   category:cat,categoryType:"document",sourceType:"imported-document",
   documentFileName:String(fileName||""),selectedText:"",
   documentFormat:String(m.format||((String(fileName||"").split(".").pop()||"txt").toLowerCase())),
   documentOriginalHtml:html,
   documentOriginalText:String(text||""),
   documentOriginalBase64:"",
   documentSourceBlob:m.sourceBlob||null,
   documentEncoding:String(m.encoding||""),
   documentEncodingBom:!!m.encodingBom,
   documentFileSize:Number(m.fileSize||0),documentMime:String(m.mime||""),
   documentTitle:String(m.title||""),documentAuthor:String(m.author||""),
   documentPublisher:String(m.publisher||""),documentLanguage:String(m.language||""),
   documentDescription:String(m.description||""),
   documentChapters:(Array.isArray(m.chapters)&&m.chapters.length?m.chapters.map(function(ch){return ensureImportedChapterParagraphs(Object.assign({},ch));}):buildImportedDocumentChapters(html,String(text||""),String(m.title||fileName||cat))),
   documentCoverBase64:String(m.coverBase64||""),documentCoverMime:String(m.coverMime||""),documentCoverIsThumb:!!m.coverBase64,
   documentModified:false,
   favorite:false,pinned:false,excerptHighlights:[],documentEditable:true
 };
}
/* V7.10.68 P0 document model: search/excerpt results are data, not UI payloads.
 * Generated documents remain transient until explicitly exported; default export is ODT.
 * This prevents generated-document content from becoming another persistent full-text cache. */
function makeGeneratedBookNoteDocument(input){
 input=input||{};
 var results=Array.isArray(input.results)?input.results:[];
 return {
   schema:1,type:"booknote-generated-document",format:"odt",
   title:String(input.title||"BookNote 搜索摘取"),createdAt:new Date().toISOString(),
   sourceQuery:String(input.query||""),items:results.map(function(r,i){return {
     index:i+1,bookId:String(r.bookId||""),bookTitle:String(r.title||r.bookTitle||""),
     chapter:String(r.chapterLabel||r.chapter||""),text:String(r.matchText||r.text||r.snippet||""),
     snippet:String(r.snippet||""),start:r.matchStart!=null?Number(r.matchStart):null,end:r.matchEnd!=null?Number(r.matchEnd):null
   };})
 };
}
function generatedDocumentToOdtXml(model){
 var enc=new TextEncoder(),items=Array.isArray(model&&model.items)?model.items:[],body=[];
 body.push('<?xml version="1.0" encoding="UTF-8"?>');
 body.push('<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:automatic-styles><style:style style:name="Title" style:family="paragraph"><style:text-properties fo:font-size="18pt"/></style:style></office:automatic-styles><office:body><office:text>');
 body.push('<text:h text:outline-level="1">'+xmlEsc(model.title||"BookNote 搜索摘取")+'</text:h>');
 if(model.sourceQuery)body.push('<text:p>搜索：'+xmlEsc(model.sourceQuery)+'</text:p>');
 items.forEach(function(x){body.push('<text:h text:outline-level="2">'+xmlEsc((x.index||0)+". "+(x.bookTitle||"未命名书籍"))+'</text:h>');if(x.chapter)body.push('<text:p>章节：'+xmlEsc(x.chapter)+'</text:p>');body.push('<text:p>'+xmlEsc(x.text||x.snippet||"")+'</text:p>');});
 body.push('</office:text></office:body></office:document-content>');
 var styles='<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2"><office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles></office:document-styles>';
 var manifest='<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/></manifest:manifest>';
 return [{name:"mimetype",data:enc.encode("application/vnd.oasis.opendocument.text")},{name:"content.xml",data:enc.encode(body.join(""))},{name:"styles.xml",data:enc.encode(styles)},{name:"META-INF/manifest.xml",data:enc.encode(manifest)}];
}

function downloadAllJson(){
 return get().then(function(ns){
  var payload={format:"Read Aloud + BookNote Offline",version:3,exportedAt:new Date().toISOString(),scope:"all",notes:ns};
  return downloadText(JSON.stringify(payload,null,2),"application/json","BookNote-All-"+new Date().toISOString().slice(0,10)+".json")
   .then(function(){toast("所有 JSON 已导出（"+ns.length+" 条）");});
 });
}
function detectTextEncoding(bytes){
 var b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(b.length>=3&&b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF)return {encoding:"utf-8",offset:3,bom:true};
 if(b.length>=2&&b[0]===0xFF&&b[1]===0xFE)return {encoding:"utf-16le",offset:2,bom:true};
 if(b.length>=2&&b[0]===0xFE&&b[1]===0xFF)return {encoding:"utf-16be",offset:2,bom:true};
 // Many UTF-16 files have no BOM. Detect the characteristic NUL-byte pattern before
 // trying legacy Chinese encodings; otherwise UTF-16 data can be misclassified as GB18030.
 var sampleLen=Math.min(b.length,4096), evenZero=0, oddZero=0, pairs=0;
 for(var z=0;z+1<sampleLen;z+=2){if(b[z]===0)evenZero++;if(b[z+1]===0)oddZero++;pairs++;}
 if(pairs>=4){
  if(oddZero/pairs>=0.20&&evenZero/pairs<=0.12)return {encoding:"utf-16le",offset:0,bom:false};
  if(evenZero/pairs>=0.20&&oddZero/pairs<=0.12)return {encoding:"utf-16be",offset:0,bom:false};
 }
 try{new TextDecoder("utf-8",{fatal:true}).decode(b);return {encoding:"utf-8",offset:0,bom:false};}catch(_){ }
 // Legacy Chinese encodings are intrinsically ambiguous. Prefer the candidate that
 // produces more natural Chinese text and penalize replacement/private-use/control noise.
 var candidates=["gb18030","gbk","big5","windows-1252"],best=null;
 for(var i=0;i<candidates.length;i++){
  var enc=candidates[i];
  try{
   var t=new TextDecoder(enc,{fatal:true}).decode(b),score=0;
   var cjk=(t.match(/[\u3400-\u9fff]/g)||[]).length;
   var latin=(t.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g)||[]).length;
   var bad=(t.match(/[\ufffd\ue000-\uf8ff\u0000-\u0008\u000b\u000c\u000e-\u001f]/g)||[]).length;
   var replacement=(t.match(/�/g)||[]).length;
   var common=(t.match(/[的了一是在不有我人中文测试你好世界繁體這測試段離線閱讀工作台问题答案章节目录第一第二第三]/g)||[]).length;
   var mojibake=(t.match(/[ÃÂÐÑåæçèéêëìíîïðñòóôõö÷øùúûüýþ]/g)||[]).length;
   // Prefer Chinese legacy encodings for Chinese-looking text, but allow Western ANSI/Windows-1252.
   score=cjk*4+common*8+latin*0.15-bad*20-replacement*30-mojibake*8;
   if(enc==="windows-1252" && cjk>0)score-=cjk*3;
   if(!best||score>best.score)best={encoding:enc,score:score};
  }catch(_){ }
 }
 if(best)return {encoding:best.encoding,offset:0,bom:false};
 return {encoding:"windows-1252",offset:0,bom:false};
}
function decodeTextBytes(bytes,encoding){
 var b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),info=encoding?{encoding:encoding,offset:0}:detectTextEncoding(b);
 var sliced=b.subarray(info.offset||0),decoder;
 try{decoder=new TextDecoder(info.encoding||"utf-8",{fatal:false});}catch(_){decoder=new TextDecoder("utf-8",{fatal:false});info.encoding="utf-8";}
 return {text:decoder.decode(sliced).replace(/^\uFEFF/,""),encoding:info.encoding,bom:!!info.bom};
}
function bytesToString(bytes){return decodeTextBytes(bytes,"utf-8").text;}
function readU16(view,o){return view.getUint16(o,true);}
function readU32(view,o){return view.getUint32(o,true);}
function findEocd(view){
 for(var i=view.byteLength-22;i>=Math.max(0,view.byteLength-65557);i--){
  if(readU32(view,i)===0x06054b50)return i;
 }
 return -1;
}
async function unzipEntriesBinary(buffer,wanted){
 var view=new DataView(buffer),eocd=findEocd(view);
 if(eocd<0)throw new Error("不是有效 ZIP 文档");
 if(eocd+22>view.byteLength)throw new Error("ZIP 文档结构不完整");
 var count=readU16(view,eocd+10),u8=new Uint8Array(buffer),out={};
 var enc=new TextDecoder("utf-8",{fatal:false}),pos=readU32(view,eocd+16),wantedSet=null;
 if(Array.isArray(wanted))wantedSet={};
 if(wantedSet)wanted.forEach(function(x){wantedSet[String(x)]=1;});
 for(var n=0;n<count;n++){
  if(readU32(view,pos)!==0x02014b50)throw new Error("ZIP 目录损坏");
  var flags=readU16(view,pos+8),method=readU16(view,pos+10),csize=readU32(view,pos+20);
  var nlen=readU16(view,pos+28),elen=readU16(view,pos+30),clen=readU16(view,pos+32),localOffset=readU32(view,pos+42);
  var nameBytes=u8.slice(pos+46,pos+46+nlen),name=(flags&0x800)?enc.decode(nameBytes):enc.decode(nameBytes);
  pos+=46+nlen+elen+clen;
  if(wantedSet&&!wantedSet[name])continue;
  var lo=localOffset;
  if(readU32(view,lo)!==0x04034b50)throw new Error("ZIP 本地目录损坏");
  var ln=readU16(view,lo+26),le=readU16(view,lo+28),start=lo+30+ln+le,data=u8.slice(start,start+csize);
  if(method===0)out[name]=new Uint8Array(data);
  else if(method===8){
   if(typeof DecompressionStream==="undefined")throw new Error("当前 Firefox 不支持离线解压");
   var ds=new DecompressionStream("deflate-raw"),stream=new Blob([data]).stream().pipeThrough(ds);
   out[name]=new Uint8Array(await new Response(stream).arrayBuffer());
  }else throw new Error("暂不支持此文档的 ZIP 压缩方式");
 }
 return out;
}
async function unzipTextEntries(buffer,wanted){
 var view=new DataView(buffer), eocd=findEocd(view);
 if(eocd<0)throw new Error("不是有效 ZIP 文档");
 if(eocd+22>view.byteLength)throw new Error("ZIP 文档结构不完整");
 var count=readU16(view,eocd+10), cdSize=readU32(view,eocd+12), cdOffset=readU32(view,eocd+16);
 var u8=new Uint8Array(buffer), out={};
 var enc=new TextDecoder("utf-8",{fatal:false}), pos=cdOffset;
 for(var n=0;n<count;n++){
  if(readU32(view,pos)!==0x02014b50)throw new Error("ZIP 目录损坏");
  var flags=readU16(view,pos+8), method=readU16(view,pos+10), csize=readU32(view,pos+20);
  var nlen=readU16(view,pos+28), elen=readU16(view,pos+30), clen=readU16(view,pos+32);
  var localOffset=readU32(view,pos+42);
  var nameBytes=u8.slice(pos+46,pos+46+nlen);
  var name=(flags&0x800)?enc.decode(nameBytes):new TextDecoder("utf-8").decode(nameBytes);
  pos+=46+nlen+elen+clen;
  if(wanted.indexOf(name)<0)continue;
  var lo=localOffset;
  if(readU32(view,lo)!==0x04034b50)throw new Error("ZIP 本地目录损坏");
  var ln=readU16(view,lo+26), le=readU16(view,lo+28);
  var data=u8.slice(lo+30+ln+le,lo+30+ln+le+csize);
  if(method===0)out[name]=data;
  else if(method===8){
   if(typeof DecompressionStream==="undefined")throw new Error("当前 Firefox 不支持离线解压");
   var ds=new DecompressionStream("deflate-raw");
   var stream=new Blob([data]).stream().pipeThrough(ds);
   out[name]=new Uint8Array(await new Response(stream).arrayBuffer());
  }else throw new Error("暂不支持此文档的 ZIP 压缩方式");
 }
 return out;
}
function xmlLocalName(el){return String(el&&el.localName||el&&el.nodeName||"").split(":").pop().toLowerCase();}
function xmlChildrenByLocal(root,name){var out=[],all=root?root.getElementsByTagName("*"):[];for(var i=0;i<all.length;i++)if(xmlLocalName(all[i])===name)out.push(all[i]);return out;}
function xmlEscAttr(s){return xmlEsc(String(s==null?"":s)).replace(/'/g,"&#39;");}
function bytesToBase64(bytes){var s="",chunk=0x8000;for(var i=0;i<bytes.length;i+=chunk){var a=bytes.subarray(i,Math.min(i+chunk,bytes.length));s+=String.fromCharCode.apply(null,a);}return btoa(s);}
async function makeEpubCoverThumb(raw,mime){
 if(!raw||!raw.length)return {base64:"",mime:""};
 try{
   var blob=new Blob([raw],{type:String(mime||"image/jpeg")});
   if(typeof createImageBitmap!=="function")return {base64:"",mime:""};
   var bmp=await createImageBitmap(blob),maxW=360,maxH=480,scale=Math.min(1,maxW/bmp.width,maxH/bmp.height),w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
   var c=document.createElement("canvas");c.width=w;c.height=h;var ctx=c.getContext("2d");ctx.drawImage(bmp,0,0,w,h);bmp.close();
   var tb=await new Promise(function(resolve){c.toBlob(resolve,"image/jpeg",0.72);});
   if(!tb)return {base64:"",mime:""};
   var ab=new Uint8Array(await tb.arrayBuffer());
   return {base64:bytesToBase64(ab),mime:"image/jpeg"};
 }catch(_){return {base64:"",mime:""};}
}
function base64ToBytes(s){var bin=atob(String(s||"")),out=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
function txtHeadingInfo(line, prevBlank, nextBlank, seen, lineIndex, lines){
 var rules=globalThis.BookNoteTxtHeadingRules;
 if(!rules)return null;
 var source=Array.isArray(lines)?lines.join("\n"):String(line||"");
 var a=rules.analyze(source,{}),hit=(a.headings||[]).find(function(h){return Number(h.line)===Number(lineIndex);});
 return hit?{level:hit.level,label:hit.label,explicit:!!hit.explicit,type:hit.type}:null;
}
function detectTxtHeadings(text){
 var rules=globalThis.BookNoteTxtHeadingRules;
 if(!rules)return [];
 return (rules.analyze(String(text||""),{}).headings||[]).map(function(h){return {line:h.line,level:h.level,label:h.label,textStart:0,textEnd:0,explicit:!!h.explicit,type:h.type};});
}
function txtHeadingRawOffset(lines,lineIndex){var n=0;for(var i=0;i<lineIndex;i++)n+=String(lines[i]||'').length+1;return n;}
function plainTextToImportedHtmlWithTxtHeadings(text){
 var rules=globalThis.BookNoteTxtHeadingRules;
 if(rules)return rules.toHtml(String(text==null?'':text),"",htmlEsc);
 var source=String(text==null?'':text).replace(/\r\n?/g,'\n');
 return source.split('\n').map(function(line){return line?'<p>'+htmlEsc(line)+'</p>':'<p><br></p>';}).join('');
}
function plainTextToImportedHtml(text){return plainTextToImportedHtmlWithTxtHeadings(text);}
function htmlEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function sanitizeImportedHtml(html){
 var doc=new DOMParser().parseFromString("<div id=\"root\">"+String(html||"")+"</div>","text/html"),root=doc.getElementById("root");
 if(!root)return plainTextToImportedHtml("");
 var allowed={P:1,DIV:1,H1:1,H2:1,H3:1,H4:1,H5:1,H6:1,BR:1,STRONG:1,B:1,EM:1,I:1,U:1,S:1,SPAN:1,MARK:1,UL:1,OL:1,LI:1,BLOCKQUOTE:1,A:1,TABLE:1,THEAD:1,TBODY:1,TR:1,TH:1,TD:1,IMG:1};
 Array.prototype.slice.call(root.querySelectorAll("*")).forEach(function(el){
   if(!allowed[el.tagName]){el.replaceWith.apply(el,Array.prototype.slice.call(el.childNodes));return;}
   Array.prototype.slice.call(el.attributes).forEach(function(a){var n=a.name.toLowerCase();if(n!=="href"&&n!=="title"&&n!=="class"&&n!=="data-color"&&n!=="style"&&n!=="target"&&!(el.tagName==="IMG"&&n==="src"&&/^(?:data:|blob:)/i.test(a.value)))el.removeAttribute(a.name);});
   if(el.tagName==="A"){var href=el.getAttribute("href")||"";if(!/^https?:|^mailto:/i.test(href))el.removeAttribute("href");}
   if(el.getAttribute("style")){var st=el.getAttribute("style").replace(/expression\s*\([^)]*\)/gi,"").replace(/url\s*\([^)]*\)/gi,"");el.setAttribute("style",st);}
   var cls=String(el.getAttribute("class")||"");
   if(/(?:^|\s)(?:search-hit|note-highlight)(?:\s|$)/.test(cls)){el.replaceWith.apply(el,Array.prototype.slice.call(el.childNodes));}
 });
 return root.innerHTML;
}
function paragraphSourceHash(s){var x=String(s||''),h=2166136261;for(var i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
function buildImportedParagraphBoundaries(html,text){
 var source=String(text||''),out=[];if(!source)return out;
 var doc=null,root=null,blocks=[];try{doc=new DOMParser().parseFromString("<div id=\"__bn_pb_root\">"+String(html||"")+"</div>","text/html");root=doc.getElementById("__bn_pb_root");if(root)blocks=Array.prototype.slice.call(root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote,li,pre,dt,dd'));if(!blocks.length&&root)blocks=Array.prototype.slice.call(root.children);}catch(_){blocks=[];}
 function fold(x){var y=String(x||'').replace(/\u00a0/g,' ').replace(/\r\n|\r/g,'\n').replace(/\s+/g,' ').trim();try{y=y.normalize('NFKC');}catch(_){}return y;}
 var folded=fold(source),map=[],last=-1,fi=0;
 for(var i=0;i<source.length;i++){var ch=source.charAt(i);if(/\s/.test(ch)){if(last!==-1&&fi<folded.length&&folded.charAt(fi)===' '){map[fi++]=i;last=-1;}continue;}var nx=ch;try{nx=nx.normalize('NFKC');}catch(_){}for(var j=0;j<nx.length&&fi<folded.length;j++)map[fi++]=i;}
 var cursor=0;blocks.forEach(function(el){var needle=fold(el.textContent||'');if(!needle)return;var at=folded.indexOf(needle,cursor);if(at<0)return;var start=map[at],endIndex=at+needle.length-1,end=endIndex<map.length?map[endIndex]+1:source.length;if(start==null||end<=start)return;out.push({start:start,end:end});cursor=endIndex+1;});
 if(!out.length){var re=/[^\n]+/g,m;while((m=re.exec(source))){if(m[0].trim())out.push({start:m.index,end:m.index+m[0].length});}}
 return out;
}


/* v7.18.56 — persistent source anchors for non-EPUB reflow documents.
 * The saved coordinate belongs to the imported source text, never to the live DOM.
 * Each visual block receives a local [start,end) source range so duplicate text
 * can never be resolved by a global occurrence ordinal after an iframe rebuild.
 */
function annotateImportedSourceRanges(html,text){
 var source=String(text||''),safeHtml=String(html||'');if(!safeHtml||!source)return safeHtml;
 try{
  var doc=new DOMParser().parseFromString('<div id="__bn_source_anchor_root">'+safeHtml+'</div>','text/html'),
      root=doc.getElementById('__bn_source_anchor_root');
  if(!root)return safeHtml;
  var blocks=Array.prototype.slice.call(root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote,li,pre,dt,dd'));
  if(!blocks.length)blocks=Array.prototype.slice.call(root.children||[]);
  function fold(v){var x=String(v||'').replace(/\u00a0/g,' ').replace(/\r\n|\r/g,'\n').replace(/\s+/g,' ').trim();try{x=x.normalize('NFKC')}catch(_){}return x;}
  var folded=fold(source),map=[],fi=0,i,ch,j,nx;
  for(i=0;i<source.length&&fi<folded.length;i++){
    ch=source.charAt(i);
    if(/\s/.test(ch)){
      while(i+1<source.length&&/\s/.test(source.charAt(i+1)))i++;
      if(fi<folded.length&&folded.charAt(fi)===' ')map[fi++]=i;
      continue;
    }
    nx=ch;try{nx=nx.normalize('NFKC')}catch(_){}
    for(j=0;j<nx.length&&fi<folded.length;j++)map[fi++]=i;
  }
  var cursor=0;
  blocks.forEach(function(el){
    var needle=fold(el.textContent||'');if(!needle)return;
    var at=folded.indexOf(needle,cursor);
    if(at<0)return;
    var endFold=at+needle.length-1,start=map[at],end=endFold<map.length?map[endFold]+1:source.length;
    if(start==null||end<=start)return;
    el.setAttribute('data-bn-source-start',String(start));
    el.setAttribute('data-bn-source-end',String(end));
    el.setAttribute('data-bn-source-version','1');
    cursor=endFold+1;
  });
  return root.innerHTML;
 }catch(_){return safeHtml;}
}
function annotateImportedChapterSourceRanges(ch){
 if(!ch)return ch;
 ch.html=annotateImportedSourceRanges(ch.html||'',ch.text||'');
 return ch;
}

function ensureImportedChapterParagraphs(ch){if(!ch)return ch;var text=String(ch.text||'');if(!text)return ch;var sig=paragraphSourceHash(text);if(!(Array.isArray(ch.paragraphs)&&ch.paragraphs.length&&String(ch.paragraphSourceHash||'')===sig)){ch.paragraphs=buildImportedParagraphBoundaries(ch.html||'',text);ch.paragraphSourceHash=sig;}ch.html=annotateImportedSourceRanges(ch.html||'',text);return ch;}


/* Unified Office Structure Adapter: ODT/DOCX use the frozen TXT Structure Rules
 * for TOC/heading decisions. Native Office heading metadata is evidence only;
 * it never bypasses BookNoteTxtHeadingRules. Search/locator source text remains
 * the imported text and chapter ranges are rebuilt from that same text. */
function enforceOfficeParagraphContract(html){
 var doc=new DOMParser().parseFromString('<div id="__bn_office_contract_root">'+String(html||'')+'</div>','text/html'),root=doc.getElementById('__bn_office_contract_root');
 if(!root)return String(html||'');
 function stripLeading(el){
   var walker=doc.createTreeWalker(el,NodeFilter.SHOW_TEXT,null),started=false,nodes=[];
   while(walker.nextNode())nodes.push(walker.currentNode);
   for(var i=0;i<nodes.length;i++){
     var n=nodes[i],v=String(n.nodeValue||'');
     if(!started){
       v=v.replace(/^[\s\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+/,'');
       n.nodeValue=v;
       if(v.length)started=true;
     }
   }
 }
 function contractStyle(el,kind){
   var raw=String(el.getAttribute('style')||''),parts=raw.split(';'),keep=[];
   parts.forEach(function(x){var q=x.trim();if(!q)return;var k=q.split(':')[0].trim().toLowerCase();
     if(/^(?:text-indent|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|line-height)$/.test(k))return;
     keep.push(q);
   });
   if(kind==='heading')keep.push('text-indent:0','margin-left:0','margin-right:0','padding-left:0','text-align:left','font-size:1em','line-height:1.9');
   else keep.push('text-indent:2em','margin-top:0','margin-bottom:0','margin-left:0','margin-right:0','padding-left:0','line-height:1.9');
   el.setAttribute('style',keep.join(';'));
 }
 Array.prototype.forEach.call(root.querySelectorAll('p'),function(el){stripLeading(el);contractStyle(el,'paragraph');});
 Array.prototype.forEach.call(root.querySelectorAll('h1,h2,h3,h4,h5,h6'),function(el){stripLeading(el);contractStyle(el,'heading');});
 /* Empty Office paragraph/div blocks are source-layout artifacts, not visible
  * reading paragraphs. Remove them so blank source paragraphs cannot become
  * visual blank lines. Content-bearing blocks remain untouched. */
 Array.prototype.forEach.call(root.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6'),function(el){
   var hasVisualChild=el.querySelector && el.querySelector('img,svg,table,ul,ol,blockquote,iframe,video,audio');
   var text=String(el.textContent||'').replace(/[\s\u00a0\u3000]+/g,'');
   if(!text && !hasVisualChild && el.parentNode)el.parentNode.removeChild(el);
 });
 Array.prototype.forEach.call(root.querySelectorAll('.booknote-document-title'),function(el){stripLeading(el);var raw=String(el.getAttribute('style')||''),parts=raw.split(';'),keep=[];parts.forEach(function(x){var q=x.trim();if(!q)return;var k=q.split(':')[0].trim().toLowerCase();if(/^(?:text-indent|margin-left|margin-right|padding-left)$/.test(k))return;keep.push(q);});keep.push('text-indent:0','margin-left:0','margin-right:0','padding-left:0');el.setAttribute('style',keep.join(';'));});
 return root.innerHTML;
}
function inferOdtDocumentTitle(html,fileName){
 var doc=new DOMParser().parseFromString('<div id="__bn_odt_title_root">'+String(html||'')+'</div>','text/html'),root=doc.getElementById('__bn_odt_title_root');
 if(!root)return {html:String(html||''),title:''};
 var blocks=Array.prototype.slice.call(root.children),meaningful=blocks.filter(function(el){return String(el.textContent||'').replace(/[\s\u00a0\u3000]+/g,'').trim();});
 if(!meaningful.length)return {html:String(html||''),title:''};
 function fold(v){return String(v||'').replace(/\.[^.]+$/,'').replace(/[（(]\d+[）)]$/,'').replace(/[“”‘’「」『』]/g,'').replace(/[\s\u00a0\u3000]+/g,'').trim().toLowerCase();}
 function clean(v){return String(v||'').replace(/[\t\r\n\u00a0\u3000]+/g,' ').replace(/\s+/g,' ').trim();}
 function structural(v){var t=clean(v);return /^(?:回\s*[^。！？；：:]{4,100}|第\s*(?:\d+|[一二三四五六七八九十百千万零〇两]+)\s*(?:章|节|篇|部|卷|回|集|册|辑)|问题\s*(?:\d+|[一二三四五六七八九十百千万零〇两]+)\s*[:：.、-])/i.test(t);}
 function isShortTitle(v){var t=clean(v);return t.length>=2&&t.length<=60&&!/[。！？；：:，,、]$/.test(t)&&!structural(t)&&!/^(?:回复|答复|回答|答案)\s*[:：]?$/i.test(t);}
 var fileStem=fold(fileName||'');
 var first=meaningful[0],firstText=clean(first.textContent),firstKey=fold(firstText);
 var firstIsNativeTitle=/(?:^|\s)booknote-document-title(?:\s|$)/i.test(String(first.getAttribute('class')||''));
 if(firstIsNativeTitle)return {html:String(html||''),title:firstText};
 if(firstKey&&fileStem&&firstKey===fileStem&&meaningful.length>1){
   var second=meaningful[1],secondText=clean(second.textContent);
   if(isShortTitle(secondText)){
     var secondHtml=second.outerHTML.replace(/<([a-z0-9-]+)([^>]*)>/i,function(_,tag,attrs){
       attrs=String(attrs||'').replace(/\sclass=(['"]).*?\1/i,'');
       return '<'+tag+attrs+' class="booknote-document-title" data-office-title="1">';
     });
     var out=[];blocks.forEach(function(el){if(el===first)out.push('');else if(el===second)out.push(secondHtml);else out.push(el.outerHTML);});
     return {html:out.join(''),title:secondText};
   }
   /* Filename-only first heading is noise even when the following content is a
    * proven structural heading. Keep the structural content and use the filename
    * stem as metadata only. */
   if(meaningful.length>1&&structural(secondText)){
     var out2=[];blocks.forEach(function(el){if(el===first)out2.push('');else out2.push(el.outerHTML);});
     return {html:out2.join(''),title:firstText.replace(/[（(]\d+[）)]$/,'').trim()};
   }
 }
 var firstTitleStyle=/(?:^|\s)booknote-document-title(?:\s|$)/i.test(String(first.getAttribute('class')||''));
 if(firstTitleStyle)return {html:String(html||''),title:firstText};
 return {html:String(html||''),title:''};
}

function normalizeOfficeHtmlToTxtRules(html,title){
 var rules=globalThis.BookNoteTxtHeadingRules;
 if(!rules)return {html:enforceOfficeParagraphContract(html),text:importedHtmlToText(html)};
 var doc=new DOMParser().parseFromString('<div id="__bn_office_unified_root">'+String(html||'')+'</div>','text/html'),root=doc.getElementById('__bn_office_unified_root');
 if(!root)return {html:String(html||''),text:importedHtmlToText(html)};
 var blocks=Array.prototype.slice.call(root.children),records=[],lines=[],titleSeen=false;
 blocks.forEach(function(el){
   var tag=String(el.tagName||'').toUpperCase(),txt=String(el.textContent||'').replace(/\r\n?|\r/g,'\n').replace(/[\t\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+/g,' ').replace(/\s+/g,' ').trim();
   var structural=/^H[1-6]$/.test(tag),titleBlock=/(?:^|\s)booknote-document-title(?:\s|$)/i.test(String(el.getAttribute('class')||''));
   /* Document Title and Structural Heading are different presentation/semantic layers. */
   if(titleBlock){
     if(titleSeen)titleBlock=false;
     else titleSeen=true;
   }
   /* Native Office Heading 1-6 is structural evidence. It is retained as evidence
    * for the final TOC unless a higher-priority semantic exclusion applies below
    * (currently: Reply labels and metadata-field children). The frozen TXT rules
    * still analyze the same normalized source for unproven headings; they no longer
    * demote a proven native Heading 2 merely because its text is decimal-numbered. */
   var synthetic=titleBlock?'':(structural?txt:('  '+txt));
   records.push({el:el,text:txt,tag:tag,structural:structural,titleBlock:titleBlock,nativeLevel:structural?Number(tag.slice(1)):0});
   lines.push(synthetic);
 });
 var source=lines.join('\n'),analysis=rules.analyze(source,{title:String(title||'').trim()}),hits={};
 (analysis.headings||[]).forEach(function(h){hits[Number(h.line)]=h;});
 var out=[],metadataSection=false;
 records.forEach(function(r,i){
   var h=hits[i],el=r.el,plain=r.text;
   /* Track the current top-level Section. Metadata is the one explicit Office
    * structural context where native Heading 2 fields are content, not TOC nodes. */
   if(r.structural&&r.nativeLevel===1){
     metadataSection=/^(?:第二部分\s+.*(?:书籍)?元数据|.*书籍元数据.*|metadata)$/i.test(plain);
   }
   var nativeReply=r.structural&&importedSemanticLabelKind(plain)==='reply';
   var nativeMetadataChild=metadataSection&&r.structural&&r.nativeLevel>=2;
   var decimalLabel=isDecimalSectionLabel(plain);
   if(decimalLabel){
     out.push('<div class="booknote-numbered-label" data-toc="0" style="text-indent:0;margin:0;padding:0;text-align:left;font-size:1em;font-weight:600;line-height:1.55">'+(el.innerHTML||htmlEsc(plain))+'</div>');
     return;
   }
   if(r.structural&&!r.titleBlock&&!nativeReply&&!nativeMetadataChild){
     var nativeLevel=Math.max(1,Math.min(6,r.nativeLevel||1)),inner=el.innerHTML||htmlEsc(plain);
     out.push('<h'+nativeLevel+' data-office-txt-rule="1" data-txt-nav="1" data-txt-nav-level="'+nativeLevel+'" style="text-indent:0;margin-left:0;margin-right:0;padding-left:0;text-align:left;font-size:1em;line-height:1.9">'+inner+'</h'+nativeLevel+'>');
     return;
   }
   /* Reply is a semantic body label, never a TOC heading, even when Office encoded
    * it as Heading 3. Keep the existing reply merge/body handling untouched. */
   if(r.titleBlock){
     out.push('<div class="booknote-document-title" style="text-indent:0;margin-left:0;margin-right:0;padding-left:0;text-align:center;font-size:1.35em;font-weight:600;line-height:1.45">'+(el.innerHTML||htmlEsc(plain))+'</div>');
     return;
   }
   /* Metadata fields are not structural headings in BookNote's Canonical TOC,
    * even when ODT/DOCX encoded them as Heading 2. Keep the field label visible
    * as a semantic label, but never render it as a heading and never expose it to TOC. */
   if(nativeMetadataChild){
     out.push('<div class="booknote-metadata-label" data-toc="0" style="text-indent:0;margin:0;padding:0;text-align:left;font-size:1em;font-weight:600;line-height:1.55">'+(el.innerHTML||htmlEsc(plain))+'</div>');
     return;
   }
   if(/^(?:TABLE|UL|OL|BLOCKQUOTE)$/i.test(r.tag)){out.push(el.outerHTML);return;}
   if(h&&!nativeMetadataChild&&!nativeReply){
     var tag='h'+Math.max(1,Math.min(6,Number(h.level)||1)),inner=el.innerHTML||htmlEsc(plain);
     out.push('<'+tag+' data-office-txt-rule="1" data-txt-nav="1" data-txt-nav-level="'+h.level+'" style="text-indent:0;margin-left:0;margin-right:0;padding-left:0;text-align:left;font-size:1em;line-height:1.9">'+inner+'</'+tag+'>');
     return;
   }
   var inner2=el.innerHTML||htmlEsc(plain);
   out.push('<p data-office-txt-rule="1" style="text-indent:2em;margin-top:0;margin-bottom:0;margin-left:0;margin-right:0;padding-left:0;line-height:1.9">'+inner2+'</p>');
 });
 var normalized=enforceOfficeParagraphContract(out.join(''));
 normalized=mergeOfficeContinuationParagraphs(normalized);
 normalized=enforceOfficeParagraphContract(normalized);
 var text=importedHtmlToText(normalized);
 return {html:normalized,text:text};
}

/* Office paragraph continuity: ODT/DOCX can contain hard paragraph blocks that
 * are only visual/source line fragments. Join only adjacent ordinary body blocks
 * when the preceding block is clearly a continuation (no terminal punctuation).
 * Never merge headings, decimal labels, semantic labels, titles, lists or blocks
 * carrying explicit structural markers. Browser wrapping remains the only visual
 * line wrapping inside the resulting logical paragraph. */
function mergeOfficeContinuationParagraphs(html){
 var doc=new DOMParser().parseFromString('<div id="__bn_office_merge_root">'+String(html||'')+'</div>','text/html'),root=doc.getElementById('__bn_office_merge_root');
 if(!root)return String(html||'');
 function textOf(el){return String(el&&el.textContent||'').replace(/[\\s\\u00a0\\u3000]+/g,' ').trim();}
 function ordinary(el){
   if(!el||String(el.tagName||'').toLowerCase()!=='p')return false;
   var c=String(el.getAttribute('class')||'');
   if(/(?:heading|title|semantic|numbered|metadata)/i.test(c))return false;
   if(el.getAttribute('data-txt-nav')==='1'||el.getAttribute('data-toc')==='1')return false;
   return true;
 }
 function terminal(t){return /[。！？!?；;：:]$/.test(t);}
 function startsContinuation(t){return /^[，。！？；：、,.!?;:）)】》」』”’]/.test(t);}
 var children=Array.prototype.slice.call(root.children);
 for(var i=0;i<children.length-1;i++){
   var a=children[i],b=children[i+1];
   if(!ordinary(a)||!ordinary(b))continue;
   var at=textOf(a),bt=textOf(b);
   if(!at||!bt)continue;
   /* A punctuation-led next block is always a continuation. Otherwise merge
    * only when the previous block has no sentence/semantic terminator. */
   if(startsContinuation(bt)||!terminal(at)){
     while(b.firstChild)a.appendChild(b.firstChild);
     b.parentNode.removeChild(b);
     children.splice(i+1,1);i--; if(i<0)i=0;
   }
 }
 return root.innerHTML;
}

function sanitizeImportedHtmlAndText(html){
 var doc=new DOMParser().parseFromString("<div id=\"root\">"+String(html||"")+"</div>","text/html"),root=doc.getElementById("root");
 if(!root)return {html:plainTextToImportedHtml(""),text:""};
 var allowed={P:1,DIV:1,H1:1,H2:1,H3:1,H4:1,H5:1,H6:1,BR:1,STRONG:1,B:1,EM:1,I:1,U:1,S:1,SPAN:1,MARK:1,UL:1,OL:1,LI:1,BLOCKQUOTE:1,A:1,TABLE:1,THEAD:1,TBODY:1,TR:1,TH:1,TD:1,IMG:1};
 Array.prototype.slice.call(root.querySelectorAll("*")).forEach(function(el){
   if(!allowed[el.tagName]){el.replaceWith.apply(el,Array.prototype.slice.call(el.childNodes));return;}
   Array.prototype.slice.call(el.attributes).forEach(function(a){var n=a.name.toLowerCase();if(n!=="href"&&n!=="title"&&n!=="class"&&n!=="data-color"&&n!=="style"&&n!=="target"&&!(el.tagName==="IMG"&&n==="src"&&/^(?:data:|blob:)/i.test(a.value)))el.removeAttribute(a.name);});
   if(el.tagName==="A"){var href=el.getAttribute("href")||"";if(!/^https?:|^mailto:/i.test(href))el.removeAttribute("href");}
   if(el.getAttribute("style")){var st=el.getAttribute("style").replace(/expression\s*\([^)]*\)/gi,"").replace(/url\s*\([^)]*\)/gi,"");el.setAttribute("style",st);}
   var cls=String(el.getAttribute("class")||"");
   if(/(?:^|\s)(?:search-hit|note-highlight)(?:\s|$)/.test(cls)){el.replaceWith.apply(el,Array.prototype.slice.call(el.childNodes));}
 });
 var text=String(root.innerText||root.textContent||"").replace(/\u00a0/g," ").replace(/\r\n|\r/g,"\n").trim();
 return {html:root.innerHTML,text:text};
}

function cssLenTwip(v){var n=parseFloat(v);return isFinite(n)?(n/20).toFixed(3)+'pt':'';}
function cssHalfPoint(v){var n=parseFloat(v);return isFinite(n)?(n/2).toFixed(2)+'pt':'';}
function docxSafeCssColor(v){
 var c=String(v||'').trim().toLowerCase().replace(/^#/,'');
 if(!c||c==='auto')return '';
 if(/^[0-9a-f]{6}$/.test(c)){
   var r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);
   if((r>=245&&g>=245&&b>=245)||(r<=10&&g<=10&&b<=10))return '';
   return '#'+c;
 }
 return '';
}
function docxStyleMap(stylesXml){
 var map={},doc=stylesXml?new DOMParser().parseFromString(String(stylesXml),'application/xml'):null;if(!doc||doc.querySelector('parsererror'))return map;
 xmlChildrenByLocal(doc,'style').forEach(function(st){
   var id=st.getAttribute('w:styleId')||'',based=xmlChildrenByLocal(st,'basedon')[0],name=xmlChildrenByLocal(st,'name')[0],nm=name&&name.getAttribute('w:val')||'',pp=xmlChildrenByLocal(st,'ppr')[0],rp=xmlChildrenByLocal(st,'rpr')[0],css=[];
   if(/heading\s*([1-6])/i.test(nm)) css.push('font-weight:700');
   if(rp){var b=xmlChildrenByLocal(rp,'b')[0],it=xmlChildrenByLocal(rp,'i')[0],u=xmlChildrenByLocal(rp,'u')[0],sz=xmlChildrenByLocal(rp,'sz')[0],c=xmlChildrenByLocal(rp,'color')[0],rf=xmlChildrenByLocal(rp,'rfonts')[0];if(b)css.push('font-weight:700');if(it)css.push('font-style:italic');if(u&&u.getAttribute('w:val')!=='none')css.push('text-decoration:underline');if(sz){var z=cssHalfPoint(sz.getAttribute('w:val'));if(z)css.push('font-size:'+z);}var safeColor=docxSafeCssColor(c&&c.getAttribute('w:val'));if(safeColor)css.push('color:'+safeColor);if(rf){var f=rf.getAttribute('w:eastAsia')||rf.getAttribute('w:ascii')||rf.getAttribute('w:hAnsi')||'';if(f)css.push('font-family:'+f.replace(/["']/g,'') );}}
   if(pp){var jc=xmlChildrenByLocal(pp,'jc')[0],ind=xmlChildrenByLocal(pp,'ind')[0],sp=xmlChildrenByLocal(pp,'spacing')[0];if(jc){var a=jc.getAttribute('w:val')||'';if(a==='center'||a==='right'||a==='left'||a==='both'||a==='distribute')css.push('text-align:'+(a==='both'||a==='distribute'?'justify':a));}if(sp){var before=sp.getAttribute('w:before'),after=sp.getAttribute('w:after'),line=sp.getAttribute('w:line'),rule=sp.getAttribute('w:lineRule');if(before)css.push('margin-top:'+cssLenTwip(before));if(after)css.push('margin-bottom:'+cssLenTwip(after));if(line){var ln=parseFloat(line);if(isFinite(ln)){if(rule==='exact'||rule==='atLeast')css.push('line-height:'+cssLenTwip(line));else css.push('line-height:'+(ln/240).toFixed(3));}}}}
   map[id]={css:css.join(';'),name:nm,based:based&&based.getAttribute('w:val')||''};
 });
 Object.keys(map).forEach(function(k){var seen={};function resolve(id){if(!map[id]||seen[id])return '';seen[id]=1;var m=map[id],base=resolve(m.based);return base+(base&&m.css?';':'')+m.css;}map[k].resolved=resolve(k);});return map;
}
function docxRunHtml(run,mediaMap,styleMap){
 var rPr=null;for(var i=0;i<run.childNodes.length;i++)if(run.childNodes[i].nodeType===1&&xmlLocalName(run.childNodes[i])==='rpr')rPr=run.childNodes[i];
 var bold=!!(rPr&&xmlChildrenByLocal(rPr,'b').length),italic=!!(rPr&&xmlChildrenByLocal(rPr,'i').length),underline=!!(rPr&&xmlChildrenByLocal(rPr,'u').length),strike=!!(rPr&&xmlChildrenByLocal(rPr,'strike').length),color='',sz='',font='',highlight='';
 if(rPr){var c=xmlChildrenByLocal(rPr,'color')[0];if(c&&c.getAttribute('w:val'))color=docxSafeCssColor(c.getAttribute('w:val'));var z=xmlChildrenByLocal(rPr,'sz')[0];if(z&&z.getAttribute('w:val'))sz=cssHalfPoint(z.getAttribute('w:val'));var rf=xmlChildrenByLocal(rPr,'rfonts')[0];if(rf)font=rf.getAttribute('w:eastAsia')||rf.getAttribute('w:ascii')||rf.getAttribute('w:hAnsi')||'';var hi=xmlChildrenByLocal(rPr,'highlight')[0];if(hi&&hi.getAttribute('w:val'))highlight=hi.getAttribute('w:val');}
 var out='',all=run.getElementsByTagName('*');for(var i=0;i<all.length;i++){var ln=xmlLocalName(all[i]);if(ln==='t')out+=htmlEsc(all[i].textContent||'');else if(ln==='tab')out+='&emsp;';else if(ln==='br'||ln==='cr')out+='<br>';else if(ln==='drawing'||ln==='pict'){var blips=xmlChildrenByLocal(all[i],'blip');for(var b=0;b<blips.length;b++){var rid=blips[b].getAttribute('r:embed')||blips[b].getAttribute('embed')||'',src=mediaMap&&mediaMap[rid];if(src)out+='<img src="'+xmlEscAttr(src)+'" alt="DOCX 图片">';}}
 }
 if(!out)return '';var style=[];if(color&&color.toLowerCase()!=='auto')style.push('color:#'+color);if(sz)style.push('font-size:'+sz);if(font)style.push('font-family:'+font.replace(/["']/g,''));if(highlight&&highlight!=='none')style.push('background-color:'+({yellow:'#fff59d',green:'#c8e6c9',cyan:'#b2ebf2',magenta:'#f8bbd0',blue:'#bbdefb',red:'#ffcdd2'}[highlight]||highlight));if(style.length)out='<span style="'+style.join(';')+'">'+out+'</span>';if(bold)out='<strong>'+out+'</strong>';if(italic)out='<em>'+out+'</em>';if(underline)out='<u>'+out+'</u>';if(strike)out='<s>'+out+'</s>';return out;
}
function normalizeImportedLeadingWhitespaceHtml(html){
 var doc=new DOMParser().parseFromString('<div id="__bn_indent_root">'+String(html||'')+'</div>','text/html'),root=doc.getElementById('__bn_indent_root');
 if(!root)return String(html||'');
 function strip(el){
   var started=false,walker=doc.createTreeWalker(el,NodeFilter.SHOW_TEXT,null),nodes=[];
   while(walker.nextNode())nodes.push(walker.currentNode);
   for(var i=0;i<nodes.length;i++){
     var n=nodes[i],v=String(n.nodeValue||'');
     if(!started){
       v=v.replace(/^[\s\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+/,'');
       n.nodeValue=v;
       if(v.length)started=true;
     }
   }
 }
 /* Also strip the fragment root itself. This matters when a semantic label
  * is merged with a reply body and the body is passed as innerHTML rather than
  * as a block element; querySelectorAll() cannot see that bare text fragment. */
 strip(root);
 root.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote').forEach(strip);
 return root.innerHTML;
}
function importedSemanticLabelKind(text){
 var t=String(text||'').replace(/^[\s\u00a0\u3000]+|[\s\u00a0\u3000]+$/g,'');
 return /^(?:回复|答复|回答|答案)\s*[:：]?$/.test(t)?'reply':'';
}
function mergeImportedSemanticReplyLabels(html){
 var doc=new DOMParser().parseFromString('<div id="__bn_reply_root">'+String(html||'')+'</div>','text/html'),root=doc.getElementById('__bn_reply_root');
 if(!root)return String(html||'');
 var els=Array.prototype.slice.call(root.children);
 for(var i=0;i<els.length-1;i++){
   var a=els[i],b=els[i+1];
   if(!/^P$/i.test(a.tagName)||!/^P$/i.test(b.tagName))continue;
   if(importedSemanticLabelKind(a.textContent)==='reply'){
     var label=a.textContent.replace(/^[\s\u00a0\u3000]+|[\s\u00a0\u3000]+$/g,'');
     /* The reply body may still begin with source indentation. Strip it before
      * attaching the body after the semantic label; otherwise the label itself
      * becomes the first text node and the later U+3000/NBSP survives, producing
      * a visually doubled paragraph indent. */
     var replyBody=normalizeImportedLeadingWhitespaceHtml(b.innerHTML);
     a.innerHTML='<span class="txt-semantic-label">'+htmlEsc(label)+'</span>'+replyBody;
     b.replaceWith(a); a.setAttribute('class',(a.getAttribute('class')||'')+' txt-reply-inline');
     els.splice(i+1,1); i--;
   }
 }
 return root.innerHTML;
}
function docxParagraphHtml(p,styleNames,mediaMap,numberingMap,styleMap){
 var pPr=xmlChildrenByLocal(p,'ppr')[0],style='',align='',num=false,ilvl=0,numId='',listKind='ul',outlineLevel=0;
 if(pPr){
   var ps=xmlChildrenByLocal(pPr,'pstyle')[0];if(ps)style=ps.getAttribute('w:val')||'';
   var jc=xmlChildrenByLocal(pPr,'jc')[0];if(jc)align=jc.getAttribute('w:val')||'';
   var ol=xmlChildrenByLocal(pPr,'outlineLvl')[0];if(ol)outlineLevel=parseInt(ol.getAttribute('w:val')||'0',10)+1;
   var np=xmlChildrenByLocal(pPr,'numpr')[0];if(np){num=true;var lv=xmlChildrenByLocal(np,'ilvl')[0];if(lv)ilvl=parseInt(lv.getAttribute('w:val')||'0',10)||0;var ni=xmlChildrenByLocal(np,'numid')[0];if(ni)numId=ni.getAttribute('w:val')||'';}
 }
 var headingLevel=Number(styleNames[style]||0)||outlineLevel;
 if(headingLevel<1||headingLevel>6)headingLevel=0;
 if(num&&numberingMap&&numberingMap[numId])listKind=numberingMap[numId];
 var body='',plain='';
 Array.prototype.forEach.call(p.childNodes,function(ch){if(ch.nodeType===1&&xmlLocalName(ch)==='r'){body+=docxRunHtml(ch,mediaMap,styleMap);plain+=ch.textContent||'';}});
 body=normalizeImportedLeadingWhitespaceHtml(body||''); body=body.replace(/<br\s*\/?>(?:\s*)/gi,'');
 plain=String(p.textContent||plain||'').replace(/^[\s\u00a0\u3000]+|[\s\u00a0\u3000]+$/g,'');
 /* Semantic reply labels are body labels, never structural headings. */
 if(headingLevel&&importedSemanticLabelKind(plain)==='reply')headingLevel=0;
 var isTitle=/^(?:title|subtitle)$/i.test(style)||/^(?:Title|Subtitle)$/i.test(String(styleNames[style]||''));
 var tag=headingLevel?'h'+headingLevel:(num?'li':'p'),bodyClass='';
 if(isTitle&&!headingLevel&&!num)bodyClass=' class="booknote-document-title"';
 if(!headingLevel&&!num&&importedSemanticLabelKind(plain)==='reply')bodyClass+=' class="txt-semantic-label"';
 var st=[];
 if(headingLevel){
   st.push('text-indent:0');st.push('margin-top:1.1em');st.push('margin-bottom:.65em');st.push('margin-left:0');st.push('margin-right:0');st.push('padding-left:0');
   if(align==='center')st.push('text-align:center');else if(align==='right')st.push('text-align:right');else if(align==='both'||align==='justify')st.push('text-align:justify');
 }else if(num){
   st.push('text-indent:0');st.push('margin-left:0');st.push('margin-right:0');st.push('padding-left:0');
 }else if(isTitle){
   st.push('text-indent:0');st.push('margin-left:0');st.push('margin-right:0');st.push('padding-left:0');st.push('text-align:center');st.push('font-size:1.35em');st.push('font-weight:600');st.push('line-height:1.45');st.push('margin-top:1.2em');st.push('margin-bottom:.8em');
 }else{
   /* Reader owns book typography: source paragraph spacing must not compound with it. */
   st.push('text-indent:2em');st.push('margin-top:0');st.push('margin-bottom:0');st.push('margin-left:0');st.push('margin-right:0');st.push('padding-left:0');st.push('line-height:1.9');
   if(align==='center')st.push('text-align:center');else if(align==='right')st.push('text-align:right');else if(align==='both'||align==='justify')st.push('text-align:justify');
 }
 return {html:'<'+tag+bodyClass+(st.length?' style="'+st.join(';')+'"':'')+'>'+body+'</'+tag+'>',list:num&&!headingLevel,level:ilvl,listKind:listKind,headingLevel:headingLevel};
}
function docxXmlToHtml(xml,stylesXml,mediaMap,numberingMap){
 var doc=new DOMParser().parseFromString(String(xml||''),'application/xml');if(doc.querySelector('parsererror'))throw new Error('DOCX 正文 XML 无法解析');
 var styleNames={},styleMap=docxStyleMap(stylesXml),styleSource=stylesXml?new DOMParser().parseFromString(String(stylesXml),'application/xml'):doc,styles=xmlChildrenByLocal(styleSource,'style');
 function directHeadingLevel(st){
   if(!st)return 0;
   var id=String(st.getAttribute('w:styleId')||'').trim(),nameEl=xmlChildrenByLocal(st,'name')[0],nm=String(nameEl&&nameEl.getAttribute('w:val')||'').trim();
   /* Title / Subtitle are presentation styles, never structural TOC headings. */
   if(/^(?:title|subtitle|标题|副标题)$/i.test(nm)||/^(?:title|subtitle)$/i.test(id))return 0;
   var m=nm.match(/^(?:heading|标题)\s*([1-6])$/i)||id.match(/^heading\s*([1-6])$/i);
   if(m)return parseInt(m[1],10);
   var spp=xmlChildrenByLocal(st,'ppr')[0],sol=spp&&xmlChildrenByLocal(spp,'outlineLvl')[0];
   if(sol){var ov=parseInt(sol.getAttribute('w:val')||'0',10)+1;if(ov>=1&&ov<=6)return ov;}
   return 0;
 }
 styles.forEach(function(st){var id=String(st.getAttribute('w:styleId')||'').trim(),level=directHeadingLevel(st);if(id&&level)styleNames[id]=level;});
 /* Custom styles based on Heading inherit the structural level. Title/Subtitle do not. */
 styles.forEach(function(st){var id=String(st.getAttribute('w:styleId')||'').trim();if(!id||styleNames[id])return;var seen={};function resolve(styleId){if(!styleId||seen[styleId])return 0;seen[styleId]=1;if(styleNames[styleId])return styleNames[styleId];var base=styleMap[styleId]&&styleMap[styleId].based||'';return resolve(base);}var inherited=resolve(id);if(inherited)styleNames[id]=inherited;});
 var body=xmlChildrenByLocal(doc,'body')[0],children=body?Array.prototype.filter.call(body.children,function(x){var l=xmlLocalName(x);return l==='p'||l==='tbl';}):[],out=[],listOpen=false;
 children.forEach(function(el){var ln=xmlLocalName(el);if(ln==='tbl'){if(listOpen){out.push('</'+listOpen+'>');listOpen=false;}out.push('<table><tbody>');xmlChildrenByLocal(el,'tr').forEach(function(tr){out.push('<tr>');Array.prototype.filter.call(tr.children,function(c){return xmlLocalName(c)==='tc';}).forEach(function(tc){var cell='';xmlChildrenByLocal(tc,'p').forEach(function(pp){cell+=docxParagraphHtml(pp,styleNames,mediaMap,numberingMap,styleMap).html;});out.push('<td>'+(cell||'<br>')+'</td>');});out.push('</tr>');});out.push('</tbody></table>');return;}
 var r=docxParagraphHtml(el,styleNames,mediaMap,numberingMap,styleMap);if(r.list){var listTag=r.listKind||'ul';if(!listOpen){out.push('<'+listTag+'>');listOpen=listTag;}else if(listOpen!==listTag){out.push('</'+listOpen+'>');out.push('<'+listTag+'>');listOpen=listTag;}out.push(r.html);}else{if(listOpen){out.push('</'+listOpen+'>');listOpen=false;}out.push(r.html);}});if(listOpen)out.push('</'+listOpen+'>');return out.join('');
}
function odtStyleMap(contentDoc,stylesDoc){
 var map={};[stylesDoc,contentDoc].forEach(function(doc){if(!doc)return;xmlChildrenByLocal(doc,"style").forEach(function(st){var name=st.getAttribute("style:name")||st.getAttribute("name")||"",tp=xmlChildrenByLocal(st,"text-properties")[0],pp=xmlChildrenByLocal(st,"paragraph-properties")[0],css=[];if(tp){var b=tp.getAttribute("fo:font-weight");if(b&&b!=="normal")css.push("font-weight:bold");var it=tp.getAttribute("fo:font-style");if(it&&it!=="normal")css.push("font-style:italic");var u=tp.getAttribute("style:text-underline-style");if(u&&u!=="none")css.push("text-decoration:underline");var fs=tp.getAttribute("fo:font-size");if(fs)css.push("font-size:"+fs);var fc=tp.getAttribute("fo:color");if(fc)css.push("color:"+fc);}if(pp){var al=pp.getAttribute("fo:text-align");if(al)css.push("text-align:"+al);var ind=pp.getAttribute("fo:text-indent");if(ind)css.push("text-indent:"+ind);}map[name]=css.join(";");});});return map;
}
function odtNodeHtml(node,styleMap){
 var ln=xmlLocalName(node);if(ln==="s"){var c=parseInt(node.getAttribute("text:c")||"1",10);return "&nbsp;".repeat(Math.max(1,isFinite(c)?c:1));}if(ln==="tab")return "&emsp;";if(ln==="line-break")return "<br>";
 var out="";Array.prototype.forEach.call(node.childNodes,function(ch){if(ch.nodeType===3||ch.nodeType===4)out+=htmlEsc(ch.nodeValue||"");else if(ch.nodeType===1)out+=odtNodeHtml(ch,styleMap);});
 var st=node.getAttribute&&node.getAttribute("text:style-name");if(st&&styleMap[st]&&out)out="<span style=\""+styleMap[st]+"\">"+out+"</span>";return out;
}
function odtXmlToHtml(contentXml,stylesXml){
 var doc=new DOMParser().parseFromString(String(contentXml||""),'application/xml'),stylesDoc=stylesXml?new DOMParser().parseFromString(String(stylesXml),'application/xml'):null;
 if(doc.querySelector('parsererror'))throw new Error('ODT 正文 XML 无法解析');
 var map=odtStyleMap(doc,stylesDoc),root=xmlChildrenByLocal(doc,'text')[0];
 if(!root)throw new Error('ODT 中未找到正文区域');
 function outlineLevel(el){
   var v=el&&el.getAttribute&&el.getAttribute('text:outline-level');
   v=v||el&&el.getAttribute&&el.getAttribute('outline-level');
   var n=parseInt(v||'0',10);
   if(n>=1&&n<=6)return n;
   var st=String(el&&el.getAttribute&&el.getAttribute('text:style-name')||'');
   var m=st.match(/(?:heading|标题)\s*([1-6])/i);
   return m?parseInt(m[1],10):1;
 }
 // Heading nodes carry the paragraph style themselves. Do not wrap the complete
 // heading text in the same style again; child text:span styles remain intact.
 function nodeHtml(node,skipOwnStyle){
   var ln=xmlLocalName(node);
   if(ln==='s'){var c=parseInt(node.getAttribute('text:c')||'1',10);return '&nbsp;'.repeat(Math.max(1,isFinite(c)?c:1));}
   if(ln==='tab')return '&emsp;';
   if(ln==='line-break')return '<br>';
   var out='';
   Array.prototype.forEach.call(node.childNodes,function(ch){
     if(ch.nodeType===3||ch.nodeType===4)out+=htmlEsc(ch.nodeValue||'');
     else if(ch.nodeType===1)out+=nodeHtml(ch,false);
   });
   var st=node.getAttribute&&node.getAttribute('text:style-name');
   if(!skipOwnStyle&&st&&map[st]&&out)out='<span style="'+map[st]+'">'+out+'</span>';
   return out;
 }
 function renderBlock(el){
   var ln=xmlLocalName(el),pst=el.getAttribute('text:style-name')||'',pc=map[pst]||'',body=nodeHtml(el,true)||'<br>';
   var plain=String(el.textContent||'').replace(/^[\s\u00a0\u3000]+|[\s\u00a0\u3000]+$/g,'');
   if(!plain && ln==='p') return '';
   var isTitleStyle=/^(?:title|subtitle|标题|副标题)$/i.test(String(pst));
   body=normalizeImportedLeadingWhitespaceHtml(body); if(ln==='p') body=body.replace(/<br\s*\/?>(?:\s*)/gi,'');
   if(isTitleStyle){
     return '<div class="booknote-document-title" data-office-title="1">'+body+'</div>';
   }
   if(ln==='h' && importedSemanticLabelKind(plain)!=='reply'){
     var tag='h'+outlineLevel(el),hs=(pc?pc+';':'')+'text-indent:0;margin-left:0;margin-right:0;padding-left:0';
     return '<'+tag+' style="'+hs+'">'+body+'</'+tag+'>';
   }
   var ps=(pc?pc+';':'')+'text-indent:2em;margin-left:0;margin-right:0;padding-left:0;line-height:1.9';
   if(importedSemanticLabelKind(plain)==='reply')body='<span class="txt-semantic-label">'+htmlEsc(plain)+'</span>';
   return '<p style="'+ps+'">'+body+'</p>';
 }
 var out='';
 Array.prototype.forEach.call(root.children,function(el){
   var ln=xmlLocalName(el);
   if(ln==='p'||ln==='h')out+=renderBlock(el);
   else if(ln==='list'){
     var ordered=false,st=el.getAttribute('text:style-name')||'';
     if(/number|ordered/i.test(st))ordered=true;
     var lt=ordered?'ol':'ul';out+='<'+lt+'>';
     Array.prototype.forEach.call(el.children,function(li){
       if(xmlLocalName(li)!=='list-item')return;
       out+='<li>'+Array.prototype.map.call(li.children,function(c){
         var cl=xmlLocalName(c);
         return (cl==='p'||cl==='h')?renderBlock(c):nodeHtml(c,false);
       }).join('')+'</li>';
     });
     out+='</'+lt+'>';
   }
 });
 return out;
}
function importedHtmlToText(html){var doc=new DOMParser().parseFromString(String(html||""),"text/html"),root=doc.body||doc;return String(root.innerText||root.textContent||"").replace(/\u00a0/g," ").replace(/\r\n/g,"\n").trim();}
function markdownInlineToHtml(s){
 s=htmlEsc(String(s||""));
 s=s.replace(/`([^`]+)`/g,"<code>$1</code>");
 s=s.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
 s=s.replace(/__([^_]+)__/g,"<strong>$1</strong>");
 s=s.replace(/\*([^*]+)\*/g,"<em>$1</em>");
 s=s.replace(/_([^_]+)_/g,"<em>$1</em>");
 s=s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2">$1</a>');
 return s;
}
function markdownToImportedHtml(md){
 var lines=String(md||"").replace(/\r\n?/g,"\n").split("\n"),out=[],list=null;
 function closeList(){if(list){out.push("</"+list+">");list=null;}}
 lines.forEach(function(line){
  var m=line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
  if(m){closeList();out.push("<h"+m[1].length+">"+markdownInlineToHtml(m[2])+"</h"+m[1].length+">");return;}
  var q=line.match(/^\s*>\s?(.*)$/);if(q){closeList();out.push("<blockquote>"+markdownInlineToHtml(q[1])+"</blockquote>");return;}
  var li=line.match(/^\s*[-*+]\s+(.+)$/);if(li){if(list!=="ul"){closeList();out.push("<ul>");list="ul";}out.push("<li>"+markdownInlineToHtml(li[1])+"</li>");return;}
  var oi=line.match(/^\s*\d+[.)]\s+(.+)$/);if(oi){if(list!=="ol"){closeList();out.push("<ol>");list="ol";}out.push("<li>"+markdownInlineToHtml(oi[1])+"</li>");return;}
  closeList();
  if(!line.trim())out.push("<p><br></p>");else out.push("<p>"+markdownInlineToHtml(line)+"</p>");
 });
 closeList();return out.join("");
}
/* v7.18.02 HTML/DM isolation gate.
 * HTML and DM (Markdown) get independent presentation hooks. These helpers only
 * annotate their own generated/imported HTML; they do not call or alter TXT,
 * Office, EPUB, or PDF paragraph normalizers.
 */
function normalizeHtmlImportedParagraphs(html){
 var doc=new DOMParser().parseFromString('<div id="__bn_html_format_root">'+String(html||'')+'</div>','text/html'),root=doc.getElementById('__bn_html_format_root');
 if(!root)return String(html||'');
 root.querySelectorAll('p').forEach(function(el){el.classList.add('booknote-html-paragraph');el.setAttribute('data-bn-format','html');});
 root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function(el){el.classList.add('booknote-html-heading');el.setAttribute('data-bn-format','html');});
 return root.innerHTML;
}
function normalizeDmImportedParagraphs(html){
 /* DM paragraph presentation is intentionally untouched. DM is isolated here only
    for semantic heading/TOC marking; paragraph spacing/indent remains Reader default. */
 var doc=new DOMParser().parseFromString('<div id="__bn_dm_format_root">'+String(html||'')+'</div>','text/html'),root=doc.getElementById('__bn_dm_format_root');
 if(!root)return String(html||'');
 root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function(el){el.classList.add('booknote-dm-heading');el.setAttribute('data-bn-format','dm');});
 return root.innerHTML;
}
function isCanonicalImportedTocHeading(label){
 var t=String(label||'').replace(/\s+/g,' ').trim();
 if(!t)return false;
 if(/^\d+(?:\.\d+)+(?:\s*(?:[、.\-:]\s*)?.*)?$/.test(t))return false;
 if(/^(?:——|—|--)?《[^》]+》$/.test(t))return false;
 return true;
}
function buildFormatSpecificImportedChapters(html,text,title,format){
 var source=String(text||''),safeHtml=String(html||''),kind=String(format||'').toLowerCase();
 var doc=new DOMParser().parseFromString('<div id="__bn_format_toc_root">'+safeHtml+'</div>','text/html'),root=doc.getElementById('__bn_format_toc_root');
 var blocks=root?Array.prototype.slice.call(root.children):[],allHeads=blocks.filter(function(el){return /^H[1-6]$/.test(el.tagName);});
 function fold(v){return String(v||'').replace(/\u00a0/g,' ').replace(/\r\n|\r/g,'\n').replace(/\s+/g,' ').trim();}
 function foldTitle(v){return fold(v).replace(/\.[^.]+$/,'').replace(/[（(]\d+[）)]$/,'').replace(/[“”‘’「」『』]/g,'').replace(/\s+/g,'').toLowerCase();}
 var titleKey=foldTitle(title),heads=[];
 allHeads.forEach(function(el){
   var label=fold(el.textContent||'');
   if(!isCanonicalImportedTocHeading(label))return;
   if(titleKey && !heads.length && foldTitle(label)===titleKey)return;
   heads.push(el);
 });
 if(!heads.length)return [{index:0,label:String(title||'正文'),href:'',textStart:0,textEnd:source.length,text:source,html:safeHtml,paragraphs:buildImportedParagraphBoundaries(safeHtml,source),paragraphSourceHash:paragraphSourceHash(source),headingLevel:0,isNavigation:false}];
 var foldedSource=fold(source),foldedCursor=0,cursor=0,chapters=[];
 function rawOffsetForFolded(pos){var fi=0,raw=0;for(var i=0;i<source.length&&fi<pos;i++){var ch=source.charAt(i);if(/\s/.test(ch)){while(i+1<source.length&&/\s/.test(source.charAt(i+1)))i++;if(fi<pos)fi++;}else fi++;raw=i+1;}return Math.max(0,Math.min(source.length,raw));}
 function push(label,st,en,chHtml,level){st=Math.max(0,Math.min(source.length,Number(st)||0));en=Math.max(st,Math.min(source.length,Number(en)||0));var chapterText=source.slice(st,en);if(!chapterText.trim()&&!String(chHtml||'').trim())return;chapters.push(ensureImportedChapterParagraphs({index:chapters.length,label:String(label||title||'正文'),href:'',textStart:st,textEnd:en,text:chapterText,html:String(chHtml||''),paragraphs:buildImportedParagraphBoundaries(chHtml,chapterText),paragraphSourceHash:paragraphSourceHash(chapterText),headingLevel:Number(level)||1,isNavigation:true}));}
 heads.forEach(function(head,idx){
   var headingText=fold(head.textContent||''),atFold=headingText?foldedSource.indexOf(headingText,foldedCursor):-1,st=atFold>=0?rawOffsetForFolded(atFold):cursor;
   var next=idx+1<heads.length?heads[idx+1]:null,nextText=next?fold(next.textContent||''):'',nextFold=nextText?foldedSource.indexOf(nextText,Math.max(foldedCursor,atFold>=0?atFold+headingText.length:foldedCursor)):-1,en=nextFold>=0?rawOffsetForFolded(nextFold):source.length;
   if(idx===0&&st>0){var preHtml=blocks.slice(0,blocks.indexOf(head)).map(function(x){return x.outerHTML;}).join('');if(preHtml.trim())chapters.push(ensureImportedChapterParagraphs({index:chapters.length,label:String(title||'正文'),href:'',textStart:0,textEnd:st,text:source.slice(0,st),html:preHtml,paragraphs:buildImportedParagraphBoundaries(preHtml,source.slice(0,st)),paragraphSourceHash:paragraphSourceHash(source.slice(0,st)),headingLevel:0,isNavigation:false}));}
   var startBlock=blocks.indexOf(head),endBlock=next?blocks.indexOf(next):blocks.length,chunk=startBlock>=0?blocks.slice(startBlock,Math.max(startBlock+1,endBlock)):[],chHtml=chunk.map(function(x){return x.outerHTML;}).join('');
   push(headingText||('第 '+(idx+1)+' 节'),st,en,chHtml,Number(head.tagName.slice(1))||1);
   cursor=en;foldedCursor=nextFold>=0?nextFold:foldedSource.length;
 });
 return chapters.length?chapters:[ensureImportedChapterParagraphs({index:0,label:String(title||'正文'),href:'',textStart:0,textEnd:source.length,text:source,html:safeHtml,headingLevel:0,isNavigation:false})];
}
function buildHtmlImportedDocumentChapters(html,text,title){return buildFormatSpecificImportedChapters(html,text,title,'html');}
function buildDmImportedDocumentChapters(html,text,title){return buildFormatSpecificImportedChapters(html,text,title,'dm');}

function supportedBookFormat(name){
 var ext=(String(name||"").split(".").pop()||"").toLowerCase();
 return ["epub","pdf","txt","odt","docx","md","html","htm"].indexOf(ext)>=0?(ext==="htm"?"html":ext):"";
}

async function parseImportedDocument(file){
 var name=file.name||"导入文档",ext=(name.split(".").pop()||"").toLowerCase();
 // PDF 只保存原始 Blob，不需要把整个文件读入 JS 堆；这对大批量导入可显著降低峰值内存。
 if(ext==="pdf"){
   if(!file || !file.size)throw new Error("PDF 原始文件为空");
   return {text:"",html:"<p>PDF 原始文档。请使用阅读器查看。</p>",format:ext,sourceBlob:file,pdfNative:true,fileSize:Number(file.size)||0,mime:"application/pdf"};
 }
 var bytes=new Uint8Array(await file.arrayBuffer());
 if(ext==="txt"){
   var decoded=decodeTextBytes(bytes),text=decoded.text,txtHtml=plainTextToImportedHtmlWithTxtHeadings(text),txtChapters=buildImportedDocumentChapters(txtHtml,text,String(file.name||"TXT"));
   return {text:text,html:txtHtml,chapters:txtChapters,format:ext,encoding:decoded.encoding,encodingBom:decoded.bom,sourceBlob:file,fileSize:bytes.byteLength,mime:"text/plain"};
 }
 if(ext==="md"){
   var mdDecoded=decodeTextBytes(bytes);
   var mdHtml=normalizeDmImportedParagraphs(markdownToImportedHtml(mdDecoded.text));
   return {text:mdDecoded.text,html:mdHtml,format:ext,encoding:mdDecoded.encoding,encodingBom:mdDecoded.bom,sourceBlob:file,fileSize:bytes.byteLength,mime:"text/markdown"};
 }
 if(ext==="html"||ext==="htm"){
   var decodedHtml=decodeTextBytes(bytes),htmlText=String(decodedHtml.text||"");
   var parsedHtml=new DOMParser().parseFromString(htmlText,"text/html");
   var htmlTitleNode=parsedHtml.querySelector("title"),htmlH1=parsedHtml.querySelector("h1,h2,h3");
   var htmlTitle=String((htmlTitleNode&&htmlTitleNode.textContent)||(htmlH1&&htmlH1.textContent)||"").replace(/\s+/g," ").trim();
   var cleanHtml=sanitizeImportedHtmlAndText(htmlText);
   var htmlOnly=normalizeHtmlImportedParagraphs(cleanHtml.html);
   if(!cleanHtml.text)throw new Error("HTML 中未读取到正文文字");
   var htmlChapters=buildHtmlImportedDocumentChapters(htmlOnly,cleanHtml.text,htmlTitle||String(file.name||"HTML"));
   return {text:cleanHtml.text,html:htmlOnly,chapters:htmlChapters,format:"html",sourceBlob:file,fileSize:bytes.byteLength,mime:String(file.type||"text/html")||"text/html",title:htmlTitle};
 }
 if(ext==="docx"){
   var all=await unzipEntriesBinary(bytes.buffer,null),docXml=all["word/document.xml"],stylesRaw=all["word/styles.xml"],relsRaw=all["word/_rels/document.xml.rels"],numberingRaw=all["word/numbering.xml"];if(!docXml)throw new Error("DOCX 中未找到正文");
   var numberingMap={};if(numberingRaw){var nd=new DOMParser().parseFromString(bytesToString(numberingRaw),"application/xml"),abstracts={};xmlChildrenByLocal(nd,"abstractnum").forEach(function(a){var aid=a.getAttribute("w:abstractNumId")||"",lvl=xmlChildrenByLocal(a,"lvl")[0],fmt=lvl&&xmlChildrenByLocal(lvl,"numfmt")[0],val=fmt&&fmt.getAttribute("w:val")||"decimal";abstracts[aid]=/^bullet$/i.test(val)?"ul":"ol";});xmlChildrenByLocal(nd,"num").forEach(function(nm){var nid=nm.getAttribute("w:numId")||"",an=xmlChildrenByLocal(nm,"abstractnumid")[0],aid=an&&an.getAttribute("w:val")||"";numberingMap[nid]=abstracts[aid]||"ol";});}
   var mediaMap={};if(relsRaw){var rd=new DOMParser().parseFromString(bytesToString(relsRaw),"application/xml");xmlChildrenByLocal(rd,"relationship").forEach(function(rel){var type=rel.getAttribute("Type")||"",target=rel.getAttribute("Target")||"",id=rel.getAttribute("Id")||"";if(/\/image$/i.test(type)&&id){var path=target.replace(/^\//,'');if(path.indexOf("word/")!==0)path="word/"+path;var raw=all[path];if(raw){var ext2=(path.split(".").pop()||"png").toLowerCase(),mime2=ext2==="jpg"||ext2==="jpeg"?"image/jpeg":ext2==="gif"?"image/gif":ext2==="svg"?"image/svg+xml":"image/png";mediaMap[id]=dataUrlFromBytes(raw,mime2);}}});}
   var html0=mergeImportedSemanticReplyLabels(normalizeImportedLeadingWhitespaceHtml(docxXmlToHtml(bytesToString(docXml),stylesRaw?bytesToString(stylesRaw):"",mediaMap,numberingMap))),officeDocx=normalizeOfficeHtmlToTxtRules(html0,String(file.name||"DOCX")),clean=sanitizeImportedHtmlAndText(officeDocx.html);html0=null;officeDocx=null;if(!clean.text)throw new Error("DOCX 中未读取到正文文字");var docxChapters=buildImportedDocumentChapters(clean.html,clean.text,String(file.name||"DOCX"));return {text:clean.text,html:clean.html,chapters:docxChapters,format:ext,sourceBlob:file,fileSize:bytes.byteLength,mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"};
 }
 if(ext==="odt"){
   var e2=await unzipTextEntries(bytes.buffer,["content.xml","styles.xml"]);if(!e2["content.xml"])throw new Error("ODT 中未找到正文");
   var html20=odtXmlToHtml(bytesToString(e2["content.xml"]),e2["styles.xml"]?bytesToString(e2["styles.xml"]):"");var odtTitleInfo=inferOdtDocumentTitle(html20,String(file.name||"ODT")),officeOdt=normalizeOfficeHtmlToTxtRules(odtTitleInfo.html,odtTitleInfo.title||String(file.name||"ODT")),clean2=sanitizeImportedHtmlAndText(officeOdt.html);html20=null;officeOdt=null;if(!clean2.text)throw new Error("ODT 中未读取到正文文字");var odtTitle=String(odtTitleInfo.title||"").trim();var odtChapters=buildImportedDocumentChapters(clean2.html,clean2.text,odtTitle||String(file.name||"ODT"));return {text:clean2.text,html:clean2.html,chapters:odtChapters,title:odtTitle,format:ext,sourceBlob:file,fileSize:bytes.byteLength,mime:"application/vnd.oasis.opendocument.text"};
 }
 if(ext==="epub"){
   // P0 修复：EPUB 的 OPF 不一定位于 OEBPS/，也不能靠正则扫描 href 猜正文。
   // 按 EPUB 标准读取 META-INF/container.xml -> OPF -> manifest -> spine，
   // 与阅读器实际解析链保持一致；这样常见的 EPUB 目录结构都能进入编辑器。
   var container=await unzipTextEntries(bytes.buffer,["META-INF/container.xml"]),containerBytes=container["META-INF/container.xml"],opfPath="";
   if(containerBytes){
     var cdoc=new DOMParser().parseFromString(bytesToString(containerBytes),"application/xml");
     var rootfiles=Array.prototype.slice.call(cdoc.getElementsByTagName("rootfile"));
     if(rootfiles.length)opfPath=rootfiles[0].getAttribute("full-path")||"";
   }
   if(!opfPath){
     // 兼容没有标准 container.xml 的非标准 EPUB：寻找任意 .opf。
     var probe=await unzipTextEntries(bytes.buffer,["content.opf","OEBPS/content.opf"]);
     opfPath=probe["content.opf"]?"content.opf":(probe["OEBPS/content.opf"]?"OEBPS/content.opf":"");
   }
   if(!opfPath)throw new Error("EPUB 中未找到 content.opf");
   var opfMap=await unzipTextEntries(bytes.buffer,[opfPath]),opfBytes=opfMap[opfPath];
   if(!opfBytes)throw new Error("EPUB content.opf 读取失败");
   var opfDoc=new DOMParser().parseFromString(bytesToString(opfBytes),"application/xml");
   function epubLocalName(el){return String(el.localName||el.nodeName||"").split(":").pop().toLowerCase();}
   function epubResolve(base,target){
     if(!target)return base;
     try{return new URL(target,"https://booknote.invalid/"+(base.includes("/")?base.slice(0,base.lastIndexOf("/")+1):"")).pathname.replace(/^\//,"");}
     catch(_){return ((base.includes("/")?base.slice(0,base.lastIndexOf("/")+1):"")+target).replace(/\/\.\//g,"/");}
   }
   var manifest={},items=Array.prototype.slice.call(opfDoc.getElementsByTagName("*"));
   items.filter(function(el){return epubLocalName(el)==="item";}).forEach(function(item){
     var id=item.getAttribute("id")||""; if(!id)return;
     manifest[id]={href:epubResolve(opfPath,item.getAttribute("href")||""),media:item.getAttribute("media-type")||"",properties:item.getAttribute("properties")||""};
   });
   var metaNodes=items.filter(function(el){return epubLocalName(el)==="meta";}),metaMap={};
   metaNodes.forEach(function(el){var name=el.getAttribute("name")||el.getAttribute("property")||"",content=el.getAttribute("content")||el.textContent||"";if(name)metaMap[name.toLowerCase()]=String(content).trim();});
   var titleNode=items.find(function(el){return epubLocalName(el)==="title";});
   var creatorNode=items.find(function(el){return epubLocalName(el)==="creator";});
   var publisherNode=items.find(function(el){return epubLocalName(el)==="publisher";});
   var languageNode=items.find(function(el){return epubLocalName(el)==="language";});
   var descNode=items.find(function(el){return epubLocalName(el)==="description";});
   var titleValue=String((titleNode&&titleNode.textContent)||metaMap["dc:title"]||"").trim();
   var authorValue=String((creatorNode&&creatorNode.textContent)||metaMap["dc:creator"]||"").trim();
   var publisherValue=String((publisherNode&&publisherNode.textContent)||metaMap["dc:publisher"]||"").trim();
   var languageValue=String((languageNode&&languageNode.textContent)||metaMap["dc:language"]||"").trim();
   var descriptionValue=String((descNode&&descNode.textContent)||metaMap["dc:description"]||"").trim();
   var coverId=metaMap["cover"]||"",coverItem=coverId&&manifest[coverId]?manifest[coverId]:null;
   if(!coverItem)coverItem=items.filter(function(el){return epubLocalName(el)==="item"&&/cover-image/i.test(el.getAttribute("properties")||"");})[0]&&manifest[items.filter(function(el){return epubLocalName(el)==="item"&&/cover-image/i.test(el.getAttribute("properties")||"");})[0].getAttribute("id")||""];
   // 只生成一个小尺寸封面缩略图，不保存原始封面二进制；原始 EPUB Blob 仍单独落盘。
   // 这样书架可以显示真实书封，同时避免把整张封面图片长期留在元数据中。
   var coverBase64="",coverThumbMime="";
   if(coverItem&&coverItem.href){
     try{
       var coverMap=await unzipTextEntries(bytes.buffer,[coverItem.href]),coverRaw=coverMap[coverItem.href];
       if(coverRaw){var ct=await makeEpubCoverThumb(coverRaw,coverItem.media);coverBase64=ct.base64;coverThumbMime=ct.mime;}
       coverMap=null;coverRaw=null;
     }catch(_){ }
   }
   var spine=items.filter(function(el){return epubLocalName(el)==="itemref" && el.parentElement && epubLocalName(el.parentElement)==="spine";});
   var hrefs=[];
   spine.forEach(function(ref){var item=manifest[ref.getAttribute("idref")||""];if(item&&/x?html?/i.test(item.media))hrefs.push(item.href);});
   if(!hrefs.length)throw new Error("EPUB 中未找到可阅读章节");
   var htmlParts=[],textParts=[],chapterMeta=[],textCursor=0;
   for(var hi=0;hi<hrefs.length;hi++){
     var one=await unzipTextEntries(bytes.buffer,[hrefs[hi]]), raw=one[hrefs[hi]];
     if(raw){
       var ds=bytesToString(raw),cleanOne=sanitizeImportedHtmlAndText(ds),safeChapterHtml=cleanOne.html,chapterText=cleanOne.text;
       var chapterLabel="";try{var hd=new DOMParser().parseFromString(safeChapterHtml,"text/html").querySelector("h1,h2,h3,h4,h5,h6");chapterLabel=hd?(hd.textContent||"").replace(/\s+/g," ").trim():"";}catch(_){}
       if(chapterText){
         htmlParts.push(safeChapterHtml);textParts.push(chapterText);
         chapterMeta.push({index:chapterMeta.length,href:hrefs[hi],label:chapterLabel||("第 "+(chapterMeta.length+1)+" 章"),textStart:textCursor,textEnd:textCursor+chapterText.length,paragraphs:buildImportedParagraphBoundaries(safeChapterHtml,chapterText),paragraphSourceHash:paragraphSourceHash(chapterText)});
         textCursor+=chapterText.length+1;
       }
       cleanOne=null;safeChapterHtml=null;chapterText=null;ds=null;
     }
     one=null;raw=null;
     if((hi&1)===1)await new Promise(function(resolve){setTimeout(resolve,0);});
   }
   var safeHtml=htmlParts.join(""),eptext=textParts.join("\n");htmlParts=null;textParts=null;
   if(!eptext)throw new Error("EPUB 中未读取到正文文字");
   var epubSize=bytes.byteLength;bytes=null;hrefs=null;manifest=null;items=null;
   return {text:eptext,html:safeHtml,chapters:chapterMeta,format:ext,sourceBlob:file,title:titleValue,author:authorValue,publisher:publisherValue,language:languageValue,description:descriptionValue,coverBase64:coverBase64,coverMime:coverThumbMime||coverItem&&coverItem.media||"",fileSize:epubSize,mime:"application/epub+zip"};
 }
 throw new Error("不支持的书籍格式");
}
function importedTextNodes(root){var a=[],w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),n;while((n=w.nextNode()))a.push(n);return a;}
function importedOffsetPoint(root,target){var nodes=importedTextNodes(root),total=0;for(var i=0;i<nodes.length;i++){var len=String(nodes[i].nodeValue||"").length;if(target<=total+len)return {node:nodes[i],offset:Math.max(0,target-total)};total+=len;}if(nodes.length){var last=nodes[nodes.length-1];return {node:last,offset:String(last.nodeValue||"").length};}return {node:root,offset:root.childNodes.length};}
function clearImportedHighlightNodes(root){if(!root)return;Array.prototype.slice.call(root.querySelectorAll(".note-highlight,.search-hit")).forEach(function(el){el.replaceWith.apply(el,Array.prototype.slice.call(el.childNodes));});}
function applyImportedNoteHighlights(ed,note){
 clearImportedHighlightNodes(ed);var hs=noteHighlightData(note).slice().sort(function(a,b){return (Number(a.start)||0)-(Number(b.start)||0);});
 hs.forEach(function(h){var a=Number(h.start)||0,b=Number(h.end)||0;if(b<=a)return;var start=importedOffsetPoint(ed,a),end=importedOffsetPoint(ed,b),range=document.createRange();try{range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);}catch(_){return;}
   var nodes=[],w=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT,null),n;while((n=w.nextNode())){if(range.intersectsNode&&range.intersectsNode(n))nodes.push(n);}
   nodes.forEach(function(t){var st=0,en=t.nodeValue.length;if(t===start.node)st=start.offset;if(t===end.node)en=end.offset;if(en<=st)return;var frag=t.splitText(en),mid=t; if(st>0)mid=t.splitText(st);var mark=document.createElement("mark");mark.className="note-highlight";mark.dataset.color=h.color||"yellow";mark.style.setProperty("--excerpt-highlight-base",EXCERPT_HIGHLIGHT_COLORS[h.color]||EXCERPT_HIGHLIGHT_COLORS.yellow);mid.parentNode.insertBefore(mark,mid);mark.appendChild(mid);});
 });
}
function renderImportedDocumentContent(ed,note){
 if(!ed)return;
 var card=ed.closest(".note");
 var html=note&&note.noteHtml;if(!html)html=plainTextToImportedHtml(note&&note.noteText||"");
 ed.innerHTML=sanitizeImportedHtml(html);
 ed.classList.remove("has-search-highlight");
 // V7.9.91：高亮重绘会重新创建导入文档内部节点；字号必须在重绘后
 // 重新建立当前编辑区的局部覆盖，否则 ODT/DOCX 原有子元素字号会把
 // A-/A+ 的当前状态“吃掉”。只作用于当前导入文档卡片。
 var oldScope=card&&card.querySelector('style[data-imported-font-scope]');
 if(oldScope)oldScope.remove();
 var size=note&&parseFloat(note.noteFontSize);
 if(isFinite(size)){
   ed.style.setProperty("font-size",size+"px","important");
   ed.dataset.importedFontSize=String(size);
   ed.setAttribute("data-imported-font-size-active","true");
   if(card){
     var scope=document.createElement("style");
     scope.setAttribute("data-imported-font-scope","true");
     scope.textContent='[data-imported-document-scope="true"] .imported-document-text[data-imported-font-size-active="true"], [data-imported-document-scope="true"] .imported-document-text[data-imported-font-size-active="true"] *{font-size:inherit !important;}';
     card.appendChild(scope);
   }
 }else{
   ed.style.removeProperty("font-size");
   delete ed.dataset.importedFontSize;
   ed.removeAttribute("data-imported-font-size-active");
 }
 applyImportedNoteHighlights(ed,note||{});
}
async function renderImportedLibrary(){
 // 导入后的刷新不能触发 Legacy booknoteNotes 一次性迁移。
 // 这里只读轻量 books_meta，保证“写入成功 -> 立即可见”。
 var ns=globalThis.BookLibraryDB?await BookLibraryDB.listMeta():[];
 cache=ns;buildBooks(ns,await getCategories());updateNav();
 var fs=filtered(ns),searchTerm=activeSearch.trim();
 status.textContent="📚 本地书籍："+ns.length+" 本　|　当前显示："+fs.length+" 本　|　离线书库";
 if(!fs.length){list.innerHTML='<div class="empty">暂无导入书籍。<br><br>使用「导入文档（1-100）」或「导入文件夹文档」添加 EPUB / PDF / TXT / MD / HTML / ODT / DOCX。</div>';return;}
 return getCategories().then(function(cats){
   list.innerHTML=fs.map(function(n){
     var options=cats.slice();if(options.indexOf(noteCategory(n))<0)options.push(noteCategory(n));
     var action='<div class="note-actions-below">'+renderNoteActions(n)+'</div>';
     return '<article class="note '+(n.pinned?"pinned ":"")+(n.favorite?"favorite":"")+(isImportedDocument(n)?" imported-document-card":"")+'" data-id="'+esc(n.id)+'" data-imported-document="true">'+
       '<div class="note-head"><div class="note-title">'+highlightSearch(noteName(n),searchTerm)+'<span class="url">'+highlightSearch(n.pageUrl||"",searchTerm)+'</span></div>'+ 
       '<div class="note-meta"><label>分类</label><select class="categorySelect">'+options.map(function(c){return '<option value="'+esc(c)+'" '+(noteCategory(n)===c?"selected":"")+'>'+esc(c)+'</option>';}).join('')+'</select><label>命名</label><input class="nameInput" value="'+esc(noteName(n))+'" placeholder="书籍名称"></div></div>'+ 
       '<div class="note-grid"><div class="block imported-document-block"><div class="label excerpt-label"><span>📄 '+esc(n.documentFormat?n.documentFormat.toUpperCase():'文档')+' · '+esc(n.documentFileName||n.name||'未命名文档')+'</span><button type="button" class="imported-document-reader-btn" data-imported-reader-id="'+esc(n.id)+'" title="在阅读器中打开这本导入文档">'+bnIcon('reader')+' 阅读器</button></div><div class="imported-document-editor note-editor-wrap"><div class="text note-editor-content imported-document-text" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false" data-placeholder="编辑导入文档内容…"></div></div></div></div>'+ 
       '<div class="note-foot"><span class="time">分类：'+esc(noteCategory(n))+'　创建：'+esc(fmt(n.createdAt))+'　更新：'+esc(fmt(n.updatedAt||n.createdAt))+'</span>'+action+'</div></article>';
   }).join('');
   list.querySelectorAll('.note-editor-content').forEach(function(ed){
     var card=ed.closest('.note'),n=cache.find(function(x){return x.id===card.dataset.id;})||{};
     renderImportedDocumentContent(ed,n);
     ed.addEventListener('input',function(){var nn=cache.find(function(x){return x.id===card.dataset.id;})||{};rememberContentEditableSelection(ed);nn.noteText=noteEditorText(ed);nn.noteHtml=sanitizeImportedHtml(ed.innerHTML);nn.documentModified=true;syncNoteHighlightsFromDOM(ed,nn);});
     ['mouseup','keyup','select','focus','blur'].forEach(function(ev){ed.addEventListener(ev,function(){rememberContentEditableSelection(ed);});});
   });
   bindNoteCards();
   list.querySelectorAll("[data-imported-reader-id]").forEach(function(btn){btn.onclick=function(e){e.preventDefault();e.stopPropagation();openStandaloneReader(btn.getAttribute("data-imported-reader-id"));};});
   void hydrateImportedCards(list.querySelectorAll(".note[data-imported-document=\"true\"]"));
 });
}

function importDocument(file){
 notifyShelfImportProgress(0,1,"starting",file&&file.name||"","");
 return parseImportedDocument(file).then(function(parsed){
   if(!String(parsed&&parsed.text||'').trim() && !parsed.pdfNative)throw new Error('文档正文为空');
   var n=makeImportedDocument(file.name,parsed.text,parsed);
   return globalThis.BookLibraryDB?BookLibraryDB.saveBookRecord(n):Promise.reject(new Error('本版本未加载 BookLibraryDB'));
 }).then(function(){notifyShelfImportProgress(1,1,"done",file&&file.name||"","success");toast('已导入：'+file.name);notifyShelfImportComplete(1,0);return renderImportedLibrary();}).catch(function(e){
   notifyShelfImportProgress(1,1,"done",file&&file.name||"","failed");
   console.error('文档导入失败',file&&file.name,e);
   alert('导入文档失败：'+(e&&e.message?e.message:'文件无法读取'));
 });
}

function documentFileExtension(file){
 var name=String(file&&file.name||"");
 return (name.split(".").pop()||"").toLowerCase();
}

function isBatchDocumentFile(file){
 return ["epub","pdf","txt","md","odt","docx","html","htm"].indexOf(documentFileExtension(file))>=0;
}

async function importDocumentBatch(fileList){
 var files=Array.prototype.slice.call(fileList||[]);
 if(!files.length)return;
 var supported=[],skipped=[];
 files.forEach(function(file){
   if(isBatchDocumentFile(file))supported.push(file);
   else skipped.push(file);
 });
 // 100 的限制针对“书籍文档”本身，不针对文件夹里的无关文件。
 // 例如文件夹有 300 个文件，其中只有 80 个 EPUB/PDF/TXT，应允许导入这 80 本。
 if(supported.length>100){
   alert("单次最多导入 100 本书籍文档。\n当前可导入文档："+supported.length+" 本，请分批选择。\n\n无关文件不会计入数量限制。");
   return;
 }
 if(!supported.length){
   alert("所选文件中没有可批量导入的 EPUB / PDF / TXT / MD / HTML / ODT / DOCX 文档。");
   return;
 }

 // 关键：批量导入采用“解析一个 -> 写入一个 -> 释放引用”的流式管线。
 // 不再把 100 本书的正文/HTML/Base64 同时堆在 JS 内存中，也不再调用
 // saveNotes(100 本完整对象)，从而避免大 EPUB/PDF 批量导入时内存峰值和长任务。
 var failed=[],success=0,duplicates=0,existingNames={};
 // 批量导入绝不能先调用 get()/listNotes()：它会触发 Legacy booknoteNotes
 // 的一次性迁移，旧库很大时会直接把导入入口拖死。这里只读取轻量 metadata。
 var before=globalThis.BookLibraryDB?await BookLibraryDB.listMeta():[];
 before.forEach(function(n){
   if(n&&n.documentFileName){
     var ek=String(n.documentFileName).toLowerCase()+"|"+String(n.documentFileSize||0);
     existingNames[ek]=true;
   }
 });

 toast("正在批量导入 0 / "+supported.length+" …");
 notifyShelfImportProgress(0,supported.length,"importing","","");
 for(var i=0;i<supported.length;i++){
   var file=supported[i], key=String(file.name||"").toLowerCase()+"|"+String(file.size||0);
   if(existingNames[key]){
     duplicates++;
     notifyShelfImportProgress(i+1,supported.length,"importing",file.name,"duplicate");
     continue;
   }
   try{
     var parsed=await parseImportedDocument(file);
     if(!String(parsed&&parsed.text||"").trim() && !parsed.pdfNative)throw new Error("文档正文为空");
     var n=makeImportedDocument(file.name,parsed.text,parsed);
     n.documentRelativePath=String(file.webkitRelativePath||file.name||"");

     // 直接写入 BookLibraryDB：books_meta + books_content + books_source。
     // 写入完成后不再把该书放入 imported[]/merged[] 长数组。
     if(globalThis.BookLibraryDB){
       // 导入不能依赖 Legacy booknoteNotes 的一次性迁移。
       // 老数据迁移失败/尚未完成时，新书仍必须可以直接进入 BookLibraryDB。
       await BookLibraryDB.saveBookRecord(n);
     }else{
       // 仅作为旧环境兜底；当前 v7.10.60+ 正常路径始终使用 BookLibraryDB。
       var current=await get();
       current.unshift(n);
       await set(current);
     }
     existingNames[key]=true;
     success++;
     notifyShelfImportProgress(i+1,supported.length,"importing",file.name,"success");
     if(success%2===0)toast("正在批量导入 "+success+" / "+supported.length+" …");
     // 明确断开本轮大型对象引用；再让 Firefox 事件循环进入一次 GC/渲染机会。
     // parsed / n / file 都只在当前迭代使用，不进入批量结果数组。
     parsed=null; n=null; file=null;
     await new Promise(function(resolve){setTimeout(resolve,0);});
   }catch(e){
     console.error("批量导入失败",file.name,e);
     failed.push({file:file,reason:e&&e.message?e.message:"文件无法读取"});
     notifyShelfImportProgress(i+1,supported.length,"importing",file.name,"failed");
   }
 }

 // 只有最后一次渲染；书架读取的是 metadata-only，不会再次加载全文。
 try{await renderImportedLibrary();}catch(e){console.error("批量导入后刷新失败",e);}
 var lines=[
   "批量导入完成",
   "",
   "扫描："+files.length+" 个文件",
   "成功："+success,
   "跳过："+(skipped.length+duplicates),
   "失败："+failed.length,
   "",
   "说明：每本书独立解析并立即落盘，不再一次性把 100 本正文放进内存。"
 ];
 if(skipped.length)lines.push("","不支持："+skipped.length+" 个（仅支持 EPUB / PDF / TXT / MD / ODT / DOCX）");
 if(duplicates)lines.push("已存在同名文档："+duplicates+" 个");
 if(failed.length){
   lines.push("","失败文件：");
   failed.slice(0,12).forEach(function(x){lines.push("❌ "+x.file.name+" — "+x.reason);});
   if(failed.length>12)lines.push("…另有 "+(failed.length-12)+" 个");
 }
 alert(lines.join("\n"));
 notifyShelfImportProgress(supported.length,supported.length,"done","",failed.length?"partial":"success");
 notifyShelfImportComplete(success,failed.length);
 toast("批量导入完成：成功 "+success+" 个");
}

function backup(){
 return get().then(function(ns){
  var selected=currentExportSet(ns);
  var p={format:"Read Aloud + BookNote Offline",version:2,exportedAt:new Date().toISOString(),scope:{
    view:view,category:categoryFilter,book:bookFilter,search:activeSearch.trim()
  },notes:selected};
  return downloadText(JSON.stringify(p,null,2),"application/json",exportFileName("BookNote","json"))
   .then(function(){toast("当前页面 JSON 已导出（"+selected.length+" 条）");});
 });
}

function exportMd(){
 return get().then(function(ns){
  var selected=currentExportSet(ns);
  var text="# Read Aloud + BookNote Offline\n\n";
  selected.forEach(function(n){
   text+="## "+noteName(n)+"\n\n";
   text+="- 分类: "+noteCategory(n)+"\n";
   text+="> "+(n.selectedText||"").replace(/\n/g,"\n> ")+"\n\n";
   if(n.noteText)text+=n.noteText+"\n\n";
   text+="- 收藏: "+(n.favorite?"是":"否")+"\n- 点赞: "+(n.pinned?"是":"否")+"\n- URL: "+(n.pageUrl||"")+"\n- 时间: "+(n.updatedAt||n.createdAt||"")+"\n\n";
  });
  return downloadText(text,"text/markdown",exportFileName("BookNote","md"));
 }).then(function(){toast("当前页面 Markdown 已导出");});
}

function exportTxt(){
 return get().then(function(ns){
  var selected=currentExportSet(ns);
  var text="Read Aloud + BookNote Offline\n"+"=".repeat(30)+"\n\n";
  selected.forEach(function(n,i){
   text+=(i+1)+". "+noteName(n)+"\n";
   text+="分类: "+noteCategory(n)+"\n";
   text+="URL: "+(n.pageUrl||"")+"\n";
   text+="创建: "+(n.createdAt||"")+"\n";
   text+="更新: "+(n.updatedAt||n.createdAt||"")+"\n";
   text+="状态: "+(n.favorite?"收藏 ":"")+(n.pinned?"点赞":"")+"\n";
   text+="\n【原文摘录】\n"+(n.selectedText||"")+"\n";
   text+="\n【我的笔记】\n"+(n.noteText||"")+"\n";
   text+="\n"+"-".repeat(60)+"\n\n";
  });
  return downloadText("\ufeff"+text,"text/plain;charset=utf-8",exportFileName("BookNote","txt"));
 }).then(function(){toast("当前页面 TXT 已导出");});
}


function xmlEsc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");}
function xmlText(s){
 return xmlEsc(s).replace(/\r\n|\r|\n/g,"</text:p><text:p>");
}
function odtParagraphs(s){
 s=String(s==null?"":s);
 if(!s) return "<text:p/>";
 return s.split(/\r\n|\r|\n/).map(function(line){return "<text:p>"+xmlEsc(line)+"</text:p>";}).join("");
}

// Minimal dependency-free ZIP writer for offline Firefox.
// Entries use ZIP "stored" mode (no compression), which is fully valid for ODT
// and avoids shipping an additional ZIP library in the extension.
function crc32(bytes){
 var table=crc32._table;
 if(!table){
  table=[];
  for(var n=0;n<256;n++){
   var c=n;
   for(var k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
   table[n]=c>>>0;
  }
  crc32._table=table;
 }
 var c=0xFFFFFFFF;
 for(var i=0;i<bytes.length;i++) c=table[(c^bytes[i])&255]^(c>>>8);
 return (c^0xFFFFFFFF)>>>0;
}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255]);}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}
function catBytes(){
 var out=[],total=0;
 for(var i=0;i<arguments.length;i++){out.push(arguments[i]);total+=arguments[i].length;}
 var r=new Uint8Array(total),p=0;
 out.forEach(function(a){r.set(a,p);p+=a.length;});
 return r;
}
function zipStored(entries){
 var enc=new TextEncoder(), locals=[], centrals=[], offset=0;
 entries.forEach(function(e){
  var name=enc.encode(e.name), data=e.data instanceof Uint8Array?e.data:enc.encode(e.data);
  var crc=crc32(data), flags=0x0800, method=0, ver=20;
  var local=catBytes(new Uint8Array([80,75,3,4]),u16(ver),u16(flags),u16(method),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data);
  locals.push(local);
  var central=catBytes(new Uint8Array([80,75,1,2]),u16(20),u16(ver),u16(flags),u16(method),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name);
  centrals.push(central);
  offset+=local.length;
 });
 var centralSize=centrals.reduce(function(a,b){return a+b.length;},0);
 var body=catBytes.apply(null,locals.concat(centrals));
 var eocd=catBytes(new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(centralSize),u32(offset),u16(0));
 return catBytes(body,eocd);
}

function exportExcerptSegments(text,highlights){
  text=String(text==null?"":text);
  var hs=Array.isArray(highlights)?highlights.slice().sort(function(a,b){return a.start-b.start;}):[];
  var out=[],pos=0;
  hs.forEach(function(h){
    var a=Math.max(pos,Number(h.start)||0),b=Math.min(text.length,Number(h.end)||0);
    if(a>pos)out.push({text:text.slice(pos,a),color:null});
    if(b>a)out.push({text:text.slice(a,b),color:h.color||"yellow"});
    pos=Math.max(pos,b);
  });
  if(pos<text.length)out.push({text:text.slice(pos),color:null});
  return out;
}
function softHighlightDocxColor(c){return {yellow:"F3E7A6",green:"C9DDC5",blue:"C9DDE8",purple:"D8CBE3",red:"E7C8C2"}[c]||"F3E7A6";}
function odtHighlightedParagraphs(text,highlights){
  return "<text:p>"+exportExcerptSegments(text,highlights).map(function(x){
    return x.color?'<text:span text:style-name="HL_'+x.color+'">'+xmlEsc(x.text)+'</text:span>':xmlEsc(x.text);
  }).join("")+"</text:p>";
}
function htmlInlineDocxRun(node){
 var text="",children=node&&node.childNodes?node.childNodes:[];Array.prototype.forEach.call(children,function(ch){if(ch.nodeType===3)text+=ch.nodeValue||"";else if(ch.nodeType===1)text+=htmlInlineDocxRun(ch);});
 if(!text)return "";var tag=node&&node.nodeType===1?node.tagName:"",pr="";
 if(tag==="STRONG"||tag==="B")pr+="<w:b/>";if(tag==="EM"||tag==="I")pr+="<w:i/>";if(tag==="U")pr+="<w:u w:val=\"single\"/>";if(tag==="S")pr+="<w:strike/>";
 var style=node&&node.nodeType===1?node.getAttribute("style")||"":"",m=style.match(/(?:^|;)\\s*font-size\\s*:\\s*([0-9.]+)(pt|px)/i);if(m)pr+="<w:sz w:val=\""+(m[2].toLowerCase()==="px"?Math.round(parseFloat(m[1])*0.75*2):Math.round(parseFloat(m[1])*2))+"\"/>";
 var cm=style.match(/(?:^|;)\\s*color\\s*:\\s*#?([0-9a-f]{6})/i);if(cm)pr+="<w:color w:val=\""+cm[1]+"\"/>";
 var out="<w:r>"+(pr?"<w:rPr>"+pr+"</w:rPr>":"")+"<w:t xml:space=\"preserve\">"+xmlEsc(text)+"</w:t></w:r>";return out;
}
function htmlToDocxBody(html){
 var doc=new DOMParser().parseFromString(String(html||""),"text/html"),root=doc.body||doc,body=[];
 function para(el,level){var runs="";function walk(n){if(n.nodeType===3){var t=n.nodeValue||"";if(t)runs+="<w:r><w:t xml:space=\"preserve\">"+xmlEsc(t)+"</w:t></w:r>";return;}if(n.nodeType!==1)return;if(n.tagName==="BR"){runs+="<w:r><w:br/></w:r>";return;}var inline=htmlInlineDocxRun(n);if(inline)runs+=inline;}
 Array.prototype.forEach.call(el.childNodes,walk);if(!runs)runs="<w:r><w:br/></w:r>";var ppr="";if(level)ppr='<w:pPr><w:pStyle w:val="Heading'+level+'"/></w:pPr>';body.push("<w:p>"+ppr+runs+"</w:p>");}
 Array.prototype.forEach.call(root.children,function(el){var tag=el.tagName;if(/^H[1-6]$/.test(tag))para(el,parseInt(tag.slice(1),10));else if(tag==="LI")para(el,0);else if(tag==="UL"||tag==="OL")Array.prototype.forEach.call(el.children,function(li){para(li,0);});else if(["P","DIV","BLOCKQUOTE","TABLE"].indexOf(tag)>=0)para(el,0);else para(el,0);});
 if(!body.length)body.push("<w:p><w:r><w:t/></w:r></w:p>");return body.join("");
}
function htmlToOdtBody(html){
 var doc=new DOMParser().parseFromString(String(html||""),"text/html"),root=doc.body||doc,out=[];
 function inline(el){if(el.nodeType===3)return xmlEsc(el.nodeValue||"");if(el.nodeType!==1)return "";var tag=el.tagName,inner="";Array.prototype.forEach.call(el.childNodes,function(c){inner+=inline(c);});if(tag==="BR")return "<text:line-break/>";if(tag==="STRONG"||tag==="B")return "<text:span text:style-name=\"HTML_B\">"+inner+"</text:span>";if(tag==="EM"||tag==="I")return "<text:span text:style-name=\"HTML_I\">"+inner+"</text:span>";if(tag==="U")return "<text:span text:style-name=\"HTML_U\">"+inner+"</text:span>";if(tag==="S")return "<text:span text:style-name=\"HTML_S\">"+inner+"</text:span>";return inner;}
 Array.prototype.forEach.call(root.children,function(el){var tag=el.tagName;if(/^H[1-6]$/.test(tag))out.push("<text:h text:outline-level=\""+tag.slice(1)+"\">"+inline(el)+"</text:h>");else if(tag==="P"||tag==="DIV"||tag==="BLOCKQUOTE")out.push("<text:p>"+inline(el)+"</text:p>");else if(tag==="UL"||tag==="OL"){out.push("<text:list>");Array.prototype.forEach.call(el.children,function(li){out.push("<text:list-item><text:p>"+inline(li)+"</text:p></text:list-item>");});out.push("</text:list>");}else out.push("<text:p>"+inline(el)+"</text:p>");});if(!out.length)out.push("<text:p/>");return out.join("");
}
function downloadImportedEdited(ns,ext){
 if(!Array.isArray(ns)||ns.length!==1)return false;var n=ns[0];if(!isImportedDocument(n)||String(n.documentFormat||"").toLowerCase()!==ext||!n.documentModified)return false;
 if(globalThis.BookLibraryDB&&!n.noteHtml&&!n.noteText){return BookLibraryDB.getContent(n.id).then(function(c){var x=Object.assign({},n,{noteHtml:c&&c.html||"",noteText:c&&c.text||""});return downloadImportedEdited([x],ext);});}
 var enc=new TextEncoder(),url,mime,zip;
 if(ext==="docx"){
  var body=htmlToDocxBody(n.noteHtml||plainTextToImportedHtml(n.noteText||""));
  var doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
  var styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>';
  for(var i=1;i<=6;i++)styles+='<w:style w:type="paragraph" w:styleId="Heading'+i+'"><w:name w:val="heading '+i+'"/></w:style>';styles+='</w:styles>';
  var ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
  var rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  zip=zipStored([{name:"[Content_Types].xml",data:enc.encode(ct)},{name:"_rels/.rels",data:enc.encode(rels)},{name:"word/document.xml",data:enc.encode(doc)},{name:"word/styles.xml",data:enc.encode(styles)}]);mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
 }else{
  var content='<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:automatic-styles><style:style style:name="HTML_B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style><style:style style:name="HTML_I" style:family="text"><style:text-properties fo:font-style="italic"/></style:style><style:style style:name="HTML_U" style:family="text"><style:text-properties style:text-underline-style="solid"/></style:style><style:style style:name="HTML_S" style:family="text"><style:text-properties style:text-line-through-style="solid"/></style:style></office:automatic-styles><office:body><office:text>'+htmlToOdtBody(n.noteHtml||plainTextToImportedHtml(n.noteText||""))+'</office:text></office:body></office:document-content>';
  var styles='<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2"><office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles></office:document-styles>';
  var manifest='<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/></manifest:manifest>';
  zip=zipStored([{name:"mimetype",data:enc.encode("application/vnd.oasis.opendocument.text")},{name:"content.xml",data:enc.encode(content)},{name:"styles.xml",data:enc.encode(styles)},{name:"META-INF/manifest.xml",data:enc.encode(manifest)}]);mime="application/vnd.oasis.opendocument.text";
 }
 var filename=(n.documentFileName||("BookNote."+ext)).replace(/\.[^.]+$/i,"_edited."+ext);url=URL.createObjectURL(new Blob([zip],{type:mime}));return browser.downloads.download({url:url,filename:filename,saveAs:true,conflictAction:"uniquify"}).then(function(){setTimeout(function(){URL.revokeObjectURL(url);},10000);toast("已导出编辑后的 "+ext.toUpperCase()+"，保留 BookNote 可识别的主要排版");}),true;
}

function downloadImportedOriginalIfExact(ns,ext){
 if(!Array.isArray(ns)||ns.length!==1)return false;
 var n=ns[0];if(!isImportedDocument(n)||String(n.documentFormat||"").toLowerCase()!==ext)return false;
 if(n.documentModified)return false;
 if(!n.documentOriginalBase64&&globalThis.BookLibraryDB){return BookLibraryDB.getSource(n.id).then(function(src){if(!src||!src.blob)return false;var filename=n.documentFileName||("BookNote."+ext),url=URL.createObjectURL(src.blob);return browser.downloads.download({url:url,filename:filename,saveAs:true,conflictAction:"uniquify"}).then(function(){setTimeout(function(){URL.revokeObjectURL(url);},10000);toast("已按源文件格式导出："+filename);});});}
 if(!n.documentOriginalBase64)return false;
 var bytes=base64ToBytes(n.documentOriginalBase64),mime=ext==="odt"?"application/vnd.oasis.opendocument.text":"application/vnd.openxmlformats-officedocument.wordprocessingml.document";
 var filename=n.documentFileName||("BookNote."+ext),url=URL.createObjectURL(new Blob([bytes],{type:mime}));
 return browser.downloads.download({url:url,filename:filename,saveAs:true,conflictAction:"uniquify"}).then(function(){setTimeout(function(){URL.revokeObjectURL(url);},10000);toast("已按源文件格式导出："+filename);}),true;
}

function exportOdt(){
 return get().then(function(ns){
  ns=currentExportSet(ns);
  if(downloadImportedOriginalIfExact(ns,"odt"))return;
  if(downloadImportedEdited(ns,"odt"))return;
  var enc=new TextEncoder();
  var body=[];
  body.push('<?xml version="1.0" encoding="UTF-8"?>');
  body.push('<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">');
  body.push('<office:automatic-styles>'+
   '<style:style style:name="Title" style:family="paragraph"><style:text-properties fo:font-size="18pt"/></style:style>'+
   '<style:style style:name="HL_yellow" style:family="text"><style:text-properties fo:background-color="#F3E7A6"/></style:style>'+
   '<style:style style:name="HL_green" style:family="text"><style:text-properties fo:background-color="#C9DDC5"/></style:style>'+
   '<style:style style:name="HL_blue" style:family="text"><style:text-properties fo:background-color="#C9DDE8"/></style:style>'+
   '<style:style style:name="HL_purple" style:family="text"><style:text-properties fo:background-color="#D8CBE3"/></style:style>'+
   '<style:style style:name="HL_red" style:family="text"><style:text-properties fo:background-color="#E7C8C2"/></style:style>'+
   '</office:automatic-styles>');
  body.push('<office:body><office:text>');
  body.push('<text:h text:outline-level="1">Read Aloud + BookNote Offline</text:h>');
  body.push('<text:p>导出时间：'+xmlEsc(new Date().toLocaleString())+'</text:p>');
  ns.forEach(function(n,i){
   body.push('<text:h text:outline-level="2">'+xmlEsc((i+1)+'. '+noteName(n))+'</text:h>');
   body.push('<text:p>分类：'+xmlEsc(noteCategory(n))+'</text:p>');
   if(n.pageUrl) body.push('<text:p>URL：'+xmlEsc(n.pageUrl)+'</text:p>');
   body.push('<text:p>创建：'+xmlEsc(n.createdAt||'')+'　更新：'+xmlEsc(n.updatedAt||n.createdAt||'')+'</text:p>');
   body.push('<text:h text:outline-level="3">原文摘录</text:h>');
   body.push(odtHighlightedParagraphs(n.selectedText||'',n.excerptHighlights||[]));
   body.push('<text:h text:outline-level="3">我的笔记</text:h>');
   body.push(odtParagraphs(n.noteText||''));
  });
  body.push('</office:text></office:body></office:document-content>');
  var content=body.join('');
  var styles='<?xml version="1.0" encoding="UTF-8"?>'+
   '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles></office:document-styles>';
  var manifest='<?xml version="1.0" encoding="UTF-8"?>'+
   '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">'+
   '<manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/>'+
   '<manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>'+
   '<manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/>'+
   '</manifest:manifest>';
  var entries=[
   {name:'mimetype',data:enc.encode('application/vnd.oasis.opendocument.text')},
   {name:'content.xml',data:enc.encode(content)},
   {name:'styles.xml',data:enc.encode(styles)},
   {name:'META-INF/manifest.xml',data:enc.encode(manifest)}
  ];
  var zip=zipStored(entries);
  return browser.downloads.download({url:URL.createObjectURL(new Blob([zip],{type:'application/vnd.oasis.opendocument.text'})),filename:exportFileName("BookNote","odt"),saveAs:true,conflictAction:'uniquify'}).then(function(){toast('当前页面 ODT 已导出（'+ns.length+' 条）');});
 });
}


function pdfUtf16Hex(text){
 var s=String(text==null?"":text),out="FEFF";
 for(var i=0;i<s.length;i++){
  var cp=s.codePointAt? s.codePointAt(i):s.charCodeAt(i);
  if(cp>0xFFFF)i++;
  if(cp<=0xFFFF){out+=cp.toString(16).padStart(4,"0").toUpperCase();}
  else{cp-=0x10000;var hi=0xD800+(cp>>10),lo=0xDC00+(cp&1023);out+=hi.toString(16).padStart(4,"0").toUpperCase()+lo.toString(16).padStart(4,"0").toUpperCase();}
 }
 return "<"+out+">";
}
function pdfWrapText(text,maxChars){
 var lines=[],src=String(text==null?"":text).replace(/\r\n?/g,"\n").split("\n");
 src.forEach(function(raw){
  raw=String(raw||"");
  if(!raw){lines.push("");return;}
  var line="",count=0;
  for(var i=0;i<raw.length;i++){
   var cp=raw.codePointAt?raw.codePointAt(i):raw.charCodeAt(i);
   var ch=String.fromCodePoint?String.fromCodePoint(cp):raw.charAt(i);
   if(cp>0xFFFF)i++;
   var weight=(cp<128?0.55:1);
   if(line && count+weight>maxChars){lines.push(line);line="";count=0;}
   line+=ch;count+=weight;
  }
  lines.push(line);
 });
 return lines;
}
function makeSimplePdf(text){
 var lines=pdfWrapText(text,62),perPage=46,pages=[];
 for(var i=0;i<lines.length;i+=perPage)pages.push(lines.slice(i,i+perPage));
 if(!pages.length)pages=[[]];
 var objects=[];
 objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
 objects[3]='<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>';
 objects[4]='<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo 6 0 R /DW 1000 >>';
 objects[6]='<< /Registry (Adobe) /Ordering (GB1) /Supplement 5 >>';
 var pageRefs=[],nextId=7;
 pages.forEach(function(page){
  var contentParts=['BT','/F1 11 Tf','50 790 Td'];
  page.forEach(function(line,idx){
   if(idx)contentParts.push('0 -16 Td');
   if(line)contentParts.push(pdfUtf16Hex(line)+' Tj');
  });
  contentParts.push('ET');
  var stream=contentParts.join('\n');
  var contentId=nextId++,pageId=nextId++;
  objects[contentId]='<< /Length '+stream.length+' >>\\nstream\\n'+stream+'\\nendstream';
  objects[pageId]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents '+contentId+' 0 R >>';
  pageRefs.push(pageId);
 });
 objects[2]='<< /Type /Pages /Kids ['+pageRefs.map(function(id){return id+' 0 R';}).join(' ') +'] /Count '+pageRefs.length+' >>';
 var chunks=['%PDF-1.4\n%1234\n'],offsets=[0],offset=chunks[0].length;
 var max=objects.length;
 for(var id=1;id<max;id++){
  if(!objects[id])continue;
  var body=objects[id].replace(/\\n/g,'\n');
  var obj=id+' 0 obj\n'+body+'\nendobj\n';
  offsets[id]=offset;chunks.push(obj);offset+=obj.length;
 }
 var xrefOffset=offset,xref=['xref','0 '+max,'0000000000 65535 f '];
 for(var j=1;j<max;j++)xref.push(objects[j]?String(offsets[j]).padStart(10,'0')+' 00000 n ':'0000000000 65535 f ');
 chunks.push(xref.join('\n')+'\ntrailer\n<< /Size '+max+' /Root 1 0 R >>\nstartxref\n'+xrefOffset+'\n%%EOF');
 return new TextEncoder().encode(chunks.join(''));
}
function exportPdf(){
 return get().then(function(ns){
  ns=currentExportSet(ns);
  if(!ns.length){toast('当前没有可导出的内容');return;}
  if(ns.length===1){
   var n=ns[0];
   if(isImportedDocument(n)&&String(n.documentFormat||'').toLowerCase()==='pdf'){
    if(!n.documentOriginalBase64&&globalThis.BookLibraryDB)return BookLibraryDB.getSource(n.id).then(function(src){if(!src||!src.blob){toast('原始 PDF 不存在');return;}var filename=n.documentFileName||'BookNote.pdf',url=URL.createObjectURL(src.blob);return browser.downloads.download({url:url,filename:filename,saveAs:true,conflictAction:'uniquify'}).then(function(){setTimeout(function(){URL.revokeObjectURL(url);},10000);toast('已按源文件导出 PDF：'+filename);});});
    if(n.documentOriginalBase64){var original=base64ToBytes(n.documentOriginalBase64),filename=n.documentFileName||'BookNote.pdf',url=URL.createObjectURL(new Blob([original],{type:'application/pdf'}));return browser.downloads.download({url:url,filename:filename,saveAs:true,conflictAction:'uniquify'}).then(function(){setTimeout(function(){URL.revokeObjectURL(url);},10000);toast('已按源文件导出 PDF：'+filename);});}
   }
  }
  var text='Read Aloud + BookNote Offline\n\n';
  ns.forEach(function(n,i){
   text+=(i+1)+'. '+noteName(n)+'\n';
   text+='分类：'+noteCategory(n)+'\n';
   if(n.pageUrl)text+='URL：'+n.pageUrl+'\n';
   text+='创建：'+(n.createdAt||'')+'  更新：'+(n.updatedAt||n.createdAt||'')+'\n';
   text+='原文摘录：\n'+(n.selectedText||'')+'\n';
   text+='我的笔记：\n'+(n.noteText||importedHtmlToText(n.noteHtml||''))+'\n\n';
   text+='----------------------------------------\n\n';
  });
  var bytes=makeSimplePdf(text),url2=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  return browser.downloads.download({url:url2,filename:exportFileName('BookNote','pdf'),saveAs:true,conflictAction:'uniquify'}).then(function(){setTimeout(function(){URL.revokeObjectURL(url2);},10000);toast('当前页面 PDF 已导出（'+ns.length+' 条）');});
 });
}

function epubPathPart(s){return encodeURIComponent(String(s||'').replace(/\\/g,'/')).replace(/%2F/g,'/');}
function exportEpub(){
 return get().then(function(ns){
  ns=currentExportSet(ns);
  if(!ns.length){toast('当前没有可导出的内容');return;}
  if(ns.length===1){
   var n=ns[0];
   if(isImportedDocument(n)&&String(n.documentFormat||'').toLowerCase()==='epub'&&!n.documentModified){
    if(!n.documentOriginalBase64&&globalThis.BookLibraryDB)return BookLibraryDB.getSource(n.id).then(function(src){if(!src||!src.blob){toast('原始 EPUB 不存在');return;}var filename=n.documentFileName||'BookNote.epub',u0=URL.createObjectURL(src.blob);return browser.downloads.download({url:u0,filename:filename,saveAs:true,conflictAction:'uniquify'}).then(function(){setTimeout(function(){URL.revokeObjectURL(u0);},10000);toast('已按源文件导出 EPUB：'+filename);});});
    if(n.documentOriginalBase64){var original=base64ToBytes(n.documentOriginalBase64),filename=n.documentFileName||'BookNote.epub',u0=URL.createObjectURL(new Blob([original],{type:'application/epub+zip'}));return browser.downloads.download({url:u0,filename:filename,saveAs:true,conflictAction:'uniquify'}).then(function(){setTimeout(function(){URL.revokeObjectURL(u0);},10000);toast('已按源文件导出 EPUB：'+filename);});}
   }
  }
  var enc=new TextEncoder(),entries=[{name:'mimetype',data:enc.encode('application/epub+zip')},{name:'META-INF/container.xml',data:enc.encode('<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')}],manifest=[],spine=[];
  ns.forEach(function(n,i){
   var id='chapter-'+(i+1),file='OEBPS/chapter-'+(i+1)+'.xhtml',title=htmlEsc(noteName(n)||('Document '+(i+1))),html=String(n.noteHtml||plainTextToImportedHtml(n.noteText||''));
   html=sanitizeImportedHtml(html);
   entries.push({name:file,data:enc.encode('<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>'+title+'</title><meta charset="utf-8"/></head><body><h1>'+title+'</h1>'+html+'</body></html>')});
   manifest.push('<item id="'+id+'" href="chapter-'+(i+1)+'.xhtml" media-type="application/xhtml+xml"/>');spine.push('<itemref idref="'+id+'"/>');
  });
  var navItems=ns.map(function(n,i){return '<li><a href="chapter-'+(i+1)+'.xhtml">'+htmlEsc(noteName(n)||('Document '+(i+1)))+'</a></li>';}).join('');
  entries.push({name:'OEBPS/nav.xhtml',data:enc.encode('<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>BookNote</title></head><body><nav epub:type="toc" id="toc"><h1>目录</h1><ol>'+navItems+'</ol></nav></body></html>')});
  entries.push({name:'OEBPS/content.opf',data:enc.encode('<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="booknote-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="booknote-id">booknote-'+Date.now()+'</dc:identifier><dc:title>BookNote Offline</dc:title><dc:language>zh</dc:language><meta property="dcterms:modified">'+new Date().toISOString().replace(/\.\d{3}Z$/,'Z')+'</meta></metadata><manifest><item id="nav" properties="nav" href="nav.xhtml" media-type="application/xhtml+xml"/>'+manifest.join('')+'</manifest><spine>'+spine.join('')+'</spine></package>')});
  var zip=zipStored(entries),url=URL.createObjectURL(new Blob([zip],{type:'application/epub+zip'}));
  return browser.downloads.download({url:url,filename:exportFileName('BookNote','epub'),saveAs:true,conflictAction:'uniquify'}).then(function(){setTimeout(function(){URL.revokeObjectURL(url);},10000);toast('当前页面 EPUB 已导出（'+ns.length+' 条）');});
 });
}

function exportDocx(){
 return get().then(function(ns){
  ns=currentExportSet(ns);
  if(downloadImportedOriginalIfExact(ns,"docx"))return;
  if(downloadImportedEdited(ns,"docx"))return;
  var enc=new TextEncoder();
  function wp(text,style){
   var t=xmlEsc(String(text||"")).replace(/\r\n/g,"\n").replace(/\r/g,"\n");
   var runs=t.split("\n"), r="";
   runs.forEach(function(line,i){if(i)r+="<w:br/>";r+='<w:t xml:space="preserve">'+line+"</w:t>";});
   return "<w:p>"+(style?'<w:pPr><w:pStyle w:val="'+style+'"/></w:pPr>':"")+"<w:r>"+r+"</w:r></w:p>";
  }
  function wpHighlighted(text,highlights){
   var r="";
   exportExcerptSegments(text,highlights).forEach(function(x){
     var pr=x.color?'<w:rPr><w:shd w:val="clear" w:fill="'+softHighlightDocxColor(x.color)+'"/></w:rPr>':"";
     var parts=String(x.text||"").split("\n");
     parts.forEach(function(part,i){
       if(i)r+="<w:br/>";
       r+="<w:r>"+pr+'<w:t xml:space="preserve">'+xmlEsc(part)+"</w:t></w:r>";
     });
   });
   return "<w:p>"+r+"</w:p>";
  }
  var body=[wp("Read Aloud + BookNote Offline","Title"),wp("导出时间："+new Date().toLocaleString())];
  ns.forEach(function(n,i){
   body.push(wp((i+1)+". "+noteName(n),"Heading1"));
   body.push(wp("分类："+noteCategory(n)));
   if(n.pageUrl)body.push(wp("URL："+n.pageUrl));
   body.push(wp("创建："+(n.createdAt||"")+"　更新："+(n.updatedAt||n.createdAt||"")));
   body.push(wp("原文摘录","Heading2"));
   body.push(wpHighlighted(n.selectedText||"",n.excerptHighlights||[]));
   body.push(wp("我的笔记","Heading2"));
   String(n.noteText||"").split(/\r?\n/).forEach(function(x){body.push(wp(x));});
  });
  body.push('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>');
  var doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
   '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body.join("")+"</w:body></w:document>";
  var styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
   '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
   '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/></w:rPr></w:rPrDefault></w:docDefaults>'+
   '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'+
   '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>'+
   '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>'+
   '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>';
  var ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+
   '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
   '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
  var rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  var entries=[
   {name:"[Content_Types].xml",data:enc.encode(ct)},
   {name:"_rels/.rels",data:enc.encode(rels)},
   {name:"word/document.xml",data:enc.encode(doc)},
   {name:"word/styles.xml",data:enc.encode(styles)}
  ];
  var zip=zipStored(entries), url=URL.createObjectURL(new Blob([zip],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}));
  return browser.downloads.download({url:url,filename:exportFileName("BookNote","docx"),saveAs:true,conflictAction:"uniquify"}).then(function(){
   setTimeout(function(){URL.revokeObjectURL(url);},10000);
   toast("当前页面 DOCX 已导出（"+ns.length+" 条）");
  });
 });
}

function restore(file){var reader=new FileReader();reader.onload=function(){try{var d=JSON.parse(reader.result),imp=Array.isArray(d)?d:d.notes;if(!Array.isArray(imp))throw new Error();get().then(function(cur){var map={};cur.forEach(function(n){map[n.id]=n;});imp.forEach(function(n){if(n&&n.id)map[n.id]=n;});return set(Object.keys(map).map(function(k){return map[k];}));}).then(function(){toast("导入完成");render();});}catch(e){alert("导入失败：不是有效的 BookNote JSON 备份。");}};reader.readAsText(file,"utf-8");}

var workspaceShelf=document.getElementById("workspaceShelf");if(workspaceShelf)workspaceShelf.onclick=function(e){e.preventDefault();e.stopPropagation();browser.tabs.create({url:browser.runtime.getURL("book-library.html"),active:true});};
var workspaceReader=document.getElementById("workspaceReader");if(workspaceReader)workspaceReader.onclick=function(e){e.preventDefault();e.stopPropagation();var latest=cache&&cache[0];if(latest&&latest.id)openStandaloneReader(latest.id);else browser.tabs.create({url:browser.runtime.getURL("book-library.html"),active:true});};
document.querySelectorAll(".nav-item").forEach(function(el){el.onclick=function(){view=el.dataset.view;bookFilter="";categoryFilter="";"";activeSearch="";panelSearchResults=null;panelExtractSelected.clear();if(q)q.value="";updateNav();savePanelState();render();};});
q.oninput=function(){
 document.querySelector(".search")?.classList.toggle("has-value",!!q.value);
 activeSearch=q.value.trim();
 panelSearchResults=null;
 clearTimeout(panelSearchTimer);
 renderSearchHistory();
 render();
 if(activeSearch)panelSearchTimer=setTimeout(function(){runPanelLocalSearch(q.value.trim());},280);
};
var searchSubmit=document.getElementById("searchSubmit");
if(searchSubmit){
 searchSubmit.onclick=function(e){
  e.preventDefault();
  e.stopPropagation();
  runPanelLocalSearch(q.value.trim());
  q.focus();
 };
}
q.onkeydown=function(e){
 if(e.key==="Enter"){
  e.preventDefault();
  clearTimeout(panelSearchTimer);
  runPanelLocalSearch(q.value.trim());
 }
};
q.onfocus=function(){
 var box=document.getElementById("searchHistory");
 if(box){box.classList.add("open");renderSearchHistory();}
};

renderSearchHistory();
var searchClear=document.getElementById("searchClear");
function clearPanelSearch(){
  if(!q)return;
  clearTimeout(panelSearchTimer); panelSearchSeq++;
  q.value=""; activeSearch=""; panelSearchResults=null; panelExtractSelected.clear();
  var wrap=document.querySelector(".search"); if(wrap)wrap.classList.remove("has-value");
  hideSearchHistory(); render(); q.focus();
}
if(searchClear)searchClear.onclick=function(e){e.preventDefault();e.stopPropagation();clearPanelSearch();};
document.getElementById("refresh").onclick=function(){savePanelState().then(render);};
document.addEventListener("click",function(e){
 var box=document.getElementById("searchHistory");
 var search=document.querySelector(".search");
 if(box && search && !search.contains(e.target))box.classList.remove("open");
});

function bindButton(id,handler){
 var el=document.getElementById(id);
 if(el) el.onclick=function(e){
   e.preventDefault();
   e.stopPropagation();
   return handler(e);
 };
}
bindButton("saveAll",saveAll);
bindButton("backup",backup);
bindButton("backupAll",downloadAllJson);
bindButton("md",exportMd);
bindButton("txt",exportTxt);
bindButton("odt",exportOdt);
bindButton("docx",exportDocx);
bindButton("pdf",exportPdf);
bindButton("epub",exportEpub);
bindButton("restore",function(){if(fileInput)fileInput.click();});
fileInput.onchange=function(){if(fileInput.files&&fileInput.files[0])restore(fileInput.files[0]);fileInput.value="";};
function openFilePicker(input){
 if(!input)return false;
 input.value="";
 // Firefox 新旧版本对 hidden file input / 扩展页 file picker 的处理存在差异。
 // 优先使用标准 showPicker()，失败再回退到 click()；input 本身保持可渲染但视觉隐藏，
 // 避免 display:none/hidden 导致较新 Firefox 拒绝打开选择器。
 try{
   if(typeof input.showPicker==="function"){input.showPicker();return true;}
 }catch(err){console.warn("showPicker failed, fallback to click",err);}
 try{input.click();return true;}catch(err2){
   console.error("file picker failed",err2);
   alert("无法打开文件选择器，请重新打开书籍面板后重试。\n\n"+(err2&&err2.message||err2));
   return false;
 }
}
var documentBatch=document.getElementById("documentBatch");
var importBatchButton=document.getElementById("importBatch");
if(importBatchButton&&documentBatch){
 importBatchButton.addEventListener("click",function(e){
   e.preventDefault();e.stopPropagation();
   openFilePicker(documentBatch);
 },false);
 documentBatch.addEventListener("change",function(){
   var files=documentBatch.files;
   if(!files||!files.length){documentBatch.value="";return;}
   var list=Array.prototype.slice.call(files);
   documentBatch.value="";
   importDocumentBatch(list);
 });
}
var documentFolder=document.getElementById("documentFolder");
var importFolderButton=document.getElementById("importFolder");
if(importFolderButton&&documentFolder){
 importFolderButton.addEventListener("click",function(e){
   e.preventDefault();e.stopPropagation();
   if(!("webkitdirectory" in documentFolder)){
     alert("当前 Firefox 环境不支持文件夹选择接口。\n请使用“批量导入文档（1-100）”一次选择多个文件。");
     return;
   }
   openFilePicker(documentFolder);
 },false);
 documentFolder.addEventListener("change",function(){
   var files=documentFolder.files;
   documentFolder.value="";
   if(files&&files.length)importDocumentBatch(files);
 });
}
function openStandaloneReader(bookId,opts){
 var u=browser.runtime.getURL("reader/reader.html")+"?bookId="+encodeURIComponent(String(bookId||""));
 opts=opts||{};
 if(opts.chapterIndex!=null)u+="&chapterIndex="+encodeURIComponent(opts.chapterIndex);
 if(opts.start!=null)u+="&annotationStart="+encodeURIComponent(opts.start);
 if(opts.end!=null)u+="&annotationEnd="+encodeURIComponent(opts.end);
 if(opts.searchTerm)u+="&searchTerm="+encodeURIComponent(opts.searchTerm);
 if(opts.annotationId)u+="&annotationId="+encodeURIComponent(opts.annotationId);
 return browser.tabs.create({url:u,active:true});
}

document.getElementById("addCategory").onclick=addCategory;
document.getElementById("openLatest").onclick=function(){
 var latest=cache[0];
 if(!latest){toast("暂无笔记");return;}
 if(isImportedDocument(latest)){openStandaloneReader(latest.id);return;}
 openSource(latest);
};
var openAnnotationLibrary=document.getElementById("openAnnotationLibrary");if(openAnnotationLibrary)openAnnotationLibrary.onclick=function(e){e.preventDefault();e.stopPropagation();browser.tabs.create({url:browser.runtime.getURL("annotation-manager.html"),active:true});};
(function handlePanelLaunchParams(){
 try{
  var params=new URLSearchParams(location.search),openId=params.get("openBook"),annotationId=params.get("annotationId"),start=params.get("annotationStart"),end=params.get("annotationEnd"),chapter=params.get("chapterIndex"),searchTerm=params.get("searchTerm");
  if(openId){
   openStandaloneReader(openId,{annotationId:annotationId,chapterIndex:chapter!=null?Number(chapter):null,start:start!=null?Number(start):null,end:end!=null?Number(end):null,searchTerm:searchTerm||""});
  }
 }catch(e){console.warn("standalone reader launch",e);}
})();
(function bindThemeControls(){
 var main=document.getElementById("themeMain");
 var picker=document.getElementById("themePicker");
 var close=document.getElementById("themeClose");
 var mode=document.getElementById("themeMode");
 if(main)main.onclick=function(e){
  e.stopPropagation();
  if(picker)picker.classList.toggle("open");
 };
 if(close)close.onclick=function(e){e.stopPropagation();if(picker)picker.classList.remove("open");};
 document.querySelectorAll(".theme-option").forEach(function(el){
  el.onclick=function(e){
   e.stopPropagation();
   getPanelState().then(function(st){
    st=st||{};
    st=st||{};
    st.themeName=el.dataset.themeChoice;
    st.themeMode=st.themeMode||"day";
    return saveThemeState(st.themeName,st.themeMode).then(applyThemeState);
   });
  };
 });
 // 首页模式按钮与书架/阅读器使用完全相同的全局 themeMode。
 if(mode)mode.onclick=function(e){
  e.stopPropagation();
  if(globalThis.BookNoteGlobalTheme){
   return BookNoteGlobalTheme.toggleMode().then(function(st){applyThemeState(st);});
  }
  return getPanelState().then(function(st){st=st||{};st.themeMode=st.themeMode==="night"?"day":"night";applyThemeState(st);return saveThemeState(st.themeName,st.themeMode);});
 };
 document.addEventListener("click",function(e){
  if(picker && !e.target.closest(".theme-tools"))picker.classList.remove("open");
 });
  browser.storage.onChanged.addListener(function(changes,area){
   if(area!=="local"||!changes.booknotePanelState)return;
   applyThemeState(changes.booknotePanelState.newValue||{});
  });
})();
(function bindSectionControls(){
 var nav=document.querySelector(".nav");
 if(!nav)return;
 nav.addEventListener("click",function(e){
  var btn=e.target.closest && e.target.closest(".section-toggle");
  if(btn){e.preventDefault();e.stopPropagation();var sec=btn.closest(".nav-section");if(!sec)return;var id=sec.id;var key=id==="sectionQuick"?"quick":id==="sectionCategories"?"categories":id==="sectionBooks"?"books":id==="sectionExport"?"":"";if(key)toggleSection(key);return;}
  var title=e.target.closest && e.target.closest(".nav-section .section-title");if(!title)return;if(e.target.closest && e.target.closest("#addCategory"))return;
  var sec=title.closest(".nav-section");if(!sec)return;var id=sec.id;var key=id==="sectionQuick"?"quick":id==="sectionCategories"?"categories":id==="sectionBooks"?"books":id==="sectionExport"?"":"";if(key)toggleSection(key);
 });
})();
(function bindDocumentManagementBox(){
 var box=document.getElementById("documentManagementBox"),btn=document.getElementById("documentManagementToggle");
 if(!box||!btn)return;
 function apply(collapsed){box.classList.toggle("collapsed",!!collapsed);btn.textContent=collapsed?"⌄":"⌃";btn.setAttribute("aria-expanded",collapsed?"false":"true");}
 browser.storage.local.get("booknotePanelState").then(function(r){apply(Boolean((r.booknotePanelState||{}).documentManagementCollapsed));});
 btn.onclick=function(e){e.preventDefault();e.stopPropagation();browser.storage.local.get("booknotePanelState").then(function(r){var st=r.booknotePanelState||{};st.documentManagementCollapsed=!Boolean(st.documentManagementCollapsed);apply(st.documentManagementCollapsed);return browser.storage.local.set({booknotePanelState:st});});};
})();
(function bindUiControls(){
 var nb=document.getElementById("navToggle");if(nb)nb.onclick=function(){getPanelState().then(function(st){st=st||{};st.navCollapsed=!Boolean(st.navCollapsed);applyUiState(st);return saveUiState({navCollapsed:st.navCollapsed});});};
})();
getPanelState().then(function(st){
 if(st){
  if(["all","excerpts","favorite","pinned","book","category"].indexOf(st.view)>=0)view=st.view;
  bookFilter=typeof st.bookFilter==="string"?st.bookFilter:"";
  categoryFilter=typeof st.categoryFilter==="string"?st.categoryFilter:"";
  applyUiState(st);
  applySectionStates(st);
  applyThemeState(st);
  return get().then(normalizeSearchSummaryNames).then(function(){return render();}).then(function(){
   applyUiState(st);
   applySectionStates(st);
   applyThemeState(st);
  });
 }
 var initial={themeName:"everforest",themeMode:"day"};
 applyUiState(initial);
 applySectionStates(initial);
 applyThemeState(initial);
 return (globalThis.BookNoteGlobalTheme?BookNoteGlobalTheme.update(initial):browser.storage.local.set({booknotePanelState:initial}).then(function(){return initial;})).then(function(st){
  applyThemeState(st||initial);
  return get().then(normalizeSearchSummaryNames).then(function(){return render();});
 });
}).then(function(){
 /* 首轮 DOM 已经完成后再显示，刷新时只出现最终状态。 */
 document.body.classList.remove("booting");
}).catch(function(e){
 /* 即使本地数据异常，也不要把整个页面永久隐藏。 */
 console.error("BookNote initial render failed",e);
 document.body.classList.remove("booting");
});


/* V1.4.16 UI FIX — Export/Import popup-only, same interaction as Theme */
(function bindExportPopup(){
 function bind(){
  var section=document.getElementById("sectionExport");
  var toolbar=document.querySelector(".toolbar");
  var search=toolbar && toolbar.querySelector(".search-wrap");
  if(!section || !toolbar || !search) return;
  /* V7.9.38: 导出/导入弹框默认关闭；只有用户点击标题后才允许打开。 */
  section.classList.remove("export-open");
  if(document.body && document.body.hasAttribute("data-embedded-io")) section.classList.add("export-open");
  if(section.parentElement!==toolbar) toolbar.insertBefore(section,search.nextElementSibling || null);
  var trigger=section.querySelector(".nav-section-title");
  if(trigger && !trigger.dataset.popupBound){
   trigger.dataset.popupBound="1";
   trigger.onclick=function(e){
    e.preventDefault();
    e.stopPropagation();
    section.classList.toggle("export-open");
   };
  }
  if(!document.documentElement.dataset.exportOutsideBound){
   document.documentElement.dataset.exportOutsideBound="1";
   document.addEventListener("click",function(e){
    if(!section.contains(e.target)) section.classList.remove("export-open");
   });
  }
 }
 if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",bind,{once:true});
 }else{
  bind();
 }
})();;



/* v7.9.45 global speech control delegation */
if(!window.v7945GlobalSpeechControls){
  window.v7945GlobalSpeechControls=true;
  document.addEventListener("click",function(e){
    var b=e.target&&e.target.closest?e.target.closest("button"):null;
    if(!b)return;
    /* V7.9.86：有明确本地处理器的区域必须自行处理朗读控制。
       全局兼容层不能在捕获阶段拦截 .excerpt-read / data-doc-action，
       否则“暂停/继续”“停止”等按钮到不了各区域自己的 onclick。 */
    if(b.closest && (b.closest(".excerpt-read") || b.getAttribute("data-doc-action"))) return;
    var action=b.getAttribute("data-read-action")||b.getAttribute("data-speech-action")||"";
    var label=(b.textContent||"").trim();
    if(action==="read-pause" || /暂停\s*\/?\s*继续|暂停|继续/.test(label)){
      if(window.speechSynthesis){
        if(window.speechSynthesis.paused) booknoteResumeAllSpeech();
        else booknotePauseAllSpeech();
      }
    }else if(action==="read-stop" || /停止/.test(label)){
      booknoteStopAllSpeech();
    }
  },true);
}

/* v7.9.46：兼容旧朗读入口，监听 speechSynthesis 生命周期，统一状态。 */
if(!window.v7946SpeechEventBridge){
  window.v7946SpeechEventBridge=true;
  document.addEventListener("click",function(e){
    var b=e.target&&e.target.closest?e.target.closest("button"):null;
    if(!b)return;
    /* V7.9.86：本地朗读区域拥有自己的完整 click handler，
       这里仅处理没有本地绑定的旧入口。 */
    if(b.closest && (b.closest(".excerpt-read") || b.getAttribute("data-doc-action"))) return;
    var action=b.getAttribute("data-read-action")||b.getAttribute("data-speech-action")||"";
    var label=(b.textContent||"").replace(/\s+/g," ").trim();
    if(action==="read-toggle" || /暂停\s*\/?\s*继续/.test(label)){
      e.preventDefault();
      e.stopImmediatePropagation();
      if(!booknoteSpeechPauseResume()){
        /* 没有任务时不再弹“当前区域没有朗读任务”；按钮保持无副作用。 */
      }
      return;
    }
    if(action==="read-stop" || /停止/.test(label)){
      e.preventDefault();
      e.stopImmediatePropagation();
      booknoteSpeechStopAll();
    }
  },true);

  if(window.speechSynthesis){
    ["start","resume","pause","end","error"].forEach(function(type){
      window.speechSynthesis.addEventListener(type,function(ev){
        var c=window.booknoteSpeechController;
        if(type==="start" || type==="resume"){
          c.active=true;
          c.paused=false;
          c.stopped=false;
        }else if(type==="pause"){
          c.active=true;
          c.paused=true;
        }else if(type==="end" || type==="error"){
          /* 不立即清空 token；允许连续朗读队列继续接管。 */
          if(!window.speechSynthesis.speaking && !window.speechSynthesis.pending){
            c.active=false;
            c.paused=false;
            c.source=null;
            c.task=null;
          }
        }
      });
    });
  }
}


/* V7.9.50：导入文档独立模板管理器
   空状态只显示一个默认模板；实际导入后按文档创建独立卡片。
   每张卡片保存 data-import-id，所有编辑/朗读/显示控制均以卡片为作用域。 */
function v7950ImportContainer(){
  return document.querySelector(
    "#imported-documents,.imported-documents,.imported-document-list,[data-section='imported-documents']"
  );
}
function v7950GetImportCards(container){
  if(!container)return [];
  return Array.prototype.slice.call(
    container.querySelectorAll(".imported-document-card,[data-imported-document='true'],.imported-doc-card")
  );
}
function v7950EnsureTemplate(container){
  if(!container)return;
  var cards=v7950GetImportCards(container);
  var template=container.querySelector(".imported-document-template");
  if(cards.length){
    if(template)template.remove();
    return;
  }
  if(!template){
    template=document.createElement("section");
    template.className="imported-document-template";
    template.setAttribute("data-template-only","true");
    template.innerHTML=
      '<div class="imported-template-title">📄 导入文档（可编辑）</div>'+
      '<div class="imported-template-hint">当前没有导入文档。导入后将自动生成独立的文档编辑区及控制按钮。</div>';
    container.appendChild(template);
  }
}
function v7950EnsureDocumentIdentity(card){
  if(!card)return "";
  var id=card.getAttribute("data-import-id");
  if(!id){
    id="import-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);
    card.setAttribute("data-import-id",id);
  }
  card.setAttribute("data-imported-document-scope","true");
  return id;
}
function v7950ScopeQuery(card,selector){
  return card ? card.querySelector(selector) : null;
}
function v7950BindOne(card){
  if(!card)return;
  v7950EnsureDocumentIdentity(card);
  /* 不把另一个文档的 DOM 当作当前文档。 */
  var editor=v7950ScopeQuery(card,
    ".imported-document-editor,.note-editor-content,[contenteditable='true'],textarea.text");
  if(!editor)return;
  if(typeof createImportedDocumentControls==="function"){
    createImportedDocumentControls(card);
  }
  /* 记录当前文档自己的编辑目标，供后续动态操作使用。 */
  card.__booknoteImportEditor=editor;
}
function v7950BindAll(){
  var container=v7950ImportContainer();
  if(!container)return;
  var cards=v7950GetImportCards(container);
  cards.forEach(v7950BindOne);
  v7950EnsureTemplate(container);
}
if(!window.v7950ImportManager){
  window.v7950ImportManager=true;
  function v7950Init(){v7950BindAll();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",v7950Init);
  else v7950Init();
  new MutationObserver(function(){v7950BindAll();})
    .observe(document.body,{childList:true,subtree:true});
}

/* V7.9.53：导入文档（可编辑）完整两排控制器。
   每个控制器只绑定到自己的 imported-document-card。 */
function createImportedDocumentControls(card){
  if(!card || card.closest('.imported-document-template')) return;

  var block=card.querySelector('.imported-document-block');
  var label=block ? block.querySelector(':scope > .excerpt-label') : null;
  var editor=card.querySelector('.imported-document-editor .imported-document-text, .imported-document-editor .note-editor-content, .note-editor-content, textarea.text');
  if(!editor) return;

  /*
   * 导入文档固定结构：
   * 📄 导入文档（可编辑）
   *   ↓
   * 两排控制
   *   ↓
   * 正文编辑区
   *
   * 即使 DOM 被重新渲染，也把已有控制器重新定位到标题正下方。
   */
  var existing=card.querySelector('.imported-doc-controls');
  if(existing){
    if(label && label.parentNode===block){
      /* 已经在标题正下方时不重复移动，避免 MutationObserver 重复触发。 */
      if(label.nextElementSibling!==existing){
        label.insertAdjacentElement('afterend',existing);
      }
    }else if(block && existing.parentNode!==block){
      block.insertBefore(existing,editor.closest('.imported-document-editor') || editor);
    }
    return;
  }
  if(typeof v7950EnsureDocumentIdentity==='function') v7950EnsureDocumentIdentity(card);

  var controls=document.createElement('div');
  controls.className='imported-doc-controls';
  controls.innerHTML =
    '<div class="imported-doc-control-row imported-doc-read-row">'+
      '<button type="button" data-doc-action="voice-settings">'+bnIcon('voice-settings','sm')+' 语音设置</button>'+
      '<button type="button" data-doc-action="read-home">'+bnIcon('speaker','sm')+' 从开头朗读</button>'+
      '<button type="button" data-doc-action="read-current">'+bnIcon('speaker','sm')+' 从选中位置朗读</button>'+
      '<button type="button" data-doc-action="read-selection">'+bnIcon('speaker','sm')+' 只朗读选中内容</button>'+
      '<button type="button" data-doc-action="read-toggle">'+bnIcon('pause','sm')+' 暂停 / 继续</button>'+
      '<button type="button" data-doc-action="read-stop">'+bnIcon('stop','sm')+' 停止</button>'+ 
    '</div>'+ 
    '<div class="imported-doc-control-row imported-doc-display-row">'+
      '<button type="button" data-doc-action="hl-yellow">🟡</button>'+ 
      '<button type="button" data-doc-action="hl-green">🟢</button>'+ 
      '<button type="button" data-doc-action="hl-blue">🔵</button>'+ 
      '<button type="button" data-doc-action="hl-purple">🟣</button>'+ 
      '<button type="button" data-doc-action="hl-red">🔴</button>'+ 
      '<button type="button" data-doc-action="hl-undo">↩️</button>'+ 
      '<button type="button" data-doc-action="font-down" title="缩小导入文档文字">A-</button>'+ 
      '<button type="button" data-doc-action="font-reset" title="恢复默认文字大小">A</button>'+ 
      '<button type="button" data-doc-action="font-up" title="放大导入文档文字">A+</button>'+ 
    '</div>';

  /* 控制器属于当前导入卡片，并且必须紧跟“📄 导入文档（可编辑）”标题之后。 */
  var editorWrap=editor.closest('.imported-document-editor');
  if(label && label.parentNode===block){
    label.insertAdjacentElement('afterend',controls);
  }else if(block && editorWrap){
    block.insertBefore(controls,editorWrap);
  }else{
    editor.parentNode.insertBefore(controls,editor);
  }

  function inEditorSelection(){
    var sel=window.getSelection();
    return !!(sel && sel.rangeCount && !sel.isCollapsed && editor.contains(sel.anchorNode) && editor.contains(sel.focusNode));
  }
  function rememberSelection(){
    if(!inEditorSelection()) return;
    try{ if(typeof rememberContentEditableSelection==='function') rememberContentEditableSelection(editor); }catch(_){ }
    try{
      var sel=window.getSelection();
      card.__importedDocSelectionText=sel.toString();
      card.__importedDocSelectionRange=sel.getRangeAt(0).cloneRange();
    }catch(_){ }
  }
  function currentRange(){
    if(typeof noteSelectedRange==='function'){
      var r=noteSelectedRange(editor);
      if(r) return r;
    }
    return null;
  }
  function persistEditorState(){
    var n=cache.find(function(x){return x.id===card.dataset.id;});
    if(!n)return;
    n.noteText=noteEditorText(editor);
    n.noteHtml=sanitizeImportedHtml(editor.innerHTML);
    n.documentModified=true;
    /* 导入文档与普通“我的笔记”共用同一套持久高亮数据结构，避免两套标记互相覆盖。 */
    if(typeof syncNoteHighlightsFromDOM==='function') syncNoteHighlightsFromDOM(editor,n);
    if(typeof saveNoteHighlights==='function') saveNoteHighlights(n);
  }
  function applyHighlight(color){
    var n=cache.find(function(x){return x.id===card.dataset.id;});
    var r=currentRange();
    if(!n || !r){toast('请先在导入文档中选中文字');return;}
    n.noteHighlights=noteHighlightData(n).filter(function(h){return !(h.end>r.start&&h.start<r.end);});
    n.noteHighlights.push({start:r.start,end:r.end,color:color});
    renderImportedDocumentContent(editor,n);
    saveNoteHighlights(n);
  }
  function clearHighlight(){
    var n=cache.find(function(x){return x.id===card.dataset.id;});
    var r=currentRange();
    if(!n || !r){toast('请先选中要取消的导入文档高亮');return;}
    n.noteHighlights=noteHighlightData(n).filter(function(h){return !(h.end>r.start&&h.start<r.end);});
    renderImportedDocumentContent(editor,n);
    saveNoteHighlights(n);
  }
  function applyScopedEditorFontSize(size){
    /*
     * ODT/DOCX 内容经导入后，文字可能保留在多个子元素自己的
     * font-size 内联样式中。只改 contenteditable 根节点会看起来“按钮无效”。
     * 因此字号调整时，在当前编辑区内建立一次局部覆盖；绝不触及其它卡片/区域。
     */
    if(!editor)return;
    var old=card.querySelector('style[data-imported-font-scope]');
    if(old) old.remove();
    if(size===null){
      editor.style.removeProperty('font-size');
      delete editor.dataset.importedFontSize;
      return;
    }
    editor.style.setProperty('font-size',size+'px','important');
    editor.dataset.importedFontSize=String(size);
    var style=document.createElement('style');
    style.setAttribute('data-imported-font-scope','true');
    style.textContent='[data-imported-document-scope="true"] .imported-document-text[data-imported-font-size-active="true"], [data-imported-document-scope="true"] .imported-document-text[data-imported-font-size-active="true"] *{font-size:inherit !important;}';
    card.appendChild(style);
    editor.setAttribute('data-imported-font-size-active','true');
  }
  function changeFont(delta){
    var n=cache.find(function(x){return x.id===card.dataset.id;});
    if(!n)return;
    if(delta===null){
      delete n.noteFontSize;
      applyScopedEditorFontSize(null);
      editor.removeAttribute('data-imported-font-size-active');
      /* A 只恢复当前导入文档默认字号，不触发整卡片重绘。 */
      return;
    }
    var current=parseFloat(n.noteFontSize||'') || parseFloat(getComputedStyle(editor).fontSize) || 16;
    current=Math.max(10,Math.min(48,current+delta));
    n.noteFontSize=current;
    applyScopedEditorFontSize(current);
    /* 只改变当前导入文档字号；不触发整卡片重绘，避免编辑/选区闪烁。 */
  }
  /*
   * 导入 ODT/DOCX 的正文是 contenteditable DOM。
   * 不能把 contentEditableOffset() 得到的“原始 DOM 字符偏移”直接
   * 用来切 speechTextFromTarget() 返回的“归一化文本”，因为后者会
   * 把连续空白、换行等压缩成单个空格；两套坐标系不同，就会出现
   * “从选中位置开始”向前偏移多个字符的问题。
   *
   * 朗读专用坐标必须与 speechTextFromTarget() 使用完全相同的文本
   * 归一化规则：从编辑器根节点到真实 Range 起点生成 prefix，
   * excerptNormalize(prefix).length 即为可朗读文本中的真实起点。
   */
  function importedSpeechRange(editor){
    if(!editor)return null;
    var r=null;
    try{
      if(card.__importedDocSelectionRange) r=card.__importedDocSelectionRange.cloneRange();
    }catch(_){}
    if(!r){
      try{
        var sel=window.getSelection();
        if(sel&&sel.rangeCount&&!sel.isCollapsed&&editor.contains(sel.anchorNode)&&editor.contains(sel.focusNode)){
          r=sel.getRangeAt(0).cloneRange();
        }
      }catch(_){}
    }
    if(!r || !editor.contains(r.startContainer) || !editor.contains(r.endContainer))return null;
    return r;
  }

  function importedSpeechNormalizedBoundary(raw){
    /*
     * 将“选区之前的 DOM 文本”映射到 speechTextFromTarget() 的坐标。
     * 必须使用真正的 Unicode 哨兵，并保留哨兵前的空白折叠结果；
     * 否则 trim() 会把边界吃掉，造成从选中位置向前错一个字符。
     */
    var s=String(raw||"");
    var marker="\uE000";
    var normalized=excerptNormalize(s+marker);
    var i=normalized.indexOf(marker);
    return i>=0?i:excerptNormalize(s).length;
  }

  function importedSpeechBoundaryText(editor,range){
    /*
     * speechTextFromTarget(contenteditable) 的基准是 innerText，而不是
     * Range.toString()/textContent。innerText 会为段落、DIV、BR 等生成
     * 不同的换行，所以这里必须用“同一个 DOM → innerText”路径计算前缀，
     * 才能保证中文字符级起点 1:1 对齐。
     */
    var holder=document.createElement('div');
    holder.style.cssText='position:absolute;left:-100000px;top:-100000px;width:1px;height:1px;overflow:hidden;';
    holder.appendChild(range.cloneContents());
    document.body.appendChild(holder);
    var text=holder.innerText!=null?holder.innerText:holder.textContent||'';
    try{holder.remove();}catch(_){if(holder.parentNode)holder.parentNode.removeChild(holder);}
    return String(text||'');
  }

  function importedSpeechOffset(editor,range){
    if(!editor||!range)return null;
    try{
      var prefix=document.createRange();
      prefix.selectNodeContents(editor);
      prefix.setEnd(range.startContainer,range.startOffset);

      var endPrefix=document.createRange();
      endPrefix.selectNodeContents(editor);
      endPrefix.setEnd(range.endContainer,range.endOffset);

      var startRaw=importedSpeechBoundaryText(editor,prefix);
      var endRaw=importedSpeechBoundaryText(editor,endPrefix);
      var start=importedSpeechNormalizedBoundary(startRaw);
      var end=importedSpeechNormalizedBoundary(endRaw);
      var selected=excerptNormalize(range.toString());

      return {start:start,end:end,selected:selected};
    }catch(_){return null;}
  }


  function read(mode){
    var text=speechTextFromTarget(editor);
    if(!text){toast('导入文档没有可朗读内容');return;}
    var range=importedSpeechRange(editor);
    var offsets=range?importedSpeechOffset(editor,range):null;
    var spoken=text;
    if(mode==='selection'){
      if(!range||!offsets){toast('请先在导入文档中选中要朗读的内容');return;}
      /* 选区直接来自真实 DOM Range，不再使用另一套原始字符偏移。 */
      spoken=offsets.selected;
    }else if(mode==='current'){
      if(!range||!offsets){toast('请先在导入文档中选中朗读起点');return;}
      /* 起点与 speechTextFromTarget() 的归一化坐标严格一致。 */
      spoken=text.slice(offsets.start);
    }
    spoken=String(spoken||'').trim();
    if(!spoken){toast('当前选择没有可朗读文字');return;}

    try{booknoteSpeechStopAll();}catch(_){try{window.speechSynthesis.cancel();}catch(__){}}
    var synth=window.speechSynthesis;
    if(!synth){toast('系统语音不可用');return;}
    var token=booknoteSpeechBegin('imported-document',card);
    var task={source:'imported-document',cardId:card.dataset.id,mode:mode};
    window.booknoteSpeechController.task=task;

    excerptReadSettings().then(function(settings){
      if(token!==window.booknoteSpeechController.token || window.booknoteSpeechController.stopped)return;
      var u=new SpeechSynthesisUtterance(spoken);
      var v=excerptFindVoice(settings);
      if(v)u.voice=v;
      if(v&&v.lang)u.lang=v.lang;
      if(isFinite(settings.rate)&&settings.rate>0)u.rate=settings.rate;
      if(isFinite(settings.pitch)&&settings.pitch>=0)u.pitch=settings.pitch;
      if(isFinite(settings.volume)&&settings.volume>=0)u.volume=Math.min(1,settings.volume);
      u.onend=function(){booknoteSpeechFinish(token);};
      u.onerror=function(){booknoteSpeechFinish(token);};
      try{synth.speak(u);}catch(e){booknoteSpeechFinish(token);}
    }).catch(function(){
      booknoteSpeechFinish(token);
      toast('朗读设置读取失败');
    });
  }

  controls.addEventListener('mousedown',function(e){
    if(e.target.closest('button')){
      rememberSelection();
      /* 按钮不抢编辑器焦点，确保浏览器原生选区仍可用于高亮/朗读。 */
      e.preventDefault();
    }
  },true);
  controls.addEventListener('click',function(e){
    var button=e.target.closest('button');
    if(!button)return;
    e.preventDefault();e.stopPropagation();
    var action=button.getAttribute('data-doc-action')||'';
    if(action==='voice-settings'){
      browser.runtime.sendMessage({type:'booknote-open-voice-settings'}).catch(function(){toast('无法打开语音朗读设置');});
      return;
    }
    if(action==='read-home'){read('home');return;}
    if(action==='read-current'){read('current');return;}
    if(action==='read-selection'){read('selection');return;}
    if(action==='read-toggle'){booknoteSpeechPauseResume();return;}
    if(action==='read-stop'){booknoteSpeechStopAll();return;}
    if(action==='hl-yellow'){applyHighlight('yellow');return;}
    if(action==='hl-green'){applyHighlight('green');return;}
    if(action==='hl-blue'){applyHighlight('blue');return;}
    if(action==='hl-purple'){applyHighlight('purple');return;}
    if(action==='hl-red'){applyHighlight('red');return;}
    if(action==='hl-undo'){clearHighlight();return;}
    if(action==='font-down'){changeFont(-1);return;}
    if(action==='font-reset'){changeFont(null);return;}
    if(action==='font-up'){changeFont(1);return;}
  });
  ['mouseup','keyup','focus','blur','input'].forEach(function(ev){
    editor.addEventListener(ev,function(){
      rememberSelection();
      if(ev==='input'){
        var n=cache.find(function(x){return x.id===card.dataset.id;});
        if(n){n.noteText=noteEditorText(editor);n.noteHtml=sanitizeImportedHtml(editor.innerHTML);n.documentModified=true;syncNoteHighlightsFromDOM(editor,n);}
      }
    });
  });
  /* 初次绑定时恢复持久字号/高亮，而不是重新创建另一套 mark。 */
  var n0=cache.find(function(x){return x.id===card.dataset.id;});
  if(n0){
    renderImportedDocumentContent(editor,n0);
    if(n0.noteFontSize)editor.style.fontSize=n0.noteFontSize+'px';
  }
}


/* V7.9.53：动态导入后最终绑定；空状态只保留默认模板。 */
if(!window.v7951ImportedDocumentFinalBinding){
  window.v7951ImportedDocumentFinalBinding=true;
  function v7951Bind(){
    var cards=document.querySelectorAll("article.note.imported-document-card[data-imported-document='true']");
    cards.forEach(function(card){
      if(typeof v7950EnsureDocumentIdentity==="function")v7950EnsureDocumentIdentity(card);
      createImportedDocumentControls(card);
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",v7951Bind);
  else v7951Bind();
  new MutationObserver(v7951Bind).observe(document.body,{childList:true,subtree:true});
}

/* V7.9.56：左侧分类 → 右侧统一排版
   全部笔记 / 导入文档管理 / 书籍/页面作为现有排版基准；
   摘录管理 / 点赞 / 收藏使用同一右侧容器、间距、边界和底部操作区。 */
(function(){
  if(window.v7956RightLayoutStandardizer)return;
  window.v7956RightLayoutStandardizer=true;

  var STANDARD = {
    "all-notes": "全部笔记",
    "imported-documents": "导入文档管理",
    "books-pages": "书籍/页面",
    "excerpts": "摘录管理",
    "liked": "点赞",
    "favorites": "收藏"
  };

  function normalizeText(v){
    return String(v||"").replace(/\s+/g,"").replace(/[📖📝⭐❤️]/g,"");
  }

  function classify(label){
    var t=normalizeText(label);
    if(t.indexOf("全部笔记")>=0)return"all-notes";
    if(t.indexOf("导入文档管理")>=0)return"imported-documents";
    if(t.indexOf("书籍/页面")>=0 || t.indexOf("书籍页面")>=0)return"books-pages";
    if(t.indexOf("摘录管理")>=0)return"excerpts";
    if(t.indexOf("点赞")>=0)return"liked";
    if(t.indexOf("收藏")>=0)return"favorites";
    return"";
  }

  function activeCategory(){
    var candidates=document.querySelectorAll(
      "button,.nav-item,.sidebar-item,.menu-item,[role='button'],[data-section]"
    );
    for(var i=0;i<candidates.length;i++){
      var el=candidates[i];
      var active=el.classList.contains("active") ||
        el.classList.contains("selected") ||
        el.getAttribute("aria-selected")==="true" ||
        el.getAttribute("data-active")==="true";
      if(active){
        var key=classify(el.textContent||el.getAttribute("data-section")||"");
        if(key)return key;
      }
    }
    return"";
  }

  function rightPanel(){
    return document.querySelector(
      "#main-content,.main-content,.right-panel,.content-panel,.notes-content"
    );
  }

  function apply(){
    var panel=rightPanel();
    if(!panel)return;
    var key=activeCategory();
    if(!key)return;

    panel.setAttribute("data-right-layout-category",key);
    panel.classList.add("right-layout-standardized");

    /* 只对需要统一的三个视图增加标准化标记；
       已经稳定的三个视图不重排、不重建 DOM。 */
    var legacy=(key==="excerpts"||key==="liked"||key==="favorites");
    panel.classList.toggle("right-layout-legacy-normalized",legacy);

    if(legacy){
      panel.querySelectorAll(
        ".card,.note-card,.excerpt-card,.item-card,.list-card"
      ).forEach(function(card){
        card.classList.add("right-layout-card-standard");
      });
    }
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply);
  else apply();

  new MutationObserver(function(){apply();})
    .observe(document.body,{childList:true,subtree:true,attributes:true,
      attributeFilter:["class","aria-selected","data-active"]});
})();

/* V7.9.57：搜索提示可见性统一
   有导入 / 无导入均显示搜索提示；提示属于搜索 UI 状态，不依赖文档数量。 */
(function(){
  if(window.v7957SearchPromptVisibility)return;
  window.v7957SearchPromptVisibility=true;

  function findSearchBox(){
    return document.querySelector(
      "#searchInput,#search-input,input[type='search'],input[placeholder*='搜索'],input[placeholder*='搜尋']"
    );
  }
  function findSearchArea(){
    var input=findSearchBox();
    if(!input)return null;
    return input.closest(".search-bar,.search-container,.search-box,.toolbar,header") || input.parentElement;
  }
  function findResultArea(){
    return document.querySelector(
      "#search-results,.search-results,.search-result-list,.results-list,[data-search-results]"
    );
  }
  function hasImportedDocs(){
    return !!document.querySelector(
      ".imported-document-card,[data-imported-document='true'],.imported-doc-card"
    );
  }
  function sync(){
    var input=findSearchBox(), results=findResultArea();
    if(!input || !results)return;

    var q=String(input.value||"").trim();
    var prompt=results.querySelector(".v7957-search-prompt");
    if(!prompt){
      prompt=document.createElement("div");
      prompt.className="v7957-search-prompt";
      results.insertBefore(prompt,results.firstChild);
    }

    /* 搜索提示不与“是否有导入文档”绑定。 */
    prompt.hidden=false;
    prompt.style.display="";
    prompt.textContent=q
      ? "🔎 搜索提示：正在搜索「"+q+"」"
      : "🔎 搜索提示：请输入关键词进行搜索";
    prompt.setAttribute("data-has-imported-documents",hasImportedDocs()?"true":"false");
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",sync);
  else sync();

  document.addEventListener("input",function(e){
    if(e.target && (e.target.matches("#searchInput,#search-input,input[type='search']") ||
      /搜索|搜尋/.test(e.target.getAttribute("placeholder")||""))) sync();
  },true);

  document.addEventListener("keyup",function(e){
    if(e.target && (e.target.matches("#searchInput,#search-input,input[type='search']") ||
      /搜索|搜尋/.test(e.target.getAttribute("placeholder")||""))) sync();
  },true);

  new MutationObserver(sync).observe(document.body,{childList:true,subtree:true});
})();

/* V7.9.58：分类视图中的“原文摘录 / 我的笔记”统一可见高度。
   仅规范双栏容器及两个内容框，不改变内容、朗读、高亮和编辑逻辑。 */
(function(){
  if(window.v7958EqualExcerptNotePanels)return;
  window.v7958EqualExcerptNotePanels=true;

  function isTargetCategory(){
    var nodes=document.querySelectorAll(
      ".sidebar-item,.nav-item,.menu-item,button,[role='button'],[data-section]"
    );
    for(var i=0;i<nodes.length;i++){
      var e=nodes[i], active=e.classList.contains("active")||
        e.classList.contains("selected")||e.getAttribute("aria-selected")==="true";
      if(!active)continue;
      var t=String(e.textContent||"").replace(/\s+/g,"");
      if(/收藏|点赞|摘要管理|摘录管理|书籍\/页面|书籍页面/.test(t))return true;
    }
    return false;
  }

  function findPairs(){
    var all=document.querySelectorAll(
      ".excerpt-note-grid,.excerpt-note-columns,.quote-note-grid,.two-column,"+
      ".original-note-grid,.content-columns,.note-columns,.detail-columns"
    );
    var pairs=[];
    all.forEach(function(grid){
      var excerpt=grid.querySelector(
        ".excerpt-panel,.original-excerpt,.excerpt-content,.quote-content,"+
        "[data-panel='excerpt'],[data-section='excerpt']"
      );
      var note=grid.querySelector(
        ".note-panel,.my-note,.note-content,.note-editor,"+
        "[data-panel='note'],[data-section='note']"
      );
      if(excerpt&&note)pairs.push({grid:grid,excerpt:excerpt,note:note});
    });
    return pairs;
  }

  function apply(){
    if(!isTargetCategory())return;
    findPairs().forEach(function(p){
      p.grid.classList.add("v7958-equal-two-column");
      p.excerpt.classList.add("v7958-equal-panel");
      p.note.classList.add("v7958-equal-panel");
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply);
  else apply();
  new MutationObserver(apply).observe(document.body,{
    childList:true,subtree:true,attributes:true,
    attributeFilter:["class","aria-selected","data-section"]
  });
})();

/* V7.9.60：📖 原文摘录/📝我的笔记普通双栏布局统一。
   统一标题、内容框、最小高度、滚动、换行和盒模型；不改正文数据。 */
(function(){
  if(window.v7959ExcerptPanelConsistency)return;
  window.v7959ExcerptPanelConsistency=true;

  function findPanels(){
    var selectors=[
      "[data-panel='excerpt']",
      "[data-section='excerpt']",
      ".excerpt-panel",
      ".original-excerpt",
      ".excerpt-content",
      ".quote-content",
      ".source-excerpt",
      ".original-content"
    ];
    var seen=[], out=[];
    selectors.forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el){
        if(seen.indexOf(el)<0){seen.push(el);out.push(el);}
      });
    });
    return out;
  }

  function normalize(panel){
    if(!panel)return;
    panel.classList.add("v7959-excerpt-panel");
    var content=panel.querySelector(
      ".excerpt-body,.excerpt-content,.quote-content,.source-excerpt,"+
      ".original-content,[data-excerpt-content],.content"
    );
    if(content)content.classList.add("v7959-excerpt-content");

    var controls=panel.querySelector(
      ".excerpt-controls,.quote-controls,[data-excerpt-controls],.reader-controls"
    );
    if(controls)controls.classList.add("v7959-excerpt-controls");
  }

  function apply(){findPanels().forEach(normalize);}

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply);
  else apply();

  new MutationObserver(apply).observe(document.body,{
    childList:true,subtree:true
  });
})();

/* V7.9.60：避免将导入文档容器误判为普通摘录面板。 */
(function(){
  function excluded(el){
    return !!el.closest(
      ".imported-document,.import-document,.import-doc-panel,"+
      "[data-import-document],[data-imported-document]"
    );
  }
  document.querySelectorAll(".v7959-excerpt-panel").forEach(function(el){
    if(excluded(el)) el.classList.remove("v7959-excerpt-panel");
  });
})();

/* V7.9.61：搜索统一覆盖“原文摘录 + 我的笔记 + 导入文档”。
   核心原则：是否存在导入文档不再决定搜索是否可用；有结果必须给出提示。
   仅负责搜索发现与提示，不修改正文/编辑内容。 */
(function(){
  if(window.v7961SearchAllContentEditable)return;
  window.v7961SearchAllContentEditable=true;

  function textOf(el){
    if(!el)return "";
    return String(el.innerText || el.textContent || "").replace(/\s+/g," ").trim();
  }

  function searchInput(){
    return document.querySelector(
      "#searchInput,#search-input,input[type='search'],"+
      "input[placeholder*='搜索'],input[placeholder*='搜尋']"
    );
  }

  function resultHost(){
    return document.querySelector(
      "#search-results,.search-results,.search-result-list,.results-list,"+
      "[data-search-results]"
    );
  }

  function cardRoots(){
    var sels=[
      ".note-card,.book-card,.document-card,.page-card",
      "[data-note-id],[data-book-id],[data-document-id]",
      ".excerpt-note-grid,.excerpt-note-columns"
    ];
    var seen=[], out=[];
    sels.forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el){
        if(seen.indexOf(el)<0){
          seen.push(el);
          out.push(el);
        }
      });
    });
    return out;
  }

  function contentCandidates(root){
    var sels=[
      ".excerpt-content",".excerpt-body",".original-excerpt",
      ".quote-content","[data-panel='excerpt']",
      ".note-content",".note-body",".my-note",".note-editor",
      "[contenteditable='true']",
      ".imported-document",".import-document",
      "[data-imported-document='true']"
    ];
    var out=[];
    sels.forEach(function(sel){
      if(root.matches && root.matches(sel)) out.push(root);
      root.querySelectorAll && root.querySelectorAll(sel).forEach(function(el){
        if(out.indexOf(el)<0) out.push(el);
      });
    });
    return out;
  }

  function makeIndex(){
    var roots=cardRoots();
    var rows=[];
    roots.forEach(function(root, i){
      var candidates=contentCandidates(root);
      if(!candidates.length){
        var t=textOf(root);
        if(t) rows.push({root:root,text:t,type:"内容"});
        return;
      }
      candidates.forEach(function(el){
        var t=textOf(el);
        if(t) rows.push({
          root:root,
          el:el,
          text:t,
          type:el.matches && el.matches("[contenteditable='true'],.note-content,.note-body,.my-note,.note-editor")
            ? "我的笔记" : "原文摘录"
        });
      });
    });
    return rows;
  }

  function showPrompt(q, matches){
    var host=resultHost();
    if(!host)return;
    var p=host.querySelector(".v7961-search-result-prompt");
    if(!p){
      p=document.createElement("div");
      p.className="v7961-search-result-prompt";
      host.insertBefore(p,host.firstChild);
    }
    p.hidden=false;
    p.style.display="block";
    if(!q){
      p.textContent="🔎 搜索提示：请输入关键词";
    }else if(matches.length){
      var excerpt=matches.filter(function(x){return x.type==="原文摘录"}).length;
      var notes=matches.filter(function(x){return x.type==="我的笔记"}).length;
      p.textContent="🔎 找到 "+matches.length+" 个结果：原文摘录 "+excerpt+"，我的笔记 "+notes;
    }else{
      p.textContent="🔎 未找到匹配内容";
    }
  }

  function runSearch(){
    var input=searchInput();
    if(!input)return;
    var q=String(input.value||"").trim();
    if(!q){showPrompt("",[]);return;}

    var needle=q.toLocaleLowerCase();
    var rows=makeIndex();
    var matches=rows.filter(function(r){
      return r.text.toLocaleLowerCase().indexOf(needle)!==-1;
    });

    showPrompt(q,matches);

    /* 保留现有搜索系统：若项目已有搜索事件/函数，不强行替换；
       本层只保证“原文 + 笔记 + 导入内容”均进入可见结果提示。 */
    document.dispatchEvent(new CustomEvent("booknote:search-results",{detail:{
      query:q, matches:matches
    }}));
  }

  document.addEventListener("input",function(e){
    var input=searchInput();
    if(input && e.target===input) runSearch();
  },true);

  document.addEventListener("keyup",function(e){
    var input=searchInput();
    if(input && e.target===input && (e.key==="Enter" || e.key.length===1 || e.key==="Backspace"))
      runSearch();
  },true);

  document.addEventListener("change",function(e){
    var input=searchInput();
    if(input && e.target===input) runSearch();
  },true);

  /* 分类切换、导入、编辑、保存后重新建立搜索索引。
     仅保留一次低频、合并后的刷新；忽略搜索提示自身的 DOM 变化，
     避免“DOM 变化 → 搜索 → DOM 变化 → 搜索”的反馈链。 */
  var searchRefreshTimer=0;
  function isSearchUiNode(node){
    if(!node || node.nodeType!==1 || !node.closest)return false;
    return !!node.closest(
      ".v7961-search-result-prompt,.v7957-search-prompt,"+
      "#search-results,.search-results,.search-result-list,.results-list,"+
      "[data-search-results],.v71070-search-results"
    );
  }
  var searchRefreshObserver=new MutationObserver(function(records){
    var relevant=false;
    for(var i=0;i<records.length && !relevant;i++){
      var record=records[i];
      var target=record.target;
      if(isSearchUiNode(target)) continue;
      var nodes=record.addedNodes||[];
      for(var j=0;j<nodes.length;j++){
        var node=nodes[j];
        if(node && node.nodeType===1 && isSearchUiNode(node)) continue;
        if(node && node.nodeType===3) continue;
        relevant=true;
        break;
      }
      if(record.type==="characterData") continue;
      if(record.type==="childList" && nodes.length) relevant=true;
    }
    if(!relevant)return;
    if(searchRefreshTimer)clearTimeout(searchRefreshTimer);
    searchRefreshTimer=setTimeout(function(){
      searchRefreshTimer=0;
      var input=searchInput();
      if(input && String(input.value||"").trim()) runSearch();
    },150);
  });
  if(document.body)searchRefreshObserver.observe(document.body,{childList:true,subtree:true});
  window.addEventListener("pagehide",function(){
    searchRefreshObserver.disconnect();
    if(searchRefreshTimer){clearTimeout(searchRefreshTimer);searchRefreshTimer=0;}
  },{once:true});

  if(document.readyState==="loading")
    document.addEventListener("DOMContentLoaded",runSearch);
  else
    runSearch();
})();

/* V7.10.248：我的笔记富文本复制。
 * 选择“📝 我的笔记”中的内容后复制时，同时写入 text/html 与 text/plain，
 * 让 Word/LibreOffice/浏览器等目标优先接收原有 HTML 排版，而纯文本目标
 * 仍得到正常换行文本。只拦截 note-pane 内的用户笔记，不影响原文摘录、
 * 导入文档及其它复制行为；摘要来源行位于 editor 外部，因此不会被复制进去。
 */
(function(){
  function isMyNoteEditor(node){
    if(!node || node.nodeType!==1) return null;
    var ed=node.closest && node.closest('.note-pane .note-editor-content[contenteditable="true"]');
    return ed || null;
  }
  function copyRichSelection(e){
    var ed=isMyNoteEditor(e.target);
    if(!ed) return;
    var sel=window.getSelection();
    if(!sel || sel.rangeCount===0 || sel.isCollapsed) return;
    var range=sel.getRangeAt(0);
    if(!ed.contains(range.startContainer) || !ed.contains(range.endContainer)) return;
    var plain=sel.toString();
    if(!plain) return;
    try{
      var fragment=range.cloneContents();
      var holder=document.createElement('div');
      holder.appendChild(fragment);
      /* 保留编辑器自身的 HTML 结构（strong/em/a/list/table/换行等）。
       * 给片段一个明确的段落排版基线，避免部分目标程序把 div 连成一行。 */
      holder.querySelectorAll('div').forEach(function(el){
        if(!el.getAttribute('style')) el.style.display='block';
      });
      var html=holder.innerHTML;
      if(!html) return;
      if(e.clipboardData){
        e.preventDefault();
        e.clipboardData.setData('text/plain',plain);
        e.clipboardData.setData('text/html',html);
      }
    }catch(_){
      /* 浏览器原生复制作为兜底，不阻断 Ctrl/Cmd+C。 */
    }
  }
  document.addEventListener('copy',copyRichSelection,true);
})();
