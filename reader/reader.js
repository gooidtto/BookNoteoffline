(function(){"use strict";
var params=new URLSearchParams(location.search),bookId=params.get("bookId")||"",requestedChapter=Number(params.get("chapterIndex")||0),requestedStart=params.get("annotationStart"),requestedQuery=params.get("searchTerm")||"",$=function(id){return document.getElementById(id)},readerSearchTimer=null,readerSearchHistory=[],readerSearchHistoryReady=Promise.resolve();
var state={book:null,content:null,source:null,runtime:null,chapters:[],canonicalChapters:[],canonicalDocument:null,hits:[],hitIndex:-1,searchSeq:0,searchNavSeq:0,searchNavPromise:Promise.resolve(),currentChapter:0,settings:{},selected:null,annotations:[],activeTab:"toc",sideSelection:{annotations:{},bookmarks:{},contentNotes:{}},sideActiveId:"",highlightColorFilter:"all",bookmarkStarFilter:"all",contentAnnotationFilter:"all",layout:"scroll",themeName:"everforest",themeMode:"day",highlightRenderSeq:0,highlightRenderPromise:Promise.resolve(),annotationNavSeq:0,toc:[],tocActiveIndex:-1,readingSaveTimer:null,readingSaveSeq:0,readingLastSavedKey:""};
function esc(s){return String(s==null?"":s).replace(/[&<>\"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\":"\\",'"':"&quot;"}[c]})}

var HIGHLIGHT_COLORS=[{key:"yellow",label:"黃色",heart:"♥"},{key:"red",label:"紅色",heart:"♥"},{key:"pink",label:"粉紅",heart:"♥"},{key:"green",label:"綠色",heart:"♥"},{key:"blue",label:"藍色",heart:"♥"},{key:"purple",label:"紫色",heart:"♥"}];
function getHighlightColorMeta(key){var k=String(key||"yellow").toLowerCase();return HIGHLIGHT_COLORS.find(function(x){return x.key===k})||HIGHLIGHT_COLORS[0]}
var BOOKMARK_STARS=[1,2,3,4,5,6].map(function(star){return {star:star,label:star+"星",src:"img/bookmark-stars/bookmark-star-"+star+".png"};});
var CONTENT_ANNOTATION_STYLES=[{key:"focus",label:"重点",color:"#E53935",line:"方形点线",symbol:"■",palette:["#E53935"],icon:"content-annotation-focus.png"},{key:"insight",label:"感悟",color:"#00C853",line:"圆点线",symbol:"●",palette:["#00C853"],icon:"content-annotation-insight.png"},{key:"receive",label:"领受",color:"#FF3B30",line:"彩色长条虚线",symbol:"▬",palette:["#FF3B30","#FF9500","#34C759","#007AFF","#AF52DE"],icon:"content-annotation-receive.png"}];
var CONTENT_ANNOTATION_LEGACY_KEY_MAP={core:"focus",important:"insight",inspiration:"receive",focus:"focus",insight:"insight",receive:"receive"};
var CONTENT_ANNOTATION_COLOR_KEY_MAP={"#e53935":"focus","#00c853":"insight","#ff3b30":"receive"};
function canonicalContentAnnotationKey(key){var k=String(key||"focus").toLowerCase();return CONTENT_ANNOTATION_LEGACY_KEY_MAP[k]||"focus"}
function contentAnnotationColorKey(a){var c=String((a&&a.contentAnnotationColor)||(a&&a.color)||"").trim().toLowerCase();return CONTENT_ANNOTATION_COLOR_KEY_MAP[c]||""}
function getContentAnnotationStyle(key){var k=canonicalContentAnnotationKey(key);return CONTENT_ANNOTATION_STYLES.find(function(x){return x.key===k})||CONTENT_ANNOTATION_STYLES[0]}
function contentAnnotationStyleKey(a){var colorKey=contentAnnotationColorKey(a);if(colorKey)return colorKey;return canonicalContentAnnotationKey(a&&a.contentAnnotationStyle||a&&a.noteStyle||"focus")}
function contentAnnotationPattern(style,cls){var raw=style&&typeof style==="object"?style.key:style,k=canonicalContentAnnotationKey(raw),base='content-note-pattern '+(cls||'')+' content-note-pattern-'+k,units='';if(k==="focus"){for(var i=0;i<3;i++)units+='<i class="content-note-pattern-unit content-note-pattern-square" style="background:#E53935"></i>';}else if(k==="insight"){for(var j=0;j<3;j++)units+='<i class="content-note-pattern-unit content-note-pattern-dot" style="background:#00C853"></i>';}else{for(var q=0;q<3;q++)units+='<i class="content-note-pattern-unit content-note-pattern-bar" style="background:linear-gradient(90deg,#FF3B30 0%,#FF9500 25%,#34C759 50%,#007AFF 75%,#AF52DE 100%)"></i>';}return '<span class="'+base+'" data-content-note-pattern="'+k+'" aria-hidden="true">'+units+'</span>'}
function contentAnnotationStyleIcon(style,cls){var raw=style&&typeof style==="object"?style.key:style,k=canonicalContentAnnotationKey(raw),srcMap={focus:"img/content-annotation/content-annotation-focus.png?v=381",insight:"img/content-annotation/content-annotation-insight.png?v=381",receive:"img/content-annotation/content-annotation-receive.png?v=381"},labelMap={focus:"重点",insight:"感悟",receive:"领受"};return '<img class="content-annotation-style-icon '+(cls||'')+'" data-content-note-style="'+k+'" data-content-note-icon-key="'+k+'" src="'+browser.runtime.getURL(srcMap[k]||srcMap.focus)+'" alt="'+esc(labelMap[k]||labelMap.focus)+'" aria-hidden="true">'}
function getBookmarkStarMeta(value){var n=Math.max(1,Math.min(6,Number(value)||1));return BOOKMARK_STARS[n-1]||BOOKMARK_STARS[0]}
function bookmarkStarImg(star,cls){var m=getBookmarkStarMeta(star);return '<img class="'+(cls||'bookmark-star-image')+'" src="'+browser.runtime.getURL(m.src)+'" alt="'+m.label+'" aria-label="'+m.label+'">'}
function bookmarkStarGlyphs(star){var n=Math.max(1,Math.min(6,Number(star)||1));return '⭐'.repeat(n)}
function openHighlightColorPicker(){var tb=$("selectionToolbar"),picker=$("highlightColorPicker");if(!tb||!picker)return;var vr=$("viewport").getBoundingClientRect(),left=Number.parseFloat(tb.style.left)||8,top=Number.parseFloat(tb.style.top)||8;picker.innerHTML='<div class="highlight-picker-title">选择高亮颜色</div><div class="highlight-picker-grid">'+HIGHLIGHT_COLORS.map(function(x){return '<button type="button" class="highlight-color-option" data-highlight-color="'+x.key+'" title="'+x.label+'"><span class="highlight-color-heart highlight-color-heart-'+x.key+'" aria-hidden="true">'+x.heart+'</span><b>'+x.label+'</b></button>'}).join('')+'</div>';picker.style.left=Math.max(8,Math.min(left,Math.max(8,vr.width-250)))+"px";var below=top+tb.getBoundingClientRect().height+8;picker.style.top=(below+140>vr.height?Math.max(8,top-150):below)+"px";picker.hidden=false;picker.querySelectorAll('[data-highlight-color]').forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();var color=b.dataset.highlightColor;picker.hidden=true;saveAnnotation("highlight",color)}})}
function closeHighlightColorPicker(){var picker=$("highlightColorPicker");if(picker)picker.hidden=true}
function openBookmarkStarPicker(){var tb=$("selectionToolbar"),picker=$("bookmarkStarPicker");if(!tb||!picker)return;var vr=$("viewport").getBoundingClientRect(),left=Number.parseFloat(tb.style.left)||8,top=Number.parseFloat(tb.style.top)||8;picker.innerHTML='<div class="bookmark-picker-title">选择书签星级</div><div class="bookmark-picker-grid">'+BOOKMARK_STARS.map(function(x){return '<button type="button" class="bookmark-star-option" data-bookmark-star="'+x.star+'" title="'+x.label+'">'+bookmarkStarImg(x.star,"bookmark-picker-image")+'<b>'+x.label+'</b></button>'}).join('')+'</div>';picker.style.left=Math.max(8,Math.min(left,Math.max(8,vr.width-390)))+"px";var below=top+tb.getBoundingClientRect().height+8;picker.style.top=(below+220>vr.height?Math.max(8,top-225):below)+"px";picker.hidden=false;picker.querySelectorAll('[data-bookmark-star]').forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();var star=Number(b.dataset.bookmarkStar)||1;picker.hidden=true;addBookmark(star)}})}
function closeBookmarkStarPicker(){var picker=$("bookmarkStarPicker");if(picker)picker.hidden=true}
function bookmarkFilterMatches(a){if(state.bookmarkStarFilter==="all")return true;if(!a||a.type!=="bookmark")return false;return Number(a.star||1)===Number(state.bookmarkStarFilter)}
function toast(s){var t=$("toast");t.textContent=s;t.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(function(){t.classList.remove("show")},1700)}
function chapterLocal(ch,p){var s=Number(ch&&ch.textStart)||0,e=Number(ch&&ch.textEnd);if(!Number.isFinite(e))e=s+String(ch&&ch.text||"").length;return Math.max(0,Math.min(e-s,Number(p)-s))}
/* v7.10.414 DOCX TOC parity: recover headings recursively and keep stored/imported chapters authoritative. */
function buildReaderHeadingChapters(html,text,title){
 var source=String(text||''),rawHtml=String(html||'');
 if(!rawHtml||!source)return [];
 var doc=new DOMParser().parseFromString('<div id="__bn_reader_ch_root">'+rawHtml+'</div>','text/html'),root=doc.getElementById('__bn_reader_ch_root');
 if(!root)return [];
 var blocks=Array.prototype.slice.call(root.children),all=Array.prototype.slice.call(root.querySelectorAll('h1,h2,h3,h4,h5,h6'));
 function fold(x){return String(x||'').replace(/\u00a0/g,' ').replace(/\r\n|\r/g,'\n').replace(/\s+/g,' ').trim();}
 function titleKey(x){return fold(x).replace(/\.[^.]+$/,'').replace(/[（(]\d+[）)]$/,'').replace(/[“”‘’「」『』]/g,'').replace(/\s+/g,'').toLowerCase();}
 var tk=titleKey(title),accepted=0,heads=all.filter(function(h){
   var label=fold(h.textContent||''),navAttr=String(h.getAttribute('data-txt-nav')||'');
   if(navAttr==='0'||/^Title\s*Page$/i.test(label))return false;
   if(navAttr!=='1')return false;
   var hk=titleKey(h.textContent||'');
   if(tk&&accepted===0&&hk===tk)return false;
   accepted++;
   return true;
 });
 if(!heads.length)return [];
 function topBlock(el){var n=el;while(n&&n.parentElement&&n.parentElement!==root)n=n.parentElement;return n;}
 function rawAtFold(pos){var fi=0,raw=0;for(var i=0;i<source.length&&fi<pos;i++){var ch=source.charAt(i);if(/\s/.test(ch)){while(i+1<source.length&&/\s/.test(source.charAt(i+1)))i++;if(fi<pos)fi++;}else fi++;raw=i+1;}return Math.max(0,Math.min(source.length,raw));}
 var folded=fold(source),chapters=[];
 heads.forEach(function(head,idx){
   var label=fold(head.textContent||''),hf=fold(label),previousEnd=idx?Number(chapters[chapters.length-1].textEnd)||0:0,at=folded.indexOf(hf,idx?previousEnd:0);
   var headingStart=at>=0?rawAtFold(at):previousEnd;
   var next=idx+1<heads.length?heads[idx+1]:null,nextLabel=next?fold(next.textContent||''):'';
   var nextAt=nextLabel?folded.indexOf(nextLabel,Math.max(at>=0?at+hf.length:headingStart,headingStart)):-1;
   var end=nextAt>=0?rawAtFold(nextAt):source.length;if(end<headingStart)end=headingStart;
   var startBlock=topBlock(head),endBlock=next?topBlock(next):null,startIdx=startBlock?blocks.indexOf(startBlock):-1,endIdx=endBlock?blocks.indexOf(endBlock):blocks.length,chunk=[];
   if(startIdx>=0){var chunkStart=idx===0?0:startIdx;chunk=blocks.slice(chunkStart,Math.max(chunkStart+1,endIdx));}
   var chapterStart=idx===0?0:headingStart,chapterText=source.slice(chapterStart,end),chHtml=chunk.length?chunk.map(function(x){return x.outerHTML;}).join(''):head.outerHTML;
   if(chapterText.trim()||chHtml)chapters.push({index:chapters.length,label:label||String(title||'正文'),href:'',textStart:chapterStart,textEnd:end,text:chapterText,html:chHtml,headingLevel:Number(head.tagName.slice(1))||1,isNavigation:true,tocOffset:Math.max(0,headingStart-chapterStart)});
 });
 return chapters;
}
/* v7.10.418 TXT navigation recovery: rebuild chapters from saved TXT HTML/text when legacy records only contain the filename chapter. */
function txtReaderHeadingInfo(line,prevBlank,nextBlank,lineIndex,lines){
 var rules=globalThis.BookNoteTxtHeadingRules;
 if(!rules)return null;
 var source=Array.isArray(lines)?lines.join("\n"):String(line||"");
 var a=rules.analyze(source,{}),hit=(a.headings||[]).find(function(h){return Number(h.line)===Number(lineIndex);});
 return hit?{level:hit.level,label:hit.label,confidence:hit.explicit?9:5,explicit:!!hit.explicit,type:hit.type}:null;
}
function buildReaderTxtHeadingChapters(text,title){
 var source=String(text||'').replace(/\r\n?/g,'\n'),rules=globalThis.BookNoteTxtHeadingRules;
 if(!rules)return [];
 var analysis=rules.analyze(source,{title:String(title||'').trim()}),lines=analysis.lines,heads=analysis.headings||[];
 if(!heads.length)return [];
 function offset(li){var n=0;for(var j=0;j<li;j++)n+=String(lines[j]||'').length+1;return n;}
 function escTxt(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
 var out=[];
 if(heads[0].line>0){var preEnd=offset(heads[0].line),pre=source.slice(0,preEnd);if(pre.trim())out.push({index:0,label:String(title||'正文'),href:'',textStart:0,textEnd:preEnd,text:pre,html:rules.toHtml(pre,title,escTxt),headingLevel:0,isNavigation:false});}
 heads.forEach(function(h,idx){var st=offset(h.line),en=idx+1<heads.length?offset(heads[idx+1].line):source.length,chunk=source.slice(st,en),hl=String(lines[h.line]||'').trim(),display=String(h.label||hl).replace(/^\[NAV-\d+\]\s*/i,'');var html=rules.toHtml(chunk,title,escTxt);out.push({index:out.length,label:display,href:'',textStart:st,textEnd:en,text:chunk,html:html,headingLevel:h.level,isNavigation:true});});
 return out;
}
function recoverTxtReaderChapters(content,title){
 var html=String(content&&content.html||''),text=String(content&&content.text||'');
 var fromText=buildReaderTxtHeadingChapters(text,title);
 if(fromText.length)return fromText;
 var fromHtml=buildReaderHeadingChapters(html,text,title);
 if(fromHtml.length){return fromHtml.map(function(ch){var m=String(ch.label||'').match(/^\[NAV-(\d+)\]\s*(.+)$/i);if(m){ch.label=m[2].trim();ch.headingLevel=Math.max(1,Math.min(6,Number(m[1])||1));}return ch;});}
 return [];
}
function chapterFor(p){var list=state.canonicalChapters.length?state.canonicalChapters:state.chapters;for(var i=0;i<list.length;i++){var c=list[i],s=Number(c.textStart)||0,e=Number(c.textEnd);if(i===list.length-1?(p>=s&&p<=e):(p>=s&&p<e))return{i:i,c:c}}return{i:Math.max(0,list.length-1),c:list[list.length-1]}}
function applySettings(){var s=state.settings||{};$('content').style.fontSize=(Number(s.fontScale)||100)/100*18+"px";$('content').style.lineHeight=Number(s.lineHeight)||1.85;$('content').classList.remove("narrow","medium","wide","layout-single","layout-double");$('content').classList.add(s.width||"medium","layout-scroll");document.body.classList.toggle("dark",state.themeMode==="night");document.body.dataset.theme=state.themeName||"everforest";document.body.dataset.mode=state.themeMode||"day";document.documentElement.dataset.readerTheme=state.themeName||"everforest";document.documentElement.dataset.readerMode=state.themeMode||"day";document.documentElement.dataset.readerLayout="scroll";if(state.runtime&&state.runtime.iframe){try{if(state.runtime.setTheme)state.runtime.setTheme({name:state.themeName,mode:state.themeMode});var d=state.runtime.iframe.contentDocument;if(d&&d.body){d.body.style.fontSize=((Number(s.fontScale)||100)/100*100)+"%";d.body.style.lineHeight=String(Number(s.lineHeight)||1.85);d.body.style.maxWidth=s.width==="narrow"?"700px":s.width==="wide"?"1120px":"900px";d.body.style.margin="0 auto";d.body.style.color=getComputedStyle(document.body).color;d.body.style.background="transparent"}}catch(_){}}}
function updateTocActive(){var c=$("sideContent");if(!c||state.activeTab!=="toc")return;var active=Number(state.currentChapter);var path=[];function walk(nodes,anc){for(var i=0;i<(nodes||[]).length;i++){var n=nodes[i],idx=Number(n&&n.index);if(idx===active){path=anc.concat([idx]);return true;}if(walk(n&&n.children,anc.concat([idx])))return true;}return false;}walk(state.toc||[],[]);if(!path.length)path=[active];c.querySelectorAll("[data-i]").forEach(function(b){var idx=Number(b.dataset.i),isActive=idx===active,isContext=path.indexOf(idx)>=0&&!isActive;b.classList.toggle("active",isActive);b.classList.toggle("toc-current",isActive);b.classList.toggle("toc-context",isContext);b.setAttribute("aria-current",isActive?"location":"false");});c.querySelectorAll(".side-toc-children").forEach(function(branch){var has=!!branch.querySelector(".side-item.toc-current,.side-item.toc-context");branch.classList.toggle("toc-branch-active",has);});state.tocActiveIndex=active;}
function readerProgressForPosition(index,offset){var list=state.canonicalChapters.length?state.canonicalChapters:state.chapters||[],n=list.length;if(!n)return 0;var i=Math.max(0,Math.min(n-1,Number(index)||0)),ch=list[i]||{},len=Number(ch.textEnd)-Number(ch.textStart);if(!Number.isFinite(len)||len<=0)len=String(ch.text||"").length;var local=Math.max(0,Math.min(len,Number(offset)||0));return Math.max(0,Math.min(1,(i+(len?local/len:0))/n));}
function readerCurrentProgressState(){var rt=state.runtime,cur=rt&&rt.getCurrent?rt.getCurrent():null;if(!cur)return null;var idx=Number(cur.index)||0,off=Math.max(0,Number(cur.offset)||0),sec=cur.section||state.chapters[idx]||{};var loc=cur.locator||(globalThis.BookNoteLocator?BookNoteLocator.reflow({chapterIndex:idx,start:off,end:off,documentStart:Number(sec.textStart||0)+off,documentEnd:Number(sec.textStart||0)+off,href:sec.href,fragment:sec.fragment}):{chapterIndex:idx,offset:off,href:sec.href||""});return {progress:readerProgressForPosition(idx,off),locator:loc,index:idx,offset:off};}
function persistReaderPosition(immediate){var m=state.book;if(!m||!state.runtime)return;var save=function(){var x=readerCurrentProgressState();if(!x)return;var key=String(m.id||"")+"|"+String(x.index)+"|"+String(Math.round(x.offset));if(key===state.readingLastSavedKey)return;state.readingLastSavedKey=key;state.readingSaveSeq++;BookNoteReadestBridge.saveProgress(m.id,{progress:x.progress,locator:x.locator,position:{version:2,type:"reflow",documentStart:Number(x.locator&&x.locator.documentStart!=null?x.locator.documentStart:(x.index>=0&&x.offset>=0?Number((state.canonicalChapters[x.index]||state.chapters[x.index]||{}).textStart||0)+x.offset:0)),documentEnd:Number(x.locator&&x.locator.documentEnd!=null?x.locator.documentEnd:(x.index>=0&&x.offset>=0?Number((state.canonicalChapters[x.index]||state.chapters[x.index]||{}).textStart||0)+x.offset:0)),textQuote:(x.locator&&x.locator.textQuote)||{exact:"",prefix:"",suffix:""}}}).catch(function(e){console.warn("[Reader Position] save failed",e)});};if(immediate){clearTimeout(state.readingSaveTimer);state.readingSaveTimer=null;save();return;}clearTimeout(state.readingSaveTimer);state.readingSaveTimer=setTimeout(function(){state.readingSaveTimer=null;save();},280);}

function buildToc(){renderSide();updateTocActive()}
function isContentNote(a){return !!(a&&a.type==="note"&&(String(a.sourceType||"")==="selection-summary"||String(a.categoryType||"")==="summary"||String(a.summaryMode||"")==="selection"))}
function isContentAnnotation(a){return !!(a&&a.type==="note"&&String(a.sourceType||"")==="content-annotation")}
function sideSelectionBucket(){if(state.activeTab==="bookmarks")return state.sideSelection.bookmarks;if(state.activeTab==="contentNotes")return state.sideSelection.contentNotes;return state.sideSelection.annotations}
function clearSideSelection(){state.sideSelection.annotations={};state.sideSelection.bookmarks={};state.sideSelection.contentNotes={}}
function highlightColorMatches(a){if(state.highlightColorFilter==="all")return true;if(!a||a.type!=="highlight")return false;return String(a.color||"yellow").toLowerCase()===String(state.highlightColorFilter).toLowerCase()}
function sideSelectable(){return state.annotations.filter(function(a){if(state.activeTab==="bookmarks")return a.type==="bookmark"&&bookmarkFilterMatches(a);if(state.activeTab==="contentNotes")return isContentAnnotation(a)&&(state.contentAnnotationFilter==="all"||contentAnnotationStyleKey(a)===state.contentAnnotationFilter);return a.type!=="bookmark"&&!isContentNote(a)&&!isContentAnnotation(a)&&highlightColorMatches(a)})}
function wrapSideList(c,filterClass){c.classList.add("side-has-managed-list");var existing=c.querySelector('.side-list-scroll');if(existing)return existing;var start=c.querySelector(filterClass);if(!start)return null;var wrap=document.createElement('div');wrap.className='side-list-scroll';var n=start.nextSibling;while(n){var next=n.nextSibling;wrap.appendChild(n);n=next}c.appendChild(wrap);return wrap}
function sideRecordPosition(a){
  if(!a)return null;
  var loc=a.epubLocator||((a.locator&&String(a.locator.type||'')==='epub')?a.locator:null);
  if(loc){var sec=Number(loc.sectionIndex!=null?loc.sectionIndex:loc.spineIndex),st=Number(loc.start!=null?loc.start:a.start),en=Number(loc.end!=null?loc.end:st);return Number.isFinite(sec)&&Number.isFinite(st)?{section:sec,start:st,end:Number.isFinite(en)?en:st}:null;}
  var st2=Number(a.documentStart!=null?a.documentStart:a.start),en2=Number(a.documentEnd!=null?a.documentEnd:a.end);
  return Number.isFinite(st2)?{absolute:st2,end:Number.isFinite(en2)?en2:st2,section:Number(a.chapterIndex)||0}:null;
}
function currentReaderRecordPosition(){if(!state.runtime)return null;try{var cur=state.runtime.getCurrent&&state.runtime.getCurrent();if(!cur)return null;var idx=Number(cur.index)||0,off=Number(cur.offset)||0,sec=cur.section||state.chapters[idx]||{},absolute=Number(sec.textStart)+off;return {section:idx,start:off,absolute:Number.isFinite(absolute)?absolute:null};}catch(_){return null;}}
function syncManagedSideToReader(){
  var c=$('sideContent');if(!c||state.activeTab==='toc'||!c.classList.contains('side-has-managed-list'))return;
  var list=c.querySelector('.side-list-scroll');if(!list)return;
  var buttons=Array.prototype.slice.call(list.querySelectorAll('[data-aid]'));if(!buttons.length)return;
  var cur=currentReaderRecordPosition();if(!cur)return;
  var best=null,bestDistance=Infinity;
  var explicit=state.sideActiveId?buttons.find(function(b){return String(b.dataset.aid)===String(state.sideActiveId)}):null;
  buttons.forEach(function(b){var a=state.annotations.find(function(x){return String(x.id)===String(b.dataset.aid)});if(!a)return;var p=sideRecordPosition(a);if(!p)return;var d=Infinity,related=false;
    if(p.section!=null&&Number(p.section)===Number(cur.section)){var e=Number.isFinite(p.end)?p.end:p.start;related=cur.start>=p.start&&cur.start<=e;d=related?0:(cur.start<p.start?p.start-cur.start:cur.start-e);}
    else if(p.absolute!=null&&cur.absolute!=null){var e2=Number.isFinite(p.end)?p.end:p.absolute;related=cur.absolute>=p.absolute&&cur.absolute<=e2;d=related?0:Math.abs(cur.absolute-(cur.absolute<p.absolute?p.absolute:e2));}
    if(d<bestDistance){bestDistance=d;best=b;}
  });
  list.querySelectorAll('.side-record-current').forEach(function(x){x.classList.remove('side-record-current');x.removeAttribute('aria-current')});
  if(explicit)best=explicit;
  if(!best)return;best.classList.add('side-record-current');best.setAttribute('aria-current','location');
  if(list.scrollHeight>list.clientHeight+2){var br=best.getBoundingClientRect(),lr=list.getBoundingClientRect();if(br.top<lr.top||br.bottom>lr.bottom){try{best.scrollIntoView({block:'nearest',inline:'nearest'});}catch(_){} }}
}
function updateSideSelectionUI(){var c=$("sideContent"),bucket=sideSelectionBucket(),items=sideSelectable(),selected=items.filter(function(a){return !!bucket[String(a.id)]}),all=items.length>0&&selected.length===items.length;var master=c.querySelector("[data-side-select-all]");if(master){master.checked=all;master.indeterminate=selected.length>0&&!all}c.querySelectorAll("[data-side-select-aid]").forEach(function(x){x.checked=!!bucket[String(x.dataset.sideSelectAid)]});var count=c.querySelector("[data-side-selected-count]");if(count)count.textContent=selected.length?"已选 "+selected.length:"";var del=c.querySelector("[data-side-bulk-delete]");if(del)del.disabled=!selected.length}
async function bulkDeleteSideSelection(){var items=sideSelectable(),bucket=sideSelectionBucket(),selected=items.filter(function(a){return !!bucket[String(a.id)]});if(!selected.length)return;if(!confirm("确定删除已选择的 "+selected.length+" 个"+(state.activeTab==="bookmarks"?"书签":state.activeTab==="contentNotes"?"内容注释":"标注")+"吗？"))return;var ok=0,fail=0;for(var i=0;i<selected.length;i++){var a=selected[i];try{await BookNoteReadestBridge.removeAnnotation(a.id);state.annotations=state.annotations.filter(function(x){return String(x.id)!==String(a.id)});removeHighlightMarks(a.id);ok++}catch(e){console.error(e);fail++}}clearSideSelection();if(state.runtime&&state.runtime.iframe){if(state.activeTab==="bookmarks")renderChapterBookmarks(state.runtime.iframe.contentDocument,state.currentChapter);if(state.activeTab==="contentNotes")renderChapterContentAnnotations(state.runtime.iframe.contentDocument,state.currentChapter)}renderSide();toast(fail?"已删除 "+ok+" 个，失败 "+fail+" 个":"已删除 "+ok+" 个"+(state.activeTab==="bookmarks"?"书签":state.activeTab==="contentNotes"?"内容注释":"标注"))}
function odtU16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function odtU32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function odtCat(){var a=Array.prototype.slice.call(arguments),len=a.reduce(function(n,x){return n+(x?x.length:0)},0),out=new Uint8Array(len),o=0;a.forEach(function(x){if(x){out.set(x,o);o+=x.length}});return out}
function odtCrc32(bytes){var c=~0;for(var i=0;i<bytes.length;i++){c^=bytes[i];for(var k=0;k<8;k++)c=(c>>>1)^((c&1)?0xEDB88320:0)}return (~c)>>>0}
function buildStoredOdt(entries){var enc=new TextEncoder(),locals=[],centrals=[],offset=0;entries.forEach(function(e){var name=enc.encode(e.name),data=e.data instanceof Uint8Array?e.data:enc.encode(String(e.data)),crc=odtCrc32(data),local=odtCat(new Uint8Array([80,75,3,4]),odtU16(20),odtU16(0x0800),odtU16(0),odtU16(0),odtU16(0),odtU32(crc),odtU32(data.length),odtU32(data.length),odtU16(name.length),odtU16(0),name,data),central=odtCat(new Uint8Array([80,75,1,2]),odtU16(20),odtU16(20),odtU16(0x0800),odtU16(0),odtU16(0),odtU16(0),odtU32(crc),odtU32(data.length),odtU32(data.length),odtU16(name.length),odtU16(0),odtU16(0),odtU16(0),odtU16(0),odtU32(0),odtU32(offset),name);locals.push(local);centrals.push(central);offset+=local.length});var central=odtCat.apply(null,centrals),local=odtCat.apply(null,locals),end=odtCat(new Uint8Array([80,75,5,6]),odtU16(0),odtU16(0),odtU16(entries.length),odtU16(entries.length),odtU32(central.length),odtU32(local.length),odtU16(0));return new Blob([odtCat(local,central,end)],{type:'application/vnd.oasis.opendocument.text'})}
function xmlEscOdt(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function annotationExportFileName(items){var list=Array.isArray(items)?items:[],first=list[0]||{},style=getContentAnnotationStyle(contentAnnotationStyleKey(first)),title=String(state.book&&(state.book.documentTitle||state.book.name)||'未命名书籍').trim()||'未命名书籍',quote=String(first.text||'').replace(/\s+/g,'').trim().slice(0,8)||'无原文';return (style.label+'-'+title+'-'+quote+'……').replace(/[\\/:*?"<>|\r\n]+/g,'-').slice(0,180)+'.odt'}
function buildContentAnnotationsOdt(items){
  var list=Array.isArray(items)?items.filter(isContentAnnotation):[],
      title=String(state.book&&(state.book.documentTitle||state.book.name)||'未命名书籍').trim()||'未命名书籍',
      body=['<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:automatic-styles>',
      '<style:style style:name="BN_NUM" style:family="paragraph"><style:paragraph-properties fo:text-indent="0"/><style:text-properties fo:font-weight="bold" fo:font-size="12pt"/></style:style>',
      '<style:style style:name="BN_BOOK" style:family="paragraph"><style:paragraph-properties fo:text-indent="0" fo:text-align="start"/><style:text-properties fo:font-size="12pt"/></style:style>',
      '<style:style style:name="BN_CHAPTER" style:family="paragraph"><style:paragraph-properties fo:text-indent="0"/><style:text-properties fo:font-size="12pt"/></style:style>',
      '<style:style style:name="BN_LABEL" style:family="paragraph"><style:paragraph-properties fo:text-indent="0"/><style:text-properties fo:font-weight="bold" fo:font-size="12pt"/></style:style>',
      '<style:style style:name="BN_BODY" style:family="paragraph"><style:paragraph-properties fo:text-indent="24pt"/><style:text-properties fo:font-size="12pt"/></style:style>',
      '</office:automatic-styles><office:body><office:text>'];
  list.forEach(function(a,index){
    var style=getContentAnnotationStyle(contentAnnotationStyleKey(a)),
        text=String(a.text||'').trim(),note=String(a.note||'').trim(),chapter=String(a.chapterLabel||'').trim(),
        normalizedTitle=title.replace(/^《+|》+$/g,'').trim()||'未命名书籍',bookTitle='《'+normalizedTitle+'》';
    body.push('<text:p text:style-name="BN_NUM">'+xmlEscOdt((index+1)+'、')+'</text:p>');
    body.push('<text:p text:style-name="BN_BOOK">'+xmlEscOdt(bookTitle)+'</text:p>');
    if(chapter)body.push('<text:p text:style-name="BN_CHAPTER">'+xmlEscOdt(chapter)+'</text:p>');
    body.push('<text:p/>');
    body.push('<text:p text:style-name="BN_LABEL">'+xmlEscOdt('注释类别：'+style.label)+'</text:p>');
    body.push('<text:p/>');
    body.push('<text:p text:style-name="BN_LABEL">原文：</text:p>');
    body.push('<text:p text:style-name="BN_BODY" xml:space="preserve">'+xmlEscOdt(text||'（无原文）')+'</text:p>');
    body.push('<text:p/>');
    body.push('<text:p text:style-name="BN_LABEL">注释：</text:p>');
    body.push('<text:p text:style-name="BN_BODY" xml:space="preserve">'+xmlEscOdt(note||'（无编辑内容）')+'</text:p>');
    if(index<list.length-1)body.push('<text:p/>');
  });
  body.push('</office:text></office:body></office:document-content>');
  var styles='<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2"><office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles></office:document-styles>',
      manifest='<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/></manifest:manifest>';
  return buildStoredOdt([{name:'mimetype',data:'application/vnd.oasis.opendocument.text'},{name:'content.xml',data:body.join('')},{name:'styles.xml',data:styles},{name:'META-INF/manifest.xml',data:manifest}]);
}
async function exportContentAnnotations(items){
  var list=Array.isArray(items)?items.filter(isContentAnnotation):[];
  if(!list.length){toast('没有可导出的内容注释');return false;}
  try{
    var blob=buildContentAnnotationsOdt(list),
        url=URL.createObjectURL(blob),
        a=document.createElement('a');
    a.href=url;
    a.download=annotationExportFileName(list);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){URL.revokeObjectURL(url)},1000);
    toast('已导出 '+list.length+' 条内容注释');
    return true;
  }catch(e){
    console.error('Content annotation ODT export failed',e);
    toast('内容注释导出失败');
    return false;
  }
}

function searchExportBookTitle(){
  var t=String(state.book&&(state.book.documentTitle||state.book.name||state.book.pageTitle)||'未命名书籍').trim()||'未命名书籍';
  return t.replace(/^《+|》+$/g,'').trim()||'未命名书籍';
}
function searchExportChapterLabel(hit){
  if(!hit)return '';
  var idx=Number(hit.logicalChapterIndex);
  if(!Number.isFinite(idx)||idx<0)idx=Number(hit.chapterIndex);
  var list=state.canonicalChapters.length?state.canonicalChapters:state.chapters;
  var c=(list&&list[idx])||{};
  return String(hit.chapterLabel||c.label||'').trim();
}
function searchExportNormalizeParagraphText(value){
  var s=String(value==null?'':value).replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ');
  /* Remove only structural blank lines around the paragraph. Internal line
     breaks are retained so source indentation/line layout is not destroyed. */
  s=s.replace(/^\n+|\n+$/g,'');
  s=s.replace(/\n{3,}/g,'\n\n');
  return s;
}
function searchExportActualDomBlockForHit(hit){
  if(!hit||!state.runtime||!state.runtime.iframe||state.runtime.isEpubMulti&&state.runtime.isEpubMulti())return null;
  var doc=state.runtime.iframe.contentDocument;if(!doc)return null;
  var idx=Number(hit.chapterIndex);if(!Number.isFinite(idx))return null;
  var list=state.canonicalChapters.length?state.canonicalChapters:state.chapters,canon=list[idx]||{};
  var base=Number(canon.textStart)||0,start=Math.max(0,Number(hit.start)-base),end=Math.max(start,Number(hit.end)-base),q=String(hit.quote||hit.text||'');
  if(!q||end<=start)return null;
  var mapped=null;
  try{mapped=state.runtime.canonicalToDom(idx,start,end,q,{strict:true});}catch(_){mapped=null;}
  if(!mapped||!mapped.start||!mapped.end)return null;
  var r;
  try{r=doc.createRange();r.setStart(mapped.start.node,mapped.start.offset);r.setEnd(mapped.end.node,mapped.end.offset);}catch(_){return null;}
  if(r.collapsed||strictReaderText(r.toString())!==strictReaderText(q))return null;
  var node=mapped.start.node&&mapped.start.node.nodeType===1?mapped.start.node:mapped.start.node&&mapped.start.node.parentElement;
  var endNode=mapped.end.node&&mapped.end.node.nodeType===1?mapped.end.node:mapped.end.node&&mapped.end.node.parentElement;
  var block=null;
  function nearest(el){
    while(el&&el!==doc.body&&el.nodeType===1){
      var tag=String(el.tagName||'').toLowerCase();
      if(/^(p|h[1-6]|blockquote|pre|li|td|th|dt|dd)$/.test(tag)||el.classList&&(/txt-paragraph|booknote-normal-block|booknote-html-paragraph|dm-paragraph/.test(el.className||'')))return el;
      el=el.parentElement;
    }
    return null;
  }
  block=nearest(node)||nearest(endNode);
  if(!block){
    /* TXT paragraphs are explicit source blocks even when their text contains
       several line spans. Use the source range as the authoritative boundary. */
    var sourceNode=mapped.start.node&&mapped.start.node.parentElement&&mapped.start.node.parentElement.closest?mapped.start.node.parentElement.closest('[data-txt-source-start][data-txt-source-end]'):null;
    if(sourceNode)block=sourceNode.closest('p')||sourceNode;
  }
  if(!block)return null;
  var text=searchExportNormalizeParagraphText(block.textContent||'');if(!text)return null;
  var chapter=searchExportChapterLabel(hit),html=block.outerHTML||'';
  var paragraphStyle=null;
  try{var cs=doc.defaultView&&doc.defaultView.getComputedStyle?doc.defaultView.getComputedStyle(block):null;if(cs)paragraphStyle={marginLeft:String(cs.marginLeft||''),textIndent:String(cs.textIndent||''),marginRight:String(cs.marginRight||''),textAlign:String(cs.textAlign||''),lineHeight:String(cs.lineHeight||''),direction:String(cs.direction||'')};}catch(_){ }
  var key='dom:'+String(idx)+'|'+String(block.getAttribute&&block.getAttribute('data-txt-source-start')||'')+'|'+String(block.getAttribute&&block.getAttribute('data-txt-source-end')||'')+'|'+String(block.tagName||'')+'|'+String(text.slice(0,80));
  return {text:text,html:html,paragraphStyle:paragraphStyle,block:block,blockKey:key,chapter:chapter};
}
function searchExportEpubBlockForHit(hit){
  if(!hit||!state.runtime||!state.runtime.book||!state.runtime.book.epubModel)return null;
  var model=state.runtime.book.epubModel,sectionIndex=Number(hit.sectionIndex!=null?hit.sectionIndex:hit.chapterIndex);
  if(!Number.isFinite(sectionIndex))return null;
  var sections=Array.isArray(model.sections)?model.sections:[],section=sections.find(function(x){return Number(x&&x.index)===sectionIndex;})||sections[sectionIndex];
  if(!section||!section.model||!section.model.textIndex)return null;

  /* EPUB export must resolve the paragraph from the EXACT hit coordinates.
     The old path trusted blockId -> model.blocks[].element. That is unsafe because
     buildSection() deliberately treats DIV/SECTION/ARTICLE as fallback blocks; in
     real EPUB XHTML those containers can wrap many <p> elements. The result was
     a whole container (sometimes a whole chapter) being exported instead of the
     paragraph containing the selected hit. */
  var index=section.model.textIndex,hs=Number(hit.localStart),he=Number(hit.localEnd);
  if(!Number.isFinite(hs))hs=Number(hit.epubLocator&&hit.epubLocator.start);
  if(!Number.isFinite(he))he=Number(hit.epubLocator&&hit.epubLocator.end);
  if(!Number.isFinite(hs)||!Number.isFinite(he)||he<=hs)return null;
  hs=Math.max(0,Math.min(index.length,hs));he=Math.max(hs,Math.min(index.length,he));
  var spans=globalThis.BookNoteEpubMultiModule&&globalThis.BookNoteEpubMultiModule.spansForRange?globalThis.BookNoteEpubMultiModule.spansForRange(index,hs,he):null;
  if(!spans||!spans.length)return null;
  var startNode=index.nodes[spans[0].nodeIndex]&&index.nodes[spans[0].nodeIndex].node;
  var endNode=index.nodes[spans[spans.length-1].nodeIndex]&&index.nodes[spans[spans.length-1].nodeIndex].node;
  if(!startNode||!endNode)return null;

  var doc=startNode.ownerDocument,range=null;
  try{
    var rr=doc.createRange();
    rr.setStart(startNode,spans[0].startOffset);
    rr.setEnd(endNode,spans[spans.length-1].endOffset);
    range=rr;
    if(!range||range.collapsed||strictReaderText(range.toString())!==strictReaderText(String(hit.text||hit.quote||'')))return null;
  }catch(_){return null;}

  function nearestParagraph(node){
    var el=node&&node.nodeType===1?node:node&&node.parentElement;
    while(el&&el!==doc.body){
      var tag=String(el.tagName||'').toLowerCase(),role=String(el.getAttribute&&el.getAttribute('data-booknote-role')||'').toLowerCase();
      if(/^(p|h[1-6]|blockquote|pre|li|td|th|dt|dd|figcaption)$/.test(tag)||/^(paragraph|chapter|part|heading)$/.test(role))return el;
      el=el.parentElement;
    }
    return null;
  }

  /* Prefer the actual semantic paragraph containing the hit. Only if the EPUB
     has no semantic paragraph element do we fall back to the model block. */
  var el=nearestParagraph(startNode)||nearestParagraph(endNode),match=null;
  if(el){
    /* Verify the chosen element really contains the exact hit and does not
       accidentally span across a neighboring block. */
    try{var probe=doc.createRange();probe.selectNodeContents(el);if(!probe.intersectsNode(startNode)||!probe.intersectsNode(endNode))el=null;}catch(_){ }
  }
  if(!el){
    var blocks=Array.isArray(section.model.blocks)?section.model.blocks:[];
    if(String(hit.blockId||'').trim())match=blocks.find(function(b){return String(b&&b.id||'')===String(hit.blockId);})||null;
    if(!match)match=blocks.find(function(b){return hs>=Number(b.start||0)&&hs<Number(b.end||0);})||null;
    if(!match||!match.element)return null;
    el=match.element;
  }

  var text=searchExportNormalizeParagraphText(el.textContent||'');if(!text)return null;
  /* Final containment check: the exported text itself must contain the exact
     searched occurrence. This prevents any structural fallback from exporting
     an unrelated block. */
  var q=String(hit.text||hit.quote||'');
  if(q&&strictReaderText(text).indexOf(strictReaderText(q))<0)return null;
  var html=el.outerHTML?String(el.outerHTML):'',paragraphStyle=null;
  try{if(el.ownerDocument&&el.ownerDocument.defaultView&&el.ownerDocument.defaultView.getComputedStyle){var cs=el.ownerDocument.defaultView.getComputedStyle(el);paragraphStyle={marginLeft:String(cs.marginLeft||''),textIndent:String(cs.textIndent||''),marginRight:String(cs.marginRight||''),textAlign:String(cs.textAlign||''),lineHeight:String(cs.lineHeight||''),direction:String(cs.direction||'')};}}catch(_){paragraphStyle=null;}
  var blockId=match&&match.id?String(match.id):String(el.getAttribute&&el.getAttribute('id')||'');
  return {text:text,html:html,paragraphStyle:paragraphStyle,block:match||{element:el,id:blockId,start:hs,end:he},blockKey:'epub:'+sectionIndex+':'+blockId+':'+hs+':'+he,chapter:searchExportChapterLabel(hit)};
}
function searchExportPlainTextBlockForHit(hit){
  var idx=Number(hit&&hit.chapterIndex);if(!Number.isFinite(idx))return null;
  var list=state.canonicalChapters.length?state.canonicalChapters:state.chapters,ch=list[idx]||{},text=String(ch.text||'');if(!text)return null;
  var base=Number(ch.textStart)||0,pos=Math.max(0,Math.min(text.length,Number(hit.start)-base));
  var lineStart=text.lastIndexOf('\n',pos-1)+1,lineEnd=text.indexOf('\n',pos);if(lineEnd<0)lineEnd=text.length;
  /* A paragraph is blank-line delimited; source-indented TXT lines are also
     paragraph starts according to the existing TXT rendering contract. */
  var starts=[0],i;
  for(i=0;i<text.length;i++)if(text[i]==='\n'){
    var next=i+1;if(next<text.length&&text[next]==='\n')starts.push(next+1);
    else if(next<text.length&&/^(?:[\u3000\u00a0]| {2,}|\t)/.test(text.slice(next,next+8)))starts.push(next);
  }
  starts.push(text.length);
  var st=0,en=text.length;
  for(i=0;i<starts.length-1;i++)if(pos>=starts[i]&&pos<starts[i+1]){st=starts[i];en=starts[i+1];break;}
  var para=searchExportNormalizeParagraphText(text.slice(st,en));if(!para)return null;
  return {text:para,html:'',paragraphStyle:null,block:null,blockKey:'text:'+idx+':'+st+':'+en,chapter:searchExportChapterLabel(hit)||String(ch.label||'').trim()};
}
function searchExportBlockForHit(hit){
  if(!hit)return null;
  if(String(hit.format||'').toLowerCase()==='epub'){
    var epub=searchExportEpubBlockForHit(hit);if(epub)return epub;
    return null;
  }
  /* The live reader DOM is authoritative for the paragraph boundary. This
     prevents a chapter-sized canonical block from being exported as a whole. */
  var live=searchExportActualDomBlockForHit(hit);if(live)return live;
  var blocks=state.canonicalDocument&&Array.isArray(state.canonicalDocument.blocks)?state.canonicalDocument.blocks:[],pos=Number(hit.start);
  if(Number.isFinite(pos)&&blocks.length){var b=blocks.find(function(x){return pos>=Number(x.textStart||0)&&pos<Number(x.textEnd||0);});if(b&&String(b.text||'').trim()){var chText=String((state.canonicalChapters[b.chapterIndex!=null?b.chapterIndex:hit.chapterIndex]||{}).text||'');var wholeChapter=chText&&String(b.text||'').trim()===chText.trim();if(!wholeChapter||String((state.source&&state.source.format)||'').toLowerCase()==='epub')return {text:searchExportNormalizeParagraphText(b.text),html:String(b.html||''),block:b,blockKey:'canonical:'+String(b.chapterIndex!=null?b.chapterIndex:hit.chapterIndex)+'|'+String(b.id||'')+'|'+String(b.textStart!=null?b.textStart:pos),chapter:searchExportChapterLabel(hit)};}}
  return searchExportPlainTextBlockForHit(hit);
}
async function searchExportParagraphsForHits(hits){
  var sourceHits=Array.isArray(hits)?hits:[],out=[];
  if(!sourceHits.length)return out;

  /* Export-count contract:
   * - state.hits is the authoritative search-hit list (the same list used by
   *   the reader's N / TOTAL counter and prev/next navigation).
   * - Every hit is resolved independently to the actual paragraph containing
   *   that hit. Therefore "5 / 22" + current hitIndex=4 exports ONLY hit #5's
   *   paragraph, while "22" total hits produces 22 hit->paragraph records.
   * - Do not collapse records merely because two hits happen to be in the same
   *   paragraph. The export count must correspond to the search-hit count.
   * - Never use the search snippet, whole chapter, or whole book as a fallback.
   */
  for(var hi=0;hi<sourceHits.length;hi++){
    var hit=sourceHits[hi], item=null;
    try{
      /* First use the same exact paragraph resolver used by current-hit export.
       * This keeps current/all export on one boundary contract. */
      item=searchExportBlockForHit(hit);
    }catch(e){console.warn('[Search Export] exact paragraph resolver failed',e);}

    /* For non-EPUB documents the live DOM may not currently contain the hit's
     * chapter. Resolve from the Library DB paragraph offsets instead. */
    if(!item && String(hit&&hit.format||'').toLowerCase()!=='epub' &&
       globalThis.BookLibraryDB&&state.book&&state.book.id){
      try{
        var content=await BookLibraryDB.getContent(String(state.book.id));
        var body=String(content&&content.text||'');
        var chapters=content&&Array.isArray(content.chapters)?content.chapters:[];
        var pos=Number(hit&&hit.start);
        if(Number.isFinite(pos)&&body){
          var ch=null,ci=-1;
          for(var i=0;i<chapters.length;i++){
            var c=chapters[i]||{},cs=Number(c.textStart||0),ce=Number(c.textEnd!=null?c.textEnd:body.length);
            if(pos>=cs&&pos<ce){ch=c;ci=Number(c.index!=null?c.index:i);break;}
          }
          if(ch){
            var base=Number(ch.textStart)||0,local=Math.max(0,pos-base),ps=Array.isArray(ch.paragraphs)?ch.paragraphs:[],pp=null;
            for(var j=0;j<ps.length;j++){
              var q=ps[j]||{},st=Number(q.start),en=Number(q.end);
              if(Number.isFinite(st)&&Number.isFinite(en)&&local>=st&&local<en){pp=q;break;}
            }
            if(pp){
              var absStart=base+Math.max(0,Number(pp.start)||0),absEnd=base+Math.max(Number(pp.end)||0,Number(pp.start)||0),text=searchExportNormalizeParagraphText(body.slice(absStart,absEnd));
              if(text)item={text:text,html:'',paragraphStyle:null,block:null,blockKey:'source-paragraph:'+ci+'|'+absStart+'|'+absEnd+'|hit:'+hi,chapter:String(ch.label||'').trim()||searchExportChapterLabel(hit)};
            }
          }
        }
      }catch(e){console.warn('[Search Export] DB paragraph resolution failed',e);}
    }

    if(item&&String(item.text||'').trim()){
      /* Keep one record per search hit. blockKey includes hit index so a
       * repeated term in one paragraph remains tied to its counted hit. */
      item.searchHitIndex=hi;
      item.searchHitTotal=sourceHits.length;
      out.push(item);
    }
  }
  return out;
}
function searchExportSourceIndent(source){
  /* Unified ODT rule: explicit non-zero text-indent is preserved semantically;
     missing/zero/invalid indentation defaults to 2em. ODT receives absolute
     points because fo:text-indent relative CSS units are not reliably rendered. */
  var raw='';
  try{
    if(source&&source.nodeType===1)raw=String(source.getAttribute('style')||'');
    else if(source&&typeof source==='object')raw=String(source.textIndent||source['text-indent']||'');
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
function searchExportParagraphStyle(source,name){
  var indent=searchExportSourceIndent(source);
  return '<style:style style:name="'+name+'" style:family="paragraph"><style:paragraph-properties fo:text-indent="'+xmlEscOdt(indent)+'"/><style:text-properties fo:font-size="12pt"/></style:style>';
}
function searchExportParagraphXml(item,index){
  var html=String(item&&item.html||''),text=String(item&&item.text||'').replace(/\r\n?/g,'\n');
  var styleName='SE_P_'+index,source=item&&item.paragraphStyle||html,isHeading=false;
  try{if(html){var d=new DOMParser().parseFromString(html,'text/html'),el=d.body&&d.body.firstElementChild;isHeading=!!el&&/^H[1-6]$/i.test(String(el.tagName||''));}}catch(_){}
  var style=isHeading?'<style:style style:name="'+styleName+'" style:family="paragraph"><style:paragraph-properties fo:text-indent="0"/><style:text-properties fo:font-size="12pt"/></style:style>':searchExportParagraphStyle(source,styleName),body='';
  var parts=text.split('\n');parts.forEach(function(line,li){if(li)body+='<text:line-break/>';body+=line?xmlEscOdt(line):'&#160;';});
  var attrs=' xml:space="preserve"';if(style)attrs+=' text:style-name="'+styleName+'"';
  return {xml:'<text:p'+attrs+'>'+body+'</text:p>',style:style};
}
function buildSearchParagraphOdt(items,searchQuery,occurrenceCount){
  var list=Array.isArray(items)?items:[],styles=['<style:style style:name="SE_Stat" style:family="paragraph"><style:paragraph-properties fo:text-indent="0" fo:text-align="start"/><style:text-properties fo:font-size="12pt"/></style:style><style:style style:name="SE_Num" style:family="paragraph"><style:paragraph-properties fo:text-indent="0"/><style:text-properties fo:font-weight="bold" fo:font-size="12pt"/></style:style>','<style:style style:name="SE_BookStart" style:family="paragraph"><style:paragraph-properties fo:text-indent="0" fo:text-align="start"/><style:text-properties fo:font-size="12pt"/></style:style>','<style:style style:name="SE_Chapter" style:family="paragraph"><style:paragraph-properties fo:text-indent="0"/><style:text-properties fo:font-size="12pt"/></style:style>','<style:style style:name="SE_Label" style:family="paragraph"><style:paragraph-properties fo:text-indent="0"/><style:text-properties fo:font-weight="bold" fo:font-size="12pt"/></style:style>','<style:style style:name="SE_BookEnd" style:family="paragraph"><style:paragraph-properties fo:text-indent="0" fo:text-align="end"/><style:text-properties fo:font-size="12pt"/></style:style>'],body=[];
  var books=[];list.forEach(function(item){var t=String(titleSafeSearchExportBookTitle(item)||'未命名书籍').replace(/^《|》$/g,'').trim();if(t&&books.indexOf(t)<0)books.push(t);});
  var statsQuery=String(searchQuery||'').trim(),statsOccurrences=Number(occurrenceCount);if(!Number.isFinite(statsOccurrences)||statsOccurrences<0)statsOccurrences=list.length;
  var stats=[];
  stats.push('<text:p text:style-name="SE_Stat">'+xmlEscOdt('搜索内容：'+statsQuery)+'</text:p>');
  stats.push('<text:p text:style-name="SE_Stat">'+xmlEscOdt('出现次数：共 '+statsOccurrences+' 次')+'</text:p>');
  stats.push('<text:p text:style-name="SE_Stat">'+xmlEscOdt('段落：共 '+list.length+' 段')+'</text:p>');
  stats.push('<text:p text:style-name="SE_Stat">'+xmlEscOdt('分别来自：'+(books.length?'全部'+books.map(function(t){return '《'+t+'》';}).join('、'):'无'))+'</text:p>');
  stats.push('<text:p/>');
  list.forEach(function(item,index){
    var px=searchExportParagraphXml(item,index);if(px.style)styles.push(px.style);
    body.push('<text:p text:style-name="SE_Num">'+xmlEscOdt((index+1)+'、')+'</text:p>');
    body.push('<text:p text:style-name="SE_BookStart">'+xmlEscOdt('《'+titleSafeSearchExportBookTitle(item)+'》')+'</text:p>');
    if(String(item.chapter||'').trim())body.push('<text:p text:style-name="SE_Chapter">'+xmlEscOdt(item.chapter.trim())+'</text:p>');
    body.push('<text:p text:style-name="SE_Label">段落：</text:p>');
    body.push(px.xml);
    body.push('<text:p text:style-name="SE_BookEnd">'+xmlEscOdt('《'+titleSafeSearchExportBookTitle(item)+'》')+'</text:p>');
    if(index<list.length-1)body.push('<text:p/>');
  });
  var content='<?xml version="1.0" encoding="UTF-8"?>'+
    '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xml="http://www.w3.org/XML/1998/namespace" office:version="1.2">'+
    '<office:automatic-styles>'+styles.join('')+'</office:automatic-styles><office:body><office:text>'+stats.join('')+body.join('')+'</office:text></office:body></office:document-content>';
  var stylesXml='<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2"><office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles></office:document-styles>';
  var manifest='<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/></manifest:manifest>';
  return buildStoredOdt([{name:'mimetype',data:'application/vnd.oasis.opendocument.text'},{name:'content.xml',data:content},{name:'styles.xml',data:stylesXml},{name:'META-INF/manifest.xml',data:manifest}]);
}
function titleSafeSearchExportBookTitle(item){
  return searchExportBookTitle();
}
function safeSearchExportFilename(q){var n=String(q||'搜索内容').replace(/[\\/:*?"<>|]+/g,'_').replace(/[\x00-\x1f]/g,'_').trim();return (n||'搜索内容').slice(0,180)+'.odt';}
function downloadSearchOdt(items,q,label,occurrenceCount){
  var list=Array.isArray(items)?items:[];if(!list.length){toast('没有可导出的搜索段落');return false;}
  try{var blob=buildSearchParagraphOdt(list,q,occurrenceCount),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safeSearchExportFilename(q);document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000);toast('已导出 '+list.length+' 个搜索段落');return true;}catch(e){console.error('[Search ODT Export]',e);toast(label+'失败');return false;}
}
async function exportAllReaderSearch(){var q=String($('searchInput')&&$('searchInput').value||'').trim(),items=await searchExportParagraphsForHits(state.hits);return downloadSearchOdt(items,q,'导出全部搜索',state.hits.length);}
async function exportCurrentReaderSearch(){var q=String($('searchInput')&&$('searchInput').value||'').trim(),h=state.hits[state.hitIndex],items=h?await searchExportParagraphsForHits([h]):[];return downloadSearchOdt(items,q,'导出当前搜索',state.hits.length);}

function renderSide(){var c=$("sideContent");c.classList.remove("side-has-managed-list");if(state.activeTab==="toc"){clearSideSelection();var tree=Array.isArray(state.toc)&&state.toc.length?state.toc:state.chapters.map(function(x,i){return {label:x.label,index:i,headingLevel:Number(x.headingLevel)||1,children:[]}});function renderTree(nodes){return (nodes||[]).map(function(x){var i=Number(x.index),lv=Math.max(1,Math.min(6,Number(x.headingLevel)||1));var btn=i>=0?'<button class="side-item side-item-level-'+lv+'" data-i="'+i+'" data-level="'+lv+'"><span class="side-item-label">'+esc(x.label||'')+'</span></button>':'';var kids=x.children&&x.children.length?'<div class="side-toc-children side-toc-level-'+lv+'">'+renderTree(x.children)+'</div>':'';return btn+kids}).join('')}c.innerHTML=renderTree(tree)||'<div class="empty">暂无目录</div>';c.querySelectorAll('[data-i]').forEach(function(b){b.onclick=function(e){e.preventDefault();var idx=Number(b.dataset.i);if(!Number.isFinite(idx)||idx<0||idx>=state.chapters.length)return;var node=null;var walk=function(nodes){for(var z=0;z<(nodes||[]).length;z++){var x=nodes[z];if(Number(x.index)===idx)return x;var y=walk(x&&x.children);if(y)return y;}return null};node=walk(state.toc||[]);var targetChapter=idx,targetOffset=0;if(node){if(node.chapterIndex!=null&&Number.isFinite(Number(node.chapterIndex)))targetChapter=Math.floor(Number(node.chapterIndex));if(node.start!=null&&Number.isFinite(Number(node.start)))targetOffset=Math.max(0,Number(node.start));else if(node.offset!=null&&Number.isFinite(Number(node.offset)))targetOffset=Math.max(0,Number(node.offset));}var __tocSec=state.chapters[idx]||{};targetChapter=Math.max(0,Math.min(state.chapters.length-1,targetChapter));state.currentChapter=targetChapter;state.tocActiveIndex=-1;updateTocActive(true);Promise.resolve(showChapter(targetChapter,targetOffset,"")).finally(function(){state.currentChapter=targetChapter;updateTocActive(true);});}});updateTocActive(true)}else if(state.activeTab==="annotations"){var arr=state.annotations.filter(function(a){return a.type!=="bookmark"&&!isContentNote(a)&&!isContentAnnotation(a)&&highlightColorMatches(a)}),allArr=state.annotations.filter(function(a){return a.type!=="bookmark"&&!isContentNote(a)&&!isContentAnnotation(a)}),highlightArr=state.annotations.filter(function(a){return a.type==="highlight"}),counts={};highlightArr.forEach(function(a){var k=String(a.color||"yellow").toLowerCase();counts[k]=(counts[k]||0)+1});var colors=HIGHLIGHT_COLORS;var filterHtml='<div class="side-color-manager"><div class="side-color-head"><span>颜色归类</span><strong data-side-color-label>'+(state.highlightColorFilter==="all"?"全部高亮 · "+highlightArr.length:(getHighlightColorMeta(state.highlightColorFilter).heart+" "+getHighlightColorMeta(state.highlightColorFilter).label+" · "+(counts[state.highlightColorFilter]||0)))+'</strong></div><div class="side-color-chips"><button type="button" class="side-color-chip side-color-chip-all" data-side-color="all" title="全部：'+highlightArr.length+' 条"><span class="side-color-chip-symbol">全部</span><span class="side-color-chip-label">全部</span><em>'+(highlightArr.length||0)+'</em></button>'+colors.map(function(x){return '<button type="button" class="side-color-chip side-color-chip-'+x.key+'" data-side-color="'+x.key+'" title="'+x.label+'：'+(counts[x.key]||0)+' 条"><span class="side-color-chip-symbol side-color-heart side-color-heart-'+x.key+'" aria-hidden="true">'+x.heart+'</span><span class="side-color-chip-label">'+x.label+'</span><em>'+(counts[x.key]||0)+'</em></button>'}).join('')+'</div><input class="side-color-slider" data-side-color-slider type="range" min="0" max="6" step="1" value="'+(state.highlightColorFilter==="all"?0:(colors.findIndex(function(x){return x.key===state.highlightColorFilter})+1)||0)+'" aria-label="按高亮颜色筛选"><div class="side-color-scale"><span>全部</span><span>黄色</span><span>红色</span><span>粉红</span><span>绿色</span><span>蓝色</span><span>紫色</span></div></div>';c.innerHTML=filterHtml+(arr.length?'<div class="side-bulkbar"><label class="side-select-all"><input type="checkbox" data-side-select-all> <span>全选</span></label><span class="side-selected-count" data-side-selected-count></span><button type="button" class="side-bulk-delete" data-side-bulk-delete disabled title="删除所选">删除所选</button></div>'+arr.map(function(a){var cm=getHighlightColorMeta(a.color),markIcon=a.type==="highlight"?'<span class="side-highlight-heart side-highlight-heart-'+cm.key+'" aria-hidden="true">'+cm.heart+'</span>':bnIcon(a.type==="quote"?"note":"note","sm");var selectedText=String(a.text||"").replace(/\s+/g," ").trim();var noteText=String(a.note||"").replace(/\s+/g," ").trim();if(!selectedText)selectedText=noteText||"（未保存选中内容）";if(selectedText.length>72)selectedText=selectedText.slice(0,72)+"…";return '<div class="side-annotation-row'+(a.type==="highlight"?" side-annotation-row-highlight":"")+'"><label class="side-row-check" title="选择标注"><input type="checkbox" data-side-select-aid="'+esc(a.id)+'" aria-label="选择标注"></label><button class="side-annotation-jump" data-aid="'+esc(a.id)+'" type="button"><span class="side-annotation-title">'+markIcon+'<b>'+esc(a.type==="highlight"?"高亮":a.type==="quote"?"摘录":(a.categoryType==="summary"||a.sourceType==="selection-summary"?"摘要笔记":"笔记"))+'</b>'+(a.type==="highlight"?'<small>'+esc(cm.label)+'</small>':'')+'</span><span class="side-meta side-annotation-text" title="'+esc(selectedText)+'">'+esc(selectedText)+'</span>'+(noteText?'<span class="side-meta side-annotation-note">'+esc(noteText.length>48?noteText.slice(0,48)+"…":noteText)+'</span>':'')+'</button><button class="side-annotation-delete" data-delete-aid="'+esc(a.id)+'" type="button" title="删除标注" aria-label="删除标注"><img class="side-annotation-delete-icon" src="../img/ui/delete.png" alt=""></button></div>'}).join(''):'<div class="empty">'+(allArr.length?'当前颜色暂无标注':'暂无标注')+'</div>');wrapSideList(c,'.side-color-manager');c.querySelectorAll('[data-side-color]').forEach(function(b){b.onclick=function(e){e.preventDefault();state.highlightColorFilter=b.dataset.sideColor||"all";clearSideSelection();renderSide()}});var slider=c.querySelector('[data-side-color-slider]');if(slider)slider.oninput=function(){var v=Number(slider.value)||0;state.highlightColorFilter=v===0?"all":colors[v-1].key;clearSideSelection();renderSide();requestAnimationFrame(function(){var n=c.querySelector('[data-side-color-slider]');if(n){n.value=String(v);try{n.focus({preventScroll:true})}catch(_){}}syncManagedSideToReader()})};}else if(state.activeTab==="contentNotes"){
 var allNoteArr=state.annotations.filter(function(a){return isContentAnnotation(a)}),filteredNoteArr=allNoteArr.filter(function(a){return state.contentAnnotationFilter==="all"||contentAnnotationStyleKey(a)===state.contentAnnotationFilter}),styleCounts={};
 allNoteArr.forEach(function(a){var k=contentAnnotationStyleKey(a);styleCounts[k]=(styleCounts[k]||0)+1});
 var activeStyle=state.contentAnnotationFilter==="all"?null:getContentAnnotationStyle(state.contentAnnotationFilter);
 var noteHeader='<div class="side-content-note-manager"><div class="side-content-note-head"><span>注释归类</span><strong>'+(state.contentAnnotationFilter==="all"?"全部内容注释 · "+allNoteArr.length:activeStyle.label+" · "+(styleCounts[activeStyle.key]||0))+'</strong></div><div class="side-content-note-filter-chips"><button type="button" class="side-content-note-filter-chip side-content-note-filter-chip-all '+(state.contentAnnotationFilter==="all"?"active":"")+'" data-content-note-filter="all" title="全部：'+allNoteArr.length+' 条"><span class="side-content-note-filter-symbol side-content-note-filter-all-symbol">全部</span><em>'+(allNoteArr.length||0)+'</em></button>'+CONTENT_ANNOTATION_STYLES.map(function(x){return '<button type="button" class="side-content-note-filter-chip content-note-filter-'+x.key+' '+(state.contentAnnotationFilter===x.key?"active":"")+'" data-content-note-filter="'+x.key+'" title="'+x.label+'：'+(styleCounts[x.key]||0)+' 条"><span class="side-content-note-filter-symbol">'+contentAnnotationStyleIcon(x.key,'side-content-note-filter-image')+'</span><em>'+(styleCounts[x.key]||0)+'</em></button>'}).join('')+'</div><input class="side-content-note-slider" data-content-note-slider type="range" min="0" max="3" step="1" value="'+(state.contentAnnotationFilter==="all"?0:Math.max(0,CONTENT_ANNOTATION_STYLES.findIndex(function(x){return x.key===state.contentAnnotationFilter})+1))+'" aria-label="按内容注释分类筛选"><div class="side-content-note-scale" aria-hidden="true"><span>全部</span><span>重点</span><span>感悟</span><span>领受</span></div></div>';
 c.innerHTML=noteHeader+(filteredNoteArr.length?'<div class="side-bulkbar"><label class="side-select-all"><input type="checkbox" data-side-select-all> <span>全选</span></label><span class="side-selected-count" data-side-selected-count></span><button type="button" class="side-bulk-export-all" data-side-export-all title="导出所有内容注释为 ODT">导出所有</button><button type="button" class="side-bulk-export-selected" data-side-export-selected title="导出选中内容注释为 ODT">导出选中</button><button type="button" class="side-bulk-delete" data-side-bulk-delete disabled title="删除所选">删除所选</button></div>'+filteredNoteArr.map(function(a){var preview=String(a.text||"").replace(/\s+/g," ").trim();if(!preview)preview="（未保存选中内容）";if(preview.length>42)preview=preview.slice(0,42)+"…";var notePreview=String(a.note||"").replace(/\s+/g," ").trim();if(notePreview.length>42)notePreview=notePreview.slice(0,42)+"…";var sm=contentAnnotationStyleKey(a);return '<div class="side-content-note-row side-content-note-row-'+sm+'"><label class="side-row-check" title="选择内容注释"><input type="checkbox" data-side-select-aid="'+esc(a.id)+'" aria-label="选择内容注释"></label><button class="side-content-note-jump" data-aid="'+esc(a.id)+'" type="button"><span class="side-content-note-row-main">'+contentAnnotationStyleIcon(sm,'side-content-note-row-image')+'<span class="side-content-note-row-copy"><span class="side-content-note-category"><b>'+esc(getContentAnnotationStyle(sm).label)+'：</b>'+contentAnnotationPattern(sm,'side-content-note-row-category-pattern')+'</span><span class="side-content-note-line"><b>原文：</b><span>'+esc(preview)+'</span></span><span class="side-content-note-line side-content-note-line-note"><b>注释：</b><span>'+esc(notePreview||'暂无注释')+'</span></span></span></span></button><button class="side-annotation-delete side-content-note-delete" data-delete-aid="'+esc(a.id)+'" type="button" title="删除内容注释" aria-label="删除内容注释"><img class="side-annotation-delete-icon" src="../img/ui/delete.png" alt=""></button></div>';}).join(""):'<div class="empty">'+(allNoteArr.length?'当前颜色暂无内容注释':'暂无内容注释')+'</div>');
 var exportAll=c.querySelector('[data-side-export-all]');if(exportAll)exportAll.onclick=function(e){e.preventDefault();e.stopPropagation();exportContentAnnotations(allNoteArr)};var exportSelected=c.querySelector('[data-side-export-selected]');if(exportSelected)exportSelected.onclick=function(e){e.preventDefault();e.stopPropagation();var bucket=sideSelectionBucket(),selected=allNoteArr.filter(function(a){return !!bucket[String(a.id)]});exportContentAnnotations(selected)};wrapSideList(c,'.side-content-note-manager');c.querySelectorAll('[data-content-note-filter]').forEach(function(b){b.onclick=function(e){e.preventDefault();state.contentAnnotationFilter=b.dataset.contentNoteFilter||"all";clearSideSelection();renderSide()}});var noteSlider=c.querySelector('[data-content-note-slider]');if(noteSlider)noteSlider.oninput=function(){var v=Number(noteSlider.value)||0;state.contentAnnotationFilter=v===0?"all":CONTENT_ANNOTATION_STYLES[v-1].key;clearSideSelection();renderSide();requestAnimationFrame(function(){var n=c.querySelector('[data-content-note-slider]');if(n){n.value=String(v);try{n.focus({preventScroll:true})}catch(_){}}syncManagedSideToReader()})};
}else{var allBookmarks=state.annotations.filter(function(a){return a.type==="bookmark"}),arr2=allBookmarks.filter(bookmarkFilterMatches),starCounts={};allBookmarks.forEach(function(a){var k=Math.max(1,Math.min(6,Number(a.star)||1));starCounts[k]=(starCounts[k]||0)+1});var starFilterHtml='<div class="side-bookmark-manager"><div class="side-bookmark-filter-head"><span>星级归类</span><strong>'+ (state.bookmarkStarFilter==="all"?"全部书签 · "+allBookmarks.length:(getBookmarkStarMeta(state.bookmarkStarFilter).label+" · "+(starCounts[state.bookmarkStarFilter]||0))) +'</strong></div><div class="side-bookmark-filter-chips"><button type="button" class="side-bookmark-filter-chip side-bookmark-filter-chip-all '+(state.bookmarkStarFilter==="all"?"active":"")+'" data-bookmark-filter="all" title="全部：'+allBookmarks.length+' 条"><span class="side-bookmark-filter-all-symbol" aria-hidden="true">全部</span><em>'+(allBookmarks.length||0)+'</em></button>'+BOOKMARK_STARS.map(function(x){return '<button type="button" class="side-bookmark-filter-chip star-'+x.star+' '+(String(state.bookmarkStarFilter)===String(x.star)?"active":"")+'" data-bookmark-filter="'+x.star+'" title="'+x.label+'：'+(starCounts[x.star]||0)+' 条">'+bookmarkStarImg(x.star,"bookmark-filter-image")+'<em>'+(starCounts[x.star]||0)+'</em></button>'}).join('')+'</div><input class="side-bookmark-slider" data-bookmark-slider type="range" min="0" max="6" step="1" value="'+(state.bookmarkStarFilter==="all"?0:Number(state.bookmarkStarFilter)||0)+'" aria-label="按书签星级筛选"><div class="side-bookmark-scale"><span>全部</span><span>1星</span><span>2星</span><span>3星</span><span>4星</span><span>5星</span><span>6星</span></div></div>';c.innerHTML=starFilterHtml+(arr2.length?'<div class="side-bulkbar"><label class="side-select-all"><input type="checkbox" data-side-select-all> <span>全选</span></label><span class="side-selected-count" data-side-selected-count></span><button type="button" class="side-bulk-delete" data-side-bulk-delete disabled title="删除所选">删除所选</button></div>'+arr2.map(function(a){var sm=Math.max(1,Math.min(6,Number(a.star)||1));var preview=String(a.text||"").replace(/\s+/g," " ).trim();if(!preview)preview="（未保存选中内容）";if(preview.length>42)preview=preview.slice(0,42)+"…";return '<div class="side-bookmark-row side-bookmark-row-star-'+sm+'"><label class="side-row-check" title="选择书签"><input type="checkbox" data-side-select-aid="'+esc(a.id)+'" aria-label="选择书签"></label><button class="side-bookmark-jump" data-aid="'+esc(a.id)+'" type="button"><span class="side-bookmark-title">'+bookmarkStarImg(sm,"side-bookmark-star-image")+'<i class="side-bookmark-star-glyphs" aria-hidden="true">'+bookmarkStarGlyphs(sm)+'</i></span><span class="side-bookmark-text" title="'+esc(preview)+'">'+esc(preview)+'</span></button><button class="side-bookmark-delete" data-delete-aid="'+esc(a.id)+'" type="button" title="删除书签" aria-label="删除书签"><img class="side-annotation-delete-icon" src="../img/ui/delete.png" alt=""></button></div>'}).join(""):'<div class="empty">'+(allBookmarks.length?'当前星级暂无书签':'暂无书签')+'</div>');wrapSideList(c,'.side-bookmark-manager');c.querySelectorAll('[data-bookmark-filter]').forEach(function(b){b.onclick=function(e){e.preventDefault();state.bookmarkStarFilter=b.dataset.bookmarkFilter||"all";clearSideSelection();renderSide()}});var bookmarkSlider=c.querySelector('[data-bookmark-slider]');if(bookmarkSlider)bookmarkSlider.oninput=function(){var v=Number(bookmarkSlider.value)||0;state.bookmarkStarFilter=v===0?"all":String(v);clearSideSelection();renderSide();requestAnimationFrame(function(){var n=c.querySelector('[data-bookmark-slider]');if(n){n.value=String(v);try{n.focus({preventScroll:true})}catch(_){}}syncManagedSideToReader()})}}c.querySelectorAll('[data-aid]').forEach(function(b){b.onclick=function(e){e.preventDefault();var a=state.annotations.find(function(x){return String(x.id)===String(b.dataset.aid)});if(!a)return;state.sideActiveId=String(a.id);c.querySelectorAll('.side-record-current').forEach(function(x){x.classList.remove('side-record-current');x.removeAttribute('aria-current')});b.classList.add('side-record-current');b.setAttribute('aria-current','location');jumpAnnotation(a)}});c.querySelectorAll('.side-content-note-jump[data-aid]').forEach(function(b){b.onclick=async function(e){e.preventDefault();e.stopPropagation();var a=state.annotations.find(function(x){return String(x.id)===String(b.dataset.aid)});if(!a)return;state.sideActiveId=String(a.id);c.querySelectorAll('.side-record-current').forEach(function(x){x.classList.remove('side-record-current');x.removeAttribute('aria-current')});b.classList.add('side-record-current');b.setAttribute('aria-current','location');await jumpAnnotation(a);}});c.querySelectorAll('[data-delete-aid]').forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();var a=state.annotations.find(function(x){return String(x.id)===String(b.dataset.deleteAid)});if(a)deleteAnnotation(a)}});c.querySelectorAll('[data-side-select-aid]').forEach(function(x){x.checked=!!sideSelectionBucket()[String(x.dataset.sideSelectAid)];x.onchange=function(e){e.stopPropagation();var bucket=sideSelectionBucket(),id=String(x.dataset.sideSelectAid);if(x.checked)bucket[id]=true;else delete bucket[id];updateSideSelectionUI()};x.onclick=function(e){e.stopPropagation()}});var master=c.querySelector('[data-side-select-all]');if(master)master.onchange=function(){var bucket=sideSelectionBucket();sideSelectable().forEach(function(a){var id=String(a.id);if(master.checked)bucket[id]=true;else delete bucket[id]});updateSideSelectionUI()};var bulk=c.querySelector('[data-side-bulk-delete]');if(bulk)bulk.onclick=function(e){e.preventDefault();e.stopPropagation();bulkDeleteSideSelection()};updateSideSelectionUI();syncManagedSideToReader()}
function isOfficeReaderSource(){
  var f=String((state.source&&state.source.format)||(state.book&&state.book.format)||"").toLowerCase();
  return f==="odt"||f==="docx"||f==="openoffice"||f==="word";
}
function setReaderChapterLabel(i,label){var el=$("chapter");if(!el)return;var v=String(label||"").trim();if(!v){var n=Number(i);v=Number.isFinite(n)?("第 "+(n+1)+" 节"):"正文";}el.textContent=v;el.title=v;}
function showChapter(i,offset,quote){if(!state.chapters.length)return;var __tocNode=null;if(state.toc&&state.activeTab==="toc"){var __find=function(nodes){for(var z=0;z<(nodes||[]).length;z++){var q=nodes[z];if(Number(q.index)===Number(i))return q;var r=__find(q.children);if(r)return r;}return null};__tocNode=__find(state.toc)}if(__tocNode&&globalThis.BookNoteCanonicalTocResolver){var __resolved=BookNoteCanonicalTocResolver.resolve(__tocNode,state.canonicalChapters.length?state.canonicalChapters:state.chapters);if(__resolved){i=__resolved.chapterIndex;offset=__resolved.localStart;quote=quote||"";}}i=Math.max(0,Math.min(state.chapters.length-1,i));state.currentChapter=i;setReaderChapterLabel(i,state.chapters[i]&&state.chapters[i].label);updateTocActive();$('progress').textContent=(state.chapters.length?Math.round((i+1)/state.chapters.length*100):0)+"%";if(state.runtime){var __ss=state.chapters[i]||{};state.runtime.show(i,Math.max(0,Number(offset)||0),quote||'');}else{document.querySelectorAll(".chapter").forEach(function(e){e.style.display=Number(e.dataset.chapterIndex)===i?"block":"none"});var el=document.querySelector('.chapter[data-chapter-index="'+i+'"]');if(el)$('viewport').scrollTop=offset?el.offsetTop+offset:el.offsetTop}persistReaderPosition(true);}
function unwrapSearchMarks(doc){if(!doc)return;readerSpeechDomMutationGuard(doc);doc.querySelectorAll("mark.reader-search-hit").forEach(function(m){var p=m.parentNode;if(!p)return;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m)});readerSpeechNormalizeIfIdle(doc);}
function clearMarks(){if(state.runtime&&state.runtime.iframe){try{unwrapSearchMarks(state.runtime.iframe.contentDocument)}catch(_){}}try{unwrapSearchMarks($("content"))}catch(_){}}
function readerSpeechPurgeSentenceVisual(doc){
  /* v7.12.44: Word mode must never pass through the sentence visual cleanup
     path that normalizes text nodes. Remove only sentence speech marks, without
     normalize(), so Firefox cannot briefly repaint the selected sentence. */
  if(!doc)return;
  try{doc.querySelectorAll("mark.reader-speech-hit,mark.reader-speech-anchor").forEach(function(m){
    var p=m.parentNode;if(!p)return;
    while(m.firstChild)p.insertBefore(m.firstChild,m);
    p.removeChild(m);
  });}catch(_){}
}
function readerSpeechClearNativeSelection(doc){
  try{var d=doc||(state.runtime&&state.runtime.iframe&&state.runtime.iframe.contentDocument);var s=d&&d.getSelection&&d.getSelection();if(s&&s.rangeCount)s.removeAllRanges();}catch(_){}
}
function clearSpeechMarks(){if(state.runtime&&state.runtime.iframe){try{var d=state.runtime.iframe.contentDocument;if(d){d.querySelectorAll("mark.reader-speech-hit,mark.reader-speech-anchor").forEach(function(m){var p=m.parentNode;if(!p)return;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m)});if(d.body)d.body.normalize()}}catch(_){}}}
function scrollSpeechHighlight(){if(!state.runtime||!state.runtime.iframe)return;try{var d=state.runtime.iframe.contentDocument,m=d&&d.querySelector("mark.reader-speech-hit");if(m&&m.scrollIntoView)m.scrollIntoView({block:"center",inline:"nearest",behavior:"auto"})}catch(_){}}
function strictReaderText(x){return String(x||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim()}
function wrapReaderRange(doc,start,end,className,attrName,attrValue,expectedText){if(!start||!end)return null;/* Hard visual-layer gate: Word/Phrase mode may never create a sentence Speech mark. */if((className==='reader-speech-hit'||className==='reader-speech-anchor')&&readerSpeechState&&readerSpeechState.wordFollowHighlight)return null;var r=doc.createRange();try{r.setStart(start.node,start.offset);r.setEnd(end.node,end.offset)}catch(_){return null}if(r.collapsed)return null;if(expectedText!=null&&strictReaderText(r.toString())!==strictReaderText(expectedText))return null;var root=doc.getElementById('source')||doc.body,walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[],n;while((n=walker.nextNode())){if(n.parentElement&&/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(n.parentElement.tagName))continue;nodes.push(n)}var startIndex=nodes.indexOf(start.node),endIndex=nodes.indexOf(end.node);if(startIndex<0||endIndex<0||startIndex>endIndex)return null;var parts=[];for(var i=startIndex;i<=endIndex;i++){var t=nodes[i],len=(t.nodeValue||'').length,a=i===startIndex?start.offset:0,b=i===endIndex?end.offset:len;if(b>a)parts.push({node:t,a:a,b:b})}if(!parts.length)return null;var marked=0;for(var j=parts.length-1;j>=0;j--){var part=parts[j],t=part.node;if(!t.parentNode)continue;try{var rr=doc.createRange();rr.setStart(t,part.a);rr.setEnd(t,part.b);var m=doc.createElement('mark');m.className=className;if(attrName)m.setAttribute(attrName,String(attrValue));rr.surroundContents(m);marked++}catch(e){return null}}return marked===parts.length?true:null;}
// v7.10.440-search-multi-hit: after Search -> Reader navigation, render only the clicked canonical hit.
// Do not paint every occurrence in the chapter/paragraph; this keeps one visible search target.
function highlightRuntimeHit(h,token){if(!state.runtime||!state.runtime.iframe)return false;try{if(token!=null&&token!==state.searchNavSeq)return false;var doc=state.runtime.iframe.contentDocument;if(state.runtime.isEpubMulti&&state.runtime.isEpubMulti()){clearMarks();var unified=state.runtime.epubLocateAndHighlight&&state.runtime.epubLocateAndHighlight(h);if(unified){return true;}var rr=(state.runtime.epubResolveLiveHit&&state.runtime.epubResolveLiveHit(h))||state.runtime.epubResolveHit(h);var q=String(h.quote||h.text||'');if(!rr||!rr.range||strictReaderText(rr.range.toString())!==strictReaderText(q))return false;var ok=wrapReaderRange(doc,{node:rr.range.startContainer,offset:rr.range.startOffset},{node:rr.range.endContainer,offset:rr.range.endOffset},'reader-search-hit active',null,'',q);if(ok){readerSpeechDomMutationGuard(doc);var mm=doc.querySelectorAll('mark.reader-search-hit.active');if(mm.length)mm[mm.length-1].scrollIntoView({block:'center'});}return ok;}if(state.runtime.invalidatePositionMap)state.runtime.invalidatePositionMap(doc);var idx=Number(h.chapterIndex)||0,canon=state.canonicalChapters[idx]||state.chapters[idx]||{},base=Number(canon.textStart)||0,s=Math.max(0,Number(h.start)-base),e=Math.max(s,Number(h.end)-base),query=String(h.quote||h.text||'');if(e<=s||!query)return false;var mapped=state.runtime.canonicalToDom(idx,s,e,query,{strict:true});if(!mapped||!mapped.start||!mapped.end)return false;var r=doc.createRange();try{r.setStart(mapped.start.node,mapped.start.offset);r.setEnd(mapped.end.node,mapped.end.offset)}catch(_){return false}if(r.collapsed||strictReaderText(r.toString())!==strictReaderText(query))return false;if(!wrapReaderRange(doc,mapped.start,mapped.end,'reader-search-hit active',null,'',query))return false;readerSpeechDomMutationGuard(doc);if(token!=null&&token!==state.searchNavSeq)return false;var marks=doc.querySelectorAll('mark.reader-search-hit.active');if(!marks.length)return false;marks[marks.length-1].scrollIntoView({block:'center'});return true}catch(e){console.warn(e);return false}}
function highlightRuntimeChapterHits(activeHit,token){if(!state.runtime||!state.runtime.iframe)return false;var doc=state.runtime.iframe.contentDocument;if(!doc)return false;var idx=Number(activeHit.chapterIndex)||0,hits=state.hits.filter(function(h){return Number(h.chapterIndex)===idx&&Number(h.end)>Number(h.start)});if(!hits.length)return false;if(state.runtime.invalidatePositionMap)state.runtime.invalidatePositionMap(doc);var mappedHits=[];for(var i=0;i<hits.length;i++){if(token!=null&&token!==state.searchNavSeq)return false;var h=hits[i],canon=state.canonicalChapters[idx]||state.chapters[idx]||{},base=Number(canon.textStart)||0,s=Math.max(0,Number(h.start)-base),e=Math.max(s,Number(h.end)-base),q=String(h.quote||h.text||'');if(e<=s||!q)continue;var mapped=state.runtime.canonicalToDom(idx,s,e,q,{strict:true});if(!mapped||!mapped.start||!mapped.end)continue;var rr=doc.createRange();try{rr.setStart(mapped.start.node,mapped.start.offset);rr.setEnd(mapped.end.node,mapped.end.offset)}catch(_){continue}if(rr.collapsed||strictReaderText(rr.toString())!==strictReaderText(q))continue;mappedHits.push({h:h,m:mapped,startRange:rr,active:Number(h.start)===Number(activeHit.start)&&Number(h.end)===Number(activeHit.end)});}if(!mappedHits.length)return false;mappedHits.sort(function(a,b){return Number(b.h.start)-Number(a.h.start)});for(var j=0;j<mappedHits.length;j++){var x=mappedHits[j];if(token!=null&&token!==state.searchNavSeq)return false;if(!wrapReaderRange(doc,x.m.start,x.m.end,'reader-search-hit'+(x.active?' active':''),null,'',String(x.h.quote||x.h.text||'')))continue;readerSpeechDomMutationGuard(doc);}var active=doc.querySelector('mark.reader-search-hit.active');if(active){active.scrollIntoView({block:'center'});return true}return false}
// v7.10.461: keep v7.10.459 verified hit-to-DOM navigation chain unchanged.
function jumpHit(){var h=state.hits[state.hitIndex];if(!h)return Promise.resolve();var token=++state.searchNavSeq;state.searchNavPromise=state.searchNavPromise.catch(function(){}).then(async function(){var current=state.hits[state.hitIndex];if(!current||current!==h||token!==state.searchNavSeq)return;clearMarks();var list=state.canonicalChapters.length?state.canonicalChapters:state.chapters,base=Number((list[h.chapterIndex]||{}).textStart)||0,local=Math.max(0,Number(h.start)-base),targetChapter=Number(h.chapterIndex)||0;try{if(state.runtime){if(state.runtime.isEpubMulti&&state.runtime.isEpubMulti()){var epubLoc=h.epubLocator||h.locator||{};var epubSection=epubLoc.sectionIndex!=null?Number(epubLoc.sectionIndex):(epubLoc.spineIndex!=null?Number(epubLoc.spineIndex):Number(h.sectionIndex!=null?h.sectionIndex:h.chapterIndex)||0);var epubStart=epubLoc.start!=null?Number(epubLoc.start):(h.localStart!=null?Number(h.localStart):0);var epubEnd=epubLoc.end!=null?Number(epubLoc.end):(h.localEnd!=null?Number(h.localEnd):epubStart);targetChapter=Math.max(0,Math.floor(epubSection));local=Math.max(0,epubStart);h=Object.assign({},h,{start:local,end:Math.max(local,epubEnd),chapterIndex:targetChapter,sectionIndex:targetChapter,localStart:local,localEnd:Math.max(local,epubEnd),quote:String(h.quote||h.text||epubLoc.textQuote&&epubLoc.textQuote.exact||''),text:String(h.text||h.quote||''),locator:epubLoc,epubLocator:epubLoc,logicalChapterIndex:h.logicalChapterIndex,logicalChapterId:h.logicalChapterId,blockId:h.blockId,sentenceId:h.sentenceId,sentenceText:h.sentenceText,queryOffsetInSentence:h.queryOffsetInSentence,occurrenceInSection:h.occurrenceInSection,contextBefore:h.contextBefore,contextAfter:h.contextAfter});var epubSame=!!state.runtime.iframe&&Number(state.runtime.currentIndex)===targetChapter;if(!epubSame){var eruntime=state.runtime,ecleanup=null,epromise=new Promise(function(resolve){var done=false;function cleanup(){if(done)return;done=true;eruntime.removeEventListener('frame-ready',onReady);if(ecleanup)ecleanup=null}function onReady(){if(eruntime.iframe){cleanup();resolve(eruntime.iframe)}}ecleanup=cleanup;eruntime.addEventListener('frame-ready',onReady);});try{await Promise.all([eruntime.show(targetChapter,local,h.quote||h.text||''),epromise])}catch(e){if(ecleanup)ecleanup();throw e}if(token!==state.searchNavSeq)return}if(Number(state.runtime.currentIndex)!==targetChapter||!state.runtime.iframe)return;var eok=highlightRuntimeHit(h,token);if(!eok&&token===state.searchNavSeq){updateReaderSearchNavigationStatus("failed");}return eok;}var resolver=globalThis.BookNoteLocatorResolver,resolvedHit=resolver&&resolver.resolveSearchHit(h,list);if(resolvedHit&&resolvedHit.type==='reflow'){targetChapter=resolvedHit.chapterIndex;local=resolvedHit.start;}else if(resolvedHit&&resolvedHit.type==='epub'){targetChapter=resolvedHit.chapterIndex;local=resolvedHit.start;}var sameChapter=!!state.runtime.iframe&&Number(state.runtime.currentIndex)===targetChapter;if(!sameChapter){var runtime=state.runtime,cleanupFrameWait=null,framePromise=new Promise(function(resolve){var done=false;function cleanup(){if(done)return;done=true;runtime.removeEventListener('frame-ready',onReady);if(cleanupFrameWait)cleanupFrameWait=null}function onReady(){if(runtime.iframe){cleanup();resolve(runtime.iframe)}}cleanupFrameWait=cleanup;runtime.addEventListener('frame-ready',onReady);});try{await Promise.all([runtime.show(targetChapter,local,h.quote||h.text||''),framePromise])}catch(e){if(cleanupFrameWait)cleanupFrameWait();throw e}if(token!==state.searchNavSeq)return}if(Number(state.runtime.currentIndex)!==targetChapter||!state.runtime.iframe)return;var ok=highlightRuntimeHit(h,token);if(!ok){if(token===state.searchNavSeq){updateReaderSearchNavigationStatus("failed");}return false}}else{if(token!==state.searchNavSeq)return;showChapter(targetChapter,local,h.quote||h.text||'')}}catch(e){console.warn('Reader search navigation failed',e)}if(token===state.searchNavSeq){var ss=$('searchStatus');if(ss&&ss.getAttribute('data-search-stage')==='locator')updateReaderSearchNavigationStatus("failed");else if(ss)updateReaderSearchNavigationStatus("results");} });return state.searchNavPromise}
function loadReaderSearchHistory(){
  readerSearchHistoryReady=browser.storage.local.get("booknoteSearchHistory").then(function(r){
    readerSearchHistory=Array.isArray(r.booknoteSearchHistory)?r.booknoteSearchHistory.filter(function(x){return typeof x==="string"&&x.trim();}).slice(0,5):[];
    return readerSearchHistory;
  }).catch(function(e){console.warn("[Search History] load failed",e);readerSearchHistory=[];return readerSearchHistory;});
  return readerSearchHistoryReady;
}
function saveReaderSearchHistory(q){
  q=String(q||"").trim();if(!q)return Promise.resolve();
  return readerSearchHistoryReady.catch(function(){return null;}).then(function(){
    readerSearchHistory=readerSearchHistory.filter(function(x){return x!==q;});
    readerSearchHistory.unshift(q);readerSearchHistory=readerSearchHistory.slice(0,5);
    return browser.storage.local.set({booknoteSearchHistory:readerSearchHistory});
  });
}
function updateReaderSearchClear(){var b=$("searchClear"),i=$("searchInput");if(b&&i)b.classList.toggle("visible",!!String(i.value||""));}
function renderReaderSearchHistory(filter){var box=$("searchHistory");if(!box)return;var q=String(filter||"").trim().toLocaleLowerCase(),items=readerSearchHistory.slice(0,5);box.innerHTML='<div class="search-history-head"><span>搜索历史</span><button type="button" id="clearReaderSearchHistory" title="清空搜索记录">清空记录</button></div>'+(items.length?items.map(function(x){return '<button type="button" class="search-history-item" data-history-query="'+esc(x)+'"><span>🕘</span><span>'+esc(x)+'</span></button>';}).join(''):'<div class="search-history-empty">'+(readerSearchHistory.length&&q?'没有匹配的历史记录':'暂无搜索历史')+'</div>');var clear=$("clearReaderSearchHistory");if(clear)clear.onclick=function(e){e.preventDefault();e.stopPropagation();readerSearchHistory=[];void browser.storage.local.remove("booknoteSearchHistory");renderReaderSearchHistory("")};box.querySelectorAll("[data-history-query]").forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();$("searchInput").value=b.getAttribute("data-history-query")||"";updateReaderSearchClear();hideReaderSearchHistory();runSearch($("searchInput").value)}})}
function showReaderSearchHistory(){var box=$("searchHistory");if(!box)return;box.hidden=false;renderReaderSearchHistory($("searchInput").value)}
function hideReaderSearchHistory(){var box=$("searchHistory");if(box)box.hidden=true}
function updateReaderSearchNavigationStatus(mode){
  var status=$("searchStatus"),prev=$("prevHit"),next=$("nextHit"),exportAll=$("exportAllSearch"),exportCurrent=$("exportCurrentSearch");
  var total=Array.isArray(state.hits)?state.hits.length:0, index=Number(state.hitIndex);
  if(!status||!prev||!next)return;
  if(total<=0){status.textContent="";status.removeAttribute("data-search-stage");prev.disabled=true;next.disabled=true;if(exportAll)exportAll.disabled=true;if(exportCurrent)exportCurrent.disabled=true;return;}
  if(!Number.isFinite(index)||index<0)index=0;
  index=Math.min(index,total-1);
  status.textContent=mode==="failed"?(index+1)+" / "+total+" · 定位失败":mode==="searching"?"搜索中…":(index+1)+" / "+total;
  prev.disabled=total<2;next.disabled=total<2;
  if(exportAll)exportAll.disabled=mode==="searching"||total<=0;
  if(exportCurrent)exportCurrent.disabled=mode==="searching"||total<=0||index<0;
  status.setAttribute("data-search-stage",mode==="failed"?"locator":"results");
}
function showReaderSearchUI(){var bar=$("searchBar");if(bar){bar.hidden=false;if(typeof syncReaderSearchGeometry==="function")syncReaderSearchGeometry();}}
async function runSearch(q){
  var seq=++state.searchSeq;
  state.searchNavSeq++;
  q=String(q||'').trim();
  clearMarks();
  state.hits=[];
  state.hitIndex=-1;
  updateReaderSearchClear();
  if(!q){$("searchStatus").textContent="";$("prevHit").disabled=true;$("nextHit").disabled=true;return;}
  showReaderSearchUI();
  updateReaderSearchNavigationStatus("searching");

  /* v7.12.2: Search Engine, Hit Normalization, History and Locator are four
   * separate stages. A failure in any post-search stage must never be reported
   * as "搜索引擎错误". EPUB search must commit its result count before any
   * navigation/highlight work begins. */
  if(state.runtime&&state.runtime.isEpubMulti&&state.runtime.isEpubMulti()){
    var eh=[];
    try{
      eh=state.runtime.epubFindHits(q);
    }catch(searchError){
      console.error("[EPUB Search Engine] findAll failed",searchError);
      if(seq===state.searchSeq){
        $("searchStatus").textContent="搜索引擎错误";
        $("searchStatus").setAttribute("data-search-stage","engine");
      }
      return;
    }
    if(seq!==state.searchSeq)return;

    /* Normalize each occurrence independently. If the optional canonical-hit
     * adapter is unavailable/broken, retain the raw EPUB hit instead of
     * destroying a successful search result. */
    state.hits=(Array.isArray(eh)?eh:[]).map(function(h){
      var raw={
        start:h&&h.start,end:h&&h.end,
        chapterIndex:h&&h.chapterIndex,
        quote:q,text:(h&&h.text)||q,
        locator:h&&h.epubLocator,format:"epub",
        sectionIndex:h&&h.sectionIndex,
        logicalChapterIndex:h&&h.logicalChapterIndex,
        blockId:h&&h.blockId,blockText:h&&h.blockText,blockTag:h&&h.blockTag,
        sentenceId:h&&h.sentenceId,sentenceText:h&&h.sentenceText,
        queryOffsetInSentence:h&&h.queryOffsetInSentence,occurrenceInSection:h&&h.occurrenceInSection,
        contextBefore:h&&h.contextBefore,contextAfter:h&&h.contextAfter,
        localStart:h&&h.localStart,localEnd:h&&h.localEnd,
        epubLocator:h&&h.epubLocator
      };
      try{
        return globalThis.BookNoteSearchHit&&typeof globalThis.BookNoteSearchHit.normalize==='function'
          ? globalThis.BookNoteSearchHit.normalize(raw)
          : raw;
      }catch(normalizeError){
        console.error("[EPUB Search Hit] normalization failed",normalizeError,h);
        return raw;
      }
    });

    if(seq!==state.searchSeq)return;
    if(!state.hits.length){
      $("searchStatus").textContent="无结果";
      $("searchStatus").removeAttribute("data-search-stage");
      return;
    }

    /* Search success is committed HERE, before history or locator work. */
    state.hitIndex=0;
    updateReaderSearchNavigationStatus("results");
    try{saveReaderSearchHistory(q).catch(function(e){console.warn("[Search History]",e);});}
    catch(e){console.warn("[Search History] save failed",e);}

    jumpHit().catch(function(e){
      console.error("[EPUB search navigation]",e);
      if(seq===state.searchSeq){
        $("searchStatus").textContent=(state.hitIndex+1)+" / "+state.hits.length+" · 定位失败";
        $("searchStatus").setAttribute("data-search-stage","locator");
      }
    });
    return;
  }

  var raw;
  try{
    raw=await BookNoteReadestBridge.search(q);
  }catch(searchError){
    console.error("[Search Engine] search failed",searchError);
    if(seq===state.searchSeq){
      $("searchStatus").textContent="搜索引擎错误";
      $("searchStatus").setAttribute("data-search-stage","engine");
    }
    return;
  }
  if(seq!==state.searchSeq)return;
  try{
    var r=raw.find(function(x){return String(x.bookId)===String(state.book.id)}),st=r&&r.matchPositions&&r.matchPositions.starts||[],en=r&&r.matchPositions&&r.matchPositions.ends||[];
    for(var i=0;i<Math.min(st.length,en.length);i++){
      var x=chapterFor(Number(st[i])),hs=Number(st[i]),he=Number(en[i]),locator=(globalThis.BookNoteLocator&&state.canonicalChapters.length)?BookNoteLocator.fromAbsolute(state.canonicalChapters,hs,he,q):null;
      state.hits.push(globalThis.BookNoteSearchHit?BookNoteSearchHit.normalize({start:hs,end:he,chapterIndex:x.i,quote:q,locator:locator,format:(state.source&&state.source.format)||"reflow"}):{start:hs,end:he,chapterIndex:x.i,quote:q,locator:locator});
    }
  }catch(hitError){
    console.error("[Search Hit Mapping] failed",hitError);
    if(seq===state.searchSeq){$("searchStatus").textContent="搜索结果处理失败";$("searchStatus").setAttribute("data-search-stage","hit-map");}
    return;
  }
  if(!state.hits.length){$("searchStatus").textContent="无结果";return;}
  state.hitIndex=0;
  showReaderSearchUI();
  updateReaderSearchNavigationStatus("results");
  try{saveReaderSearchHistory(q).catch(function(e){console.warn("[Search History]",e);});}catch(e){console.warn("[Search History] save failed",e);}
  jumpHit().catch(function(e){
    console.error("[Search Navigation]",e);
    if(seq===state.searchSeq)updateReaderSearchNavigationStatus("failed");
  });
}
/* v7.12.65: Unified Position Contract.
 * A saved record owns an independent physical position. Chapter/paragraph/sentence
 * fields are descriptive only. EPUB uses Spine Section + section-local character
 * offsets (with document-global offsets for integrity); reflow documents use
 * document-global offsets. The position record is authoritative; legacy fields
 * remain compatibility mirrors only.
 */
function readerPositionHash(text){var x=String(text||'');var h=2166136261;for(var i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
function buildIndependentPosition(s){
 if(!s)return null;
 var ep=s.epubLocator||((s.locator&&String(s.locator.type||'')==='epub')?s.locator:null);
 if(ep){
   var si=Number(ep.sectionIndex!=null?ep.sectionIndex:ep.spineIndex!=null?ep.spineIndex:s.chapterIndex),st=Number(ep.start!=null?ep.start:s.start),en=Number(ep.end!=null?ep.end:st);
   if(!Number.isFinite(si)||!Number.isFinite(st))return null;
   var ds=ep.documentStart!=null?Number(ep.documentStart):NaN,de=ep.documentEnd!=null?Number(ep.documentEnd):NaN;
   return {version:2,type:'epub',sectionIndex:si,sectionId:String(ep.sectionId||''),href:String(ep.href||''),start:Math.max(0,st),end:Math.max(Math.max(0,st),Number.isFinite(en)?en:st),documentStart:Number.isFinite(ds)?ds:null,documentEnd:Number.isFinite(de)?de:null,textQuote:ep.textQuote||{exact:String(s.text||''),prefix:'',suffix:''}};
 }
 var existing=s.position&&s.position.type==='reflow'?s.position:null,existingAnchor=existing&&existing.sourceAnchor;
 var reflowFormat=String(state.source&&state.source.format||state.book&&state.book.documentFormat||state.book&&state.book.meta&&state.book.meta.documentFormat||'reflow').toLowerCase();
 var idx=Number(existingAnchor&&existingAnchor.chapterIndex!=null?existingAnchor.chapterIndex:s.chapterIndex);
 if(!Number.isFinite(idx)||idx<0)idx=0;idx=Math.floor(idx);
 var canon=state.canonicalChapters[idx]||state.chapters[idx]||{},base=Number(canon.textStart)||0,chapterText=String(canon.text||''),chapterEnd=Number(canon.textEnd);
 if(!Number.isFinite(chapterEnd))chapterEnd=base+chapterText.length;
 var absStart,absEnd,localStart,localEnd;
 if(existingAnchor&&Number.isFinite(Number(existingAnchor.localStart))&&Number.isFinite(Number(existingAnchor.localEnd))){
   localStart=Math.max(0,Math.min(chapterText.length,Number(existingAnchor.localStart)));localEnd=Math.max(localStart,Math.min(chapterText.length,Number(existingAnchor.localEnd)));absStart=base+localStart;absEnd=base+localEnd;
 }else{
   absStart=Number(s.start!=null?s.start:s.documentStart);absEnd=Number(s.end!=null?s.end:s.documentEnd);
   if(!Number.isFinite(absStart)&&existing&&Number.isFinite(Number(existing.documentStart)))absStart=Number(existing.documentStart);
   if(!Number.isFinite(absEnd)&&existing&&Number.isFinite(Number(existing.documentEnd)))absEnd=Number(existing.documentEnd);
   if(!Number.isFinite(absStart))return null;if(!Number.isFinite(absEnd))absEnd=absStart;
   localStart=Math.max(0,Math.min(chapterText.length,absStart-base));localEnd=Math.max(localStart,Math.min(chapterText.length,absEnd-base));
 }
 var exact=chapterText.slice(localStart,localEnd);
 var q=(s.locator&&s.locator.textQuote)||{exact:exact,prefix:chapterText.slice(Math.max(0,localStart-48),localStart),suffix:chapterText.slice(localEnd,Math.min(chapterText.length,localEnd+48))};
 return {version:4,type:'reflow',format:reflowFormat,documentStart:Math.max(0,absStart),documentEnd:Math.max(Math.max(0,absStart),absEnd),textQuote:q,sourceAnchor:{chapterIndex:idx,localStart:localStart,localEnd:localEnd,exact:exact,prefix:chapterText.slice(Math.max(0,localStart-48),localStart),suffix:chapterText.slice(localEnd,Math.min(chapterText.length,localEnd+48)),chapterTextHash:readerPositionHash(chapterText),chapterTextLength:chapterText.length},canonicalSpace:'chapter-local-v1'};
}
function positionFromAnnotation(a){if(!a)return null;return a.position||buildIndependentPosition(a);}
function validateIndependentPosition(a){var p=positionFromAnnotation(a);if(!p)return false;if(p.type==='epub')return p.version===2&&Number.isFinite(Number(p.sectionIndex))&&Number.isFinite(Number(p.start))&&Number.isFinite(Number(p.end))&&Number(p.end)>=Number(p.start);if(p.type==='reflow'){var currentFormat=String(state.source&&state.source.format||state.book&&state.book.documentFormat||state.book&&state.book.meta&&state.book.meta.documentFormat||'reflow').toLowerCase();if(p.format&&String(p.format).toLowerCase()!==currentFormat)return false;var x=p.sourceAnchor||{},idx=Number(x.chapterIndex),canon=state.canonicalChapters[Math.floor(idx)]||state.chapters[Math.floor(idx)]||{},ct=String(canon.text||'');if(!((p.version===4||p.version===3)&&Number.isFinite(idx)&&idx>=0&&Number.isFinite(Number(x.localStart))&&Number.isFinite(Number(x.localEnd))&&Number(x.localStart)>=0&&Number(x.localEnd)>=Number(x.localStart)))return false;if(Number(x.localEnd)>ct.length)return false;if(x.chapterTextHash&&ct&&String(x.chapterTextHash)!==readerPositionHash(ct))return false;return true;}return false;}
function selectionOffsets(){var frame=state.runtime&&state.runtime.iframe;if(!frame)return null;try{var doc=frame.contentDocument,sel=doc.getSelection();if(!sel||!sel.rangeCount||sel.isCollapsed)return null;var range=sel.getRangeAt(0);if(!doc.body.contains(range.startContainer)||!doc.body.contains(range.endContainer))return null;var rawText=String(range.toString()||''),text=rawText.trim();if(!text)return null;/* Keep the exact DOM selection text for locator construction. Trimming before building the EPUB locator can shift occurrence/context matching when the selection starts or ends with whitespace. The user-facing annotation text remains trimmed. */if(state.runtime.isEpubMulti&&state.runtime.isEpubMulti()&&state.runtime.epubAnchorFromRange){var anchor=state.runtime.epubAnchorFromRange(range,rawText);if(anchor){try{var sr=range.getBoundingClientRect();}catch(_){}return {start:Number(anchor.start)||0,end:Number(anchor.end)||Number(anchor.start)||0,text:text,rawText:rawText,chapterIndex:Number(anchor.sectionIndex)||0,chapterLabel:(state.chapters[Number(anchor.sectionIndex)||0]||{}).label||'',progress:state.chapters.length?((Number(anchor.sectionIndex)||0)+1)/state.chapters.length:0,range:range,frame:frame,epubLocator:anchor,locator:anchor};}}/* Office/TXT/other reflow documents are rendered one canonical section per live iframe. The runtime index is authoritative after natural section scrolling; state.currentChapter can lag behind when the user crosses a section boundary. */var currentIndex=Number(state.runtime.currentIndex);if(!Number.isFinite(currentIndex))currentIndex=Number(state.currentChapter)||0;var mapped=state.runtime.domRangeToCanonical(currentIndex,range,{annotation:true});if(!mapped)return null;var base=Number((state.canonicalChapters[currentIndex]||state.chapters[currentIndex]||{}).textStart)||0;return {start:base+Number(mapped.start||0),end:base+Number(mapped.end||0),text:text,rawText:rawText,chapterIndex:currentIndex,chapterLabel:(state.chapters[currentIndex]||{}).label||'',progress:state.chapters.length?(currentIndex+1)/state.chapters.length:0,range:range,frame:frame}}catch(_){return null}}
function positionToolbar(sel){var tb=$("selectionToolbar");if(!sel||!sel.text||!sel.range){tb.hidden=true;return}try{var r=sel.range.getBoundingClientRect(),fr=sel.frame&&sel.frame.getBoundingClientRect(),vr=$("viewport").getBoundingClientRect();fr=fr||vr;var left=fr.left-vr.left+r.left+(r.width/2)-145;var top=fr.top-vr.top+r.top-56;if(top<8)top=fr.top-vr.top+r.bottom+10;left=Math.max(8,Math.min(left,Math.max(8,vr.width-300)));top=Math.max(8,Math.min(top,Math.max(8,vr.height-46)));tb.style.left=Math.round(left)+"px";tb.style.top=Math.round(top)+"px";tb.hidden=false}catch(_){tb.hidden=true}}
function clearSelection(){state.selected=null;var tb=$("selectionToolbar");if(tb)tb.hidden=true;closeHighlightColorPicker();closeBookmarkStarPicker();try{var frame=state.runtime&&state.runtime.iframe,doc=frame&&frame.contentDocument,sel=doc&&doc.getSelection&&doc.getSelection();if(sel&&sel.rangeCount)sel.removeAllRanges()}catch(_){} }

function openSummaryNoteEditor(existingAnnotation){
 var s=state.selected||selectionOffsets();
 var existing=existingAnnotation||null;
 if(existing){s={start:Number(existing.start),end:Number(existing.end),text:String(existing.text||""),chapterIndex:Number(existing.chapterIndex)||0,chapterLabel:String(existing.chapterLabel||""),progress:Number(existing.progress)||0,range:null,frame:state.runtime&&state.runtime.iframe};}
 if(!s||!s.text){toast("请先选择正文");return;}
 if(!existing){for(var i=state.annotations.length-1;i>=0;i--){
   var a=state.annotations[i];
   if(a&&a.type==="note"&&String(a.sourceType||"")==="selection-summary"&&String(a.text||"")===String(s.text||"")){existing=a;break;}
 }}
 var overlay=document.createElement("div");
 overlay.className="reader-summary-editor-overlay";
 overlay.innerHTML='<div class="reader-summary-editor" role="dialog" aria-modal="true" aria-label="BookNote">'+
   '<div class="reader-summary-editor-head"><strong><span class="content-annotation-glyph content-annotation-glyph-sm" aria-hidden="true">注</span> BookNote</strong><button type="button" data-close title="关闭">×</button></div>'+
   '<div class="reader-summary-editor-label">原文摘录（只读）</div>'+
   '<div class="reader-summary-editor-quote"></div>'+ 
   '<div class="reader-summary-editor-label">BookNote（可编辑）</div>'+ 
   '<textarea data-note spellcheck="false" placeholder="输入你的摘要、理解或补充笔记……"></textarea>'+ 
   '<div class="reader-summary-editor-meta">保存后自动关联到首页「摘录管理」，并保留本书、章节和原文定位。</div>'+ 
   '<div class="reader-summary-editor-actions"><button type="button" data-cancel>取消</button><button type="button" data-save>'+bnIcon('export','sm')+' 保存</button></div>'+
   '</div>';
 var quote=overlay.querySelector(".reader-summary-editor-quote"),ta=overlay.querySelector("[data-note]");
 quote.textContent=s.text;
 ta.value=existing?String(existing.note||""):"";
 document.body.appendChild(overlay);
 var close=function(){try{overlay.remove()}catch(_){} };
 overlay.querySelector("[data-close]").onclick=close;
 overlay.querySelector("[data-cancel]").onclick=close;
 overlay.addEventListener("pointerdown",function(e){if(e.target===overlay)close();},true);
 overlay.querySelector("[data-save]").onclick=async function(){
   var text=String(ta.value||"").trim();
   var now=Date.now();
   var id=existing&&existing.id?String(existing.id):"summary-note-"+now+"-"+Math.random().toString(36).slice(2,9);
   var bookTitle=String(state.book.documentTitle||state.book.name||state.book.pageTitle||"未命名书籍").trim()||"未命名书籍";
   var sourceBook="《"+bookTitle.replace(/^《|》$/g,"")+"》";
   var sourceFooter=sourceBook;
   var chapterName=String(s.chapterLabel||"正文").trim()||"正文";
   var generatedName=sourceBook+chapterName;
   var annotation={
     id:id,bookId:String(state.book.id),type:"note",text:String(s.text||""),note:text,color:"yellow",
     start:s.start,end:s.end,chapterIndex:s.chapterIndex,chapterLabel:s.chapterLabel,progress:s.progress,
     position:buildIndependentPosition(s),positionVersion:4,
     locator:(s.epubLocator||s.locator||(globalThis.BookNoteLocator?BookNoteLocator.fromRange(s.chapterIndex,Math.max(0,Number(s.start)-Number(state.chapters[s.chapterIndex].textStart||0)),Math.max(0,Number(s.end)-Number(state.chapters[s.chapterIndex].textStart||0)),s.text,{href:(state.chapters[s.chapterIndex]||{}).href,fragment:(state.chapters[s.chapterIndex]||{}).fragment,documentStart:Number(s.start)||0,documentEnd:Number(s.end)||Number(s.start)||0}):{chapterIndex:s.chapterIndex,offset:Math.max(0,Number(s.start)-Number(state.chapters[s.chapterIndex].textStart||0))})),epubLocator:s.epubLocator||((s.locator&&String(s.locator.type||'')==='epub')?s.locator:null),
     categoryType:"summary",sourceType:"selection-summary",summaryMode:"selection",source:"reader-summary",
     createdAt:existing&&existing.createdAt||now,updatedAt:now,tags:existing&&Array.isArray(existing.tags)?existing.tags:[],
     displayName:generatedName
   };
   var noteRecord={
     id:id,bookId:String(state.book.id),name:generatedName,pageTitle:bookTitle,pageUrl:location.href,
     selectedText:String(s.text||""),noteText:text,noteHtml:"",category:s.chapterLabel||"未分类",categoryType:"summary",sourceType:"selection-summary",summaryMode:"selection",
     displayName:generatedName,
     readerChapter:chapterName,readerProgress:s.progress,chapterIndex:s.chapterIndex,annotationStart:s.start,annotationEnd:s.end,
     createdAt:annotation.createdAt,updatedAt:now,tags:annotation.tags,favorite:existing&&!!existing.favorite,pinned:false
   };
   try{
     var saved=await BookNoteReadestBridge.saveAnnotation(annotation);
     var r=await browser.storage.local.get("booknoteNotes");
     var notes=Array.isArray(r.booknoteNotes)?r.booknoteNotes:[];
     var ix=notes.findIndex(function(n){return String(n&&n.id)===String(id);});
     if(ix>=0)notes[ix]=Object.assign({},notes[ix],noteRecord);else notes.unshift(noteRecord);
     await browser.storage.local.set({booknoteNotes:notes});
     state.annotations=state.annotations.filter(function(a){return String(a.id)!==String(id);});
     state.annotations.unshift(saved);renderSide();close();clearSelection();toast(existing?"💾 BookNote已更新":"📝 BookNote已保存");
   }catch(e){console.error(e);toast("BookNote保存失败");}
 };
 setTimeout(function(){ta.focus()},0);
}
function openContentAnnotationEditor(existingAnnotation){
 var existing=existingAnnotation||null,s=existing?{start:Number(existing.start),end:Number(existing.end),text:String(existing.text||""),chapterIndex:Number(existing.chapterIndex)||0,chapterLabel:String(existing.chapterLabel||""),progress:Number(existing.progress)||0,range:null,frame:state.runtime&&state.runtime.iframe}:(state.selected||selectionOffsets());
 if(!s||!s.text){toast("请先选择正文");return}
 var initialStyle=contentAnnotationStyleKey(existing),overlay=document.createElement("div");overlay.className="reader-content-annotation-editor-overlay";
 overlay.innerHTML='<div class="reader-content-annotation-editor" role="dialog" aria-modal="true" aria-label="内容注释"><div class="reader-summary-editor-head"><strong><span class="content-annotation-editor-icon">'+contentAnnotationStyleIcon(initialStyle,'')+'</span> 内容注释</strong><button type="button" data-close title="关闭">×</button></div><div class="reader-summary-editor-label">注释内容（原文）</div><div class="reader-summary-editor-quote"></div><div class="reader-summary-editor-label">标记颜色与线型</div><div class="content-annotation-style-picker">'+CONTENT_ANNOTATION_STYLES.map(function(x){return '<button type="button" class="content-annotation-style-option '+(x.key===initialStyle?"active":"")+'" data-content-note-style="'+x.key+'" title="'+x.label+'：'+x.color+' · '+x.line+'"><span class="content-annotation-style-title">'+x.label+'</span><span class="content-annotation-style-visual"><span class="content-annotation-style-icon-wrap">'+contentAnnotationStyleIcon(x.key,'content-annotation-style-option-icon')+'</span><span class="content-annotation-style-line-info"><small>'+({focus:"方点虚线",insight:"圆形虚线",receive:"长点虚线"}[x.key]||x.line)+'</small>'+contentAnnotationPattern(x.key,'content-annotation-style-preview')+'</span></span></button>'}).join('')+'</div><div class="reader-summary-editor-label">内容注释（可编辑）</div><textarea data-note spellcheck="false" placeholder="输入对这段内容的注释、说明或理解……"></textarea><div class="reader-summary-editor-actions"><button type="button" data-cancel>取消</button><button type="button" data-save>'+bnIcon('export','sm')+' 保存</button></div></div>';
 overlay.querySelector('.reader-summary-editor-quote').textContent=s.text;overlay.querySelector('[data-note]').value=existing?String(existing.note||""):"";document.body.appendChild(overlay);var selectedStyle=initialStyle;overlay.querySelectorAll('[data-content-note-style]').forEach(function(b){b.onclick=function(e){e.preventDefault();selectedStyle=b.dataset.contentNoteStyle||"focus";overlay.querySelectorAll('[data-content-note-style]').forEach(function(x){x.classList.toggle('active',x===b)})}});var close=function(){overlay.remove()};overlay.querySelector('[data-close]').onclick=close;overlay.querySelector('[data-cancel]').onclick=close;overlay.addEventListener('pointerdown',function(e){if(e.target===overlay)close()},true);
 overlay.querySelector('[data-save]').onclick=async function(){var text=String(overlay.querySelector('[data-note]').value||"").trim();if(!text){toast("请输入内容注释");return}var now=Date.now(),id=existing&&existing.id?String(existing.id):"content-annotation-"+now+"-"+Math.random().toString(36).slice(2,9),canon=state.canonicalChapters[s.chapterIndex]||state.chapters[s.chapterIndex]||{},base=Number(canon.textStart)||0,style=getContentAnnotationStyle(selectedStyle);var a={id:id,bookId:String(state.book.id),type:"note",text:String(s.text||""),note:text,color:style.color,contentAnnotationStyle:style.key,contentAnnotationColor:style.color,contentAnnotationLine:style.line,start:s.start,end:s.end,chapterIndex:s.chapterIndex,chapterLabel:s.chapterLabel,progress:s.progress,locator:(s.epubLocator||s.locator||(globalThis.BookNoteLocator?BookNoteLocator.fromRange(s.chapterIndex,Math.max(0,Number(s.start)-base),Math.max(0,Number(s.end)-base),s.text,{href:canon.href,fragment:canon.fragment,documentStart:Number(s.start)||0,documentEnd:Number(s.end)||Number(s.start)||0}):{chapterIndex:s.chapterIndex,offset:Math.max(0,Number(s.start)-base)})),epubLocator:s.epubLocator||((s.locator&&String(s.locator.type||'')==='epub')?s.locator:null),sourceType:"content-annotation",categoryType:"content-annotation",summaryMode:"content-annotation",position:buildIndependentPosition(s),positionVersion:4,source:"reader-content-annotation",createdAt:existing&&existing.createdAt||now,updatedAt:now};try{var saved=await BookNoteReadestBridge.saveAnnotation(a);state.annotations=state.annotations.filter(function(x){return String(x.id)!==String(id)});state.annotations.unshift(saved);close();renderSide();if(state.runtime&&state.runtime.iframe)await renderChapterContentAnnotations(state.runtime.iframe.contentDocument,state.currentChapter);clearSelection();toast(existing?"💾 内容注释已更新":"📖 内容注释已保存")}catch(e){console.error(e);toast("内容注释保存失败")}};setTimeout(function(){overlay.querySelector('[data-note]').focus()},0)
}

async function saveAnnotation(type,color){var s=state.selected||selectionOffsets();if(!s||!s.text)return toast("请先选择正文");var note="";if(type==="note"){note=prompt("请输入笔记：","");if(note===null)return}var canon=state.canonicalChapters[s.chapterIndex]||state.chapters[s.chapterIndex]||{},base=Number(canon.textStart)||0;var a={bookId:String(state.book.id),type:type,text:s.text,note:note,color:type==="highlight"?getHighlightColorMeta(color).key:"yellow",start:s.start,end:s.end,chapterIndex:s.chapterIndex,chapterLabel:s.chapterLabel,progress:s.progress,position:buildIndependentPosition(s),positionVersion:4,locator:(s.epubLocator||s.locator||(globalThis.BookNoteLocator?BookNoteLocator.fromRange(s.chapterIndex,Math.max(0,Number(s.start)-base),Math.max(0,Number(s.end)-base),s.text,{href:canon.href,fragment:canon.fragment,documentStart:Number(s.start)||0,documentEnd:Number(s.end)||Number(s.start)||0}):{chapterIndex:s.chapterIndex,offset:Math.max(0,Number(s.start)-base)})),epubLocator:s.epubLocator||((s.locator&&String(s.locator.type||'')==='epub')?s.locator:null)};var saved=await BookNoteReadestBridge.saveAnnotation(a);state.annotations.unshift(saved);renderSide();if(type==="highlight"){var __doc=state.runtime&&state.runtime.iframe&&state.runtime.iframe.contentDocument;var __idx=state.runtime&&Number.isFinite(Number(state.runtime.currentIndex))?Number(state.runtime.currentIndex):Number(s.chapterIndex)||0;if(__doc)await renderChapterHighlights(__doc,__idx);else applyHighlight(saved)}if(type==="bookmark"){toast("已添加书签")}else if(type==="note"){toast("已保存笔记")}else toast("已保存高亮");clearSelection()}
function removeHighlightMarks(id){try{var doc=state.runtime&&state.runtime.iframe&&state.runtime.iframe.contentDocument;if(!doc)return;readerSpeechDomMutationGuard(doc);doc.querySelectorAll('mark.reader-highlight[data-annotation-id="'+CSS.escape(String(id||''))+'"]').forEach(function(m){var p=m.parentNode;if(!p)return;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m);});readerSpeechNormalizeIfIdle(doc);}catch(_){} }
function buildCanonicalDocumentModel(){
 try{
  if(!globalThis.BookNoteCanonicalBlocks)return null;
  var list=state.canonicalChapters.length?state.canonicalChapters:state.chapters;
  var text=list.length?list.map(function(c){return String(c&&c.text||'');}).join(''):'';
  var tocTree=state.toc||[];
  if(globalThis.BookNoteCanonicalToc){
   var tr=BookNoteCanonicalToc.build({chapters:list,toc:tocTree});
   if(!tr.ok)console.warn('[BookNote Canonical TOC] validation failed',tr.errors);
   tocTree=tr.tree; state.toc=tocTree;
  }
  if(globalThis.BookNoteCanonicalBlockAdapter){
   var built=BookNoteCanonicalBlockAdapter.build({source:state.source||{},content:state.content||{},title:(state.book&&state.book.title)||'',text:text,chapters:list,toc:tocTree,metadata:{title:(state.book&&state.book.title)||'',bookId:(state.book&&state.book.id)||''}});
   state.canonicalChapters=built.chapters;
   state.canonicalDocument=built.document;
   var vr=BookNoteCanonicalBlocks.validateDocument(state.canonicalDocument);
   if(!vr.ok)console.warn('[BookNote Canonical Blocks] validation failed',vr.errors);
   return state.canonicalDocument;
  }
  var doc=BookNoteCanonicalBlocks.createDocument({metadata:{title:(state.book&&state.book.title)||'',bookId:(state.book&&state.book.id)||''},source:state.source||{},text:text,chapters:list,toc:tocTree});
  var vr2=BookNoteCanonicalBlocks.validateDocument(doc);
  if(!vr2.ok)console.warn('[BookNote Canonical Blocks] validation failed',vr2.errors);
  state.canonicalDocument=doc;
  return doc;
 }catch(e){console.warn('[BookNote Canonical Blocks] build failed',e);return null;}
}
function scrollRectToReaderCenter(doc,rect){
  if(!doc||!rect)return false;
  try{
    var win=doc.defaultView;if(!win)return false;
    var de=doc.documentElement||{};
    var body=doc.body||{};
    var viewportH=Number(win.innerHeight)||Number(de.clientHeight)||0;
    var viewportW=Number(win.innerWidth)||Number(de.clientWidth)||0;
    if(!viewportH&&!viewportW)return false;
    var curY=Number(win.scrollY);if(!Number.isFinite(curY))curY=Number(de.scrollTop)||Number(body.scrollTop)||0;
    var curX=Number(win.scrollX);if(!Number.isFinite(curX))curX=Number(de.scrollLeft)||Number(body.scrollLeft)||0;
    var targetY=curY+(Number(rect.top)||0)-Math.max(0,viewportH/2-(Number(rect.height)||0)/2);
    var targetX=curX+(Number(rect.left)||0)-Math.max(0,viewportW/2-(Number(rect.width)||0)/2);
    var maxY=Math.max(0,(Number(de.scrollHeight)||Number(body.scrollHeight)||0)-viewportH);
    var maxX=Math.max(0,(Number(de.scrollWidth)||Number(body.scrollWidth)||0)-viewportW);
    targetY=Math.max(0,Math.min(maxY,targetY));
    targetX=Math.max(0,Math.min(maxX,targetX));
    win.scrollTo({top:targetY,left:targetX,behavior:'auto'});
    if(state.runtime&&state.runtime.updateScrollState)state.runtime.updateScrollState();
    return true;
  }catch(e){
    try{
      var w=doc.defaultView;if(!w)return false;
      var h=Number(w.innerHeight)||0;
      var y=(Number(w.scrollY)||0)+(Number(rect.top)||0)-Math.max(0,h/2-(Number(rect.height)||0)/2);
      w.scrollTo(0,Math.max(0,y));
      if(state.runtime&&state.runtime.updateScrollState)state.runtime.updateScrollState();
      return true;
    }catch(_){return false}
  }
}
function scrollResolvedPosition(res){if(!res||!res.range||!res.doc)return false;try{var r=res.range;if(r.collapsed){var probe=res.doc.createRange(),n=r.startContainer,o=Number(r.startOffset)||0;probe.setStart(n,o);if(n&&n.nodeType===3){var len=String(n.nodeValue||'').length;if(o<len)probe.setEnd(n,o+1);else if(o>0){probe.setStart(n,o-1);probe.setEnd(n,o);}}var rect=probe.getBoundingClientRect();if(scrollRectToReaderCenter(res.doc,rect))return true}var rect2=r.getBoundingClientRect();if(scrollRectToReaderCenter(res.doc,rect2))return true;r.scrollIntoView({block:'center'});if(state.runtime&&state.runtime.updateScrollState)state.runtime.updateScrollState();return true}catch(_){return false}}
function nextReaderFrame(doc){return new Promise(function(resolve){var win=doc&&doc.defaultView;if(!win||!win.requestAnimationFrame)return setTimeout(resolve,32);win.requestAnimationFrame(function(){win.requestAnimationFrame(resolve)})})}
function scrollHighlightMarkToCenter(doc,marks,resolved){
  if(!doc)return false;
  /* v7.18.39: navigation must use the persisted Range start, not the visual
     size/order of <mark> fragments. This is especially important when the
     selection spans multiple lines, inline spans, or previously highlighted
     nodes. */
  if(resolved&&resolved.range){
    var startRect=bookmarkStartRect(doc,resolved.range);
    if(startRect)return scrollRectToReaderCenter(doc,startRect);
  }
  if(!marks||!marks.length)return false;
  var target=null;
  for(var i=0;i<marks.length;i++){if(marks[i]&&marks[i].isConnected){target=marks[i];break;}}
  if(!target)return false;
  return scrollRectToReaderCenter(doc,target.getBoundingClientRect());
}
function unwrapAllReaderHighlightMarks(doc){if(!doc)return;try{readerSpeechDomMutationGuard(doc);doc.querySelectorAll("mark.reader-highlight").forEach(function(m){var p=m.parentNode;if(!p)return;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m)});readerSpeechNormalizeIfIdle(doc)}catch(e){console.warn("unwrap reader highlights failed",e)}}
function renderChapterHighlights(doc,idx){if(!doc)return Promise.resolve([]);var token=++state.highlightRenderSeq,items=state.annotations.filter(function(a){return a&&a.type==="highlight"&&annotationBelongsToSection(a,idx)}).slice().sort(function(a,b){var sa=Number(a.start)||0,sb=Number(b.start)||0;if(sa!==sb)return sa-sb;var ea=Number(a.end)||sa,eb=Number(b.end)||sb;if(ea!==eb)return ea-eb;return String(a.id||"").localeCompare(String(b.id||""))});state.highlightRenderPromise=state.highlightRenderPromise.catch(function(){}).then(async function(){if(token!==state.highlightRenderSeq)return [];await nextReaderFrame(doc);var out=[];for(var i=0;i<items.length;i++){if(token!==state.highlightRenderSeq)return out;var a=items[i];/* Incremental reconciliation: each annotation owns only its own marks. A failed locator must never erase unrelated, already-visible highlights. */var applied=applyHighlight(a);if(applied&&applied.marks&&applied.marks.length)out.push({annotation:a,marks:applied.marks})}await nextReaderFrame(doc);return out});return state.highlightRenderPromise}
function findHighlightMarksById(doc,id){if(!doc||id==null)return [];var q='mark.reader-highlight[data-annotation-id="'+CSS.escape(String(id))+'"]';return Array.prototype.slice.call(doc.querySelectorAll(q))}

function resolveReaderPosition(a){
 if(!state.runtime||!state.runtime.iframe||!a)return null;
 var pos=positionFromAnnotation(a);
 if(!validateIndependentPosition(a))return null;
 if(state.runtime.isEpubMulti&&state.runtime.isEpubMulti()&&pos&&pos.type==='epub'){
   var edoc=state.runtime.iframe.contentDocument;if(!edoc)return null;
   var eidx=Number(pos.sectionIndex);if(Number(state.runtime.currentIndex)!==eidx)return null;
   var er=state.runtime.epubResolveAnnotation&&state.runtime.epubResolveAnnotation({epubLocator:pos,locator:pos,text:a.text,type:a.type});
   if(!er||!er.range)return null;
   var expected=String((pos.textQuote&&pos.textQuote.exact)||a.text||'');
   if(expected&&strictReaderText(er.range.toString())!==strictReaderText(expected))return null;
   return {doc:edoc,mapped:{start:{node:er.range.startContainer,offset:er.range.startOffset},end:{node:er.range.endContainer,offset:er.range.endOffset},confidence:'epub-position-v2'},range:er.range,index:eidx,start:Number(pos.start),end:Number(pos.end)};
 }
 var list=state.canonicalChapters.length?state.canonicalChapters:state.chapters;
 if(!pos||pos.type!=='reflow')return null;
 var sourceAnchor=pos.sourceAnchor||null,idx,canon,base,start,end,absoluteStart,absoluteEnd,query=String((pos.textQuote&&pos.textQuote.exact)||a.text||'');
 if(sourceAnchor&&Number.isFinite(Number(sourceAnchor.chapterIndex))&&Number.isFinite(Number(sourceAnchor.localStart))&&Number.isFinite(Number(sourceAnchor.localEnd))){
   idx=Math.max(0,Math.min(list.length-1,Number(sourceAnchor.chapterIndex)));
   canon=list[idx]||{};base=Number(canon.textStart)||0;
   start=Number(sourceAnchor.localStart);end=Number(sourceAnchor.localEnd);
   absoluteStart=base+start;absoluteEnd=base+end;
 }else{
   absoluteStart=Number(pos.documentStart);absoluteEnd=Number(pos.documentEnd);if(!Number.isFinite(absoluteStart))return null;
   var located=globalThis.BookNoteLocator?BookNoteLocator.fromAbsolute(list,absoluteStart,Number.isFinite(absoluteEnd)?absoluteEnd:absoluteStart,query,{textQuote:pos.textQuote}):null;
   if(!located)return null;
   idx=Number(located.chapterIndex);canon=list[idx]||{};base=Number(canon.textStart)||0;start=Number(located.start);end=Number(located.end);
 }
 if(!Number.isFinite(start))return null;
 if(sourceAnchor&&sourceAnchor.chapterTextHash&&String(sourceAnchor.chapterTextHash)!==readerPositionHash(String(canon.text||'')))return null;
 if(sourceAnchor&&Number(sourceAnchor.localStart)!==Number(start)||sourceAnchor&&Number(sourceAnchor.localEnd)!==Number(end))return null;
 start=Math.max(base,Math.min(Number(canon.textEnd)!=null?Number(canon.textEnd):base+String(canon.text||'').length,start));
 end=Number.isFinite(end)?Math.max(start,Math.min(Number(canon.textEnd)!=null?Number(canon.textEnd):base+String(canon.text||'').length,end)):start;
 if(state.runtime.currentIndex!==idx)return null;
 if(state.runtime.invalidatePositionMap)state.runtime.invalidatePositionMap(state.runtime.iframe.contentDocument);
 var mapped=state.runtime.canonicalToDom(idx,start-base,end-base,query,{annotation:true});
 /* v7.18.55 ODT/DOCX: reflow DOM may rebuild inline nodes; retry by persisted canonical offsets. EPUB is excluded. */
 /* Annotation restore is single-path and fail-closed. Do not retry with a weaker locator. */
 if(!mapped||!mapped.start)return null;
 /* v7.18.56: non-EPUB annotation restore must never guess by repeated-text
    occurrence/context or proportional DOM ratio. Those fallbacks caused records
    to jump to another identical sentence after refresh. Source anchors and the
    full normalized document map are deterministic; everything else fails closed. */
 if(mapped.confidence!=='source-anchor-exact'&&mapped.confidence!=='txt-source-annotated-exact'&&mapped.confidence!=='odt-source-anchor-exact'&&mapped.confidence!=='docx-source-anchor-exact'&&mapped.confidence!=='normalized-exact')return null;
 var doc=state.runtime.iframe.contentDocument;if(!doc)return null;var r=doc.createRange();try{r.setStart(mapped.start.node,mapped.start.offset);r.setEnd((mapped.end&&mapped.end.node)||mapped.start.node,(mapped.end&&mapped.end.offset)!=null?mapped.end.offset:mapped.start.offset)}catch(_){return null}
 if(query&&strictReaderText(r.toString())!==strictReaderText(query)){
   if(state.runtime.isEpubMulti&&state.runtime.isEpubMulti())return null;
   var actual=String(r.toString()||''),expectedLength=Math.max(0,end-start);
   if(!actual||expectedLength<=0||actual.length<Math.max(1,Math.floor(expectedLength*0.5)))return null;
 }
 return {doc:doc,mapped:mapped,range:r,index:idx,start:absoluteStart,end:Number.isFinite(absoluteEnd)?absoluteEnd:absoluteStart};
}
function applyHighlight(a){if(!state.runtime||!state.runtime.iframe||!a)return false;try{var res=resolveReaderPosition(a);if(!res||res.range.collapsed)return false;removeHighlightMarks(a.id);var color=getHighlightColorMeta(a.color).key;if(!((state.runtime.isEpubMulti&&state.runtime.isEpubMulti()) ? wrapReaderRange(res.doc,res.mapped.start,res.mapped.end,'reader-highlight','data-annotation-id',a.id,String(a.text||'')) : wrapReaderRange(res.doc,res.mapped.start,res.mapped.end,'reader-highlight','data-annotation-id',a.id,null)))return false;readerSpeechDomMutationGuard(res.doc);var marks=res.doc.querySelectorAll('mark.reader-highlight[data-annotation-id="'+CSS.escape(String(a.id))+'"]');if(!marks.length)return false;var bgDay={yellow:"#FFE58A",red:"#F6B4B4",pink:"#F5C2DA",green:"#BFE3C5",blue:"#B9DCF0",purple:"#D7BEEB"},fgDay={yellow:"#20252B",red:"#2B1717",pink:"#351421",green:"#132318",blue:"#10212A",purple:"#24162D"},bgNight={yellow:"#8F7A22",red:"#7A4247",pink:"#7A465F",green:"#45664D",blue:"#405E70",purple:"#5B476C"},fgNight={yellow:"#FFF8D7",red:"#FFF0F0",pink:"#FFF0F7",green:"#F0FFF3",blue:"#F0FAFF",purple:"#F8F0FF"},palette=(state.themeMode==="night"?bgNight:bgDay),foreground=(state.themeMode==="night"?fgNight:fgDay);marks.forEach(function(m){m.setAttribute('data-color',color);var bg=palette[color]||palette.yellow,fg=foreground[color]||foreground.yellow;m.style.setProperty('background-color',bg,'important');m.style.setProperty('background',bg,'important');m.style.setProperty('color',fg,'important');m.style.setProperty('-webkit-text-fill-color',fg,'important');m.style.setProperty('text-shadow','none','important')});if(state.runtime.invalidatePositionMap)state.runtime.invalidatePositionMap(res.doc);return {doc:res.doc,marks:marks,resolved:res}}catch(err){console.warn('applyHighlight failed',err);return false}}
function contentAnnotationMarkerLayer(doc){var host=$("viewport");if(!host)return null;var layer=document.getElementById("booknoteContentAnnotationMarkerLayer");if(layer&&layer.parentNode===host)return layer;if(layer)layer.remove();layer=document.createElement("div");layer.id="booknoteContentAnnotationMarkerLayer";layer.className="booknote-content-annotation-marker-layer";layer.setAttribute("aria-hidden","false");host.appendChild(layer);return layer}
function clearContentAnnotationMarkers(){try{var layer=document.getElementById("booknoteContentAnnotationMarkerLayer");if(layer)layer.remove()}catch(_){} }
function contentAnnotationMarkerRect(doc,range){return bookmarkStartRect(doc,range)}
function contentAnnotationUnderlineBackground(style){var m=getContentAnnotationStyle(style),p=m.palette||[],svg,colors=p.map(function(c){return c.replace(/&/g,"&amp;").replace(/"/g,"&quot;")});if(m.key==="focus"){svg='<svg xmlns="http://www.w3.org/2000/svg" width="60" height="2" viewBox="0 0 60 2"><path d="M0 0H2 M6 0H8 M12 0H14 M18 0H20 M24 0H26 M30 0H32 M36 0H38 M42 0H44 M48 0H50 M54 0H56" stroke="'+colors[0]+'" stroke-width="2" stroke-linecap="butt"/></svg>';}else if(m.key==="insight"){svg='<svg xmlns="http://www.w3.org/2000/svg" width="60" height="2" viewBox="0 0 60 2"><path d="M1 1h0 M7 1h0 M13 1h0 M19 1h0 M25 1h0 M31 1h0 M37 1h0 M43 1h0 M49 1h0 M55 1h0" stroke="'+colors[0]+'" stroke-width="2" stroke-linecap="round"/></svg>';}else if(m.key==="receive"){svg='<svg xmlns="http://www.w3.org/2000/svg" width="60" height="2" viewBox="0 0 60 2"><defs><linearGradient id="g" x1="0" y1="0" x2="60" y2="0" gradientUnits="userSpaceOnUse">'+colors.map(function(c,i){return '<stop offset="'+(i/(colors.length-1)*100)+'%" stop-color="'+c+'"/>'}).join("")+'</linearGradient></defs><path d="M0 1H60" stroke="url(#g)" stroke-width="2" stroke-linecap="butt" stroke-dasharray="6 4" fill="none"/></svg>';}else return '';return 'url("data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg)+'")'}
function contentAnnotationUnderlineRects(doc,range){return bookmarkUnderlineRects(doc,range)}
function contentAnnotationMarkerFromRange(doc,a,range,idx,layer){if(!doc||!range||!layer)return null;var style=getContentAnnotationStyle(contentAnnotationStyleKey(a)),underlines=[],lineRects=contentAnnotationUnderlineRects(doc,range);for(var ui=0;ui<lineRects.length;ui++){var underline=document.createElement('div');underline.className='booknote-content-annotation-underline booknote-content-annotation-underline-'+style.key;underline.setAttribute('aria-hidden','true');underline.style.setProperty('--content-note-color',style.color);underline.style.backgroundImage=contentAnnotationUnderlineBackground(style.key);layer.appendChild(underline);underlines.push(underline)}var img=document.createElement("div");img.className="booknote-content-annotation-marker booknote-content-annotation-marker-"+style.key;img.setAttribute("role","button");img.setAttribute("aria-label","内容注释："+style.label);img.title="点击编辑内容注释";img.dataset.aid=String(a.id||"");img.innerHTML=contentAnnotationStyleIcon(style.key,"booknote-content-annotation-marker-image");img.__contentAnnotationAnchor={doc:doc,range:range,layer:layer,iframe:state.runtime&&state.runtime.iframe,annotation:a,underlines:underlines};layer.appendChild(img);img.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();openContentAnnotationEditor(a)},true);positionContentAnnotationMarker(img);return img}
function readerMarkerVisibleBottom(host,hostRect){var bottom=Math.max(0,host.clientHeight||0),nav=document.getElementById("bottomNavigator");if(nav&&nav.isConnected){var nr=nav.getBoundingClientRect(),overlapTop=nr.top-hostRect.top,overlapBottom=nr.bottom-hostRect.top;if(overlapTop>0&&overlapTop<bottom&&overlapBottom>overlapTop){bottom=Math.min(bottom,overlapTop)}}return bottom}
function positionContentAnnotationMarker(el){var meta=el&&el.__contentAnnotationAnchor;if(!meta)return false;var doc=meta.doc,range=meta.range,layer=meta.layer,iframe=meta.iframe,host=$("viewport");if(!doc||!range||!layer||!iframe||!host||!layer.isConnected||!iframe.isConnected)return false;var r=contentAnnotationMarkerRect(doc,range);if(!r)return false;var fr=iframe.getBoundingClientRect(),vr=host.getBoundingClientRect(),
      // v7.10.352: 内容注释与正文书签共享同一 52px 视觉尺寸和左侧轨道。
      size=52,markerHeight=52,markerGutter=54,markerTrackWidth=48;
    // v7.10.353: center the content-annotation icon against the visual line
    // box, matching the bookmark marker's vertical alignment.
    var contentLineMetrics=bookmarkLineMetrics(doc,range.startContainer,r);
    var contentLineTop=Number.isFinite(contentLineMetrics&&contentLineMetrics.top)?contentLineMetrics.top:r.top;
    var contentLineHeight=Number.isFinite(contentLineMetrics&&contentLineMetrics.height)?contentLineMetrics.height:r.height;
    // v7.10.371: center the content-annotation artwork on the shared marker axis.
    var lineAnchor=bookmarkFirstVisualLineAnchor(doc,range,r);var markerGap=35;
    // v7.18.55 Office-only: content-note artwork shares the same fixed
    // left gutter as bookmarks. EPUB keeps its existing visual-line anchor.
    var x=isOfficeReaderSource()
      ? Math.max(4,fr.left-vr.left-size-markerGap)
      : Math.max(4,fr.left+lineAnchor.left-vr.left-size-markerGap),y=fr.top+lineAnchor.top-vr.top+(contentLineHeight-markerHeight)/2;
    // v7.10.394: keep the v7.10.389 navigation/anchor chain unchanged.
    // Only remove the old top-clamp fallback: an off-screen annotation must
    // be clipped, never relocated to the viewport top where several markers
    // can stack on one another.
    var visibleBottom=readerMarkerVisibleBottom(host,vr),markerBottom=y+markerHeight,markerVisible=markerBottom>0&&y<visibleBottom;
    el.style.left=Math.round(x)+"px";el.style.top=Math.round(y)+"px";el.style.width=size+"px";el.style.height=markerHeight+"px";el.style.visibility=markerVisible?"visible":"hidden";el.style.opacity=markerVisible?"1":"0";
    var underlines=Array.isArray(meta.underlines)?meta.underlines:[],lineRects=contentAnnotationUnderlineRects(doc,range),lineHeight=2;for(var i=0;i<underlines.length;i++){var line=underlines[i],lr=lineRects[i];if(!line||!line.isConnected)continue;if(lr){var ux=fr.left+lr.left-vr.left,uy=fr.top+lr.bottom-vr.top+2,uw=Math.max(2,lr.right-lr.left);line.style.left=Math.round(ux)+"px";line.style.top=Math.round(uy)+"px";line.style.width=Math.round(uw)+"px";line.style.height=lineHeight+"px";var lineVisible=uy+lineHeight>0&&uy<visibleBottom;line.style.visibility=lineVisible?"visible":"hidden";line.style.opacity=lineVisible?"1":"0"}else line.style.visibility="hidden"}return true}
function refreshContentAnnotationMarkerPositions(){var layer=document.getElementById("booknoteContentAnnotationMarkerLayer");if(!layer)return;Array.prototype.forEach.call(layer.querySelectorAll(".booknote-content-annotation-marker"),positionContentAnnotationMarker)}
function renderChapterContentAnnotations(doc,idx){clearContentAnnotationMarkers();if(!doc)return[];var layer=contentAnnotationMarkerLayer(doc);if(!layer)return[];var items=state.annotations.filter(function(a){return isContentAnnotation(a)&&annotationBelongsToSection(a,idx)}).slice().sort(function(a,b){var sa=Number(a.start)||0,sb=Number(b.start)||0;if(sa!==sb)return sa-sb;return String(a.id||"").localeCompare(String(b.id||""))}),out=[];for(var i=0;i<items.length;i++){var a=items[i],res=resolveReaderPosition(a);if(!res)continue;var m=contentAnnotationMarkerFromRange(doc,a,res.range,idx,layer);if(m)out.push({annotation:a,marker:m,range:res.range})}return out}

function bookmarkMarkerLayer(doc){
  var host=$("viewport");
  if(!host)return null;
  var layer=document.getElementById("booknoteBookmarkMarkerLayer");
  if(layer&&layer.parentNode===host)return layer;
  if(layer)layer.remove();
  layer=document.createElement("div");
  layer.id="booknoteBookmarkMarkerLayer";
  layer.className="booknote-bookmark-marker-layer";
  layer.setAttribute("aria-hidden","true");
  host.appendChild(layer);
  return layer;
}
function clearBookmarkMarkers(doc){
  try{
    var layer=document.getElementById("booknoteBookmarkMarkerLayer");
    if(layer)layer.remove();
  }catch(_){}
}
function bookmarkStartRect(doc,range){
  if(!doc||!range)return null;
  var node=range.startContainer,off=Number(range.startOffset)||0,probe=doc.createRange(),rect=null;
  try{
    if(node&&node.nodeType===3){
      var len=String(node.nodeValue||'').length;
      if(len>0){
        var a=Math.max(0,Math.min(off,len));
        if(a<len){probe.setStart(node,a);probe.setEnd(node,a+1)}
        else if(a>0){probe.setStart(node,a-1);probe.setEnd(node,a)}
        else return null;
      }else return null;
    }else{probe.setStart(node,Math.max(0,off));probe.collapse(true)}
    rect=probe.getBoundingClientRect();
    if(rect&&Number.isFinite(rect.left)&&Number.isFinite(rect.top)&&Number.isFinite(rect.bottom)&&rect.height>0)return rect;
    var rects=range.getClientRects&&range.getClientRects();
    if(rects&&rects.length){
      for(var i=0;i<rects.length;i++){var rr=rects[i];if(rr&&rr.height>0&&Number.isFinite(rr.left)&&Number.isFinite(rr.top))return rr}
    }
  }catch(_){}
  return null;
}
function bookmarkLineMetrics(doc,node,rect){
  var el=node&&node.nodeType===1?node:(node&&node.parentElement),fallback=Math.max(12,Math.min(72,Number(rect&&rect.height)||24));
  while(el&&el!==doc.body&&el!==doc.documentElement){
    try{
      var cs=doc.defaultView&&doc.defaultView.getComputedStyle?doc.defaultView.getComputedStyle(el):null;
      if(cs){
        var fs=parseFloat(cs.fontSize)||16,lh=parseFloat(cs.lineHeight);
        if(!Number.isFinite(lh)||lh<=0)lh=fs*1.45;
        return {height:Math.max(12,Math.min(72,lh)),top:rect.top};
      }
    }catch(_){ }
    el=el.parentElement;
  }
  return {height:fallback,top:rect.top};
}
/* v7.18.09 — first visual line anchor shared by bookmarks and content notes.
   The anchor is the LEFT EDGE OF THE FIRST VISUAL LINE containing the marked
   content, not the selection's character offset. This keeps the marker outside
   the text even when the saved Range starts in the middle of a wrapped line. */
function bookmarkFirstVisualLineAnchor(doc,range,startRect){
  if(!doc||!range||!startRect)return {left:startRect.left,top:startRect.top,height:startRect.height};
  var top=Number(startRect.top)||0,tol=Math.max(2,Math.min(8,(Number(startRect.height)||20)*0.45)),bestLeft=Number(startRect.left)||0;
  try{
    var node=range.startContainer,off=Number(range.startOffset)||0,el=node&&node.nodeType===1?node:node&&node.parentElement;
    /* Find the nearest block/container that defines the paragraph line box. */
    while(el&&el!==doc.body&&el!==doc.documentElement){
      var cs=doc.defaultView&&doc.defaultView.getComputedStyle?doc.defaultView.getComputedStyle(el):null;
      var display=cs&&String(cs.display||'');
      if(display==='block'||display==='list-item'||display==='table-cell'||display==='flow-root'||display==='flex'||display==='grid')break;
      el=el.parentElement;
    }
    if(!el)el=doc.body;
    var probe=doc.createRange();
    probe.setStart(el,0);
    probe.setEnd(node,Math.max(0,Math.min(off,node&&node.nodeType===3?String(node.nodeValue||'').length:off)));
    var rects=probe.getClientRects&&probe.getClientRects();
    if(rects&&rects.length){
      var candidates=[];
      for(var i=0;i<rects.length;i++){
        var r=rects[i];
        if(!r||r.width<=0||r.height<=0)continue;
        if(Math.abs(r.top-top)<=tol||Math.abs(r.bottom-startRect.bottom)<=tol)candidates.push(r);
      }
      if(candidates.length){
        for(var j=0;j<candidates.length;j++)bestLeft=Math.min(bestLeft,Number(candidates[j].left)||bestLeft);
      }
    }
    /* If the range starts at a text node boundary, probe one character before
       it as a fallback so an empty collapsed prefix still yields the line edge. */
    if(bestLeft===Number(startRect.left)||!Number.isFinite(bestLeft)){
      var sr=doc.createRange();
      if(node&&node.nodeType===3&&off>0){sr.setStart(node,Math.max(0,off-1));sr.setEnd(node,off);var pr=sr.getBoundingClientRect();if(pr&&Math.abs(pr.top-top)<=tol)bestLeft=Math.min(bestLeft,pr.left);}
    }
  }catch(_){ }
  return {left:bestLeft,top:top,height:Number(startRect.height)||20};
}
function bookmarkMarkerDimensions(doc,a,rect){
  var m=getBookmarkStarMeta(a.star),
      // v7.10.352: 正文书签尺寸与左侧书签列表保持同一视觉高度。
      // 左侧书签图标规范高度为 52px；正文书签保持原图比例，不拉伸。
      h=48;
  var width=30;
  return {height:h,width:width,meta:m};
}
function bookmarkUnderlineColor(star){
  var colors={1:'#A2C561',2:'#77BA19',3:'#D6BB05',4:'#FB4320',5:'#AB243C',6:'#2A1650'};
  return colors[Math.max(1,Math.min(6,Number(star)||1))]||colors[1];
}
function bookmarkUnderlineRects(doc,range){
  if(!doc||!range||!range.getClientRects)return[];
  try{
    var rects=Array.prototype.slice.call(range.getClientRects()).filter(function(r){return r&&r.width>0&&r.height>0&&Number.isFinite(r.left)&&Number.isFinite(r.right)&&Number.isFinite(r.top)&&Number.isFinite(r.bottom)});
    if(!rects.length)return[];
    rects.sort(function(a,b){if(a.top!==b.top)return a.top-b.top;return a.left-b.left});
    // A DOM Range can return several fragments for one visual line (spans, marks,
    // inline elements). Merge fragments that occupy the same line so the star
    // color line is continuous across the entire selected visual line.
    var lines=[];
    for(var i=0;i<rects.length;i++){
      var r=rects[i],line=null;
      for(var j=lines.length-1;j>=0;j--){
        var candidate=lines[j],tol=Math.max(2,Math.min(8,Math.min(r.height,candidate.height)*0.45));
        if(Math.abs(r.top-candidate.top)<=tol||Math.abs(r.bottom-candidate.bottom)<=tol){line=candidate;break}
        if(candidate.top<r.top-tol)break;
      }
      if(!line){line={left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height};lines.push(line)}
      else{line.left=Math.min(line.left,r.left);line.right=Math.max(line.right,r.right);line.top=Math.min(line.top,r.top);line.bottom=Math.max(line.bottom,r.bottom);line.height=Math.max(line.height,r.height)}
    }
    return lines;
  }catch(_){return[]}
}
function bookmarkAnchorFromRange(doc,range,a,idx){
  if(!doc||!range||!a)return null;
  try{
    var layer=bookmarkMarkerLayer(doc),rect=bookmarkStartRect(doc,range),iframe=state.runtime&&state.runtime.iframe;
    if(!layer||!rect||!iframe)return null;
    var dims=bookmarkMarkerDimensions(doc,a,rect),marker=document.createElement('img');
    marker.className='booknote-bookmark-marker booknote-bookmark-marker-star-'+dims.meta.star;
    marker.src=browser.runtime.getURL(dims.meta.src);marker.alt='';marker.title='';marker.draggable=false;marker.setAttribute('aria-hidden','true');
    marker.style.width=dims.width+'px';marker.style.height=dims.height+'px';
    var underlineRects=bookmarkUnderlineRects(doc,range),underlines=[];
    for(var ui=0;ui<underlineRects.length;ui++){
      var underline=document.createElement('div');
      underline.className='booknote-bookmark-underline booknote-bookmark-underline-star-'+dims.meta.star;
      underline.setAttribute('aria-hidden','true');
      underline.style.backgroundColor=bookmarkUnderlineColor(dims.meta.star);
      underline.style.setProperty('visibility','visible','important');
      underline.style.setProperty('opacity','1','important');
      layer.appendChild(underline);
      underlines.push(underline);
    }
    layer.appendChild(marker);
    marker.__bookmarkAnchor={doc:doc,range:range,layer:layer,iframe:iframe,annotation:a,underlines:underlines};
    for(var uj=0;uj<underlines.length;uj++)underlines[uj].__bookmarkAnchor=marker.__bookmarkAnchor;
    marker.style.setProperty('visibility','visible','important');
    marker.style.setProperty('opacity','1','important');
    positionBookmarkMarker(marker);
    (doc.defaultView&&doc.defaultView.requestAnimationFrame?doc.defaultView.requestAnimationFrame:function(fn){setTimeout(fn,0)})(function(){positionBookmarkMarker(marker)});
    return {annotation:a,element:marker,underline:underlines,anchor:layer,range:range,rect:rect,lineHeight:dims.height};
  }catch(e){console.warn('bookmark overlay marker failed',e);return null}
}
function createBookmarkMarker(doc,a,range,idx,layer){return bookmarkAnchorFromRange(doc,range,a,idx)}
function positionBookmarkMarker(el){
  if(!el||!el.__bookmarkAnchor)return false;
  var meta=el.__bookmarkAnchor,doc=meta.doc,layer=meta.layer,range=meta.range,iframe=meta.iframe,host=$("viewport");
  if(!doc||!layer||!range||!iframe||!host||!layer.isConnected||!iframe.isConnected)return false;
  var innerRect=bookmarkStartRect(doc,range);if(!innerRect)return false;
  var iframeRect=iframe.getBoundingClientRect(),hostRect=host.getBoundingClientRect();
  var dims=bookmarkMarkerDimensions(doc,meta.annotation,innerRect);
  // v7.10.353: use the actual visual line box for vertical centering.
  // Glyph rects are usually shorter than the CSS line-height, so centering
  // against innerRect alone makes the 52px marker look too high/low.
  var lineMetrics=bookmarkLineMetrics(doc,range.startContainer,innerRect);
  var lineTop=Number.isFinite(lineMetrics&&lineMetrics.top)?lineMetrics.top:innerRect.top;
  var lineHeight=Number.isFinite(lineMetrics&&lineMetrics.height)?lineMetrics.height:innerRect.height;
  // v7.10.351: reader markers use a stable left-gutter anchor instead of
  // attaching to the selected text's x-coordinate. This keeps bookmarks and
  // content-annotation icons in one predictable visual column.
  var lineAnchor=bookmarkFirstVisualLineAnchor(doc,range,innerRect);
  var markerGap=20;
  // v7.18.55 Office-only: keep the marker in a fixed left gutter.
  // Paragraph first-line indentation, hanging indentation, or a new selection
  // must never move the bookmark artwork horizontally. EPUB retains its
  // existing first-visual-line positioning contract.
  var x=isOfficeReaderSource()
    ? Math.max(4,iframeRect.left-hostRect.left-dims.width-markerGap)
    : Math.max(4,iframeRect.left+lineAnchor.left-hostRect.left-dims.width-markerGap);
  var y=iframeRect.top+lineTop-hostRect.top;
  var visibleBottom=readerMarkerVisibleBottom(host,hostRect);
  var left=Math.max(4,x);
  var top=y+(lineHeight-dims.height)/2;
  el.style.setProperty('width',dims.width+'px','important');
  el.style.setProperty('height',dims.height+'px','important');
  el.style.setProperty('left',Math.round(left)+'px','important');
  el.style.setProperty('top',Math.round(top)+'px','important');
  var markerVisible=top+dims.height>0&&top<visibleBottom;
  el.style.setProperty('visibility',markerVisible?'visible':'hidden','important');
  el.style.setProperty('opacity',markerVisible?'1':'0','important');
  var underlines=Array.isArray(meta.underlines)?meta.underlines:[];
  if(underlines.length){
    var lineRects=bookmarkUnderlineRects(doc,range);
    var lineHeight=2;
    for(var li=0;li<underlines.length;li++){
      var line=underlines[li],r=lineRects[li];
      if(!line||!line.isConnected)continue;
      if(r){
        var ux=iframeRect.left+r.left-hostRect.left;
        var uy=iframeRect.top+r.bottom-hostRect.top;
        var uw=Math.max(2,r.right-r.left);
        line.style.setProperty('left',Math.round(ux)+'px','important');
        line.style.setProperty('top',Math.round(uy+2)+'px','important');
        line.style.setProperty('width',Math.round(uw)+'px','important');
        line.style.setProperty('height',lineHeight+'px','important');
        line.style.setProperty('background-color',bookmarkUnderlineColor(meta.annotation.star),'important');
        var lineVisible=uy+lineHeight>0&&uy<visibleBottom;
        line.style.setProperty('visibility',lineVisible?'visible':'hidden','important');
        line.style.setProperty('opacity',lineVisible?'1':'0','important');
      }else line.style.setProperty('visibility','hidden','important');
    }
    // If reflow changed the number of visual lines, rebuild the underline set.
    if(lineRects.length!==underlines.length){
      var parent=layer,annotation=meta.annotation;
      for(var ri=0;ri<underlines.length;ri++)if(underlines[ri]&&underlines[ri].isConnected)underlines[ri].remove();
      meta.underlines=[];
      for(var ni=0;ni<lineRects.length;ni++){
        var fresh=document.createElement('div');
        fresh.className='booknote-bookmark-underline booknote-bookmark-underline-star-'+getBookmarkStarMeta(annotation.star).star;
        fresh.setAttribute('aria-hidden','true');
        fresh.style.backgroundColor=bookmarkUnderlineColor(annotation.star);
        parent.appendChild(fresh);
        meta.underlines.push(fresh);
      }
      positionBookmarkMarker(el);
    }
  }
  return true;
}
function refreshBookmarkMarkerPositions(doc){
  var layer=document.getElementById("booknoteBookmarkMarkerLayer");
  if(!layer)return;
  Array.prototype.forEach.call(layer.querySelectorAll('.booknote-bookmark-marker'),positionBookmarkMarker);
}
function epubAnnotationSectionIndex(a){
  if(!a)return null;
  var loc=a.epubLocator||a.locator||{};
  if(String(loc.type||loc.format||'')!=='epub' && !(loc.sectionIndex!=null||loc.spineIndex!=null))return null;
  var n=loc.sectionIndex!=null?Number(loc.sectionIndex):(loc.spineIndex!=null?Number(loc.spineIndex):Number(a.chapterIndex));
  return Number.isFinite(n)?n:null;
}
function annotationBelongsToSection(a,idx){
  if(!a)return false;
  var p=positionFromAnnotation(a);
  if(p&&p.type==='epub'&&Number.isFinite(Number(p.sectionIndex)))return Number(p.sectionIndex)===Number(idx);
  if(p&&p.type==='reflow'&&p.sourceAnchor&&Number.isFinite(Number(p.sourceAnchor.chapterIndex)))return Number(p.sourceAnchor.chapterIndex)===Number(idx);
  /* Compatibility-only path for legacy records that predate chapter-local anchors. */
  if(p&&p.type==='reflow'&&Number.isFinite(Number(p.documentStart))){
    var list=state.canonicalChapters.length?state.canonicalChapters:state.chapters;
    if(globalThis.BookNoteLocator&&list&&list.length){
      var resolved=BookNoteLocator.fromAbsolute(list,Number(p.documentStart),Number.isFinite(Number(p.documentEnd))?Number(p.documentEnd):Number(p.documentStart),String((p.textQuote&&p.textQuote.exact)||a.text||''),{textQuote:p.textQuote});
      if(resolved&&Number.isFinite(Number(resolved.chapterIndex)))return Number(resolved.chapterIndex)===Number(idx);
    }
  }
  var e=epubAnnotationSectionIndex(a);
  if(e!==null)return Number(e)===Number(idx);
  return Number(a.chapterIndex)===Number(idx);
}
async function renderChapterBookmarks(doc,idx){
  if(!doc)return[];
  clearBookmarkMarkers(doc);
  var items=state.annotations.filter(function(a){return a&&a.type==='bookmark'&&annotationBelongsToSection(a,idx)}).slice().sort(function(a,b){var sa=Number(a.start)||0,sb=Number(b.start)||0;if(sa!==sb)return sa-sb;return String(a.id||'').localeCompare(String(b.id||''))}),out=[];
  var layer=bookmarkMarkerLayer(doc);if(!layer)return out;
  for(var i=0;i<items.length;i++){
    var a=items[i],res=resolveReaderPosition(a);if(!res)continue;
    var marker=createBookmarkMarker(doc,a,res.range,idx,layer);if(marker)out.push(marker);
  }
  return out;
}
async function refreshAnnotations(){try{state.annotations=await BookNoteReadestBridge.listAnnotations(state.book.id);var repairs=[];state.annotations=state.annotations.map(function(a){var next=a,p=positionFromAnnotation(a);if(!validateIndependentPosition(a)||(p&&p.type==='reflow'&&Number(p.version)!==4)){var rebuilt=buildIndependentPosition(a);if(rebuilt){next=Object.assign({},a,{position:rebuilt,positionVersion:Number(rebuilt.version)||4});repairs.push(next)}}if(isContentAnnotation(next)){var k=contentAnnotationStyleKey(next),m=getContentAnnotationStyle(k);next=Object.assign({},next,{contentAnnotationStyle:k,contentAnnotationColor:m.color,contentAnnotationLine:m.line,color:m.color})}return next});if(repairs.length){await Promise.all(repairs.map(function(a){return BookNoteReadestBridge.saveAnnotation(a).catch(function(e){console.warn('[Position Repair]',e)})}))}renderSide()}catch(e){console.warn(e)}}
function bnIcon(name,cls){return '<img class="bn-reader-icon ' +(cls||'') +'" src="'+browser.runtime.getURL("img/ui/"+name+".png")+'" alt="" aria-hidden="true">'}
async function restoreRecordVisualAfterReady(record,idx,doc){
  if(!record||!doc)return false;
  var resolved=null;
  for(var retry=0;retry<6&&!resolved;retry++){
    await nextReaderFrame(doc);
    if(state.runtime&&state.runtime.invalidatePositionMap)state.runtime.invalidatePositionMap(doc);
    resolved=resolveReaderPosition(record);
  }
  if(!resolved)return false;
  try{
    if(record.type==="highlight"){
      await renderChapterHighlights(doc,idx);
    }else if(record.type==="bookmark"){
      await renderChapterBookmarks(doc,idx);
      refreshBookmarkMarkerPositions(doc);
    }else if(isContentAnnotation(record)){
      await renderChapterContentAnnotations(doc,idx);
      refreshContentAnnotationMarkerPositions();
    }
    return true;
  }catch(e){console.warn("[Record Visual Restore] failed",e);return false;}
}
async function jumpAnnotation(a){
  if(!a||!a.id)return;
  var navToken=++state.annotationNavSeq;
  var navCurrent=function(){return navToken===state.annotationNavSeq};
  var fresh=state.annotations.find(function(x){return String(x.id)===String(a.id)})||a;
  state.sideActiveId=String(fresh.id);
  var pos=positionFromAnnotation(fresh);
  if(!pos||!validateIndependentPosition(fresh)){toast("该记录没有有效的位置数据");return;}
  var epubJump=state.runtime&&state.runtime.isEpubMulti&&state.runtime.isEpubMulti()&&pos.type==='epub';
  var list=state.canonicalChapters.length?state.canonicalChapters:state.chapters;
  var idx=epubJump?Number(pos.sectionIndex):0;
  var off=0;
  if(epubJump){
    off=Number(pos.start)||0;
  }else if(pos.type==='reflow'){
    var anchor=pos.sourceAnchor;
    if(anchor&&Number.isFinite(Number(anchor.chapterIndex))&&Number.isFinite(Number(anchor.localStart))){
      idx=Number(anchor.chapterIndex)||0;off=Math.max(0,Number(anchor.localStart));
    }else{
      var abs=Number(pos.documentStart);
      var al=globalThis.BookNoteLocator?BookNoteLocator.fromAbsolute(list,abs,Number(pos.documentEnd),String((pos.textQuote&&pos.textQuote.exact)||fresh.text||''),{textQuote:pos.textQuote}):null;
      if(al){idx=Number(al.chapterIndex)||0;off=Math.max(0,Number(al.start)-(Number(list[idx]&&list[idx].textStart)||0));}
    }
  }
  idx=Math.max(0,Math.min(state.chapters.length-1,Number.isFinite(idx)?idx:Number(fresh.chapterIndex)||0));
  if(state.runtime){
    var runtime=state.runtime;
    try{await runtime.show(idx,off,String(fresh.text||''));}catch(e){if(navCurrent())console.warn('annotation navigation failed',e);return;}
    if(!navCurrent())return;
    if(Number(runtime.currentIndex)!==idx||!runtime.iframe){if(navCurrent())toast("记录定位失败");return;}
    var doc=runtime.iframe.contentDocument;
    await nextReaderFrame(doc);
    if(!navCurrent())return;
    await refreshAnnotations();
    if(!navCurrent())return;
    fresh=state.annotations.find(function(x){return String(x.id)===String(a.id)})||fresh;
    var resolved=null;
    /* v7.12.68: Section/DOM Ready -> Position Retry -> Visual Restore.
       A transient null resolver result is never treated as a missing record. */
    for(var retry=0;retry<6&&!resolved;retry++){
      await nextReaderFrame(doc);
      if(!navCurrent())return;
      if(runtime.invalidatePositionMap)runtime.invalidatePositionMap(doc);
      resolved=resolveReaderPosition(fresh);
    }
    if(!navCurrent())return;
    if(resolved){
      try{var rr=resolved.range,rc=rr&&rr.getBoundingClientRect?rr.getBoundingClientRect():null,rs=rr&&rr.startContainer;}catch(_){ }
      if(fresh.type==='highlight'){
        /* Office: restore the clicked record directly after the iframe rebuild. */
        var __officeRestore=!(runtime.isEpubMulti&&runtime.isEpubMulti()),__restored=false;
        if(__officeRestore){
          for(var __hr=0;__hr<8&&!__restored;__hr++){
            if(!navCurrent())return;
            await nextReaderFrame(doc);
            if(runtime.invalidatePositionMap)runtime.invalidatePositionMap(doc);
            __restored=!!applyHighlight(fresh)&&findHighlightMarksById(doc,fresh.id).length>0;
          }
        }else{
          await renderChapterHighlights(doc,idx);
          __restored=findHighlightMarksById(doc,fresh.id).length>0;
        }
        if(!navCurrent())return;
        var marks=findHighlightMarksById(doc,fresh.id);
        if(marks.length)scrollHighlightMarkToCenter(doc,marks,resolved);else if(!__restored)scrollResolvedPosition(resolved);
      }else if(fresh.type==='bookmark'){
        var bookmarkMarkers=await renderChapterBookmarks(doc,idx);
        if(!navCurrent())return;
        var targetMarker=bookmarkMarkers.find(function(x){return String(x.annotation.id)===String(fresh.id)});
        if(targetMarker&&targetMarker.range){var targetRect=bookmarkStartRect(doc,targetMarker.range);if(targetRect)scrollRectToReaderCenter(doc,targetRect);}
        else scrollResolvedPosition(resolved);
        refreshBookmarkMarkerPositions(doc);
      }else if(isContentAnnotation(fresh)){
        var contentMarkers=await renderChapterContentAnnotations(doc,idx);
        if(!navCurrent())return;
        var targetContent=contentMarkers.find(function(x){return String(x.annotation.id)===String(fresh.id)});
        if(targetContent&&targetContent.range){var cr=bookmarkStartRect(doc,targetContent.range);if(cr)scrollRectToReaderCenter(doc,cr);}else scrollResolvedPosition(resolved);
        refreshContentAnnotationMarkerPositions();
      }else{
        scrollResolvedPosition(resolved);
      }
      try{var fr=resolved.range&&resolved.range.getBoundingClientRect?resolved.range.getBoundingClientRect():null,root=doc.scrollingElement||doc.documentElement;}catch(_){ }
    }else{
      
      toast("记录定位失败：原文位置验证未通过");
    }
  }
  $('sidebar').classList.add('open');$('readerBody').classList.add('sidebar-open');$('sidebarScrim').hidden=true;
  state.activeTab=fresh.type==='bookmark'?'bookmarks':(isContentNote(fresh)||isContentAnnotation(fresh))?'contentNotes':'annotations';
  document.querySelectorAll('.side-tabs button').forEach(function(b){b.classList.toggle('active',b.dataset.tab===state.activeTab)});
  renderSide();syncReaderGeometry();
}
async function deleteAnnotation(a){if(!a||!a.id)return;if(!confirm(a.type==='bookmark'?'删除这个书签？':'删除这个标注？'))return;try{await BookNoteReadestBridge.removeAnnotation(a.id);state.annotations=state.annotations.filter(function(x){return String(x.id)!==String(a.id)});removeHighlightMarks(a.id);if(a.type==="bookmark"&&state.runtime&&state.runtime.iframe)renderChapterBookmarks(state.runtime.iframe.contentDocument,state.currentChapter);if(isContentAnnotation(a)&&state.runtime&&state.runtime.iframe)renderChapterContentAnnotations(state.runtime.iframe.contentDocument,state.currentChapter);renderSide();toast(a.type==='bookmark'?'书签已删除':'标注已删除');}catch(e){console.error(e);toast(a.type==='bookmark'?'删除书签失败':'删除标注失败')}}
async function editBookmark(a){if(!a)return;var current=String(a.note||a.chapterLabel||"书签");var label=prompt("编辑书签名称：",current);if(label===null)return;label=String(label).trim();if(!label)label="书签";try{var saved=await BookNoteReadestBridge.saveAnnotation(Object.assign({},a,{note:label}));state.annotations=state.annotations.map(function(x){return String(x.id)===String(saved.id)?saved:x});if(state.runtime&&state.runtime.iframe)renderChapterBookmarks(state.runtime.iframe.contentDocument,state.currentChapter);renderSide();toast("书签已更新")}catch(e){console.error(e);toast("书签编辑失败")}}
async function addBookmark(star){
  var s=state.selected||null,loc=state.runtime&&state.runtime.getCurrent?state.runtime.getCurrent():{index:state.currentChapter,offset:0},idx=s?s.chapterIndex:Number(loc.index)||0,canon=state.canonicalChapters[idx]||state.chapters[idx]||{},base=Number(canon.textStart)||0,off=s?Math.max(0,Number(s.start)-base):Number(loc.offset)||0,start=s?Number(s.start):base+off,end=s?Number(s.end):start;
  star=Math.max(1,Math.min(6,Number(star)||1));
  var duplicate=null;
  state.annotations.some(function(a){
    if(!a||a.type!=="bookmark"||Number(a.chapterIndex)!==Number(idx))return false;
    var as=Number(a.start),ae=Number(a.end),astar=Math.max(1,Math.min(6,Number(a.star)||1));
    if(!Number.isFinite(as)||!Number.isFinite(ae))return false;
    // 每一个不同的选择内容都必须独立记录，即使星级完全相同。
    // 只有“同章节 + 相同星级 + 相同选择范围 + 相同选中文本”才视为重复。
    // 文本本身也参与判定，避免不同内容因位置映射到相同边界而被错误拦截。
    var sameText=strictReaderText(a.text)===strictReaderText(s&&s.text||"");
    if(as===start&&ae===end&&astar===star&&sameText){
      duplicate=a;
      return true;
    }
    return false;
  });
  if(duplicate){
    toast("该内容已经存在"+getBookmarkStarMeta(star).label+"书签，不能重复添加");
    clearSelection();
    return jumpAnnotation(duplicate);
  }
  try{
    var bookmarkPositionSource=s||{chapterIndex:idx,start:start,end:end,text:'',rawText:''};
    var a=await BookNoteReadestBridge.saveAnnotation({bookId:String(state.book.id),type:'bookmark',text:s?s.text:'',note:getBookmarkStarMeta(star).label,star:star,start:start,end:end,chapterIndex:idx,chapterLabel:(state.chapters[idx]||{}).label||'',progress:state.chapters.length?(idx+1)/state.chapters.length:0,position:buildIndependentPosition(bookmarkPositionSource),positionVersion:4,locator:(s&&s.epubLocator?s.epubLocator:(globalThis.BookNoteLocator?BookNoteLocator.fromRange(idx,off,Math.max(off,Number(end)-base),s?s.text:'',{href:canon.href,fragment:canon.fragment,documentStart:Number(start)||0,documentEnd:Number(end)||Number(start)||0}):{chapterIndex:idx,offset:off})),epubLocator:s&&s.epubLocator?s.epubLocator:null});
    state.annotations.unshift(a);renderSide();
    if(state.runtime&&state.runtime.iframe){
      var doc=state.runtime.iframe.contentDocument;
      var layer=bookmarkMarkerLayer(doc);
      if(s&&s.range&&s.frame===state.runtime.iframe&&Number(state.runtime.currentIndex)===Number(idx)){
        clearBookmarkMarkers(doc);
        var items=state.annotations.filter(function(x){return x&&x.type==='bookmark'&&Number(x.chapterIndex)===Number(idx)}).sort(function(x,y){return (Number(x.start)||0)-(Number(y.start)||0)});
        for(var i=0;i<items.length;i++){
          var item=items[i],range=(String(item.id)===String(a.id))?s.range:null,res=range?{range:range}:resolveReaderPosition(item);
          if(res)createBookmarkMarker(doc,item,res.range,idx,layer);
        }
        refreshBookmarkMarkerPositions(doc);
      }else await renderChapterBookmarks(doc,idx);
    }
    toast(getBookmarkStarMeta(star).label+'书签已添加');clearSelection();
  }catch(e){console.error(e);toast('书签保存失败')}
}
async function exportCanonicalModel(){
  try{
    if(!globalThis.BookNoteCanonicalExport||!state.canonicalDocument)throw new Error("Canonical Document unavailable");
    var reading=await BookNoteReadestBridge.loadProgress(String(state.book.id));
    var doc=state.canonicalDocument||buildCanonicalDocumentModel();
    var payload=BookNoteCanonicalExport.buildAsync?await BookNoteCanonicalExport.buildAsync({document:doc,annotations:state.annotations,readingPosition:reading}):BookNoteCanonicalExport.build({document:doc,annotations:state.annotations,readingPosition:reading});
    var vr=BookNoteCanonicalExport.validate(payload);
    if(!vr.ok)throw new Error("Canonical export validation failed: "+JSON.stringify(vr.errors));
    var title=String(state.book.documentTitle||state.book.name||"book").replace(/[^\w\u4e00-\u9fa5-]+/g,"-");
    var blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="booknote-canonical-"+title+".json";document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url)},1000);toast("Canonical Model 已导出");
  }catch(e){console.error("Canonical export failed",e);toast("Canonical Model 导出失败")}
}
async function importCanonicalModelFile(file){
  try{
    if(!file)throw new Error("未选择文件");
    if(!globalThis.BookNoteCanonicalImport)throw new Error("Canonical Import 模块不可用");
    var text=await file.text(),payload=BookNoteCanonicalImport.parseText(text),vr=BookNoteCanonicalImport.validate(payload);
    if(!vr.ok)throw new Error("Canonical Import 校验失败："+vr.errors.map(function(x){return x.code;}).join("、"));
    var result=await BookNoteCanonicalImport.persist(payload,{});
    toast("Canonical Model 已导入");
    setTimeout(function(){location.href=browser.runtime.getURL("reader/reader.html")+"?bookId="+encodeURIComponent(result.id)},120);
  }catch(e){console.error("Canonical import failed",e);toast("Canonical Model 导入失败："+(e&&e.message||e));}
}

async function exportAnnotations(){var payload={version:1,bookId:String(state.book.id),bookTitle:state.book.documentTitle||state.book.name||"",exportedAt:new Date().toISOString(),annotations:state.annotations};var blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="booknote-annotations-"+String(state.book.documentTitle||state.book.name||"book").replace(/[^\w\u4e00-\u9fa5-]+/g,"-")+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000);toast("标注已导出")}
function goHome(){location.href=browser.runtime.getURL("booknote/panel.html?fromReader=1")}
function syncThemeState(){if(globalThis.BookNoteGlobalTheme)return BookNoteGlobalTheme.update({themeName:state.themeName,themeMode:state.themeMode}).catch(function(e){console.warn("reader theme sync",e)});var st={};return browser.storage.local.get("booknotePanelState").then(function(r){st=r.booknotePanelState||{};st.themeName=state.themeName;st.themeMode=state.themeMode;return browser.storage.local.set({booknotePanelState:st})}).catch(function(e){console.warn("reader theme sync",e)})}
function applyReaderThemeControls(){document.querySelectorAll(".reader-theme-option").forEach(function(b){b.classList.toggle("active",b.dataset.themeChoice===state.themeName)});$("lightTheme").classList.toggle("active",state.themeMode==="day");$("darkTheme").classList.toggle("active",state.themeMode==="night")}
function setLayout(){state.layout="scroll";if(state.runtime&&state.runtime.setDisplayMode)state.runtime.setDisplayMode("scroll").catch(function(){});updateLayoutControls();}
function updateLayoutControls(){document.querySelectorAll(".layout-btn").forEach(function(b){b.remove()});}
function updateScrollSlider(){var sl=$("readerScrollSlider"),r=state.runtime&&state.runtime.getScrollState&&state.runtime.getScrollState();if(!sl||!r)return;sl.value=Math.round((Number(r.ratio)||0)*1000);var top=$("readerScrollTop"),bottom=$("readerScrollBottom"),ratio=Math.max(0,Math.min(1,Number(r.ratio)||0)),eps=.005;if(top)top.disabled=ratio<=eps; if(bottom)bottom.disabled=ratio>=1-eps;}
function scrollReaderToEdge(edge){if(!state.runtime||!state.runtime.scrollToEdge)return;state.runtime.scrollToEdge(edge);updateScrollSlider();}
function scrollReaderByPage(dir){if(!state.runtime)return;state.runtime.scrollByPage(dir);}
function updateModeControl(){
 var night=state.themeMode==="night";
 $("modeIcon").src=browser.runtime.getURL(night?"img/ui/moon.png":"img/ui/sun.png");
 $("modeLabel").textContent=night?"黑夜":"白天";
 $("modeBtn").title=night?"切换到白天":"切换到黑夜";
 $("modeBtn").setAttribute("aria-label",night?"黑夜":"白天");
}
async function openThemePanel(){
 var p=$("settingsPanel");
 p.hidden=!p.hidden;
 if(!p.hidden){
   state.settings=await BookNoteReadestBridge.getReaderSettings();
   $("fontScale").value=state.settings.fontScale||100;
   $("lineHeight").value=Math.round(Number(state.settings.lineHeight||1.85)*10);
   $("widthMode").value=state.settings.width||"medium";
   applyReaderThemeControls();
 }
}
function closeThemePanel(){$("settingsPanel").hidden=true}

var readerSpeechState={status:"idle",token:0,queue:[],index:0,utterance:null,/* Default: Word/Phrase visual follow ON; Sentence visual follow OFF. */sentenceFollowHighlight:false,wordFollowHighlight:true,source:null,selection:null,selectionKey:"",sessionId:0,currentSpeakText:"",currentSpeechItem:null,currentSentenceMark:null,currentLiveRange:null,currentWordAbsStart:-1,currentWordAbsEnd:-1,currentBoundaryIndex:0,currentBoundaryLength:0,lastBoundaryTimeStamp:-1,txtHighFreqLockStart:-1,txtHighFreqLockEnd:-1,txtHighFreqLockChar:"",txtHighFreqLockAbsStart:-1,txtHighFreqLockAbsEnd:-1,speechCharacterMap:null,lastFollowScrollAt:0,lastFollowScrollTop:null,followInitialCenter:true};
/* v7.12.60: Speech/DOM isolation contract. Search and annotation may temporarily
   wrap text for their persistent UI, but they must never normalize live EPUB text
   while Speech is active. If a mutation changes TextNodes, invalidate the live
   Character Map and let the next boundary re-anchor the word/phrase highlight. */
function readerSpeechDomMutationGuard(doc){
  if(!doc)return;
  try{
    var active=readerSpeechState.status!=="idle";
    if(!active)return;
    if(readerSpeechState.wordFollowHighlight){
      var win=doc.defaultView||window;
      if(win.CSS&&win.CSS.highlights){try{win.CSS.highlights.delete("booknote-speech-word");}catch(_){}}
      doc.querySelectorAll("mark.reader-speech-word-hit").forEach(function(m){var p=m.parentNode;if(!p)return;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m);});
      readerSpeechState.currentWordAbsStart=-1;
      readerSpeechState.currentWordAbsEnd=-1;
      readerSpeechState.txtHighFreqLockStart=-1;readerSpeechState.txtHighFreqLockEnd=-1;readerSpeechState.txtHighFreqLockChar="";readerSpeechState.txtHighFreqLockAbsStart=-1;readerSpeechState.txtHighFreqLockAbsEnd=-1;
      readerSpeechState.speechCharacterMap=null;
    }
    readerSpeechState.currentLiveRange=null;
  }catch(_){}
}
function readerSpeechNormalizeIfIdle(doc){
  if(!doc||readerSpeechState.status!=="idle")return false;
  try{if(doc.body)doc.body.normalize();return true;}catch(_){return false;}
}

function readerSpeechSelectionKey(s){if(!s||!s.text)return "";var l=s.epubLocator||s.locator||{};return [String(s.text||""),String(l.sectionId||""),String(l.sectionIndex!=null?l.sectionIndex:""),String(l.sentenceId||""),String(l.start!=null?l.start:""),String(l.end!=null?l.end:"")].join("\u001f");}
function readerSpeechSelectionChanged(s){
 var k=readerSpeechSelectionKey(s);
 if(!k)return false;
 /* While a speech session is active, any newly materialized user selection is a new context.
    If the current session already owns a selection key, require an actual key change.
    A session started from Home/Current without selection has no key, so a later user selection
    must also terminate that session rather than silently changing its reading context. */
 if(!readerSpeechState.selectionKey)return !!readerSpeechState.selection;
 return k!==readerSpeechState.selectionKey;
}
function readerSpeechSettings(){return browser.storage.local.get(["voiceName","rate","pitch","volume"]).then(function(r){return {voiceName:r.voiceName||"",rate:Number(r.rate)||1,pitch:typeof r.pitch==="number"?r.pitch:1,volume:typeof r.volume==="number"?r.volume:1};});}
function readerSpeechVoice(settings){var synth=window.speechSynthesis,voices=synth&&synth.getVoices?synth.getVoices():[];if(!voices.length)return null;var wanted=String(settings&&settings.voiceName||"");if(wanted){var v=voices.find(function(x){return x&&(String(x.voiceName||"")===wanted||String(x.name||"")===wanted);});if(v)return v;}return voices.find(function(x){return x&&x.localService;})||voices[0]||null;}
function readerSpeechSelected(){if(!state.runtime||!state.runtime.iframe)return "";try{var d=state.runtime.iframe.contentDocument,s=d&&d.getSelection?s=d.getSelection():null;return s&&!s.isCollapsed?String(s.toString()||"").trim():"";}catch(_){return "";}}
function readerSpeechAllText(){return state.chapters.map(function(c){return String(c&&c.text||"").trim();}).filter(Boolean).join("\n\n");}
function readerSpeechFromCurrent(){var texts=[];for(var i=Math.max(0,state.currentChapter);i<state.chapters.length;i++){var c=state.chapters[i],t=String(c&&c.text||"").trim();if(i===state.currentChapter&&state.runtime&&state.runtime.iframe){try{var d=state.runtime.iframe.contentDocument;if(d&&d.body&&d.body.innerText)t=String(d.body.innerText).trim();}catch(_){}}if(t)texts.push(t);}return texts.join("\n\n");}
function readerSpeechChunks(text){
 var source=String(text||"").replace(/\r\n?/g,"\n"),out=[],limit=source.length,cursor=0;
 while(cursor<limit){
   while(cursor<limit && /[\s\u00a0\u3000]/.test(source.charAt(cursor))) cursor++;
   if(cursor>=limit) break;
   var segStart=cursor,i=cursor,cut=limit;
   while(i<limit){
     var ch=source.charAt(i);
     if(ch==="\n"){ cut=i+1; break; }
     if(/[。！？!?；;]/.test(ch)){
       i++;
       while(i<limit && /[”’》」』】）)\"'’]/.test(source.charAt(i))) i++;
       cut=i; break;
     }
     if(ch==="." && !(i>0 && i+1<limit && /\d/.test(source.charAt(i-1)) && /\d/.test(source.charAt(i+1)))){
       i++;
       while(i<limit && /[”’》」』】）)\"'’]/.test(source.charAt(i))) i++;
       cut=i; break;
     }
     i++;
   }
   if(cut<=segStart) cut=Math.min(limit,segStart+1);
   var end=cut;
   while(end>segStart && /[\s\u00a0\u3000]/.test(source.charAt(end-1))) end--;
   if(end>segStart) out.push(source.slice(segStart,end));
   cursor=cut;
 }
 return out.filter(Boolean);
}

/* v7.14.72: Speech queue is a monotonic source-coordinate stream. It never
   searches the whole chapter again for an already-spoken string. Repeated
   words/phrases therefore cannot resolve back to an earlier occurrence. */
function readerSpeechBuildTxtCanonicalChars(sourceStart,utteranceText){
 /* TXT Character-Level Canonical Locator:
    Speech charIndex/charLength are UTF-16 coordinates.  The utterance is
    created directly from the canonical source slice, so every UTF-16 code
    unit gets an immutable source interval.  No trim/fold/indexOf operation
    is allowed to participate in this coordinate mapping. */
 var text=String(utteranceText||""),base=Math.max(0,Number(sourceStart)||0),map=new Array(text.length);
 for(var i=0;i<text.length;i++)map[i]={sourceStart:base+i,sourceEnd:base+i+1};
 return map;
}
function readerSpeechQueueFromText(text,sectionIndex,startOffset,endOffset){
 var idx=Number(sectionIndex)||0,source=String((state.chapters[idx]&&state.chapters[idx].text)||text||""),begin=Math.max(0,Math.min(Number(startOffset)||0,source.length)),limit=endOffset!=null?Math.max(begin,Math.min(Number(endOffset)||begin,source.length)):source.length;
 var out=[],cursor=begin;
 /* Canonical Speech Sentence Contract for TXT/ODT/DOCX:
    - A sentence is a source-contiguous unit ending at 。！？!?；; or a hard paragraph break.
    - Commas/colons never create a new sentence.
    - Source characters are preserved exactly; utterance charIndex therefore maps directly
      to the same source coordinate. No whitespace folding and no global text search. */
 while(cursor<limit){
   while(cursor<limit&&/^[\s\u00a0\u3000]+$/.test(source.charAt(cursor)))cursor++;
   if(cursor>=limit)break;
   var segStart=cursor, i=cursor, cut=limit;
   while(i<limit){
     var ch=source.charAt(i);
     if(ch==='\r'||ch==='\n'){cut=i+1;break;}
     if(/[。！？!?；;]/.test(ch)){
       i++;
       /* Include closing quotation/bracket marks in the same sentence. */
       while(i<limit&&/[”’》」』】）)\"'’]/.test(source.charAt(i)))i++;
       cut=i;break;
     }
     /* English full stop: only treat as sentence termination when it is not a decimal. */
     if(ch==='.'&&!(i>0&&i+1<limit&&/\d/.test(source.charAt(i-1))&&/\d/.test(source.charAt(i+1)))){
       i++;
       while(i<limit&&/[”’》」』】）)\"'’]/.test(source.charAt(i)))i++;
       cut=i;break;
     }
     i++;
   }
   if(cut<=segStart)cut=Math.min(limit,segStart+1);
   var segEnd=cut;
   while(segEnd>segStart&&/[\s\u00a0\u3000]/.test(source.charAt(segEnd-1)))segEnd--;
   if(segEnd>segStart){
     var spoken=source.slice(segStart,segEnd);
     out.push({text:spoken,sectionIndex:idx,start:segStart,end:segEnd,sequence:out.length,sentenceStart:segStart,sentenceEnd:segEnd,txtCanonicalChars:readerSpeechBuildTxtCanonicalChars(segStart,spoken)});
   }
   cursor=cut;
 }
 return out;
}
function readerSpeechQueueFromChapters(startChapter,startOffset){var out=[],begin=Math.max(0,Number(startChapter)||0),off=Math.max(0,Number(startOffset)||0);for(var i=begin;i<state.chapters.length;i++){var t=String(state.chapters[i]&&state.chapters[i].text||"");if(!t)continue;var local=i===begin?Math.min(off,t.length):0;var qs=readerSpeechQueueFromText(t,i,local);out.push.apply(out,qs);}return out;}
function readerSpeechQueueFromSelection(selection){if(!selection||!selection.text)return [];var idx=Number(selection.chapterIndex)||0,base=Number((state.canonicalChapters[idx]||{}).textStart)||0,start=Math.max(0,Number(selection.start||0)-base),end=Math.max(start,Number(selection.end||0)-base);return readerSpeechQueueFromText(selection.text,idx,start,end);}
function readerSpeechUpdate(){var t=$("readToggleBtn"),s=$("readStopBtn"),q=$("readSentenceFollowBtn"),w=$("readWordFollowBtn");if(t){var paused=readerSpeechState.status==="paused",icon=paused?"play":"pause",label=paused?"继续":"暂停 / 继续";t.innerHTML=bnIcon(icon,"sm")+label;}if(s){s.disabled=readerSpeechState.status==="idle";s.innerHTML=bnIcon("stop","sm")+"停止朗读";}if(q){q.innerHTML=bnIcon("highlight","sm")+"逐句跟随："+(readerSpeechState.sentenceFollowHighlight?"开":"关");q.setAttribute("aria-pressed",readerSpeechState.sentenceFollowHighlight?"true":"false");q.classList.toggle("active",readerSpeechState.sentenceFollowHighlight);}if(w){w.innerHTML=bnIcon("highlight","sm")+"逐字/词跟随："+(readerSpeechState.wordFollowHighlight?"开":"关");w.setAttribute("aria-pressed",readerSpeechState.wordFollowHighlight?"true":"false");w.classList.toggle("active",readerSpeechState.wordFollowHighlight);}}
function toggleSearchFloat(open){var bar=$("searchBar"),b=$("searchFloatBtn");if(!bar||!b)return;var show=typeof open==="boolean"?open:bar.hidden;if(show){bar.hidden=false;b.setAttribute("aria-expanded","true");b.classList.add("active");showReaderSearchHistory();setTimeout(function(){var i=$("searchInput");if(i)i.focus()},0)}else{bar.hidden=true;b.setAttribute("aria-expanded","false");b.classList.remove("active");hideReaderSearchHistory()}}
function toggleTtsPanel(open){var p=$("ttsPanel"),b=$("ttsFloatBtn");if(!p||!b)return;var show=typeof open==="boolean"?open:p.hidden;if(show){p.hidden=false;b.setAttribute("aria-expanded","true");b.classList.add("active")}else{p.hidden=true;b.setAttribute("aria-expanded","false");b.classList.remove("active")}}
function readerSpeechResolveLiveRange(item){
 var rt=state.runtime;if(!rt||!rt.iframe||!item)return null;
 var doc=rt.iframe.contentDocument;if(!doc)return null;
 var query=String(typeof item==='string'?item:(item.text||'')).trim();if(!query)return null;
 var sentenceId=typeof item==='string'?'':String((item.epubLocator&&item.epubLocator.sentenceId)||item.sentenceId||'');
 var qoff=typeof item==='string'?0:Number(item.queryOffsetInSentence)||0;
 /* v7.12.39: every EPUB speech sentence must be forward-only. A resolver result
    is accepted only when its live DOM position is not before the canonical item.start.
    This prevents duplicate text from jumping back to an earlier occurrence. */
 var canonicalStart=Number(item&&item.start);if(!Number.isFinite(canonicalStart)||canonicalStart<0)canonicalStart=Math.max(0,qoff);
 try{
   if(!(rt.isEpubMulti&&rt.isEpubMulti())&&rt.canonicalToDom&&item.sectionIndex!=null){try{var grx=rt.canonicalToDom(Number(item.sectionIndex)||0,canonicalStart,Number(item.end)!=null?Number(item.end):canonicalStart+query.length,query,{strict:true});if(grx&&grx.start&&grx.end){var gx=doc.createRange();gx.setStart(grx.start.node,grx.start.offset);gx.setEnd(grx.end.node,grx.end.offset);if(!gx.collapsed&&strictReaderText(gx.toString())===strictReaderText(query))return {start:grx.start,end:grx.end,range:gx,method:'canonical-office-txt'};}}catch(_){} }
   var root=doc.getElementById('source')||doc.body;
   var NF=(doc.defaultView&&doc.defaultView.NodeFilter)||NodeFilter;
   var w=doc.createTreeWalker(root,NF.SHOW_TEXT),nodes=[],n,raw='',total=0;
   while((n=w.nextNode())){
     if(n.parentElement&&/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(n.parentElement.tagName))continue;
     var t=String(n.nodeValue||'');if(!t)continue;
     nodes.push({node:n,start:total,end:total+t.length});raw+=t;total+=t.length;
   }
   function absPos(pt){if(!pt||!pt.node)return -1;for(var ii=0;ii<nodes.length;ii++){if(nodes[ii].node===pt.node)return nodes[ii].start+Math.max(0,Math.min(nodes[ii].node.nodeValue.length,Number(pt.offset)||0));}return -1;}
   if(sentenceId&&rt.epubResolveSentence){
     try{
       var rr=rt.epubResolveSentence(sentenceId,query,qoff,item.sectionIndex);
       if(rr){
         var a=rr.start||{node:rr.startContainer,offset:rr.startOffset},b=rr.end||{node:rr.endContainer,offset:rr.endOffset};
         var ap=absPos(a),bp=absPos(b);
         /* The resolver is only valid if its occurrence is at/after the canonical
            sentence position and the returned text is an exact match. */
         if(a&&b&&a.node&&b.node&&ap>=canonicalStart&&bp>=ap){
           try{
             var vr=doc.createRange();vr.setStart(a.node,a.offset);vr.setEnd(b.node,b.offset);
             if(!vr.collapsed&&strictReaderText(vr.toString())===strictReaderText(query))return {start:a,end:b,range:vr,method:'sentence-forward'};
           }catch(_){ }
         }
       }
     }catch(_){ }
   }
   /* Forward-only live-DOM fallback. Never search before canonicalStart. */
   var pos=raw.indexOf(query,Math.max(0,canonicalStart));
   if(pos<0){
     var folded='',starts=[],ends=[],i=0;
     while(i<raw.length){var c=raw.charAt(i);if(/\s/.test(c)){var j=i+1;while(j<raw.length&&/\s/.test(raw.charAt(j)))j++;if(folded&&folded.charAt(folded.length-1)!==' '){folded+=' ';starts.push(i);ends.push(j);}i=j;continue;}folded+=c;starts.push(i);ends.push(i+1);i++;}
     if(folded.charAt(folded.length-1)===' '){folded=folded.slice(0,-1);starts.pop();ends.pop();}
     var qn=query.replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
     var foldedTarget=Math.max(0,Math.min(folded.length,canonicalStart));
     var fp=folded.indexOf(qn,foldedTarget);
     if(fp>=0){var ps=starts[fp],pe=ends[fp+qn.length-1];if(ps>=canonicalStart)return readerSpeechRangeFromOffsets(doc,nodes,ps,pe,'live-normalized-forward');}
   }
   if(pos>=canonicalStart)return readerSpeechRangeFromOffsets(doc,nodes,pos,pos+query.length,'live-exact-forward');
 }catch(_){ }
 return null;
}
function readerSpeechRangeFromOffsets(doc,nodes,start,end,method){
 var a=null,b=null;
 for(var i=0;i<nodes.length;i++){if(a===null&&start>=nodes[i].start&&start<=nodes[i].end)a={node:nodes[i].node,offset:Math.max(0,Math.min(nodes[i].node.nodeValue.length,start-nodes[i].start))};if(end>=nodes[i].start&&end<=nodes[i].end){b={node:nodes[i].node,offset:Math.max(0,Math.min(nodes[i].node.nodeValue.length,end-nodes[i].start))};break;}}
 if(!a||!b)return null;
 try{var r=doc.createRange();r.setStart(a.node,a.offset);r.setEnd(b.node,b.offset);if(!r.collapsed)return {start:a,end:b,range:r,method:method};}catch(_){}
 return null;
}
function clearSpeechWordMarks(){
  try{
    var d=state.runtime&&state.runtime.iframe&&state.runtime.iframe.contentDocument;
    if(d){
      var win=d.defaultView||window;
      if(win.CSS&&win.CSS.highlights){try{win.CSS.highlights.delete("booknote-speech-word");}catch(_){}}
      d.querySelectorAll("mark.reader-speech-word-hit").forEach(function(m){var p=m.parentNode;if(!p)return;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m)});
      /* Word mode must not normalize the EPUB body: normalization can merge live text
         nodes and invalidate the Character Map while speech is running. */
      if(!readerSpeechState.wordFollowHighlight&&d.body)d.body.normalize();
    }
  }catch(_){}
  if(state.runtime&&state.runtime.invalidatePositionMap)try{state.runtime.invalidatePositionMap(d)}catch(_){}
  readerSpeechInvalidateCharacterMap();
}
function readerSpeechPaintWordRange(doc,range){
  if(!doc||!range||range.collapsed)return false;
  /* TXT/ODT/DOCX need a deterministic DOM paint layer. CSS Highlight can report
     success without producing a visible mark inside the Reader iframe, so the
     primary path is the same real <mark> layer used by the stable v7.14.72 core. */
  try{
    var ok=wrapReaderRange(doc,{node:range.startContainer,offset:range.startOffset},{node:range.endContainer,offset:range.endOffset},"reader-speech-word-hit",null,"",strictReaderText(range.toString()));
    if(ok){
      var marks=doc.querySelectorAll("mark.reader-speech-word-hit");
      for(var i=0;i<marks.length;i++){
        marks[i].style.setProperty("background","color-mix(in srgb,var(--reader-accent,#5B8CFF) 58%,transparent)","important");
        marks[i].style.setProperty("background-color","color-mix(in srgb,var(--reader-accent,#5B8CFF) 58%,transparent)","important");
        marks[i].style.setProperty("color","inherit","important");
        marks[i].style.setProperty("-webkit-text-fill-color","currentColor","important");
        marks[i].style.setProperty("border","0","important");
        marks[i].style.setProperty("border-radius","0","important");
        marks[i].style.setProperty("padding","0","important");
        marks[i].style.setProperty("margin","0","important");
        marks[i].style.setProperty("box-shadow","none","important");
      }
      try{var css=doc.defaultView&&doc.defaultView.CSS;if(css&&css.highlights)css.highlights.delete("booknote-speech-word");}catch(_){}
      if(state.runtime&&state.runtime.invalidatePositionMap)try{state.runtime.invalidatePositionMap(doc)}catch(_){}
      return true;
    }
  }catch(_){}
  /* DOM <mark> is primary. CSS Highlight is fallback only when wrapping the
     live range fails, so word/phrase follow highlighting is never lost.
     It uses the same theme accent and is removed whenever a real mark exists,
     preventing a second visual layer from being painted over the theme mark. */
  try{
    var win=doc.defaultView||window,css=win.CSS;
    if(css&&css.highlights&&typeof win.Highlight==='function'){
      css.highlights.set("booknote-speech-word",new win.Highlight(range));
      return true;
    }
  }catch(_){}
  return false;
}
function readerSpeechWordRange(base,text,charIndex,charLength){if(!base)return null;var doc=base.ownerDocument||((base.range&&base.range.startContainer)&&base.range.startContainer.ownerDocument);if(!doc)return null;var rawNodes=[],raw="",n;try{var r=base.range||base;if(!r.startContainer||!r.endContainer)return null;var root=doc.getElementById("source")||doc.body;var walker=doc.createTreeWalker(root,(doc.defaultView&&doc.defaultView.NodeFilter||NodeFilter).SHOW_TEXT);while((n=walker.nextNode())){var t=String(n.nodeValue||"");if(!t)continue;var probe=doc.createRange();probe.selectNodeContents(n);var before=probe.compareBoundaryPoints(Range.END_TO_START,r)<=0,after=probe.compareBoundaryPoints(Range.START_TO_END,r)>=0;if(before||after)continue;var a=0,b=t.length;if(n===r.startContainer)a=r.startOffset;if(n===r.endContainer)b=r.endOffset;if(b>a){rawNodes.push({node:n,start:raw.length,end:raw.length+(b-a),sourceStart:a});raw+=t.slice(a,b);}}}catch(_){return null;}
 if(!raw)return null;var query=String(text||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();var folded="",starts=[],ends=[],i=0;while(i<raw.length){var c=raw.charAt(i);if(/\s/.test(c)){var j=i+1;while(j<raw.length&&/\s/.test(raw.charAt(j)))j++;if(folded&&folded.charAt(folded.length-1)!==" "){folded+=" ";starts.push(i);ends.push(j);}i=j;continue;}folded+=c;starts.push(i);ends.push(i+1);i++;}if(folded.charAt(folded.length-1)===" "){folded=folded.slice(0,-1);starts.pop();ends.pop();}
 var ci=Math.max(0,Number(charIndex)||0),cl=Math.max(0,Number(charLength)||0);if(ci>=query.length&&ci>=folded.length)return null;var targetStart=Math.min(ci,Math.max(0,folded.length-1)),targetEnd=cl>0?Math.min(folded.length,targetStart+cl):targetStart+1;
 /* Boundary without charLength: SpeechSynthesis remains the clock; use a natural
    word/phrase segment for the visual unit instead of forcing one Han character. */
 if(cl<=0&&targetStart<query.length){
   var c0=query.charAt(targetStart),isCjk=/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(c0);
   try{
     if(typeof Intl!=="undefined"&&Intl.Segmenter){
       var seg=new Intl.Segmenter(isCjk?"zh-CN":"en-US",{granularity:"word"}),found=null;
       for(var sg of seg.segment(query)){
         var ss=Number(sg.index)||0,ee=ss+String(sg.segment||"").length;
         if(targetStart>=ss&&targetStart<ee){found={start:ss,end:ee};break;}
       }
       if(found&&found.end>found.start){targetStart=found.start;targetEnd=Math.min(folded.length,found.end);}
     }
   }catch(_){}
   /* CJK fallback: a short 2–4 character phrase, never across punctuation. */
   if(targetEnd<=targetStart+1&&isCjk){
     var phraseEnd=targetStart+1,phraseCount=1;
     while(phraseEnd<query.length&&phraseCount<4&&!/[\s\u3000，。！？；：、,.!?;:"'“”‘’()（）\[\]【】]/.test(query.charAt(phraseEnd))){phraseEnd++;phraseCount++;}
     targetEnd=Math.min(folded.length,phraseEnd);
   }
   if(!isCjk&&targetEnd<=targetStart+1){
     var j2=targetStart+1;
     while(j2<query.length&&!/[\s\u3000，。！？；：、,.!?;:"'“”‘’()（）\[\]【】]/.test(query.charAt(j2)))j2++;
     targetEnd=Math.min(folded.length,j2);
   }
 }
 if(targetStart>=starts.length)return null;var rs=starts[targetStart],re=ends[Math.max(targetStart,targetEnd-1)];if(re<=rs)return null;var a=null,b=null;for(var k=0;k<rawNodes.length;k++){var x=rawNodes[k];if(!a&&rs>=x.start&&rs<=x.end)a={node:x.node,offset:Math.max(0,Math.min(x.node.nodeValue.length,rs-x.start))};if(re>=x.start&&re<=x.end){b={node:x.node,offset:Math.max(0,Math.min(x.node.nodeValue.length,re-x.start))};break;}}if(!a||!b)return null;try{var r=doc.createRange();r.setStart(a.node,a.offset);r.setEnd(b.node,b.offset);return r.collapsed?null:{start:a,end:b,range:r};}catch(_){return null;}}
function readerSpeechSpeechBoundarySegment(text,charIndex,charLength){
 var q=String(text||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
 if(!q)return null;
 var ci=Math.max(0,Number(charIndex)||0),cl=Math.max(0,Number(charLength)||0);
 if(ci>=q.length)return null;
 var start=Math.min(ci,q.length-1),end=cl>0?Math.min(q.length,start+cl):start+1;
 var c0=q.charAt(start),isCjk=/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(c0);
 if(cl<=0){
   try{
     if(typeof Intl!=="undefined"&&Intl.Segmenter){
       var seg=new Intl.Segmenter(isCjk?"zh-CN":"en-US",{granularity:"word"});
       for(var sg of seg.segment(q)){var ss=Number(sg.index)||0,ee=ss+String(sg.segment||"").length;if(start>=ss&&start<ee){start=ss;end=ee;break;}}
     }
   }catch(_){}
   if(end<=start+1&&isCjk){var pe=start+1,nc=1;while(pe<q.length&&nc<4&&!/[\s\u3000，。！？；：、,.!?;:\"'“”‘’()（）\[\]【】]/.test(q.charAt(pe))){pe++;nc++;}end=Math.min(q.length,pe);}
   if(end<=start+1&&!isCjk){var je=start+1;while(je<q.length&&!/[\s\u3000，。！？；：、,.!?;:\"'“”‘’()（）\[\]【】]/.test(q.charAt(je)))je++;end=Math.min(q.length,je);}
 }
 return {text:q,start:start,end:end};
}
function readerSpeechBuildCharacterMap(doc,sectionIndex){
 /* v7.12.43: non-destructive Speech Character Map. Never rewrites EPUB DOM. */
 if(!doc)return null;
 var cached=readerSpeechState.speechCharacterMap;
 if(cached&&cached.doc===doc&&cached.sectionIndex===Number(sectionIndex))return cached;
 var root=doc.getElementById('source')||doc.body;
 var NF=(doc.defaultView&&doc.defaultView.NodeFilter)||NodeFilter;
 var walker=doc.createTreeWalker(root,NF.SHOW_TEXT),nodes=[],raw='',n;
 while((n=walker.nextNode())){
   if(n.parentElement&&/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(n.parentElement.tagName))continue;
   var t=String(n.nodeValue||'');if(!t)continue;
   nodes.push({node:n,start:raw.length,end:raw.length+t.length});raw+=t;
 }
 var folded='',mapStart=[],mapEnd=[],i=0;
 while(i<raw.length){
   var c=raw.charAt(i);
   if(/\s/.test(c)){
     var j=i+1;while(j<raw.length&&/\s/.test(raw.charAt(j)))j++;
     if(folded&&folded.charAt(folded.length-1)!==' '){folded+=' ';mapStart.push(i);mapEnd.push(j);}
     i=j;continue;
   }
   folded+=c;mapStart.push(i);mapEnd.push(i+1);i++;
 }
 if(folded.charAt(folded.length-1)===' '){folded=folded.slice(0,-1);mapStart.pop();mapEnd.pop();}
 cached={doc:doc,sectionIndex:Number(sectionIndex),nodes:nodes,raw:raw,folded:folded,mapStart:mapStart,mapEnd:mapEnd};
 readerSpeechState.speechCharacterMap=cached;
 return cached;
}
function readerSpeechInvalidateCharacterMap(){readerSpeechState.speechCharacterMap=null;}
function readerSpeechTxtVisualPhrase(q,ci,lockStart,lockEnd,cmap,charLength){
 /* TXT visual unit: Speech charIndex selects the exact source character, but
    CJK is painted as a continuous lexical phrase whenever possible.  This is
    intentionally separate from the Speech queue/sentence contract: it never
    changes what is spoken and never crosses the punctuation Fence. */
 var text=String(q||""),i=Math.max(0,Math.floor(Number(ci)||0));
 if(i>=text.length)return null;
 var isCjk=function(ch){return /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(ch||"");};
 if(!isCjk(text.charAt(i)))return null;
 var left=i,right=i+1;
 /* Prefer the Speech boundary's declared word length when it is a real
    forward token. This makes multi-character words such as 真理 / 你们
    deterministic instead of depending on Intl.Segmenter's tokenization.
    The declared span is still fenced below, so it can never absorb punctuation. */
 var spokenLen=Math.floor(Number(charLength)||0);
 if(spokenLen>1){
   var spokenRight=Math.min(text.length,i+spokenLen),crossesPunctuation=false,allCjk=true;
   for(var si=i;si<spokenRight;si++){
     if(/[。！？!?；：;:，、,.“”‘’「」『』（）\[\]【】《》〈〉…．·•—–－～~＿]/.test(text.charAt(si))){crossesPunctuation=true;break;}
     if(!isCjk(text.charAt(si)))allCjk=false;
   }
   if(!crossesPunctuation&&allCjk)right=spokenRight;
 }
 try{
   if(right===i+1&&typeof Intl!=="undefined"&&Intl.Segmenter){
     var seg=new Intl.Segmenter("zh",{granularity:"word"}),it=seg.segment(text),found=null;
     for(var part of it){var ps=Number(part.index)||0,pe=ps+String(part.segment||"").length;if(i>=ps&&i<pe){found={start:ps,end:pe};break;}if(ps>i)break;}
     if(found){left=Math.max(0,found.start);right=Math.min(text.length,found.end);}
   }
 }catch(_){/* deterministic fallback below */}
 /* Some engines expose each Chinese character as an individual word. For a
    high-frequency/isolated CJK boundary, join the immediately following CJK
    run into a short visual phrase. This prevents 喜|欢 style flashing while
    avoiding a whole-paragraph highlight. */
 if(right<=i+1){
   right=i+1;
   var max=Math.min(text.length,i+4);
   while(right<max&&isCjk(text.charAt(right)))right++;
 }
 left=Math.max(left,i); /* never paint before the current Speech occurrence */
 while(right>left&&right-1<text.length){
   var cp=Number(cmap[right-1]&&cmap[right-1].sourceEnd);if(!Number.isFinite(cp))break;
   if(cp>lockEnd){right--;continue;}break;
 }
 var s=Number(cmap[left]&&cmap[left].sourceStart),e=Number(cmap[right-1]&&cmap[right-1].sourceEnd);
 if(!Number.isFinite(s)||!Number.isFinite(e)||s<lockStart||e>lockEnd||e<=s)return null;
 return {start:s,end:e,charStart:left,charEnd:right};
}
function readerSpeechTxtTailFallbackRange(item,text,charIndex,doc){
 /* v7.17.49-TailFallback: visual-only emergency fallback. It never changes
    Queue/Fence coordinates and never searches another occurrence. It selects
    only the final visible character/word-group immediately before the current
    punctuation Fence boundary, and only when the normal exact/phrase Range
    cannot be painted. */
 if(!item||!doc||!state.chapters)return null;
 var idx=Number(item.sectionIndex)||0;
 var src=String(state.chapters[idx]&&state.chapters[idx].text||'');
 var q=String(text||'');
 if(!src||!q)return null;
 var base=Number(item.start),qEnd=Number(item.end);
 if(!Number.isFinite(base)||!Number.isFinite(qEnd)||qEnd<=base)return null;
 if(qEnd-base!==q.length||qEnd>src.length)return null;
 var ci=Math.max(0,Math.floor(Number(charIndex)||0));
 if(ci>=q.length)return null;
 var cmap=Array.isArray(item.txtCanonicalChars)&&item.txtCanonicalChars.length===q.length?item.txtCanonicalChars:readerSpeechBuildTxtCanonicalChars(base,q);
 if(!Array.isArray(cmap)||cmap.length!==q.length)return null;
 for(var mi=0;mi<q.length;mi++){
   var ms=Number(cmap[mi]&&cmap[mi].sourceStart),me=Number(cmap[mi]&&cmap[mi].sourceEnd);
   if(ms!==base+mi||me!==base+mi+1)return null;
 }
 var punctuation=/[。！？!?；：;:，、,.“”‘’「」『』（）\[\]【】《》〈〉…．·•—–－～~＿]/;
 var isP=function(ch){return !!ch&&punctuation.test(ch);};
 var rightCi=ci;
 if(!isP(q.charAt(ci))){rightCi=ci+1;while(rightCi<q.length&&!isP(q.charAt(rightCi)))rightCi++;}
 var fenceEnd=qEnd;
 if(rightCi<q.length){var pe=Number(cmap[rightCi]&&cmap[rightCi].sourceStart);if(Number.isFinite(pe))fenceEnd=pe;}
 var fenceStart=Number(cmap[ci]&&cmap[ci].sourceStart);
 if(!Number.isFinite(fenceStart)||!Number.isFinite(fenceEnd)||fenceEnd<=fenceStart)return null;
 var start=ci,end=ci+1;
 var c=q.charAt(ci),isCjk=function(ch){return /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(ch||"");};
 /* Fallback must remain anchored at the CURRENT Speech occurrence. It may
    extend forward to the same lexical unit, but may never select a later tail
    merely because that tail is still inside the punctuation fence. */
 if(isCjk(c)){
   var max=Math.min(rightCi<q.length?rightCi:q.length,ci+4);
   while(end<max&&isCjk(q.charAt(end)))end++;
 }else{
   while(end<(rightCi<q.length?rightCi:q.length)){
     var next=q.charAt(end);
     if(/[\s\u3000]/.test(next)||isP(next))break;
     end++;
   }
 }
 var absStart=Number(cmap[start]&&cmap[start].sourceStart),absEnd=Number(cmap[end-1]&&cmap[end-1].sourceEnd);
 if(!Number.isFinite(absStart)||!Number.isFinite(absEnd)||absStart<fenceStart||absEnd>fenceEnd||absStart<base||absEnd>qEnd||absEnd<=absStart)return null;
 var committedEnd=Number(readerSpeechState.currentWordAbsEnd);
 if(Number.isFinite(committedEnd)&&committedEnd>=base&&absStart<committedEnd)return null;
 var token=src.slice(absStart,absEnd);if(!token||token!==q.slice(start,end))return null;
 var rt=state.runtime;if(!rt||typeof rt.canonicalToDom!=="function")return null;
 var mapped=null;try{mapped=rt.canonicalToDom(idx,absStart,absEnd,token,{strict:true});}catch(_){mapped=null;}
 if(!mapped||!mapped.start||!mapped.end)return null;
 try{
   var r=doc.createRange();r.setStart(mapped.start.node,mapped.start.offset);r.setEnd(mapped.end.node,mapped.end.offset);
   if(r.collapsed||String(r.toString()||"")!==token)return null;
   return {start:mapped.start,end:mapped.end,range:r,absoluteStart:absStart,absoluteEnd:absEnd,
     boundarySourceStart:base,lockSourceStart:fenceStart,lockSourceEnd:fenceEnd,
     lockRightPunctuationIndex:rightCi,lockCharIndex:ci,lockChar:q.charAt(ci),
     highFrequency:false,method:'txt-fence-tail-fallback',tailStart:start,tailEnd:end};
 }catch(_){return null;}
}
function readerSpeechTxtWordRange(item,text,charIndex,charLength,doc,allowSameOccurrence){
 /* v7.17.31 — TXT locator priority is a strict interval chain:
    1) current Speech queue item = outer hard scope;
    2) current reading position -> the next actual punctuation = the standard
       inner interval (one-way, never search backward for a punctuation bound);
    3) charIndex -> absolute source position = unique character selector;
    4) high-frequency CJK characters = exact absolute-character lock.
    Lower levels may only narrow/resolve inside higher levels; they may never
    replace, broaden, or move a higher-level position. */
 if(!item||!doc||!state.chapters)return null;
 var idx=Number(item.sectionIndex)||0;
 var src=String(state.chapters[idx]&&state.chapters[idx].text||'');
 var q=String(text||'');
 if(!src||!q)return null;
 var base=Number(item.start);if(!Number.isFinite(base)||base<0)base=0;
 var expectedEnd=base+q.length;if(expectedEnd>src.length)return null;
 var cmap=Array.isArray(item.txtCanonicalChars)&&item.txtCanonicalChars.length===q.length
   ?item.txtCanonicalChars:readerSpeechBuildTxtCanonicalChars(base,q);
 var ci=Math.max(0,Math.floor(Number(charIndex)||0));
 if(ci>=q.length||ci>=cmap.length)return null;
 var anchor=Number(cmap[ci]&&cmap[ci].sourceStart),anchorEnd=Number(cmap[ci]&&cmap[ci].sourceEnd);
 if(!Number.isFinite(anchor)||!Number.isFinite(anchorEnd)||anchor<base||anchorEnd>expectedEnd||anchorEnd<=anchor)return null;

 var punctuation=/[。！？!?；：;:，、,.“”‘’「」『』（）\[\]【】《》〈〉…．·•—–－～~＿]/;
 var isPunctuation=function(ch){return !!ch&&punctuation.test(ch);};

 /* LEVEL 2 — standard one-way interval:
    current reading position -> next actual punctuation.
    Never inspect punctuation before the current reading position. The current
    character itself is treated as the next punctuation when it is punctuation,
    so punctuation remains highlightable without creating a backward scope. */
 var rightCi=-1;
 if(isPunctuation(q.charAt(ci))) rightCi=ci;
 else {
   rightCi=ci+1;
   while(rightCi<q.length&&!isPunctuation(q.charAt(rightCi)))rightCi++;
 }
 var lockStart=anchor;
 var lockEnd=expectedEnd;
 if(rightCi>=0&&rightCi<q.length){
   var rightEnd=Number(cmap[rightCi]&&cmap[rightCi].sourceEnd);
   if(Number.isFinite(rightEnd)&&rightEnd>=anchorEnd&&rightEnd<=expectedEnd)lockEnd=rightEnd;
 }
 /* The interval always starts at the current absolute reading position. */
 if(lockStart<anchor)lockStart=anchor;
 if(lockEnd<anchorEnd)lockEnd=anchorEnd;
 if(lockStart<base||lockEnd>expectedEnd||lockEnd<=lockStart)return null;

 var highFreq=/[的是了神在与会道就一个不领受圣灵开你给主]/.test(q.charAt(ci));
 var rt=state.runtime;if(!rt||typeof rt.canonicalToDom!=="function")return null;
 function makeRange(s,e,method){
   /* Every candidate must remain inside BOTH outer queue scope and the
      current-position -> next-punctuation interval. */
   if(!Number.isFinite(s)||!Number.isFinite(e)||s<lockStart||e>lockEnd||s<base||e>expectedEnd||e<=s)return null;
   /* A forceCurrent retry can repaint the already committed phrase, but it
      cannot enlarge that visual range or move to another source occurrence. */
   if(retrySameOccurrence&&e>Number(readerSpeechState.currentWordAbsEnd))return null;
   var token=src.slice(s,e);if(!token)return null;
   var mapped=null;try{mapped=rt.canonicalToDom(idx,s,e,token,{strict:true});}catch(_) {mapped=null;}
   if(!mapped||!mapped.start||!mapped.end)return null;
   var r;try{r=doc.createRange();r.setStart(mapped.start.node,mapped.start.offset);r.setEnd(mapped.end.node,mapped.end.offset);}catch(_){return null;}
   if(r.collapsed)return null;
   try{if(String(r.toString()||'')!==token)return null;}catch(_){return null;}
   return {start:mapped.start,end:mapped.end,range:r,absoluteStart:s,absoluteEnd:e,
     boundarySourceStart:base,lockSourceStart:lockStart,lockSourceEnd:lockEnd,
     lockRightPunctuationIndex:rightCi,lockCharIndex:ci,lockChar:q.charAt(ci),
     highFrequency:highFreq,method:method};
 }

 var ch=q.charAt(ci),cjk=/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(ch);
 /* HARD VISUAL FRONTIER — once a source interval has been painted, a later
    boundary has no authority to create a new range whose start is behind the
    committed end. This gate is deliberately before phrase selection: semantic
    grouping can optimize only the unread suffix; it cannot re-absorb history. */
 var committedEnd=Number(readerSpeechState.currentWordAbsEnd);
 var retrySameOccurrence=false;
 if(Number.isFinite(committedEnd)&&committedEnd>=base&&anchor<committedEnd){
   /* Stability retry exception: forceCurrent may repaint ONLY the exact
      source occurrence already under the visual cursor. The committed visual
      range may contain that occurrence as part of a phrase, so anchorEnd need
      not equal committedEnd. It may never select a different occurrence. */
   retrySameOccurrence=!!allowSameOccurrence&&
     anchor===Number(readerSpeechState.currentWordAbsStart)&&
     anchor<Number(readerSpeechState.currentWordAbsEnd);
   if(!retrySameOccurrence)return null;
 }
 /* v7.17.57 — minimal TXT regression fix: "你们" is locked to the exact
    occurrence selected by the current Queue + charIndex. This bypasses only
    the generic CJK phrase chooser; it never searches another occurrence and
    never changes Queue/Fence coordinates. */
 var niMenStartCi=-1,niMenEndCi=-1;
 /* '你们' is a display composition only when Speech explicitly reports
    the two-character boundary. A one-character boundary must remain exactly
    '你' or '们'; adjacency alone has no authority to merge them. */
 var niMenExplicit=Number(charLength)>=2 && q.slice(ci,ci+2)==='你们';
 if(niMenExplicit){niMenStartCi=ci;niMenEndCi=ci+2;}
 if(niMenStartCi>=0){
   var niMenS=Number(cmap[niMenStartCi]&&cmap[niMenStartCi].sourceStart);
   var niMenE=Number(cmap[niMenEndCi-1]&&cmap[niMenEndCi-1].sourceEnd);
   if(Number.isFinite(niMenS)&&Number.isFinite(niMenE)&&niMenS>=lockStart&&niMenE<=lockEnd){
     var niMenRange=makeRange(niMenS,niMenE,'txt-ni-men-exact-occurrence');
     if(niMenRange)return niMenRange;
   }
 }
 /* HARD WORD-UNIT FENCE — when the current Speech occurrence is one half of
    the literal source word '你们', generic CJK/semantic visual grouping must
    not absorb neighboring characters. The pair is therefore a closed visual
    unit: explicit 2-char Speech boundary => exactly 你们; one-char boundary =>
    exactly the current occurrence. This gate is after A and before B/C, so it
    cannot relocate the occurrence and cannot be bypassed by visual grouping. */
 var currentIsNiMenPart=(q.charAt(ci)==='你'&&q.charAt(ci+1)==='们') ||
                        (q.charAt(ci)==='们'&&ci>0&&q.charAt(ci-1)==='你');
 if(currentIsNiMenPart){
   var unitStartCi=q.charAt(ci)==='你'?ci:ci-1;
   var unitEndCi=unitStartCi+2;
   if(niMenExplicit){
     var unitS=Number(cmap[unitStartCi]&&cmap[unitStartCi].sourceStart);
     var unitE=Number(cmap[unitEndCi-1]&&cmap[unitEndCi-1].sourceEnd);
     if(Number.isFinite(unitS)&&Number.isFinite(unitE)&&unitS>=lockStart&&unitE<=lockEnd){
       var unitRange=makeRange(unitS,unitE,'txt-ni-men-hard-unit');
       if(unitRange)return unitRange;
     }
   }
   return makeRange(anchor,anchorEnd,'txt-ni-men-single-occurrence');
 }
 /* LEVEL C — visual-only semantic composition. A is already locked above.
    B may propose a natural phrase, but C can only accept it when the phrase
    contains the CURRENT charIndex occurrence and its absolute source span is
    fully inside the already-locked Queue/Fence interval. If C rejects B,
    execution falls through to the original stable A-based visual path. */
 if(cjk&&typeof BookNoteTxtSemanticVisualV67!=="undefined"&&
    typeof BookNoteTxtSemanticCandidateV65!=="undefined"){
   try{
     var semanticVisual=BookNoteTxtSemanticVisualV67.select(q,ci,lockStart,lockEnd,cmap,BookNoteTxtSemanticCandidateV65);
     if(semanticVisual){
       var semanticRange=makeRange(semanticVisual.start,semanticVisual.end,'txt-c-semantic-'+semanticVisual.reason);
       if(semanticRange)return semanticRange;
     }
   }catch(_){/* B/C failure must never affect A fallback. */}
 }
 /* LEVEL 3 + 4 — charIndex is the unique selector. For CJK/high-frequency
    characters, return exactly this source occurrence. No indexOf(), no merge,
    no alternate occurrence, no backward/forward substitution. */
 if(cjk){
   var phrase=readerSpeechTxtVisualPhrase(q,ci,lockStart,lockEnd,cmap,charLength);
   if(phrase){
     return makeRange(phrase.start,phrase.end,highFreq?'txt-high-frequency-phrase':'txt-cjk-phrase');
   }
   return makeRange(anchor,anchorEnd,highFreq?'txt-high-frequency-absolute-occurrence':'txt-speech-exact-character');
 }
 if(highFreq||isPunctuation(ch))
   return makeRange(anchor,anchorEnd,highFreq?'txt-high-frequency-absolute-occurrence':'txt-speech-exact-character');

 /* LEVEL 3B — ordinary/non-CJK follow uses the SAME current-position ->
    punctuation Fence. The visual range is allowed to span everything from
    the current Speech character through the character immediately before the
    next punctuation boundary. It must not introduce a second word boundary
    rule (whitespace/CJK are not independent Fence terminators). */
 var sourceEnd=lockEnd;
 if(rightCi>=0&&rightCi<q.length){
   var rightStart=Number(cmap[rightCi]&&cmap[rightCi].sourceStart);
   if(Number.isFinite(rightStart))sourceEnd=rightStart;
 }
 if(!Number.isFinite(sourceEnd)||sourceEnd<=anchor)return null;
 return makeRange(anchor,sourceEnd,'txt-speech-forward-word');
}
function readerSpeechIndependentWordRange(item,text,charIndex,charLength,allowSameOccurrence){
 /* Word/Phrase mode: EPUB/Office keep their canonical mapping. TXT uses a
    source-visible map because TXT presentation removes leading indentation and
    blank lines; treating source offsets as DOM offsets causes missing or
    forward-jumping highlights. */
 if(!item||!state.runtime||!state.runtime.iframe)return null;
 var doc=state.runtime.iframe.contentDocument;if(!doc)return null;
 var isTxt=!!(doc.body&&doc.body.classList&&doc.body.classList.contains('reader-format-txt'));
 if(isTxt)return readerSpeechTxtWordRange(item,text,charIndex,charLength,doc,allowSameOccurrence);
 if(!(state.runtime.isEpubMulti&&state.runtime.isEpubMulti())&&state.runtime.canonicalToDom){try{var cr=state.runtime.canonicalToDom(Number(item.sectionIndex)||0,Number(item.start)||0,Number(item.end)!=null?Number(item.end):Number(item.start)||0,String(text||''),{strict:true});if(cr&&cr.start&&cr.end){var br=doc.createRange();br.setStart(cr.start.node,cr.start.offset);br.setEnd(cr.end.node,cr.end.offset);var gwr=readerSpeechWordRange({ownerDocument:doc,range:br},text,charIndex,charLength);if(gwr)return gwr;}}catch(_){} }
 var map=readerSpeechBuildCharacterMap(doc,item.sectionIndex);if(!map||!map.raw)return null;
 var q=String(text||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();if(!q)return null;
 var seg=readerSpeechSpeechBoundarySegment(q,charIndex,charLength);if(!seg)return null;
 var phrase=seg.text.slice(seg.start,seg.end);if(!phrase)return null;
 var canonicalStart=Number(item.start);if(!Number.isFinite(canonicalStart)||canonicalStart<0)canonicalStart=0;
 var ci=Math.max(0,Number(charIndex)||0),minRaw=canonicalStart+ci;
 if(Number.isFinite(readerSpeechState.currentWordAbsStart)&&readerSpeechState.currentWordAbsStart>=canonicalStart)minRaw=Math.max(minRaw,readerSpeechState.currentWordAbsStart);
 var foldedStart=0;while(foldedStart<map.mapStart.length&&map.mapStart[foldedStart]<minRaw)foldedStart++;
 var exact=map.folded.indexOf(phrase,foldedStart);if(exact<0)return null;
 var rs=map.mapStart[exact],last=exact+phrase.length-1;if(last>=map.mapEnd.length)return null;var re=map.mapEnd[last];if(rs<minRaw)return null;
 return readerSpeechRangeFromOffsets(doc,map.nodes,rs,re,'word-character-map-forward');
}
function readerSpeechSmartFollowWord(doc,range){
  if(!doc||!range||!readerSpeechState.wordFollowHighlight)return false;
  try{
    var rect=range.getBoundingClientRect();
    if(!rect||!Number.isFinite(rect.top)||!Number.isFinite(rect.bottom)||(!rect.width&&!rect.height))return false;
    var win=doc.defaultView||window;
    var root=readerSpeechResolveFollowScrollRoot(doc);
    if(!root)return false;
    /* Document scrolling elements move with scrollTop; their bounding-rect
       top is NOT a fixed viewport origin. Only nested scroll containers may
       use their own rect as the viewport origin. */
    var isDocumentScroller=(root===doc.scrollingElement||root===doc.documentElement||root===doc.body);
    var viewportRect=(!isDocumentScroller&&root.getBoundingClientRect)?root.getBoundingClientRect():null;
    var viewportTop=viewportRect?Number(viewportRect.top)||0:0;
    var viewportH=Math.max(1,Number(root.clientHeight)||Number(win.innerHeight)||0);
    if(!viewportH)return false;

    /*
     * Range geometry is viewport-relative. Convert it to the scroll-root
     * coordinate system first. The 25%-75% band is the normal comfort zone.
     * Once the spoken position is outside that band, scrolling is mandatory:
     * it must never be suppressed by the rate limiter or by an unfinished
     * smooth-scroll animation.
     */
    var wordCenter=(rect.top-viewportTop)+Math.max(1,rect.height)/2;
    var upper=viewportH*0.25;
    var lower=viewportH*0.75;
    var hardUpper=viewportH*0.15;
    var hardLower=viewportH*0.85;
    var center=viewportH*0.50;
    var initialCenter=!!readerSpeechState.followInitialCenter;

    if(wordCenter>=upper&&wordCenter<=lower){
      readerSpeechState.followInitialCenter=false;
      return false;
    }

    var delta=wordCenter-center;
    var now=Date.now();
    var last=Number(readerSpeechState.lastFollowScrollAt)||0;
    var lastTop=readerSpeechState.lastFollowScrollTop;
    var currentTop=Number(root.scrollTop)||0;
    var maxTop=Math.max(0,(Number(root.scrollHeight)||0)-(Number(root.clientHeight)||0));
    var target=Math.max(0,Math.min(maxTop,currentTop+delta));

    /*
     * Never throttle a position that is already outside the comfort zone.
     * The previous implementation could discard these updates for 220ms,
     * while smooth scrolling was still moving, allowing speech to outrun the
     * viewport. Only redundant in-zone-equivalent requests are rate limited.
     */
    var outsideHard=wordCenter<hardUpper||wordCenter>hardLower;
    var targetIsSame=lastTop!==null&&Math.abs(target-Number(lastTop))<Math.max(8,viewportH*0.05);
    if(!outsideHard&&now-last<90&&targetIsSame)return false;

    readerSpeechState.lastFollowScrollAt=now;
    readerSpeechState.lastFollowScrollTop=target;
    readerSpeechState.followInitialCenter=false;

    /* Hard overflow gets an immediate correction so the highlight cannot
       remain outside the readable region while a previous smooth animation
       is still in flight. Ordinary comfort-zone correction remains smooth. */
    var behavior=outsideHard?'auto':'smooth';
    try{
      root.scrollTo({top:target,left:Number(root.scrollLeft)||0,behavior:behavior});
    }catch(_){
      try{root.scrollTop=target;}catch(__){}
    }
    if(state.runtime&&state.runtime.updateScrollState)state.runtime.updateScrollState();

    /* If the browser refused/lagged the requested scroll, do one synchronous
       fallback based on the current geometry. This is intentionally bounded
       to one correction per boundary to avoid scroll loops. */
    try{
      var afterRect=range.getBoundingClientRect();
      var afterTop=(afterRect.top-viewportTop);
      var afterBottom=(afterRect.bottom-viewportTop);
      /* Final guard: never leave the spoken range outside the visible
         viewport. Keep a small 12%-88% safety band; do not recenter it. */
      var safeTop=viewportH*0.12;
      var safeBottom=viewportH*0.88;
      var correction=0;
      if(afterTop<safeTop)correction=afterTop-safeTop;
      else if(afterBottom>safeBottom)correction=afterBottom-safeBottom;
      if(Math.abs(correction)>1){
        var retry=Math.max(0,Math.min(maxTop,(Number(root.scrollTop)||0)+correction));
        if(Math.abs(retry-(Number(root.scrollTop)||0))>1)root.scrollTop=retry;
      }
    }catch(__){}
    return true;
  }catch(_){return false;}
}
function readerSpeechApplyWordBoundary(e,forceCurrent){
 /* v7.17.30 fix: boundarySourceStart is the queue scope start, not the current character position. Use the current mapped source character for the forward-follow gate. */
 if(!readerSpeechState.wordFollowHighlight||readerSpeechState.status!="speaking")return;
 if(e&&e.name&&String(e.name).toLowerCase()!=="word")return;
 var item=readerSpeechState.currentSpeechItem,text=readerSpeechState.currentSpeakText;if(!item||!text)return;
 var liveDoc=state.runtime&&state.runtime.iframe&&state.runtime.iframe.contentDocument;
 var isTxt=!!(liveDoc&&liveDoc.body&&liveDoc.body.classList&&liveDoc.body.classList.contains('reader-format-txt'));
 var ci=Number(e&&e.charIndex);if(!Number.isFinite(ci)||ci<0)ci=0;
 var cl=Number(e&&e.charLength);if(!Number.isFinite(cl)||cl<0)cl=0;
 var stamp=Number(e&&e.timeStamp);if(!Number.isFinite(stamp))stamp=-1;
 var prevCi=Number(readerSpeechState.currentBoundaryIndex)||0;
 var prevCl=Number(readerSpeechState.currentBoundaryLength)||0;
 /* Speech boundary clock is strictly forward. Ignore stale/out-of-order events
    even when their DOM text happens to be a valid repeated word. */
 if(isTxt&&stamp>=0&&Number(readerSpeechState.lastBoundaryTimeStamp)>=0&&stamp<Number(readerSpeechState.lastBoundaryTimeStamp))return;
 if(ci<prevCi||(ci===prevCi&&cl<=prevCl&&Number(readerSpeechState.currentWordAbsStart)>=0))return;
 /* TXT 高频字符必须先做“单次出现位置”锁。一个被约束的字只对应
    一个 UTF-16 source occurrence；相同的下一个字不是当前锁的延伸。 */
 var TXT_HIGH_FREQ_CHARS=/[的是了神在与会道就一个不领受圣灵开你给主，。？！,.；;]/;
 var lockStart=Number(readerSpeechState.txtHighFreqLockStart),lockEnd=Number(readerSpeechState.txtHighFreqLockEnd),lockChar=String(readerSpeechState.txtHighFreqLockChar||'');
 var lockAbsStart=Number(readerSpeechState.txtHighFreqLockAbsStart),lockAbsEnd=Number(readerSpeechState.txtHighFreqLockAbsEnd);
 /* Strict occurrence lock: one constrained character = one exact source
    occurrence. Never merge adjacent identical characters. */
 if(isTxt&&lockStart>=0&&lockEnd>lockStart&&ci===lockStart&&lockChar&&text.charAt(ci)===lockChar&&
    Number.isFinite(lockAbsStart)&&Number.isFinite(lockAbsEnd)){
   /* The lock identifies the already-selected source occurrence; it is NOT a
      paint suppression flag. Normal boundary duplicates are filtered by the
      Speech clock above. forceCurrent is allowed to repaint this SAME absolute
      occurrence after a transient DOM/layout paint failure. */
   if(!forceCurrent){
     readerSpeechState.currentBoundaryIndex=ci;
     readerSpeechState.currentBoundaryLength=cl;
     readerSpeechState.lastBoundaryTimeStamp=stamp;
     return;
   }
 }
 if(isTxt&&lockStart>=0&&ci>lockStart){
   readerSpeechState.txtHighFreqLockStart=-1;readerSpeechState.txtHighFreqLockEnd=-1;readerSpeechState.txtHighFreqLockChar='';
   readerSpeechState.txtHighFreqLockAbsStart=-1;readerSpeechState.txtHighFreqLockAbsEnd=-1;
 }
 var wr=readerSpeechIndependentWordRange(item,text,ci,cl,!!forceCurrent);if(!wr)return;
 /* v7.17.41 — hard TXT punctuation fence. Keep the proven v7.17.31
    highlight mapper, but make the returned visual range prove it remains
    inside the SAME Queue item and the SAME current-position -> next-punctuation
    interval. This is a validation gate only; it never substitutes another
    occurrence when mapping succeeds. */
 var fenceStart=Number(wr.lockSourceStart),fenceEnd=Number(wr.lockSourceEnd);
 var absStart=Number(wr.absoluteStart),absEnd=Number(wr.absoluteEnd),boundaryStart=Number(wr.boundarySourceStart);
 if(isTxt){
   var qStart=Number(item.start),qEnd=Number(item.end);
   if(!Number.isFinite(qStart)||!Number.isFinite(qEnd)||qEnd<=qStart||
      !Number.isFinite(fenceStart)||!Number.isFinite(fenceEnd)||
      fenceStart<qStart||fenceEnd>qEnd||fenceEnd<=fenceStart||
      absStart<fenceStart||absEnd>fenceEnd||absEnd<=absStart)return;
   try{
     var expectedPaint=String((state.chapters[Number(item.sectionIndex)||0]&&state.chapters[Number(item.sectionIndex)||0].text||'').slice(absStart,absEnd));
     var actualPaint=String(wr.range&&wr.range.toString?wr.range.toString():'');
     if(!expectedPaint||actualPaint!==expectedPaint)return;
   }catch(_){return;}
 }
 var liveEnd=Number(readerSpeechState.currentWordAbsEnd);
 var currentAbs=NaN;
 if(isTxt){
   try{
     var qmap=Array.isArray(item.txtCanonicalChars)&&item.txtCanonicalChars.length===String(text||'').length
       ?item.txtCanonicalChars:readerSpeechBuildTxtCanonicalChars(Number(item.start)||0,String(text||''));
     currentAbs=Number(qmap[ci]&&qmap[ci].sourceStart);
   }catch(_){}
 }
 if(isTxt&&!forceCurrent){
   /* A boundary may advance inside the same word/phrase. Do not treat that
      as a backward jump merely because the token start is unchanged.
      Reject only a token that does not contain the current Speech boundary. */
   if(Number.isFinite(currentAbs)&&Number.isFinite(absStart)&&Number.isFinite(absEnd)){
     if(currentAbs<absStart || currentAbs>=absEnd)return;
   }
   /* Monotonic visual cursor: Speech charIndex may advance inside a word whose
      Segmenter token begins before the previous visual token. That is a valid
      speech clock movement, but repainting that earlier token would visibly
      jump the highlight backwards. Keep the already-painted range until the
      next token starts at/after the current visual source position. */
   var visualStart=Number(readerSpeechState.currentWordAbsStart);
   if(Number.isFinite(visualStart)&&visualStart>=0&&Number.isFinite(absStart)&&absStart<visualStart){
     readerSpeechState.currentBoundaryIndex=ci;
     readerSpeechState.currentBoundaryLength=cl;
     readerSpeechState.lastBoundaryTimeStamp=stamp;
     return;
   }
   /* Once the boundary has moved beyond a previous token's end, an older
      token can never become current again. */
   if(Number.isFinite(liveEnd)&&liveEnd>=0&&boundaryStart>=liveEnd&&absEnd<=liveEnd)return;
   /* 高频字符已经由上面的单次出现锁处理；这里不再用“连续相同字符
      运行”吞掉后续 occurrence，避免把第一个字误当成整段重复字。 */
 } else if(!forceCurrent&&Number.isFinite(readerSpeechState.currentWordAbsStart)&&readerSpeechState.currentWordAbsStart>=0&&absStart<readerSpeechState.currentWordAbsStart)return;
 /* Final TXT monotonicity gate: forceCurrent is allowed to retry the SAME
    source occurrence after a paint failure, but never to move the visual range
    backward. A previously committed end is an irreversible frontier. */
 if(isTxt&&Number.isFinite(liveEnd)&&liveEnd>=0&&Number.isFinite(absStart)&&absStart<liveEnd)return;
 if(!liveDoc)return;
 readerSpeechClearNativeSelection(liveDoc);
 clearSpeechWordMarks();
 readerSpeechPurgeSentenceVisual(liveDoc);
 var ok=readerSpeechPaintWordRange(liveDoc,wr.range);
 if(!ok&&isTxt){
   /* v7.17.49 Tail Fallback: only the final character/CJK-word group inside
      the SAME punctuation Fence may be used as a visual fallback. The normal
      Range remains authoritative whenever it paints successfully. */
   var tailWr=readerSpeechTxtTailFallbackRange(item,text,ci,liveDoc);
   if(tailWr){
     var tailStart=Number(tailWr.absoluteStart),tailEnd=Number(tailWr.absoluteEnd);
     var qStart2=Number(item.start),qEnd2=Number(item.end);
     if(tailStart>=fenceStart&&tailEnd<=fenceEnd&&tailStart>=qStart2&&tailEnd<=qEnd2&&
        (!Number.isFinite(liveEnd)||tailStart>=liveEnd)){
       clearSpeechWordMarks();
       readerSpeechPurgeSentenceVisual(liveDoc);
       ok=readerSpeechPaintWordRange(liveDoc,tailWr.range);
       if(ok)wr=tailWr;
     }
   }
 }
 if(!ok)return;
 /* 只有视觉 Range 真正绘制成功后，才提交新的视觉游标。这样一次临时
    DOM/布局失败不会把状态推进到后面的重复字，下一 boundary 仍可在同一
    绝对位置重试，而不会发生“失败后跳到下一个相同字”的假跳转。 */
 readerSpeechState.currentBoundaryIndex=ci;readerSpeechState.currentBoundaryLength=cl;readerSpeechState.currentWordAbsStart=absStart;readerSpeechState.currentWordAbsEnd=absEnd;readerSpeechState.lastBoundaryTimeStamp=stamp;
 if(isTxt&&TXT_HIGH_FREQ_CHARS.test(text.charAt(ci))&&wr.method==='txt-high-frequency-absolute-occurrence'){
   /* Lock exactly this source occurrence. Do not expand over adjacent identical
      characters; the next occurrence must be reached by its own Speech index. */
   readerSpeechState.txtHighFreqLockStart=ci;
   readerSpeechState.txtHighFreqLockEnd=ci+1;
   readerSpeechState.txtHighFreqLockChar=text.charAt(ci);
   readerSpeechState.txtHighFreqLockAbsStart=absStart;
   readerSpeechState.txtHighFreqLockAbsEnd=absEnd;
 }
 if(readerSpeechState.wordFollowHighlight)readerSpeechSmartFollowWord(liveDoc,wr.range);
}
function readerSpeechRevealNewSegment(item,previousItem){
  if(!state.runtime||!state.runtime.iframe||!item)return;
  var sectionChanged=!!previousItem&&Number(previousItem.sectionIndex)!==Number(item.sectionIndex);
  var prevChapterId=previousItem&&String(previousItem.logicalChapterId||"");
  var nextChapterId=String(item.logicalChapterId||"");
  var chapterChanged=!!previousItem&&((prevChapterId&&nextChapterId&&prevChapterId!==nextChapterId)||(!prevChapterId&&!nextChapterId&&Number(previousItem.logicalChapterIndex||0)!==Number(item.logicalChapterIndex||0)));
  if(!sectionChanged&&!chapterChanged)return;
  try{
    var d=state.runtime.iframe.contentDocument,root=d&&(d.scrollingElement||d.documentElement);
    if(!root)return;
    root.scrollTo({top:0,left:0,behavior:"auto"});
    state.runtime.currentOffset=0;
  }catch(_){}
}
function readerSpeechApplyVisualMode(){
  /* v7.12.45: there is no master "Speech Highlight Follow" switch.
     The selected mode button is the only authority for both visual highlight
     and its scroll-follow behavior. Sentence and word/phrase modes are exclusive. */
  readerSpeechInvalidateCharacterMap();
  if(!state.runtime||!state.runtime.iframe)return;
  try{
    var d=state.runtime.iframe.contentDocument;if(!d)return;
    var root=d.body||d.documentElement;if(!root)return;
    /* Selection lock belongs to an active Speech session, not to the Word-mode
       preference itself. Word Follow may remain enabled while idle, but the
       reader must remain selectable until Speech actually starts. */
    var speechActive=readerSpeechState.status!=="idle";
    root.classList.toggle("booknote-word-follow-mode",!!readerSpeechState.wordFollowHighlight&&speechActive);
    root.classList.toggle("booknote-sentence-follow-off",!readerSpeechState.sentenceFollowHighlight);
    if(readerSpeechState.wordFollowHighlight){
      readerSpeechClearNativeSelection(d);
      readerSpeechPurgeSentenceVisual(d);
      clearSpeechWordMarks();
      readerSpeechClearNativeSelection(d);
    }else if(readerSpeechState.sentenceFollowHighlight){
      clearSpeechWordMarks();
      readerSpeechPurgeSentenceVisual(d);
    }else{
      clearSpeechWordMarks();
      readerSpeechPurgeSentenceVisual(d);
    }
  }catch(_){}
}
function readerSpeechRefreshCurrentHighlight(){
  /* v7.12.49: Word/Phrase mode owns the speech paint pipeline. Never allow a
     sentence refresh (including delayed/asynchronous callers) to paint even
     for one frame before the next word boundary. */
  if(readerSpeechState.wordFollowHighlight){
    try{if(state.runtime&&state.runtime.iframe){readerSpeechPurgeSentenceVisual(state.runtime.iframe.contentDocument);readerSpeechClearNativeSelection(state.runtime.iframe.contentDocument);}}catch(_){}
    return;
  }
  if(!readerSpeechState.sentenceFollowHighlight||!readerSpeechState.currentSpeechItem||!state.runtime||!state.runtime.iframe)return;
  try{
    clearSpeechMarks();
    readerSpeechState.currentSentenceMark=null;
    if(readerSpeechState.wordFollowHighlight||!readerSpeechState.sentenceFollowHighlight)return;
    var d=state.runtime.iframe.contentDocument;
    var live=readerSpeechResolveLiveRange(readerSpeechState.currentSpeechItem);
    if(!d||!live||!live.start||!live.end)return;
    var ok=wrapReaderRange(d,live.start,live.end,"reader-speech-hit",null,"",readerSpeechState.currentSpeakText);
    if(ok){
      readerSpeechState.currentSentenceMark=d.querySelector("mark.reader-speech-hit");
      if(readerSpeechState.sentenceFollowHighlight)scrollSpeechHighlight();
    }
  }catch(_){}
}
function readerSpeechSetHighlightMode(mode){
 /* Mode is a selector, never an on/off toggle. Selecting Word always means
    Word=ON/Sentence=OFF; selecting Sentence means Sentence=ON/Word=OFF.
    Switching mode never restarts Speech or changes the queue/cursor. */
 if(mode==="word"){
   readerSpeechState.wordFollowHighlight=true;
   readerSpeechState.sentenceFollowHighlight=false;
 }else if(mode==="sentence"){
   readerSpeechState.wordFollowHighlight=false;
   readerSpeechState.sentenceFollowHighlight=true;
 }else return;
 readerSpeechApplyVisualMode();
 var d=state.runtime&&state.runtime.iframe&&state.runtime.iframe.contentDocument;
 if(readerSpeechState.status!=="idle"&&d&&readerSpeechState.currentSpeechItem){
   if(readerSpeechState.wordFollowHighlight){
     readerSpeechClearNativeSelection(d);readerSpeechPurgeSentenceVisual(d);clearSpeechWordMarks();
     readerSpeechApplyWordBoundary({charIndex:readerSpeechState.currentBoundaryIndex||0,charLength:readerSpeechState.currentBoundaryLength||0},true);
   }else{
     clearSpeechWordMarks();readerSpeechPurgeSentenceVisual(d);readerSpeechRefreshCurrentHighlight();
   }
 }
 readerSpeechUpdate();
}
function readerSpeechExitWordVisualLock(){
  /* Explicit Stop is the hard reset boundary: release the browser text-selection lock.
     Pause/Resume never calls this function. */
  try{
    var frame=state.runtime&&state.runtime.iframe;
    var d=frame&&frame.contentDocument;
    if(d){
      var body=d.body||d.documentElement;
      if(body){
        body.classList.remove("booknote-word-follow-mode");
        body.classList.remove("booknote-sentence-follow-off");
      }
    }
  }catch(_){}
  try{var tb=$("selectionToolbar");if(tb)tb.hidden=true;}catch(_){}
}
function readerSpeechStop(){readerSpeechExitWordVisualLock();readerSpeechState.token++;readerSpeechState.sessionId++;readerSpeechState.status="idle";readerSpeechState.queue=[];readerSpeechState.index=0;try{if(window.speechSynthesis)window.speechSynthesis.cancel();}catch(_){}readerSpeechState.utterance=null;readerSpeechState.source=null;readerSpeechState.selection=null;readerSpeechState.selectionKey="";readerSpeechState.currentSpeakText="";readerSpeechState.currentSpeechItem=null;readerSpeechState.currentSentenceMark=null;readerSpeechState.currentLiveRange=null;readerSpeechState.currentWordAbsStart=-1;readerSpeechState.currentWordAbsEnd=-1;readerSpeechState.currentBoundaryIndex=0;readerSpeechState.currentBoundaryLength=0;readerSpeechState.lastBoundaryTimeStamp=-1;readerSpeechState.lastFollowScrollAt=0;readerSpeechState.lastFollowScrollTop=null;readerSpeechState.followInitialCenter=true;readerSpeechInvalidateCharacterMap();clearSpeechMarks();readerSpeechUpdate();}
function readerSpeechClosePanel(){
 /* Closing the TTS panel is UI-only. It must never cancel, rebuild, or mutate the speech session. */
 toggleTtsPanel(false);
}
function readerSpeechExplicitRestart(text,options){
 /* Only an explicit new reading command enters this reset boundary. */
 readerSpeechStart(text,options||{});
}
function ensureSpeechHighlightStyle(doc){if(!doc||!doc.head)return;try{var id="booknote-speech-highlight-style";if(doc.getElementById(id))return;var st=doc.createElement("style");st.id=id;st.textContent="mark.reader-speech-hit{background:color-mix(in srgb,var(--reader-accent,#5B8CFF) 26%,transparent)!important;color:inherit!important;-webkit-text-fill-color:currentColor!important;border:1px solid color-mix(in srgb,var(--reader-accent,#5B8CFF) 72%,transparent)!important;border-radius:3px;padding:0 1px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--reader-accent,#5B8CFF) 16%,transparent)} body.booknote-word-follow-mode mark.reader-speech-hit,body.booknote-word-follow-mode mark.reader-speech-anchor{display:none!important;background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;box-shadow:none!important}mark.reader-speech-hit::selection,mark.reader-speech-word-hit::selection{background:transparent!important}mark.reader-speech-anchor{background:transparent!important;border:0!important;border-radius:0!important;padding:0!important;box-shadow:none!important}body.booknote-word-follow-mode{user-select:none!important;-moz-user-select:none!important}body.booknote-word-follow-mode *{user-select:none!important;-moz-user-select:none!important}body.booknote-word-follow-mode *::selection{background:transparent!important;color:inherit!important} mark.reader-speech-word-hit{background:color-mix(in srgb,var(--reader-accent,#5B8CFF) 58%,transparent)!important;background-color:color-mix(in srgb,var(--reader-accent,#5B8CFF) 58%,transparent)!important;color:inherit!important;-webkit-text-fill-color:currentColor!important;border:0!important;border-radius:0!important;padding:0!important;margin:0!important;box-shadow:none!important}::highlight(booknote-speech-word){background:color-mix(in srgb,var(--reader-accent,#5B8CFF) 58%,transparent);color:inherit;-webkit-text-fill-color:currentColor;text-decoration:none;text-shadow:none}";doc.head.appendChild(st);}catch(_){}}
function readerSpeechSelectionAnchor(){var s=state.selected||selectionOffsets();if(!s||!s.text)return null;return s;}
function readerSpeechStartFromSelection(){var s=readerSpeechSelectionAnchor();if(!s){var text=readerSpeechSelected();if(text)return readerSpeechStart(text,{useEpub:false,source:"selection"});toast("请先选择正文内容");return;}var idx=Number(s.epubLocator&&s.epubLocator.sectionIndex!=null?s.epubLocator.sectionIndex:s.chapterIndex)||0;var base=Number((state.canonicalChapters[idx]||{}).textStart)||0;var off=Number(s.epubLocator&&s.epubLocator.start!=null?s.epubLocator.start:s.start)||0;var isEpub=!!(s.epubLocator||s.locator&&String(s.locator.type||"")==="epub");if(!isEpub)off=Math.max(0,off-base);readerSpeechStart(s.text,{useEpub:isEpub,sectionIndex:idx,offset:off,source:"selection-only",selection:s});}
function readerSpeechEnterWordVisualLock(){
  if(!readerSpeechState.wordFollowHighlight)return;
  try{
    /* Establish the Word-mode paint barrier before async settings/frame work.
       This closes the old Selection -> sentence-paint -> word-boundary window. */
    var frame=state.runtime&&state.runtime.iframe;
    var d=frame&&frame.contentDocument;
    if(d){
      var body=d.body||d.documentElement;
      if(body){
        body.classList.add("booknote-word-follow-mode");
        body.classList.add("booknote-sentence-follow-off");
      }
      readerSpeechClearNativeSelection(d);
      readerSpeechPurgeSentenceVisual(d);
      clearSpeechWordMarks();
    }
    var topSel=window.getSelection&&window.getSelection();
    if(topSel&&topSel.rangeCount)topSel.removeAllRanges();
    var tb=$("selectionToolbar");
    if(tb)tb.hidden=true;
  }catch(_){}
}
function readerSpeechStart(text,options){var synth=window.speechSynthesis,opts=options||{};if(!synth){toast("系统语音不可用");return;}text=String(text||"").trim();if(!text){toast("没有可朗读的内容");return;}readerSpeechStop();readerSpeechState.sentenceFollowHighlight=false;readerSpeechState.wordFollowHighlight=true;readerSpeechEnterWordVisualLock();readerSpeechState.source=String(opts.source||"default");readerSpeechState.selection=opts.selection||null;readerSpeechState.selectionKey=readerSpeechSelectionKey(opts.selection);try{var ad=state.runtime&&state.runtime.iframe&&state.runtime.iframe.contentDocument,as=ad&&ad.getSelection&&ad.getSelection();if(as&&as.rangeCount)as.removeAllRanges();}catch(_){}readerSpeechState.sessionId++;var token=++readerSpeechState.token;var epubMode=(opts.useEpub!==false&&state.runtime&&state.runtime.isEpubMulti&&state.runtime.isEpubMulti());if(Array.isArray(opts.queue))readerSpeechState.queue=opts.queue;else if(epubMode&&opts.source==="selection-only"&&opts.selection){
  var selIdx=Number(opts.sectionIndex!=null?opts.sectionIndex:(opts.selection.epubLocator&&opts.selection.epubLocator.sectionIndex!=null?opts.selection.epubLocator.sectionIndex:opts.selection.chapterIndex))||0;
  var selStart=Number(opts.offset!=null?opts.offset:(opts.selection.epubLocator&&opts.selection.epubLocator.start!=null?opts.selection.epubLocator.start:opts.selection.start))||0;
  var selEnd=Number(opts.selection.epubLocator&&opts.selection.epubLocator.end!=null?opts.selection.epubLocator.end:opts.selection.end);
  var epq=state.runtime.epubSentenceQueue(selIdx,selStart);
  readerSpeechState.queue=epq.filter(function(x){return Number(x.sectionIndex)===selIdx&&Number(x.start)<selEnd;}).map(function(x){
    var a=Math.max(Number(x.start)||0,selStart),b=Math.min(Number(x.end)||0,selEnd);
    if(b<=a)return null;
    var q=String(x.text||""),lo=a-(Number(x.start)||0),hi=b-(Number(x.start)||0);
    return Object.assign({},x,{start:a,end:b,text:q.slice(Math.max(0,lo),Math.max(0,hi))});
  }).filter(function(x){return x&&x.text;});
}else if(epubMode)readerSpeechState.queue=state.runtime.epubSentenceQueue(opts.sectionIndex!=null?opts.sectionIndex:state.currentChapter,opts.offset!=null?opts.offset:(state.runtime.currentOffset||0));else if(opts.source==="selection-position"&&opts.sectionIndex!=null)readerSpeechState.queue=readerSpeechQueueFromText(String((state.chapters[Number(opts.sectionIndex)||0]&&state.chapters[Number(opts.sectionIndex)||0].text)||text||""),Number(opts.sectionIndex)||0,Number(opts.offset)||0);else if(opts.source==="selection-only"&&opts.selection&&opts.sectionIndex!=null)readerSpeechState.queue=readerSpeechQueueFromSelection(opts.selection);else if(opts.selection&&opts.sectionIndex!=null)readerSpeechState.queue=readerSpeechQueueFromSelection(opts.selection);else if(opts.sectionIndex!=null)readerSpeechState.queue=readerSpeechQueueFromText(text,Number(opts.sectionIndex)||0,Number(opts.offset)||0);else readerSpeechState.queue=readerSpeechQueueFromChapters(state.currentChapter,state.runtime&&state.runtime.currentOffset||0);
/* Scope is explicit: a failed CURRENT queue must never fall back to the selected text.
   A failed SELECTION queue may only fall back to the selection itself. */
if(!readerSpeechState.queue.length){
  if(opts.source==="selection-only"&&opts.selection&&opts.selection.text){
    readerSpeechState.queue=readerSpeechQueueFromText(String(opts.selection.text),Number(opts.sectionIndex)||Number(opts.selection.chapterIndex)||0,0);
  }else if(opts.source==="selection-position"&&opts.sectionIndex!=null){
    var fallbackChapter=Number(opts.sectionIndex)||0,fullSource=String((state.chapters[fallbackChapter]&&state.chapters[fallbackChapter].text)||"");
    readerSpeechState.queue=readerSpeechQueueFromText(fullSource,fallbackChapter,Number(opts.offset)||0);
  }else if(opts.sectionIndex!=null){
    readerSpeechState.queue=readerSpeechQueueFromText(text,Number(opts.sectionIndex)||0,Number(opts.offset)||0);
  }else{
    readerSpeechState.queue=readerSpeechChunks(text).map(function(x){return {text:x,sectionIndex:Number(opts.sectionIndex)||state.currentChapter,start:Number(opts.offset)||0,end:(Number(opts.offset)||0)+x.length};});
  }
}readerSpeechState.index=0;readerSpeechState.status="speaking";readerSpeechUpdate();readerSpeechSettings().then(function(settings){if(token!==readerSpeechState.token)return;async function speakNext(){if(token!==readerSpeechState.token)return;if(readerSpeechState.index>=readerSpeechState.queue.length){readerSpeechExitWordVisualLock();readerSpeechState.status="idle";readerSpeechState.utterance=null;readerSpeechState.currentSpeechItem=null;readerSpeechState.currentLiveRange=null;readerSpeechState.currentSentenceMark=null;readerSpeechState.currentWordAbsStart=-1;readerSpeechState.currentWordAbsEnd=-1;readerSpeechState.currentBoundaryIndex=0;readerSpeechState.currentBoundaryLength=0;readerSpeechState.lastBoundaryTimeStamp=-1;readerSpeechState.txtHighFreqLockStart=-1;readerSpeechState.txtHighFreqLockEnd=-1;readerSpeechState.txtHighFreqLockChar="";readerSpeechState.txtHighFreqLockAbsStart=-1;readerSpeechState.txtHighFreqLockAbsEnd=-1;readerSpeechInvalidateCharacterMap();clearSpeechMarks();readerSpeechUpdate();return;}var item=readerSpeechState.queue[readerSpeechState.index++],previousItem=readerSpeechState.queue[readerSpeechState.index-2],speakText=typeof item==='string'?item:item.text;if(typeof item!=='string'&&state.runtime&&state.runtime.iframe){try{var targetSection=Number(item.sectionIndex);if(!Number.isFinite(targetSection))targetSection=state.currentChapter;var sectionChanged=Number(state.runtime.currentIndex)!==targetSection;if(sectionChanged)await state.runtime.show(targetSection,0,'');readerSpeechRevealNewSegment(item,previousItem);ensureSpeechHighlightStyle(state.runtime.iframe.contentDocument);if(readerSpeechState.wordFollowHighlight){readerSpeechEnterWordVisualLock();readerSpeechClearNativeSelection(state.runtime.iframe.contentDocument);readerSpeechPurgeSentenceVisual(state.runtime.iframe.contentDocument);}else readerSpeechClearNativeSelection(state.runtime.iframe.contentDocument);readerSpeechApplyVisualMode();if(readerSpeechState.wordFollowHighlight){readerSpeechPurgeSentenceVisual(state.runtime.iframe.contentDocument);readerSpeechClearNativeSelection(state.runtime.iframe.contentDocument);}else clearSpeechMarks();readerSpeechState.currentSpeakText=speakText;readerSpeechState.currentSpeechItem=item;readerSpeechState.currentSentenceMark=null;readerSpeechState.currentLiveRange=null;readerSpeechState.currentWordAbsStart=-1;readerSpeechState.currentWordAbsEnd=-1;readerSpeechState.currentBoundaryIndex=0;readerSpeechState.currentBoundaryLength=0;readerSpeechState.lastBoundaryTimeStamp=-1;readerSpeechState.txtHighFreqLockStart=-1;readerSpeechState.txtHighFreqLockEnd=-1;readerSpeechState.txtHighFreqLockChar="";readerSpeechState.txtHighFreqLockAbsStart=-1;readerSpeechState.txtHighFreqLockAbsEnd=-1;readerSpeechState.lastFollowScrollAt=0;readerSpeechState.lastFollowScrollTop=null;readerSpeechState.followInitialCenter=true;if(readerSpeechState.sentenceFollowHighlight&&!readerSpeechState.wordFollowHighlight){var sr=readerSpeechResolveLiveRange(item);if(sr&&sr.start&&sr.end){readerSpeechState.currentLiveRange=sr;var ok=wrapReaderRange(state.runtime.iframe.contentDocument,sr.start,sr.end,"reader-speech-hit",null,"",speakText);if(!ok)clearSpeechMarks();else{readerSpeechState.currentSentenceMark=state.runtime.iframe.contentDocument.querySelector("mark.reader-speech-hit");scrollSpeechHighlight();}}}state.runtime.currentOffset=Number(item.start)||0;}catch(e){console.warn("[BookNote Speech] visual mapping failed",e);}}var u=new SpeechSynthesisUtterance(speakText),v=readerSpeechVoice(settings);if(v)u.voice=v;if(v&&v.lang)u.lang=v.lang;u.rate=settings.rate;u.pitch=settings.pitch;u.volume=Math.min(1,Math.max(0,settings.volume));u.onboundary=function(e){if(token!==readerSpeechState.token)return;readerSpeechApplyWordBoundary(e);};u.onend=function(){if(token!==readerSpeechState.token)return;speakNext();};u.onerror=function(){if(token!==readerSpeechState.token)return;readerSpeechExitWordVisualLock();readerSpeechState.status="idle";readerSpeechState.utterance=null;readerSpeechState.currentSpeechItem=null;readerSpeechState.currentLiveRange=null;readerSpeechState.currentSentenceMark=null;readerSpeechState.currentWordAbsStart=-1;readerSpeechState.currentWordAbsEnd=-1;readerSpeechState.currentBoundaryIndex=0;readerSpeechState.currentBoundaryLength=0;readerSpeechState.lastBoundaryTimeStamp=-1;readerSpeechState.txtHighFreqLockStart=-1;readerSpeechState.txtHighFreqLockEnd=-1;readerSpeechState.txtHighFreqLockChar="";readerSpeechState.txtHighFreqLockAbsStart=-1;readerSpeechState.txtHighFreqLockAbsEnd=-1;readerSpeechInvalidateCharacterMap();clearSpeechMarks();readerSpeechUpdate();};readerSpeechState.utterance=u;synth.speak(u);}speakNext();}).catch(function(){readerSpeechStop();toast("朗读设置读取失败");});}

function readerSpeechHandleSpaceKey(e){
  /* v7.12.54: While Speech is active, Space belongs exclusively to
     Pause/Resume. Never let the browser/reader consume it as page scroll. */
  if(!e||e.defaultPrevented)return false;
  if(!(e.code==="Space"||e.key===" "))return false;
  if(readerSpeechState.status!=="speaking"&&readerSpeechState.status!=="paused")return false;
  if(e.repeat)return true;
  try{e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==="function")e.stopImmediatePropagation();}catch(_){}
  readerSpeechToggle();
  return true;
}
function readerSpeechToggle(){var synth=window.speechSynthesis;if(!synth){toast("系统语音不可用");return;}
  if(readerSpeechState.status==="speaking"){synth.pause();readerSpeechState.status="paused";readerSpeechUpdate();return;}
  if(readerSpeechState.status==="paused"){
    /* Resume the existing queue/session. Never rebuild the EPUB locator. */
    synth.resume();readerSpeechState.status="speaking";readerSpeechUpdate();return;
  }
  var s=state.selected||selectionOffsets();
  if(s&&s.text&&state.runtime&&state.runtime.isEpubMulti&&state.runtime.isEpubMulti()&&s.epubLocator)readerSpeechExplicitRestart(s.text,{useEpub:true,sectionIndex:Number(s.epubLocator.sectionIndex)||0,offset:Number(s.epubLocator.start)||0,source:"selection-position",selection:s});else readerSpeechStart(readerSpeechFromCurrent());
}
function openReaderVoiceSettings(){browser.tabs.create({url:browser.runtime.getURL("options.html"),active:true});}

/* v7.12.54: Speech owns Space while a reading session is active. Capture at
   the Reader shell so Space cannot fall through to viewport/page scrolling. */
if(!window.__booknoteSpeechSpaceBound){
  window.__booknoteSpeechSpaceBound=true;
  window.addEventListener("keydown",function(e){readerSpeechHandleSpaceKey(e);},true);
}


function syncReaderAdaptiveGeometry(){
 var body=document.getElementById("readerBody"),root=document.documentElement;
 if(!body||!root)return;
 var h=Math.max(360,body.clientHeight||window.innerHeight||800);
 
 /* 859px is the reference Reader body height for the current 58px header.
    Clamp prevents controls from becoming unusably small or oversized. */
 var scale=Math.max(.84,Math.min(1.08,h/859));
 var px=function(n,min,max){return Math.max(min,Math.min(max,Math.round(n*scale)))+"px";};
 root.style.setProperty("--reader-scale",scale.toFixed(3));
 root.style.setProperty("--reader-head-h",h<620?"54px":"58px");
 root.style.setProperty("--reader-btn-h",px(40,34,42));
 root.style.setProperty("--reader-side-head-h",px(52,44,56));
 root.style.setProperty("--reader-side-tabs-h",px(44,38,48));
 root.style.setProperty("--reader-foot-h",px(54,50,58));
}
function bindReaderAdaptiveGeometry(){
 syncReaderAdaptiveGeometry();
 var body=document.getElementById("readerBody");
 if(window.ResizeObserver&&body){
   var ro=new ResizeObserver(function(){syncReaderAdaptiveGeometry()});
   ro.observe(body);
 }
 window.addEventListener("resize",syncReaderAdaptiveGeometry,{passive:true});
}

function clearReaderSearch(){
  clearTimeout(readerSearchTimer);
  state.searchSeq++;state.searchNavSeq++;
  state.hits=[];state.hitIndex=-1;
  clearMarks();
  var input=$("searchInput");if(input)input.value="";
  updateReaderSearchClear();
  var status=$("searchStatus");if(status){status.textContent="";status.removeAttribute("data-search-stage");}
  var prev=$("prevHit"),next=$("nextHit");if(prev)prev.disabled=true;if(next)next.disabled=true;
  showReaderSearchUI();
  showReaderSearchHistory();
  if(input){input.focus();try{input.setSelectionRange(0,0)}catch(_){} }
}
function initUI(){
 var searchBar=$("searchBar"),readerCenter=$("readerCenter");if(searchBar&&readerCenter&&searchBar.parentElement!==readerCenter)readerCenter.insertBefore(searchBar,readerCenter.firstChild);
 $("ttsFloatBtn").onclick=function(e){e.stopPropagation();toggleTtsPanel()};
 $("closeTtsPanel").onclick=readerSpeechClosePanel;
 $("voiceSettingsBtn").onclick=openReaderVoiceSettings;
 $("readHomeBtn").onclick=function(){readerSpeechExplicitRestart(readerSpeechAllText(),{useEpub:true,sectionIndex:0,offset:0,queue:(state.runtime&&state.runtime.isEpubMulti&&state.runtime.isEpubMulti())?null:readerSpeechQueueFromChapters(0,0)});};
 $("readCurrentBtn").onclick=function(){var s=state.selected||selectionOffsets();if(s&&s.text){if(state.runtime&&state.runtime.isEpubMulti&&state.runtime.isEpubMulti()&&s.epubLocator){readerSpeechStart(s.text,{useEpub:true,sectionIndex:Number(s.epubLocator.sectionIndex)||0,offset:Number(s.epubLocator.start)||0,source:"selection-position",selection:s});}else{readerSpeechStart(s.text,{useEpub:false,sectionIndex:Number(s.chapterIndex)||0,offset:Math.max(0,Number(s.start||0)-Number((state.canonicalChapters[Number(s.chapterIndex)||0]||{}).textStart||0)),source:"selection-position",selection:s});}}else readerSpeechStart(readerSpeechFromCurrent(),{useEpub:true,sectionIndex:state.currentChapter,offset:state.runtime&&state.runtime.currentOffset||0,queue:(state.runtime&&state.runtime.isEpubMulti&&state.runtime.isEpubMulti())?null:readerSpeechQueueFromChapters(state.currentChapter,state.runtime&&state.runtime.currentOffset||0)});};
 $("readSelectionBtn").onclick=function(){readerSpeechStartFromSelection();};
 $("readToggleBtn").onclick=readerSpeechToggle;
 $("readSentenceFollowBtn").onclick=function(){readerSpeechSetHighlightMode("sentence");};
 $("readWordFollowBtn").onclick=function(){readerSpeechSetHighlightMode("word");};
 $("readStopBtn").onclick=readerSpeechStop;
 $("homeBtn").onclick=goHome;
 $("shelfBtn").onclick=function(){location.href=browser.runtime.getURL("book-library.html")};
 $("exportCanonicalModel").onclick=function(){exportCanonicalModel()};
 $("importCanonicalModel").onclick=function(){var f=$("canonicalImportFile");if(f){f.value="";f.click();}};
 $("canonicalImportFile").onchange=function(){var f=this.files&&this.files[0];if(f)importCanonicalModelFile(f);};
$("sidebarBtn").onclick=function(){var open=!$("sidebar").classList.contains("open");$("sidebar").classList.toggle("open",open);$("sidebarScrim").hidden=!open;$("readerBody").classList.toggle("sidebar-open",open);renderSide()};
 $("closeSide").onclick=function(){$("sidebar").classList.remove("open");$("sidebarScrim").hidden=true;$("readerBody").classList.remove("sidebar-open")};
 $("sidebarScrim").onclick=function(){$("sidebar").classList.remove("open");$("sidebarScrim").hidden=true;$("readerBody").classList.remove("sidebar-open")};
 document.querySelectorAll(".side-tabs [data-tab]").forEach(function(b){b.onclick=function(e){e.preventDefault();var tab=b.dataset.tab||"toc";if(state.activeTab!==tab)clearSideSelection();state.activeTab=tab;document.querySelectorAll(".side-tabs button").forEach(function(x){var on=x.dataset.tab===tab;x.classList.toggle("active",on);x.setAttribute("aria-selected",on?"true":"false");});renderSide();requestAnimationFrame(function(){if(state.activeTab==='toc')updateTocActive(true);else syncManagedSideToReader();});}});
 $("themeBtn").onclick=openThemePanel;
 $("modeBtn").onclick=function(){if(globalThis.BookNoteGlobalTheme)return BookNoteGlobalTheme.toggleMode().then(function(st){state.themeName=st.themeName;state.themeMode=st.themeMode;applySettings();applyReaderThemeControls();updateModeControl();});state.themeMode=state.themeMode==="night"?"day":"night";applySettings();applyReaderThemeControls();updateModeControl();syncThemeState()};
var searchFloatBtn=$("searchFloatBtn");if(searchFloatBtn)searchFloatBtn.onclick=function(e){e.stopPropagation();toggleSearchFloat();};
 $("searchInput").oninput=function(){updateReaderSearchClear();showReaderSearchHistory();clearTimeout(readerSearchTimer);var q=this.value;readerSearchTimer=setTimeout(function(){runSearch(q)},90)};
 $("searchInput").onfocus=function(){updateReaderSearchClear();showReaderSearchHistory()};
 $("searchInput").onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();clearTimeout(readerSearchTimer);runSearch(this.value).finally(function(){if(document.activeElement===$("searchInput"))showReaderSearchHistory()})}else if(e.key==="Escape"){showReaderSearchHistory()}};
 var clearSearchButton=$("searchClear");
 if(clearSearchButton){
   var clearHandler=function(e){e.preventDefault();e.stopPropagation();clearReaderSearch()};
   clearSearchButton.onclick=clearHandler;
   clearSearchButton.onpointerdown=clearHandler;
 }
 $("searchSubmit").onclick=function(e){e.preventDefault();e.stopPropagation();clearTimeout(readerSearchTimer);runSearch($("searchInput").value).finally(function(){if(document.activeElement===$("searchInput"))showReaderSearchHistory()});$("searchInput").focus()};
 $("exportAllSearch").onclick=function(e){e.preventDefault();e.stopPropagation();exportAllReaderSearch();};
 $("exportCurrentSearch").onclick=function(e){e.preventDefault();e.stopPropagation();exportCurrentReaderSearch();};
 $("prevHit").onclick=function(){if(state.hits.length){state.hitIndex=(state.hitIndex-1+state.hits.length)%state.hits.length;updateReaderSearchNavigationStatus("results");void jumpHit()}};
 $("nextHit").onclick=function(){if(state.hits.length){state.hitIndex=(state.hitIndex+1)%state.hits.length;updateReaderSearchNavigationStatus("results");void jumpHit()}};
 $("closeSettings").onclick=closeThemePanel;
 $("saveTypography").onclick=async function(){state.settings.fontScale=Number($("fontScale").value);state.settings.lineHeight=Number($("lineHeight").value)/10;state.settings.width=$("widthMode").value;await BookNoteReadestBridge.saveReaderSettings(state.settings);applySettings();toast("排版设置已保存")};
 $("fontScale").oninput=function(){state.settings.fontScale=Number(this.value);applySettings()};
 $("lineHeight").oninput=function(){state.settings.lineHeight=Number(this.value)/10;applySettings()};
 $("widthMode").onchange=function(){state.settings.width=this.value;applySettings()};
 $("lightTheme").onclick=function(){if(globalThis.BookNoteGlobalTheme)return BookNoteGlobalTheme.setMode("day").then(function(st){state.themeName=st.themeName;state.themeMode=st.themeMode;applySettings();applyReaderThemeControls();updateModeControl();});state.themeMode="day";applySettings();applyReaderThemeControls();updateModeControl();syncThemeState()};
 $("darkTheme").onclick=function(){if(globalThis.BookNoteGlobalTheme)return BookNoteGlobalTheme.setMode("night").then(function(st){state.themeName=st.themeName;state.themeMode=st.themeMode;applySettings();applyReaderThemeControls();updateModeControl();});state.themeMode="night";applySettings();applyReaderThemeControls();updateModeControl();syncThemeState()};
 document.querySelectorAll(".reader-theme-option").forEach(function(b){b.onclick=function(){state.themeName=b.dataset.themeChoice||state.themeName;applySettings();applyReaderThemeControls();syncThemeState()}});
 $("prevChapter").onclick=function(){showChapter(state.currentChapter-1,0)};
 $("nextChapter").onclick=function(){showChapter(state.currentChapter+1,0)};
 $("prevPage").onclick=function(){scrollReaderByPage(-1)};
 $("nextPage").onclick=function(){scrollReaderByPage(1)};
 $("readerScrollTop").onclick=function(){scrollReaderToEdge("top")};
 $("readerScrollBottom").onclick=function(){scrollReaderToEdge("bottom")};
 var scrollSlider=$("readerScrollSlider");
 if(scrollSlider)scrollSlider.oninput=function(){if(state.runtime&&state.runtime.setScrollRatio)state.runtime.setScrollRatio(Number(this.value)/1000)};
 document.querySelectorAll("#selectionToolbar [data-action]").forEach(function(b){b.onclick=function(){var a=b.dataset.action;if(a==="highlight")openHighlightColorPicker();else if(a==="bookmark")openBookmarkStarPicker();else if(a==="summary-note"){openSummaryNoteEditor()}else if(a==="content-annotation"){openContentAnnotationEditor()}else if(a==="note"){saveAnnotation("note")}else if(a==="copy"){var s=state.selected||selectionOffsets();if(s)navigator.clipboard&&navigator.clipboard.writeText(s.text).then(function(){toast("已复制")});else toast("请先选择正文")}else if(a==="search"){var s=state.selected||selectionOffsets();if(s){$("searchBar").hidden=false;$("searchInput").value=s.text;runSearch(s.text)}}else if(a==="cancel"){clearSelection();}}});
 $("viewport").addEventListener("scroll",function(){if(state.runtime&&state.runtime.iframe){var cur=state.runtime.getCurrent&&state.runtime.getCurrent();if(cur){var __loc=cur.locator||(globalThis.BookNoteLocator?BookNoteLocator.reflow({chapterIndex:Number(cur.index)||0,start:Number(cur.offset)||0,end:Number(cur.offset)||0,documentStart:Number(cur.section&&cur.section.textStart||0)+Number(cur.offset||0),documentEnd:Number(cur.section&&cur.section.textStart||0)+Number(cur.offset||0),href:cur.section&&cur.section.href,fragment:cur.section&&cur.section.fragment}):{chapterIndex:Number(cur.index)||0,offset:Number(cur.offset)||0});BookNoteReadestBridge.saveProgress(state.book&&state.book.id,{progress:state.chapters.length?((Number(cur.index)||0)+1)/state.chapters.length:0,locator:__loc,position:{version:2,type:"reflow",documentStart:Number(__loc&&__loc.documentStart!=null?__loc.documentStart:(cur.section&&cur.section.textStart||0))+Number(cur.offset||0),documentEnd:Number(__loc&&__loc.documentEnd!=null?__loc.documentEnd:(cur.section&&cur.section.textStart||0))+Number(cur.offset||0),textQuote:(__loc&&__loc.textQuote)||{exact:"",prefix:"",suffix:""}}}).catch(function(){})}}});
 window.addEventListener("click",function(e){if(e.target.closest("#selectionToolbar")||e.target.closest("#highlightColorPicker")||e.target.closest("#bookmarkStarPicker"))return;closeHighlightColorPicker();if(!e.target.closest(".popover")&&!e.target.closest("#themeBtn"))closeThemePanel();var w=$("searchHistory"),wrap=document.querySelector(".search-wrap");if(w&&wrap&&!wrap.contains(e.target))hideReaderSearchHistory();if(!e.target.closest("#ttsFloat"))toggleTtsPanel(false);if(!e.target.closest("#searchFloat")&&!e.target.closest("#searchBar"))toggleSearchFloat(false)});
 updateLayoutControls();updateModeControl();
}
function updateResponsiveLayout(){}
var readerGeometryObserver=null;
function syncReaderSearchGeometry(){var bar=$("searchBar"),center=$("readerCenter"),nav=$("bottomNavigator"),float=$("searchFloat");if(!bar||!center||!float||!nav)return;var cw=Math.max(0,Math.floor(center.getBoundingClientRect().width));var nw=Math.max(0,Math.floor(nav.getBoundingClientRect().width));var group=Math.min(nw,Math.max(0,cw-16));var bw=Math.max(42,Math.floor(float.getBoundingClientRect().width||44));if(group<bw+24)group=Math.max(0,cw-8);var left=Math.max(0,(cw-group)/2),field=Math.max(0,group-bw);bar.style.width=field+"px";bar.style.left=left+"px";bar.style.right="auto";bar.style.top="18px";bar.style.paddingRight="10px";float.style.right=(cw-left-bw)+"px";float.style.left="auto";float.style.top="18px";float.style.width=bw+"px";float.style.height=bw+"px";float.style.zIndex="182";bar.style.zIndex="181"}
function openDefaultDirectory(){var side=$("sidebar"),body=$("readerBody");if(!side||!body)return;side.hidden=false;side.classList.add("open");body.classList.add("sidebar-open");var scrim=$("sidebarScrim");if(scrim)scrim.hidden=true;state.activeTab="toc";document.querySelectorAll(".side-tabs button").forEach(function(b){b.classList.toggle("active",b.dataset.tab==="toc")});renderSide();}
function syncReaderGeometry(){var body=$("readerBody"),center=$("readerCenter");if(!body||!center)return;var br=body.getBoundingClientRect(),cr=center.getBoundingClientRect(),w=Math.max(0,Math.floor(cr.width));body.style.setProperty("--reader-center-width",w+"px");body.style.setProperty("--reader-center-left",Math.max(0,Math.floor(cr.left-br.left))+"px");updateResponsiveLayout();syncReaderSearchGeometry();if(state.selected)positionToolbar(state.selected)}
function installReaderGeometryObserver(){if(typeof ResizeObserver!=="function")return;if(readerGeometryObserver)readerGeometryObserver.disconnect();readerGeometryObserver=new ResizeObserver(function(){requestAnimationFrame(syncReaderGeometry)});["readerBody","readerCenter","sidebar"].forEach(function(id){var el=$(id);if(el)readerGeometryObserver.observe(el)});}
window.addEventListener("resize",syncReaderGeometry);
function bindFrameSelection(){if(!state.runtime)return;var runtime=state.runtime;function bindDocument(d){if(!d||d.__booknoteSelectionBound)return;d.__booknoteSelectionBound=true;var seq=0;var dragging=false;var lastText='';function scheduleUpdate(delay){var token=++seq;setTimeout(function(){if(token!==seq)return;if(readerSpeechState.wordFollowHighlight&&readerSpeechState.status!=="idle"){readerSpeechClearNativeSelection(d);var tb=$('selectionToolbar');if(tb)tb.hidden=true;return;}var s=selectionOffsets();state.selected=s;if(s&&s.text){
          if(readerSpeechState.status!=="idle"&&readerSpeechSelectionChanged(s)){
            /* A genuinely different selection starts a new reading context. */
            readerSpeechStop();
          }
          lastText=s.text;positionToolbar(s)
        }else if(!dragging){state.selected=null;var tb=$('selectionToolbar');if(tb)tb.hidden=true;}},delay||20)}d.addEventListener('mousedown',function(e){if(e.button!==0)return;dragging=true;seq++;var tb=$('selectionToolbar');if(tb)tb.hidden=true;},true);d.addEventListener('mousemove',function(){if(dragging) scheduleUpdate(45);},true);d.addEventListener('mouseup',function(){dragging=false;scheduleUpdate(0);},true);d.addEventListener('keyup',function(){scheduleUpdate(0);},true);d.addEventListener('selectionchange',function(){scheduleUpdate(dragging?45:0);},true);d.addEventListener("keydown",function(e){readerSpeechHandleSpaceKey(e);},true);d.addEventListener('click',function(e){if(dragging)return;var s=d.getSelection&&d.getSelection();if(!s||s.isCollapsed){clearSelection();}},true);d.addEventListener('scroll',function(){seq++;var tb=$('selectionToolbar');if(tb)tb.hidden=true;refreshBookmarkMarkerPositions(d);refreshContentAnnotationMarkerPositions();}, {passive:true});
      if(d.defaultView){d.defaultView.addEventListener('resize',function(){refreshBookmarkMarkerPositions(d);refreshContentAnnotationMarkerPositions()}, {passive:true});}
      if(typeof d.defaultView.ResizeObserver==='function'){try{var ro=new d.defaultView.ResizeObserver(function(){refreshBookmarkMarkerPositions(d);refreshContentAnnotationMarkerPositions()});var src=d.getElementById('source');if(src)ro.observe(src);d.__booknoteBookmarkResizeObserver=ro;d.__booknoteContentAnnotationResizeObserver=ro}catch(_){}}
      var ss=d.getSelection&&d.getSelection();if(ss&&!ss.isCollapsed)scheduleUpdate(0);}function bindCurrentFrame(){var frame=runtime.iframe;if(frame&&frame.contentDocument)bindDocument(frame.contentDocument);}runtime.addEventListener('frame-ready',function(){bindCurrentFrame();var idx=Number(runtime.currentIndex);refreshAnnotations().then(function(){return renderChapterHighlights(runtime.iframe&&runtime.iframe.contentDocument,idx).then(function(){return renderChapterBookmarks(runtime.iframe&&runtime.iframe.contentDocument,idx)}).then(function(){return renderChapterContentAnnotations(runtime.iframe&&runtime.iframe.contentDocument,idx)})}).then(function(){runtime.dispatchEvent(new CustomEvent("highlights-ready",{detail:{index:idx}}));}).catch(function(e){console.warn("reader highlight render failed",e)});});bindCurrentFrame();}
async function render(){var m=state.book,c=state.content,fmt=String(m.documentFormat||"").toLowerCase();$("title").textContent=m.documentTitle||m.name||"未命名书籍";$("author").textContent=m.documentAuthor||"";$("format").textContent=fmt.toUpperCase();state.settings=await BookNoteReadestBridge.getReaderSettings();state.layout="scroll";var pst=globalThis.BookNoteGlobalTheme?await BookNoteGlobalTheme.get():(await browser.storage.local.get("booknotePanelState")).booknotePanelState||{};state.themeName=pst.themeName||"everforest";state.themeMode=pst.themeMode||"day";applySettings();applyReaderThemeControls();updateModeControl();updateLayoutControls();syncReaderGeometry();installReaderGeometryObserver();
 if(fmt==="pdf"&&state.source&&state.source.blob){var pdfUrl=URL.createObjectURL(state.source.blob);state.pdfObjectUrl=pdfUrl;state.pdfLocator=(globalThis.BookNotePdfAdapter&&BookNotePdfAdapter.normalizeDocument?BookNotePdfAdapter.normalizeDocument({}):{type:"fixed",format:"pdf",locatorType:"page-rect",native:true});if(globalThis.BookNoteCanonicalPdfBlocks){state.canonicalDocument={version:1,type:"fixed",format:"pdf",metadata:{title:(state.book&&state.book.title)||m.documentTitle||m.name||""},source:state.source||{},text:"",blocks:[],pages:[],chapters:[],toc:[]};var __pv=BookNoteCanonicalPdfBlocks.validate(state.canonicalDocument);if(!__pv.ok)console.warn("[BookNote Canonical PDF Blocks] validation failed",__pv.errors);}$("pdf").hidden=false;$("pdf").src=pdfUrl;await refreshAnnotations();renderSide();openDefaultDirectory();syncReaderGeometry();return}
 if(c&&c.canonicalDocument&&c.canonicalDocument.text!=null){
   var importedDoc=c.canonicalDocument;
   state.canonicalDocument=importedDoc;
   state.chapters=Array.isArray(importedDoc.chapters)&&importedDoc.chapters.length?importedDoc.chapters:[{index:0,label:m.documentTitle||m.name||"",textStart:0,textEnd:String(importedDoc.text||"").length,html:"<p>"+esc(importedDoc.text||"")+"</p>",text:String(importedDoc.text||"")}];
   state.canonicalChapters=state.chapters;
 }else{
   state.chapters=Array.isArray(c&&c.chapters)&&c.chapters.length?c.chapters:[{index:0,label:m.documentTitle||m.name||"",textStart:0,textEnd:String(c&&c.text||"").length,html:c&&c.html||"",text:c&&c.text||""}];
 }
 function chapterCoverageGap(list,total){var n=Number(total)||0;if(!Array.isArray(list)||!list.length)return true;var ranges=list.map(function(x){return {s:Number(x&&x.textStart)||0,e:Number(x&&x.textEnd)};}).filter(function(r){return Number.isFinite(r.e)&&r.e>r.s;}).sort(function(a,b){return a.s-b.s;});if(!ranges.length)return true;var cursor=0;for(var ri=0;ri<ranges.length;ri++){if(ranges[ri].s>cursor+1)return true;cursor=Math.max(cursor,ranges[ri].e);}return cursor<n-1;}
 var officeFormat=String(m.documentFormat||'').toLowerCase();
 if(officeFormat==='docx'||officeFormat==='odt'){
   /* v7.10.441 Office Canonical Adapter: keep indexed chapters when coverage is valid;
      rebuild only when the canonical range is incomplete or heading structure is richer. */
   var officeExisting=Array.isArray(state.chapters)?state.chapters:[];
   var officeTextLen=String(c&&c.text||'').length;
   var officeGap=chapterCoverageGap(officeExisting,officeTextLen);
   var officeRebuilt=buildReaderHeadingChapters(c&&c.html,c&&c.text,m.documentTitle||m.name||'');
   /* v7.14.52 P0 Office section-fragmentation fix:
      Decimal labels are body/semantic labels, not canonical Reader sections.
      Older imported records may nevertheless contain 1.1 / 1.2 / 1.3 ... as
      separate chapters. That makes the Reader show the Part, then a new page/section
      for every decimal label even though the left TOC correctly hides them.

      When such legacy decimal sections are detected, rebuild the Office section
      projection from the already-normalized HTML. The rebuilt ranges keep the full
      source coverage and group all body labels between two real navigation headings
      into the same Reader section. No Search/Locator algorithm is changed; the
      canonical section boundaries are corrected at the Office import/read boundary. */
   var officeHasDecimalSections=officeExisting.some(function(ch){
     var label=String(ch&&ch.label||'').replace(/\s+/g,' ').trim();
     return /^\d+(?:\.\d+)+(?:\s*(?:[、.\-:]\s*)?.*)?$/.test(label);
   });
   var rebuiltCoverage=!chapterCoverageGap(officeRebuilt,officeTextLen);
   if(officeRebuilt.length>=1&&(officeExisting.length<=1||officeGap||officeRebuilt.length>officeExisting.length||(officeHasDecimalSections&&rebuiltCoverage))){
     state.chapters=officeRebuilt;
   }
 }
 if(String(m.documentFormat||'').toLowerCase()==='txt'){var txtTitle=String(m.documentTitle||m.name||'').trim(),txtText=String(c&&c.text||''),txtRebuilt=recoverTxtReaderChapters(c,txtTitle);/* TXT v3.0: the strict source-text detector is authoritative. If structure cannot be proven, replace any legacy/false TOC with one complete body section. */if(txtRebuilt.length){state.chapters=txtRebuilt;}else{state.chapters=[{index:0,label:txtTitle||'正文',href:'',textStart:0,textEnd:txtText.length,text:txtText,html:String(c&&c.html||''),headingLevel:0,isNavigation:false}];}}
 if(globalThis.BookNoteTxtCanonical&&state.chapters.length){state.chapters=BookNoteTxtCanonical.normalize({title:txtTitle,text:String(c&&c.text||''),html:String(c&&c.html||''),chapters:state.chapters});var __tv=BookNoteTxtCanonical.validate(state.chapters,String(c&&c.text||'').length);if(!__tv.ok)console.warn('[BookNote Canonical TXT] validation failed',__tv.errors);}
 if(globalThis.BookNoteReadestRuntime){var progressState=await BookNoteReadestBridge.loadProgress(m.id),savedLocator=progressState&&progressState.locator||{},isSavedEpub=String(savedLocator.type||savedLocator.format||'')==='epub',savedChapter=Number(isSavedEpub?(savedLocator.sectionIndex!=null?savedLocator.sectionIndex:savedLocator.spineIndex):savedLocator.chapterIndex),savedOffset=Number(isSavedEpub?(savedLocator.start!=null?savedLocator.start:savedLocator.localStart):savedLocator.start!=null?savedLocator.start:savedLocator.offset)||0;var hasSaved=!!(progressState&&progressState.locator&&Number.isFinite(savedChapter)&&savedChapter>=0&&(savedOffset>0||Number(progressState.progress)>0));var initialChapter=hasSaved?savedChapter:requestedChapter;var initialOffset=hasSaved?savedOffset:0;$('content').classList.add('runtime-active');clearTimeout(state.readingSaveTimer);state.readingSaveTimer=null;state.readingLastSavedKey="";state.runtime=new BookNoteReadestRuntime.ReadestRuntime({viewport:$('viewport'),content:$('content'),toc:$('sideContent')});state.runtime.initialIndex=Number.isFinite(initialChapter)?initialChapter:0;state.runtime.initialOffset=initialOffset;state.runtime.setDisplayMode("scroll");state.runtime.setTheme({name:state.themeName,mode:state.themeMode});state.runtime.addEventListener('scrollstate',function(e){var d=e.detail||{};state.currentChapter=Number(d.index)||0;var sec=state.chapters[state.currentChapter]||{};$('chapter').textContent=sec.label||"";updateTocActive();$('progress').textContent=Math.round(readerProgressForPosition(state.currentChapter,Number(d.offset)||0)*100)+"%";updateScrollSlider();syncManagedSideToReader();persistReaderPosition(false);});state.runtime.addEventListener('relocate',function(e){var d=e.detail||{},sec=d.section||state.chapters[d.index]||{};state.currentChapter=Number(d.index)||0;$('chapter').textContent=sec.label||"";state.tocActiveIndex=-1;updateTocActive();$('progress').textContent=Math.round(readerProgressForPosition(state.currentChapter,Number(d.offset)||0)*100)+"%";updateScrollSlider();syncManagedSideToReader();persistReaderPosition(true);});state.canonicalChapters=(state.chapters&&state.chapters.length)?state.chapters:((state.content&&Array.isArray(state.content.chapters)&&state.content.chapters.length)?state.content.chapters:[]);if(typeof BookNoteCanonical!=="undefined"&&state.canonicalChapters.length){var __cv=BookNoteCanonical.validateCoverage(state.canonicalChapters,state.canonicalChapters[state.canonicalChapters.length-1].textEnd);if(!__cv.ok)console.warn("[BookNote Canonical] reader chapter coverage validation failed",__cv.errors);}if(state.runtime.setCanonicalSections)state.runtime.setCanonicalSections(state.canonicalChapters);buildCanonicalDocumentModel();var runtimeContent=c;
    // DOCX/TXT: their raw source-open paths would rebuild the book as a single
    // section and discard our normalized chapters. Use the indexed HTML + stored
    // chapters so their TOC/navigation chain reaches the same Reader path as ODT.
    if((String(m.documentFormat||'').toLowerCase()==='docx' || String(m.documentFormat||'').toLowerCase()==='odt' || String(m.documentFormat||'').toLowerCase()==='txt') && state.chapters.length){
      runtimeContent=Object.assign({},c,{chapters:state.chapters});
    }
    var book;try{
      var runtimeFormat=String(m.documentFormat||'').toLowerCase();
      book=((runtimeFormat==='docx' || runtimeFormat==='odt' || runtimeFormat==='txt'))
        ? await state.runtime.openContent(runtimeContent,m)
        : (state.source&&state.source.blob?await state.runtime.open(state.source,m):await state.runtime.openContent(c,m));
    }catch(runtimeError){console.warn('Readest runtime source open failed; falling back to indexed content',runtimeError);book=await state.runtime.openContent(runtimeContent,m)}
    state.chapters=book.sections;
    /* v7.18.07: DM and HTML own their structural projections. Their runtime
       sections are the canonical section space so TOC/Locator offsets do not
       fall back to the legacy generic chapter projection. TXT/Office/EPUB are
       intentionally untouched here. */
    if(runtimeFormat==='md'||runtimeFormat==='markdown'||runtimeFormat==='text/markdown'||/\.md$/i.test(runtimeFormat)||runtimeFormat==='html'||runtimeFormat==='text/html'||/\.html?$/i.test(runtimeFormat)){
      state.canonicalChapters=state.chapters.slice();
    }
    state.toc=Array.isArray(book.toc)?book.toc.slice():[];
    /* v7.14.51: filter only the sidebar TOC projection. Do not mutate state.chapters
       or the runtime's section list, so every decimal-labeled body section remains
       readable and addressable. */
    if(officeFormat==='docx'||officeFormat==='odt'){
      state.toc=state.toc.filter(function(node){
        var label=String(node&&node.label||'').replace(/\s+/g,' ').trim();
        return !/^\d+(?:\.\d+)+(?:\s*(?:[、.\-:]\s*)?.*)?$/.test(label);
      });
    }
    if(!state.canonicalChapters.length)state.canonicalChapters=state.chapters;if(state.runtime.setCanonicalSections)state.runtime.setCanonicalSections(state.canonicalChapters);buildCanonicalDocumentModel();$("content").hidden=false;await refreshAnnotations();renderSide();bindFrameSelection();openDefaultDirectory();if(state.runtime.setDisplayMode)state.runtime.setDisplayMode("scroll");if(requestedStart!=null)state.runtime.jumpGlobal(Number(requestedStart),requestedQuery||'');if(requestedQuery){$("searchBar").hidden=false;$("searchInput").value=requestedQuery;runSearch(requestedQuery)}return}
 $("content").innerHTML=state.chapters.map(function(ch,i){return '<article class="chapter" data-chapter-index="'+i+'"><div class="chapter-kicker">'+esc(ch.label||("第 "+(i+1)+" 节"))+'</div>'+String(ch.html||("<p>"+esc(ch.text||"")+"</p>"))+'</article>'}).join("");$("content").hidden=false;renderSide();await refreshAnnotations();var rr=await BookNoteReadestBridge.loadProgress(m.id),ii=Number(rr&&rr.locator&&rr.locator.chapterIndex);showChapter(Number.isFinite(ii)?ii:requestedChapter,Number(rr&&rr.locator&&rr.locator.offset)||0);openDefaultDirectory();syncReaderGeometry();if(requestedStart!=null){var x=chapterFor(Number(requestedStart));showChapter(x.i,chapterLocal(x.c,Number(requestedStart)))}if(requestedQuery){$("searchBar").hidden=false;$("searchInput").value=requestedQuery;runSearch(requestedQuery)}}
window.addEventListener("pagehide",function(){try{persistReaderPosition(true)}catch(_){}});
browser.storage.onChanged.addListener(function(changes,area){if(area!=="local"||!changes.booknotePanelState)return;var st=changes.booknotePanelState.newValue||{};state.themeName=st.themeName||state.themeName;state.themeMode=st.themeMode||state.themeMode;applySettings();applyReaderThemeControls()});
function renderEmptyReader(){
 state.book=null;state.content=null;state.source=null;state.runtime=null;state.chapters=[];state.canonicalChapters=[];state.canonicalDocument=null;state.toc=[];state.hits=[];state.hitIndex=-1;state.currentChapter=0;state.selected=null;
 $("title").textContent="未选择书籍";$("author").textContent="";setReaderChapterLabel(0,"正文");$("progress").textContent="0%";$("format").textContent="";
 var content=$("content"),pdf=$("pdf");
 if(content){content.hidden=false;content.innerHTML='<div class="reader-empty-state" aria-label="未选择书籍"><div class="reader-empty-icon">📖</div><strong>未选择书籍</strong><span>从书架打开一本书后，正文会显示在这里</span><span class="reader-empty-hint">当前仅展示阅读器布局，不读取任何书籍数据</span></div>';}
 if(pdf){pdf.hidden=true;pdf.removeAttribute("src");}if(state.pdfObjectUrl){try{URL.revokeObjectURL(state.pdfObjectUrl)}catch(_){}state.pdfObjectUrl=null;state.pdfLocator=null;}
 $("sideTitle").textContent="目录";$("sideContent").innerHTML='<div class="reader-empty-side"><div class="reader-empty-side-icon">📑</div><strong>暂无书籍</strong><span>打开书籍后显示目录、标注和书签</span></div>';
 document.querySelectorAll(".side-tabs button").forEach(function(b){b.disabled=true;});
 $("selectionToolbar").hidden=true;$("ttsFloat").classList.add("empty-disabled");$("ttsFloatBtn").disabled=true;
 $("prevChapter").disabled=true;$("prevPage").disabled=true;$("nextPage").disabled=true;$("nextChapter").disabled=true;$("readerScrollTop").disabled=true;$("readerScrollBottom").disabled=true;
 $("readerBody").classList.add("sidebar-open","reader-empty");
 $("sidebar").hidden=false;
 updateModeControl();syncReaderGeometry();installReaderGeometryObserver();
}
async function init(){initUI();
bindReaderAdaptiveGeometry();await loadReaderSearchHistory();if(!bookId){renderEmptyReader();return}try{var r=await BookNoteReadestBridge.openBook(bookId);state.book=r.meta;state.content=r.content;state.source=r.source;await render()}catch(e){console.error(e);toast("打开失败："+(e&&e.message||e))}}init();
})();
