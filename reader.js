(function(){"use strict";
var params=new URLSearchParams(location.search),bookId=params.get("bookId")||"",requestedChapter=Number(params.get("chapterIndex")||0),requestedStart=params.get("annotationStart"),requestedQuery=params.get("searchTerm")||"",$=function(id){return document.getElementById(id)},readerSearchTimer=null,readerSearchHistory=[],readerSearchHistoryReady=Promise.resolve(),state={book:null,content:null,source:null,runtime:null,chapters:[],canonicalChapters:[],canonicalDocument:null,hits:[],hitIndex:-1,searchSeq:0,searchNavSeq:0,searchNavPromise:Promise.resolve(),currentChapter:0,settings:{},selected:null,annotations:[],activeTab:"toc",sideSelection:{annotations:{},bookmarks:{},contentNotes:{}},sideActiveId:"",highlightColorFilter:"all",bookmarkStarFilter:"all",contentAnnotationFilter:"all",layout:"scroll",themeName:"everforest",themeMode:"day",highlightRenderSeq:0,highlightRenderPromise:Promise.resolve(),toc:[],tocActiveIndex:-1,readingSaveTimer:null,readingSaveSeq:0,readingLastSavedKey:""};
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
function readerOfficeTocMetadataParent(label){
 var t=String(label||"").replace(/\s+/g," ").trim();
 return /(?:^|[\s\u3000])(书籍元数据|元数据|metadata)(?:$|[\s\u3000])/i.test(t);
}
function readerOfficeTocNoiseHeading(label,level,parent){
 var t=String(label||"").replace(/\s+/g," ").trim();
 if(parent&&readerOfficeTocMetadataParent(parent.label)&&Number(level)>Number(parent.level||1))return true;
 return /^(?:\d+(?:\.\d+)+[\s、.-]*)?(?:书名|作者|副标题|ISBN|语言|分类|标签(?:\/分类)?|出版信息|出版日期|日期|版本|封面|文件名|文件格式|文件大小|编码|出版社)(?:\s*[:：].*)?$/i.test(t);
}
function buildReaderHeadingChapters(html,text,title){
 var source=String(text||""),rawHtml=String(html||"");
 if(!rawHtml||!source)return [];
 var doc=new DOMParser().parseFromString("<div id=\"__bn_reader_ch_root\">"+rawHtml+"</div>","text/html"),root=doc.getElementById("__bn_reader_ch_root");
 if(!root)return [];
 var all=Array.prototype.slice.call(root.querySelectorAll("h1,h2,h3,h4,h5,h6"));
 var rawHeads=all.filter(function(el){return String(el.textContent||"").trim();}),heads=[],stack=[];
 rawHeads.forEach(function(el){
   var level=parseInt(String(el.tagName||"").slice(1),10)||1,label=String(el.textContent||"").replace(/\s+/g," ").trim();
   while(stack.length&&stack[stack.length-1].level>=level)stack.pop();
   var parent=stack.length?stack[stack.length-1]:null;
   if(!readerOfficeTocNoiseHeading(label,level,parent))heads.push(el);
   if(!readerOfficeTocNoiseHeading(label,level,parent))stack.push({level:level,label:label});
 });
 if(!heads.length)return [];
 var blocks=Array.prototype.slice.call(root.children),flat=[];
 function topBlock(el){var n=el;while(n&&n.parentElement&&n.parentElement!==root)n=n.parentElement;return n;}
 heads.forEach(function(h){var b=topBlock(h);if(b&&flat.indexOf(b)<0)flat.push(b);});
 function fold(x){return String(x||"").replace(/\u00a0/g," ").replace(/\r\n|\r/g,"\n").replace(/\s+/g," ").trim();}
 function rawAtFold(pos){var fi=0,raw=0;for(var i=0;i<source.length&&fi<pos;i++){var ch=source.charAt(i);if(/\s/.test(ch)){while(i+1<source.length&&/\s/.test(source.charAt(i+1)))i++;if(fi<pos)fi++;}else fi++;raw=i+1;}return Math.max(0,Math.min(source.length,raw));}
 var folded=fold(source),cursor=0,chapters=[];
 heads.forEach(function(head,idx){
   var label=String(head.textContent||"").replace(/\s+/g," ").trim(),hf=fold(label),at=folded.indexOf(hf,cursor),st=at>=0?rawAtFold(at):cursor;
   var next=idx+1<heads.length?heads[idx+1]:null,en=source.length;
   if(next){var nh=fold(String(next.textContent||"")),nat=folded.indexOf(nh,Math.max(cursor,at>=0?at+hf.length:cursor));if(nat>=0)en=rawAtFold(nat);}
   if(en<st)en=st;
   var startNode=topBlock(head),endNode=next?topBlock(next):null;
   var chunk=[];
   if(startNode){
     var startIdx=blocks.indexOf(startNode),endIdx=endNode?blocks.indexOf(endNode):blocks.length;
     if(startIdx>=0){
       if(endNode===startNode){chunk=[startNode];}
       else{chunk=blocks.slice(startIdx,Math.max(startIdx+1,endIdx));}
     }
   }
   var chapterText=source.slice(st,en),chHtml=chunk.length?chunk.map(function(x){return x.outerHTML;}).join(""):head.outerHTML;
   if(chapterText.trim()||chHtml)chapters.push({index:chapters.length,label:label||String(title||"正文"),href:"",textStart:st,textEnd:en,text:chapterText,html:chHtml,headingLevel:Number(head.tagName.slice(1))||1});
   cursor=en;
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
function updateTocActive(forceCenter){var c=$("sideContent");if(!c||state.activeTab!=="toc")return;var active=Number(state.currentChapter);var path=[];function walk(nodes,anc){for(var i=0;i<(nodes||[]).length;i++){var n=nodes[i],idx=Number(n&&n.index);if(idx===active){path=anc.concat([idx]);return true;}if(walk(n&&n.children,anc.concat([idx])))return true;}return false;}walk(state.toc||[],[]);if(!path.length)path=[active];c.querySelectorAll("[data-i]").forEach(function(b){var idx=Number(b.dataset.i),isActive=idx===active,isContext=path.indexOf(idx)>=0&&!isActive;b.classList.toggle("active",isActive);b.classList.toggle("toc-current",isActive);b.classList.toggle("toc-context",isContext);b.setAttribute("aria-current",isActive?"location":"false");});c.querySelectorAll(".side-toc-children").forEach(function(branch){var has=!!branch.querySelector(".side-item.toc-current,.side-item.toc-context");branch.classList.toggle("toc-branch-active",has);});var changed=state.tocActiveIndex!==active;state.tocActiveIndex=active;if(changed||forceCenter){var target=c.querySelector('.side-item.toc-current[data-i="'+active+'"]');if(target){try{var top=target.offsetTop,height=target.offsetHeight,view=c.clientHeight,max=Math.max(0,c.scrollHeight-view),next=Math.max(0,Math.min(max,top-(view-height)/2));c.scrollTo({top:next,behavior:forceCenter?"auto":"smooth"});}catch(_){try{target.scrollIntoView({block:"center",inline:"nearest"});}catch(__){}}}}}
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
function xmlEscOdt(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function odtU16(n){return new Uint8Array([n&255,(n>>>8)&255]);}
function odtU32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);}
function odtCat(){var a=Array.prototype.slice.call(arguments),len=0;a.forEach(function(x){len+=x.length;});var o=new Uint8Array(len),p=0;a.forEach(function(x){o.set(x,p);p+=x.length;});return o;}
function odtCrc32(data){var c=~0;for(var i=0;i<data.length;i++){c^=data[i];for(var k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return (~c)>>>0;}
function buildStoredOdt(entries){var enc=new TextEncoder(),locals=[],centrals=[],offset=0;entries.forEach(function(e){var name=enc.encode(e.name),data=e.data instanceof Uint8Array?e.data:enc.encode(e.data),crc=odtCrc32(data),local=odtCat(new Uint8Array([80,75,3,4]),odtU16(20),odtU16(0x0800),odtU16(0),odtU16(0),odtU16(0),odtU32(crc),odtU32(data.length),odtU32(data.length),odtU16(name.length),odtU16(0),name,data),central=odtCat(new Uint8Array([80,75,1,2]),odtU16(20),odtU16(20),odtU16(0x0800),odtU16(0),odtU16(0),odtU16(0),odtU32(crc),odtU32(data.length),odtU32(data.length),odtU16(name.length),odtU16(0),odtU16(0),odtU16(0),odtU16(0),odtU32(0),odtU32(offset),name);locals.push(local);centrals.push(central);offset+=local.length;});var central=odtCat.apply(null,centrals),local=odtCat.apply(null,locals),end=odtCat(new Uint8Array([80,75,5,6]),odtU16(0),odtU16(0),odtU16(entries.length),odtU16(entries.length),odtU32(central.length),odtU32(local.length),odtU16(0));return new Blob([odtCat(local,central,end)],{type:'application/vnd.oasis.opendocument.text'});}
function safeAnnotationOdtPart(s,fallback){var x=String(s||fallback||'').replace(/[\\/:*?"<>|]+/g,'_').replace(/[\x00-\x1f]/g,'_').replace(/\s+/g,' ').trim();return x||String(fallback||'注释');}
function annotationExportFileName(items){var list=Array.isArray(items)?items:[],first=list[0]||{},style=getContentAnnotationStyle(contentAnnotationStyleKey(first)),category=list.length&&list.every(function(a){return contentAnnotationStyleKey(a)===style.key})?style.label:'注释',book=safeAnnotationOdtPart(state.book&&(state.book.documentTitle||state.book.name),'未命名书籍'),source=String(first.text||'').replace(/\s+/g,' ').trim().slice(0,8)||'无原文';return (category+'-'+book+'-'+safeAnnotationOdtPart(source,'无原文')+'……').slice(0,180)+'.odt';}
function buildContentAnnotationsOdt(items){
  var list=Array.isArray(items)?items:[],title=String(state.book&&(state.book.documentTitle||state.book.name)||'未命名书籍').trim()||'未命名书籍',
      body=['<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2"><office:automatic-styles><style:style style:name="BN_NUM" style:family="paragraph"><style:paragraph-properties fo:text-indent="0"/><style:text-properties fo:font-weight="bold" fo:font-size="12pt"/></style:style><style:style style:name="BN_BOOK" style:family="paragraph"><style:paragraph-properties fo:text-indent="0" fo:text-align="start"/><style:text-properties fo:font-size="12pt"/></style:style><style:style style:name="BN_CHAPTER" style:family="paragraph"><style:paragraph-properties fo:text-indent="0"/><style:text-properties fo:font-size="12pt"/></style:style><style:style style:name="BN_LABEL" style:family="paragraph"><style:paragraph-properties fo:text-indent="0"/><style:text-properties fo:font-weight="bold" fo:font-size="12pt"/></style:style><style:style style:name="BN_BODY" style:family="paragraph"><style:paragraph-properties fo:text-indent="24pt"/><style:text-properties fo:font-size="12pt"/></style:style><style:style style:name="BN_END" style:family="paragraph"><style:paragraph-properties fo:text-indent="0" fo:text-align="end"/><style:text-properties fo:font-size="12pt"/></style:style></office:automatic-styles><office:body><office:text>'];
  list.forEach(function(a,index){var style=getContentAnnotationStyle(contentAnnotationStyleKey(a)),text=String(a.text||'').trim(),note=String(a.note||'').trim(),chapter=String(a.chapterLabel||'').trim(),book='《'+title.replace(/^《+|》+$/g,'').trim()+'》';body.push('<text:p text:style-name="BN_NUM">'+xmlEscOdt((index+1)+'、')+'</text:p>');body.push('<text:p text:style-name="BN_BOOK">'+xmlEscOdt(book)+'</text:p>');if(chapter)body.push('<text:p text:style-name="BN_CHAPTER">'+xmlEscOdt(chapter)+'</text:p>');body.push('<text:p/>');body.push('<text:p text:style-name="BN_LABEL">'+xmlEscOdt('注释类别：'+style.label)+'</text:p>');body.push('<text:p text:style-name="BN_LABEL">原文：</text:p>');body.push('<text:p text:style-name="BN_BODY" xml:space="preserve">'+xmlEscOdt(text||'（无原文）')+'</text:p>');body.push('<text:p text:style-name="BN_LABEL">注释：</text:p>');body.push('<text:p text:style-name="BN_BODY" xml:space="preserve">'+xmlEscOdt(note||'（无编辑内容）')+'</text:p>');if(index<list.length-1)body.push('<text:p/>');});body.push('</office:text></office:body></office:document-content>');var styles='<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2"><office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles></office:document-styles>',manifest='<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/></manifest:manifest>';return buildStoredOdt([{name:'mimetype',data:'application/vnd.oasis.opendocument.text'},{name:'content.xml',data:body.join('')},{name:'styles.xml',data:styles},{name:'META-INF/manifest.xml',data:manifest}]);
}
function renderSide(){var c=$("sideContent");c.classList.remove("side-has-managed-list");if(state.activeTab==="toc"){clearSideSelection();var tree=Array.isArray(state.toc)&&state.toc.length?state.toc:state.chapters.map(function(x,i){return {label:x.label,index:i,headingLevel:Number(x.headingLevel)||1,children:[]}});function renderTree(nodes){return (nodes||[]).map(function(x){var i=Number(x.index),lv=Math.max(1,Math.min(6,Number(x.headingLevel)||1));var btn=i>=0?'<button class="side-item side-item-level-'+lv+'" data-i="'+i+'" data-level="'+lv+'"><span class="side-item-label">'+esc(x.label||'')+'</span></button>':'';var kids=x.children&&x.children.length?'<div class="side-toc-children side-toc-level-'+lv+'">'+renderTree(x.children)+'</div>':'';return btn+kids}).join('')}c.innerHTML=renderTree(tree)||'<div class="empty">暂无目录</div>';c.querySelectorAll('[data-i]').forEach(function(b){b.onclick=function(e){e.preventDefault();var idx=Number(b.dataset.i);var list=state.canonicalChapters.length?state.canonicalChapters:state.chapters;var node=null;var walk=function(nodes){for(var z=0;z<(nodes||[]).length;z++){var x=nodes[z];if(Number(x.index)===idx)return x;var y=walk(x&&x.children);if(y)return y;}return null};node=walk(state.toc||[]);var targetChapter=idx,targetOffset=0;if(node&&globalThis.BookNoteCanonicalTocResolver){var rr=BookNoteCanonicalTocResolver.resolveToReader(node,list,state.runtime);if(rr){targetChapter=Number(rr.chapterIndex)||0;targetOffset=Math.max(0,Number(rr.localStart)||0);}}state.currentChapter=targetChapter;state.tocActiveIndex=-1;updateTocActive(true);Promise.resolve(showChapter(targetChapter,targetOffset,"")).finally(function(){state.currentChapter=targetChapter;updateTocActive(true);});}});updateTocActive(true)}else if(state.activeTab==="annotations"){var arr=state.annotations.filter(function(a){return a.type!=="bookmark"&&!isContentNote(a)&&!isContentAnnotation(a)&&highlightColorMatches(a)}),allArr=state.annotations.filter(function(a){return a.type!=="bookmark"&&!isContentNote(a)&&!isContentAnnotation(a)}),highlightArr=state.annotations.filter(function(a){return a.type==="highlight"}),counts={};highlightArr.forEach(function(a){var k=String(a.color||"yellow").toLowerCase();counts[k]=(counts[k]||0)+1});var colors=HIGHLIGHT_COLORS;var filterHtml='<div class="side-color-manager"><div class="side-color-head"><span>颜色归类</span><strong data-side-color-label>'+(state.highlightColorFilter==="all"?"全部高亮 · "+highlightArr.length:(getHighlightColorMeta(state.highlightColorFilter).heart+" "+getHighlightColorMeta(state.highlightColorFilter).label+" · "+(counts[state.highlightColorFilter]||0)))+'</strong></div><div class="side-color-chips"><button type="button" class="side-color-chip side-color-chip-all" data-side-color="all" title="全部：'+highlightArr.length+' 条"><span class="side-color-chip-symbol">全部</span><span class="side-color-chip-label">全部</span><em>'+(highlightArr.length||0)+'</em></button>'+colors.map(function(x){return '<button type="button" class="side-color-chip side-color-chip-'+x.key+'" data-side-color="'+x.key+'" title="'+x.label+'：'+(counts[x.key]||0)+' 条"><span class="side-color-chip-symbol side-color-heart side-color-heart-'+x.key+'" aria-hidden="true">'+x.heart+'</span><span class="side-color-chip-label">'+x.label+'</span><em>'+(counts[x.key]||0)+'</em></button>'}).join('')+'</div><input class="side-color-slider" data-side-color-slider type="range" min="0" max="6" step="1" value="'+(state.highlightColorFilter==="all"?0:(colors.findIndex(function(x){return x.key===state.highlightColorFilter})+1)||0)+'" aria-label="按高亮颜色筛选"><div class="side-color-scale"><span>全部</span><span>黄色</span><span>红色</span><span>粉红</span><span>绿色</span><span>蓝色</span><span>紫色</span></div></div>';c.innerHTML=filterHtml+(arr.length?'<div class="side-bulkbar"><label class="side-select-all"><input type="checkbox" data-side-select-all> <span>全选</span></label><span class="side-selected-count" data-side-selected-count></span><button type="button" class="side-bulk-delete" data-side-bulk-delete disabled title="删除所选">删除所选</button></div>'+arr.map(function(a){var cm=getHighlightColorMeta(a.color),markIcon=a.type==="highlight"?'<span class="side-highlight-heart side-highlight-heart-'+cm.key+'" aria-hidden="true">'+cm.heart+'</span>':bnIcon(a.type==="quote"?"note":"note","sm");var selectedText=String(a.text||"").replace(/\s+/g," ").trim();var noteText=String(a.note||"").replace(/\s+/g," ").trim();if(!selectedText)selectedText=noteText||"（未保存选中内容）";if(selectedText.length>72)selectedText=selectedText.slice(0,72)+"…";return '<div class="side-annotation-row'+(a.type==="highlight"?" side-annotation-row-highlight":"")+'"><label class="side-row-check" title="选择标注"><input type="checkbox" data-side-select-aid="'+esc(a.id)+'" aria-label="选择标注"></label><button class="side-annotation-jump" data-aid="'+esc(a.id)+'" type="button"><span class="side-annotation-title">'+markIcon+'<b>'+esc(a.type==="highlight"?"高亮":a.type==="quote"?"摘录":(a.categoryType==="summary"||a.sourceType==="selection-summary"?"摘要笔记":"笔记"))+'</b>'+(a.type==="highlight"?'<small>'+esc(cm.label)+'</small>':'')+'</span><span class="side-meta side-annotation-text" title="'+esc(selectedText)+'">'+esc(selectedText)+'</span>'+(noteText?'<span class="side-meta side-annotation-note">'+esc(noteText.length>48?noteText.slice(0,48)+"…":noteText)+'</span>':'')+'</button><button class="side-annotation-delete" data-delete-aid="'+esc(a.id)+'" type="button" title="删除标注" aria-label="删除标注"><img class="side-annotation-delete-icon" src="../img/ui/delete.png" alt=""></button></div>'}).join(''):'<div class="empty">'+(allArr.length?'当前颜色暂无标注':'暂无标注')+'</div>');wrapSideList(c,'.side-color-manager');c.querySelectorAll('[data-side-color]').forEach(function(b){b.onclick=function(e){e.preventDefault();state.highlightColorFilter=b.dataset.sideColor||"all";clearSideSelection();renderSide()}});var slider=c.querySelector('[data-side-color-slider]');if(slider)slider.oninput=function(){var v=Number(slider.value)||0;state.highlightColorFilter=v===0?"all":colors[v-1].key;clearSideSelection();renderSide();requestAnimationFrame(function(){var n=c.querySelector('[data-side-color-slider]');if(n){n.value=String(v);try{n.focus({preventScroll:true})}catch(_){}}syncManagedSideToReader()})};}else if(state.activeTab==="contentNotes"){
 var allNoteArr=state.annotations.filter(function(a){return isContentAnnotation(a)}),filteredNoteArr=allNoteArr.filter(function(a){return state.contentAnnotationFilter==="all"||contentAnnotationStyleKey(a)===state.contentAnnotationFilter}),styleCounts={};
 allNoteArr.forEach(function(a){var k=contentAnnotationStyleKey(a);styleCounts[k]=(styleCounts[k]||0)+1});
 var activeStyle=state.contentAnnotationFilter==="all"?null:getContentAnnotationStyle(state.contentAnnotationFilter);
 var noteHeader='<div class="side-content-note-manager"><div class="side-content-note-head"><span>注释归类</span><strong>'+(state.contentAnnotationFilter==="all"?"全部内容注释 · "+allNoteArr.length:activeStyle.label+" · "+(styleCounts[activeStyle.key]||0))+'</strong></div><div class="side-content-note-filter-chips"><button type="button" class="side-content-note-filter-chip side-content-note-filter-chip-all '+(state.contentAnnotationFilter==="all"?"active":"")+'" data-content-note-filter="all" title="全部：'+allNoteArr.length+' 条"><span class="side-content-note-filter-symbol side-content-note-filter-all-symbol">全部</span><em>'+(allNoteArr.length||0)+'</em></button>'+CONTENT_ANNOTATION_STYLES.map(function(x){return '<button type="button" class="side-content-note-filter-chip content-note-filter-'+x.key+' '+(state.contentAnnotationFilter===x.key?"active":"")+'" data-content-note-filter="'+x.key+'" title="'+x.label+'：'+(styleCounts[x.key]||0)+' 条"><span class="side-content-note-filter-symbol">'+contentAnnotationStyleIcon(x.key,'side-content-note-filter-image')+'</span><em>'+(styleCounts[x.key]||0)+'</em></button>'}).join('')+'</div><input class="side-content-note-slider" data-content-note-slider type="range" min="0" max="3" step="1" value="'+(state.contentAnnotationFilter==="all"?0:Math.max(0,CONTENT_ANNOTATION_STYLES.findIndex(function(x){return x.key===state.contentAnnotationFilter})+1))+'" aria-label="按内容注释分类筛选"><div class="side-content-note-scale" aria-hidden="true"><span>全部</span><span>重点</span><span>感悟</span><span>领受</span></div></div>';
 c.innerHTML=noteHeader+(filteredNoteArr.length?'<div class="side-bulkbar"><label class="side-select-all"><input type="checkbox" data-side-select-all> <span>全选</span></label><span class="side-selected-count" data-side-selected-count></span><button type="button" class="side-bulk-export-all" data-side-export-all title="导出全部内容注释为 ODT">导出所有</button><button type="button" class="side-bulk-export-selected" data-side-export-selected title="导出已选内容注释为 ODT">导出选中</button><button type="button" class="side-bulk-delete" data-side-bulk-delete disabled title="删除所选">删除所选</button></div>'+filteredNoteArr.map(function(a){var preview=String(a.text||"").replace(/\s+/g," ").trim();if(!preview)preview="（未保存选中内容）";if(preview.length>42)preview=preview.slice(0,42)+"…";var notePreview=String(a.note||"").replace(/\s+/g," ").trim();if(notePreview.length>42)notePreview=notePreview.slice(0,42)+"…";var sm=contentAnnotationStyleKey(a);return '<div class="side-content-note-row side-content-note-row-'+sm+'"><label class="side-row-check" title="选择内容注释"><input type="checkbox" data-side-select-aid="'+esc(a.id)+'" aria-label="选择内容注释"></label><button class="side-content-note-jump" data-aid="'+esc(a.id)+'" type="button"><span class="side-content-note-row-main">'+contentAnnotationStyleIcon(sm,'side-content-note-row-image')+'<span class="side-content-note-row-copy"><span class="side-content-note-category"><b>'+esc(getContentAnnotationStyle(sm).label)+'：</b>'+contentAnnotationPattern(sm,'side-content-note-row-category-pattern')+'</span><span class="side-content-note-line"><b>原文：</b><span>'+esc(preview)+'</span></span><span class="side-content-note-line side-content-note-line-note"><b>注释：</b><span>'+esc(notePreview||'暂无注释')+'</span></span></span></span></button><button class="side-annotation-delete side-content-note-delete" data-delete-aid="'+esc(a.id)+'" type="button" title="删除内容注释" aria-label="删除内容注释"><img class="side-annotation-delete-icon" src="../img/ui/delete.png" alt=""></button></div>';}).join(""):'<div class="empty">'+(allNoteArr.length?'当前颜色暂无内容注释':'暂无内容注释')+'</div>');
 wrapSideList(c,'.side-content-note-manager');c.querySelectorAll('[data-content-note-filter]').forEach(function(b){b.onclick=function(e){e.preventDefault();state.contentAnnotationFilter=b.dataset.contentNoteFilter||"all";clearSideSelection();renderSide()}});var noteSlider=c.querySelector('[data-content-note-slider]');if(noteSlider)noteSlider.oninput=function(){var v=Number(noteSlider.value)||0;state.contentAnnotationFilter=v===0?"all":CONTENT_ANNOTATION_STYLES[v-1].key;clearSideSelection();renderSide();requestAnimationFrame(function(){var n=c.querySelector('[data-content-note-slider]');if(n){n.value=String(v);try{n.focus({preventScroll:true})}catch(_){}}syncManagedSideToReader()})};
}else{var allBookmarks=state.annotations.filter(function(a){return a.type==="bookmark"}),arr2=allBookmarks.filter(bookmarkFilterMatches),starCounts={};allBookmarks.forEach(function(a){var k=Math.max(1,Math.min(6,Number(a.star)||1));starCounts[k]=(starCounts[k]||0)+1});var starFilterHtml='<div class="side-bookmark-manager"><div class="side-bookmark-filter-head"><span>星级归类</span><strong>'+ (state.bookmarkStarFilter==="all"?"全部书签 · "+allBookmarks.length:(getBookmarkStarMeta(state.bookmarkStarFilter).label+" · "+(starCounts[state.bookmarkStarFilter]||0))) +'</strong></div><div class="side-bookmark-filter-chips"><button type="button" class="side-bookmark-filter-chip side-bookmark-filter-chip-all '+(state.bookmarkStarFilter==="all"?"active":"")+'" data-bookmark-filter="all" title="全部：'+allBookmarks.length+' 条"><span class="side-bookmark-filter-all-symbol" aria-hidden="true">全部</span><em>'+(allBookmarks.length||0)+'</em></button>'+BOOKMARK_STARS.map(function(x){return '<button type="button" class="side-bookmark-filter-chip star-'+x.star+' '+(String(state.bookmarkStarFilter)===String(x.star)?"active":"")+'" data-bookmark-filter="'+x.star+'" title="'+x.label+'：'+(starCounts[x.star]||0)+' 条">'+bookmarkStarImg(x.star,"bookmark-filter-image")+'<em>'+(starCounts[x.star]||0)+'</em></button>'}).join('')+'</div><input class="side-bookmark-slider" data-bookmark-slider type="range" min="0" max="6" step="1" value="'+(state.bookmarkStarFilter==="all"?0:Number(state.bookmarkStarFilter)||0)+'" aria-label="按书签星级筛选"><div class="side-bookmark-scale"><span>全部</span><span>1星</span><span>2星</span><span>3星</span><span>4星</span><span>5星</span><span>6星</span></div></div>';c.innerHTML=starFilterHtml+(arr2.length?'<div class="side-bulkbar"><label class="side-select-all"><input type="checkbox" data-side-select-all> <span>全选</span></label><span class="side-selected-count" data-side-selected-count></span><button type="button" class="side-bulk-delete" data-side-bulk-delete disabled title="删除所选">删除所选</button></div>'+arr2.map(function(a){var sm=Math.max(1,Math.min(6,Number(a.star)||1));var preview=String(a.text||"").replace(/\s+/g," " ).trim();if(!preview)preview="（未保存选中内容）";if(preview.length>42)preview=preview.slice(0,42)+"…";return '<div class="side-bookmark-row side-bookmark-row-star-'+sm+'"><label class="side-row-check" title="选择书签"><input type="checkbox" data-side-select-aid="'+esc(a.id)+'" aria-label="选择书签"></label><button class="side-bookmark-jump" data-aid="'+esc(a.id)+'" type="button"><span class="side-bookmark-title">'+bookmarkStarImg(sm,"side-bookmark-star-image")+'<i class="side-bookmark-star-glyphs" aria-hidden="true">'+bookmarkStarGlyphs(sm)+'</i></span><span class="side-bookmark-text" title="'+esc(preview)+'">'+esc(preview)+'</span></button><button class="side-bookmark-delete" data-delete-aid="'+esc(a.id)+'" type="button" title="删除书签" aria-label="删除书签"><img class="side-annotation-delete-icon" src="../img/ui/delete.png" alt=""></button></div>'}).join(""):'<div class="empty">'+(allBookmarks.length?'当前星级暂无书签':'暂无书签')+'</div>');wrapSideList(c,'.side-bookmark-manager');c.querySelectorAll('[data-bookmark-filter]').forEach(function(b){b.onclick=function(e){e.preventDefault();state.bookmarkStarFilter=b.dataset.bookmarkFilter||"all";clearSideSelection();renderSide()}});var bookmarkSlider=c.querySelector('[data-bookmark-slider]');if(bookmarkSlider)bookmarkSlider.oninput=function(){var v=Number(bookmarkSlider.value)||0;state.bookmarkStarFilter=v===0?"all":String(v);clearSideSelection();renderSide();requestAnimationFrame(function(){var n=c.querySelector('[data-bookmark-slider]');if(n){n.value=String(v);try{n.focus({preventScroll:true})}catch(_){}}syncManagedSideToReader()})}}c.querySelectorAll('[data-aid]').forEach(function(b){b.onclick=function(e){e.preventDefault();var a=state.annotations.find(function(x){return String(x.id)===String(b.dataset.aid)});if(!a)return;state.sideActiveId=String(a.id);c.querySelectorAll('.side-record-current').forEach(function(x){x.classList.remove('side-record-current');x.removeAttribute('aria-current')});b.classList.add('side-record-current');b.setAttribute('aria-current','location');jumpAnnotation(a)}});c.querySelectorAll('.side-content-note-jump[data-aid]').forEach(function(b){b.onclick=async function(e){e.preventDefault();var a=state.annotations.find(function(x){return String(x.id)===String(b.dataset.aid)});if(!a)return;await jumpAnnotation(a);openContentAnnotationEditor(a)}});c.querySelectorAll('[data-delete-aid]').forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();var a=state.annotations.find(function(x){return String(x.id)===String(b.dataset.deleteAid)});if(a)deleteAnnotation(a)}});c.querySelectorAll('[data-side-select-aid]').forEach(function(x){x.checked=!!sideSelectionBucket()[String(x.dataset.sideSelectAid)];x.onchange=function(e){e.stopPropagation();var bucket=sideSelectionBucket(),id=String(x.dataset.sideSelectAid);if(x.checked)bucket[id]=true;else delete bucket[id];updateSideSelectionUI()};x.onclick=function(e){e.stopPropagation()}});var master=c.querySelector('[data-side-select-all]');if(master)master.onchange=function(){var bucket=sideSelectionBucket();sideSelectable().forEach(function(a){var id=String(a.id);if(master.checked)bucket[id]=true;else delete bucket[id]});updateSideSelectionUI()};var bulk=c.querySelector('[data-side-bulk-delete]');if(bulk)bulk.onclick=function(e){e.preventDefault();e.stopPropagation();bulkDeleteSideSelection()};var exportAll=c.querySelector('[data-side-export-all]');if(exportAll)exportAll.onclick=function(e){e.preventDefault();e.stopPropagation();exportContentAnnotations(allNoteArr)};var exportSelected=c.querySelector('[data-side-export-selected]');if(exportSelected)exportSelected.onclick=function(e){e.preventDefault();e.stopPropagation();var bucket=sideSelectionBucket(),selected=sideSelectable().filter(function(a){return !!bucket[String(a.id)]});exportContentAnnotations(selected)};updateSideSelectionUI();syncManagedSideToReader()}
function setReaderChapterLabel(i,label){var el=$("chapter");if(!el)return;var v=String(label||"").trim();if(!v){var n=Number(i);v=Number.isFinite(n)?("第 "+(n+1)+" 节"):"正文";}el.textContent=v;el.title=v;}
function showChapter(i,offset,quote){if(!state.chapters.length)return;var __tocNode=null;if(state.toc&&state.activeTab==="toc"){var __find=function(nodes){for(var z=0;z<(nodes||[]).length;z++){var q=nodes[z];if(Number(q.index)===Number(i))return q;var r=__find(q.children);if(r)return r;}return null};__tocNode=__find(state.toc)}if(__tocNode&&globalThis.BookNoteCanonicalTocResolver){var __resolved=BookNoteCanonicalTocResolver.resolve(__tocNode,state.canonicalChapters.length?state.canonicalChapters:state.chapters);if(__resolved){i=__resolved.chapterIndex;offset=__resolved.localStart;quote=quote||"";}}i=Math.max(0,Math.min(state.chapters.length-1,i));state.currentChapter=i;setReaderChapterLabel(i,state.chapters[i]&&state.chapters[i].label);updateTocActive();$('progress').textContent=(state.chapters.length?Math.round((i+1)/state.chapters.length*100):0)+"%";if(state.runtime){state.runtime.show(i,Math.max(0,Number(offset)||0),quote||'');}else{document.querySelectorAll(".chapter").forEach(function(e){e.style.display=Number(e.dataset.chapterIndex)===i?"block":"none"});var el=document.querySelector('.chapter[data-chapter-index="'+i+'"]');if(el)$('viewport').scrollTop=offset?el.offsetTop+offset:el.offsetTop}persistReaderPosition(true);}
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
function scrollSpeechHighlight(){if(!state.runtime||!state.runtime.iframe)return;try{var d=state.runtime.iframe.contentDocument,m=d&&d.querySelector("mark.reader-speech-hit");if(m&&m.scrollIntoView)m.scrollIntoView({block:"center",inline:"nearest",behavior:"smooth"})}catch(_){}}
function strictReaderText(x){return String(x||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim()}
function wrapReaderRange(doc,start,end,className,attrName,attrValue,expectedText){if(!start||!end)return null;/* Hard visual-layer gate: Word/Phrase mode may never create a sentence Speech mark. */if((className==='reader-speech-hit'||className==='reader-speech-anchor')&&readerSpeechState&&readerSpeechState.wordFollowHighlight)return null;var r=doc.createRange();try{r.setStart(start.node,start.offset);r.setEnd(end.node,end.offset)}catch(_){return null}if(r.collapsed)return null;if(expectedText!=null&&strictReaderText(r.toString())!==strictReaderText(expectedText))return null;var root=doc.getElementById('source')||doc.body,walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[],n;while((n=walker.nextNode())){if(n.parentElement&&/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/i.test(n.parentElement.tagName))continue;nodes.push(n)}var startIndex=nodes.indexOf(start.node),endIndex=nodes.indexOf(end.node);if(startIndex<0||endIndex<0||startIndex>endIndex)return null;var parts=[];for(var i=startIndex;i<=endIndex;i++){var t=nodes[i],len=(t.nodeValue||'').length,a=i===startIndex?start.offset:0,b=i===endIndex?end.offset:len;if(b>a)parts.push({node:t,a:a,b:b})}if(!parts.length)return null;var marked=0;/* Split-and-wrap instead of Range.surroundContents(). Existing reader-highlight marks can overlap or cross; surroundContents rejects partially contained marks and can make one annotation disappear. Splitting the text node keeps text/locator content unchanged and permits nested highlight layers. */for(var j=parts.length-1;j>=0;j--){var part=parts[j],t=part.node;if(!t.parentNode)continue;try{t.splitText(part.b);var middle=t.splitText(part.a),m=doc.createElement('mark');m.className=className;if(attrName)m.setAttribute(attrName,String(attrValue));middle.parentNode.insertBefore(m,middle);m.appendChild(middle);marked++}catch(e){return null}}return marked===parts.length?true:null;}
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
  var status=$("searchStatus"),prev=$("prevHit"),next=$("nextHit");
  var total=Array.isArray(state.hits)?state.hits.length:0, index=Number(state.hitIndex);
  if(!status||!prev||!next)return;
  if(total<=0){status.textContent="";status.removeAttribute("data-search-stage");prev.disabled=true;next.disabled=true;return;}
  if(!Number.isFinite(index)||index<0)index=0;
  index=Math.min(index,total-1);
  status.textContent=mode==="failed"?(index+1)+" / "+total+" · 定位失败":mode==="searching"?"搜索中…":(index+1)+" / "+total;
  prev.disabled=total<2;next.disabled=total<2;
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
function buildIndependentPosition(s){
  if(!s)return null;
  var ep=s.epubLocator||((s.locator&&String(s.locator.type||'')==='epub')?s.locator:null);
  if(ep){
    var si=Number(ep.sectionIndex!=null?ep.sectionIndex:ep.spineIndex!=null?ep.spineIndex:s.chapterIndex),st=Number(ep.start!=null?ep.start:s.start),en=Number(ep.end!=null?ep.end:st);
    if(!Number.isFinite(si)||!Number.isFinite(st))return null;
    var ds=ep.documentStart!=null?Number(ep.documentStart):NaN,de=ep.documentEnd!=null?Number(ep.documentEnd):NaN;
    return {version:2,type:'epub',sectionIndex:si,sectionId:String(ep.sectionId||''),href:String(ep.href||''),start:Math.max(0,st),end:Math.max(Math.max(0,st),Number.isFinite(en)?en:st),documentStart:Number.isFinite(ds)?ds:null,documentEnd:Number.isFinite(de)?de:null,textQuote:ep.textQuote||{exact:String(s.text||''),prefix:'',suffix:''}};
  }
  var st2=Number(s.documentStart!=null?s.documentStart:s.start),en2=Number(s.documentEnd!=null?s.documentEnd:s.end);
  if(!Number.isFinite(st2))return null;
  if(!Number.isFinite(en2))en2=st2;
  return {version:2,type:'reflow',documentStart:Math.max(0,st2),documentEnd:Math.max(Math.max(0,st2),en2),textQuote:(s.locator&&s.locator.textQuote)||{exact:String(s.text||''),prefix:'',suffix:''}};
}
function positionFromAnnotation(a){if(!a)return null;return a.position||buildIndependentPosition(a);}
function validateIndependentPosition(a){var p=positionFromAnnotation(a);if(!p||p.version!==2)return false;if(p.type==='epub')return Number.isFinite(Number(p.sectionIndex))&&Number.isFinite(Number(p.start))&&Number.isFinite(Number(p.end))&&Number(p.end)>=Number(p.start);if(p.type==='reflow')return Number.isFinite(Number(p.documentStart))&&Number.isFinite(Number(p.documentEnd))&&Number(p.documentEnd)>=Number(p.documentStart);return false;}

function selectionOffsets(){var frame=state.runtime&&state.runtime.iframe;if(!frame)return null;try{var doc=frame.contentDocument,sel=doc.getSelection();if(!sel||!sel.rangeCount||sel.isCollapsed)return null;var range=sel.getRangeAt(0);if(!doc.body.contains(range.startContainer)||!doc.body.contains(range.endContainer))return null;var rawText=String(range.toString()||''),text=rawText.trim();if(!text)return null;/* Keep the exact DOM selection for locator construction; only the displayed annotation text is trimmed. */if(state.runtime.isEpubMulti&&state.runtime.isEpubMulti()&&state.runtime.epubAnchorFromRange){var anchor=state.runtime.epubAnchorFromRange(range,rawText);if(anchor){return {start:Number(anchor.start)||0,end:Number(anchor.end)||Number(anchor.start)||0,text:text,rawText:rawText,chapterIndex:Number(anchor.sectionIndex)||0,chapterLabel:(state.chapters[Number(anchor.sectionIndex)||0]||{}).label||'',progress:state.chapters.length?((Number(anchor.sectionIndex)||0)+1)/state.chapters.length:0,range:range,frame:frame,epubLocator:anchor,locator:anchor};}}/* The live iframe section is authoritative. state.currentChapter can lag behind after a section transition. */var currentIndex=Number(state.runtime.currentIndex);if(!Number.isFinite(currentIndex))currentIndex=Number(state.currentChapter)||0;var mapped=state.runtime.domRangeToCanonical(currentIndex,range,{annotation:true});if(!mapped)return null;var base=Number((state.canonicalChapters[currentIndex]||state.chapters[currentIndex]||{}).textStart)||0;return {start:base+Number(mapped.start||0),end:base+Number(mapped.end||0),text:text,rawText:rawText,chapterIndex:currentIndex,chapterLabel:(state.chapters[currentIndex]||{}).label||'',progress:state.chapters.length?(currentIndex+1)/state.chapters.length:0,range:range,frame:frame}}catch(_){return null}}
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
 overlay.querySelector('[data-save]').onclick=async function(){var text=String(overlay.querySelector('[data-note]').value||"").trim();if(!text){toast("请输入内容注释");return}var now=Date.now(),id=existing&&existing.id?String(existing.id):"content-annotation-"+now+"-"+Math.random().toString(36).slice(2,9),canon=state.canonicalChapters[s.chapterIndex]||state.chapters[s.chapterIndex]||{},base=Number(canon.textStart)||0,style=getContentAnnotationStyle(selectedStyle);var a={id:id,bookId:String(state.book.id),type:"note",text:String(s.text||""),note:text,color:style.color,contentAnnotationStyle:style.key,contentAnnotationColor:style.color,contentAnnotationLine:style.line,start:s.start,end:s.end,chapterIndex:s.chapterIndex,chapterLabel:s.chapterLabel,progress:s.progress,locator:(s.epubLocator||s.locator||(globalThis.BookNoteLocator?BookNoteLocator.fromRange(s.chapterIndex,Math.max(0,Number(s.start)-base),Math.max(0,Number(s.end)-base),s.text,{href:canon.href,fragment:canon.fragment,documentStart:Number(s.start)||0,documentEnd:Number(s.end)||Number(s.start)||0}):{chapterIndex:s.chapterIndex,offset:Math.max(0,Number(s.start)-base)})),epubLocator:s.epubLocator||((s.locator&&String(s.locator.type||'')==='epub')?s.locator:null),sourceType:"content-annotation",categoryType:"content-annotation",summaryMode:"content-annotation",position:buildIndependentPosition(s),positionVersion:2,source:"reader-content-annotation",createdAt:existing&&existing.createdAt||now,updatedAt:now};try{var saved=await BookNoteReadestBridge.saveAnnotation(a);state.annotations=state.annotations.filter(function(x){return String(x.id)!==String(id)});state.annotations.unshift(saved);close();renderSide();if(state.runtime&&state.runtime.iframe)await renderChapterContentAnnotations(state.runtime.iframe.contentDocument,state.currentChapter);clearSelection();toast(existing?"💾 内容注释已更新":"📖 内容注释已保存")}catch(e){console.error(e);toast("内容注释保存失败")}};setTimeout(function(){overlay.querySelector('[data-note]').focus()},0)
}

async function saveAnnotation(type,color){var s=state.selected||selectionOffsets();if(!s||!s.text)return toast("请先选择正文");var note="";if(type==="note"){note=prompt("请输入笔记：","");if(note===null)return}var canon=state.canonicalChapters[s.chapterIndex]||state.chapters[s.chapterIndex]||{},base=Number(canon.textStart)||0;var a={bookId:String(state.book.id),type:type,text:s.text,note:note,color:type==="highlight"?getHighlightColorMeta(color).key:"yellow",start:s.start,end:s.end,chapterIndex:s.chapterIndex,chapterLabel:s.chapterLabel,progress:s.progress,position:buildIndependentPosition(s),positionVersion:2,locator:(s.epubLocator||s.locator||(globalThis.BookNoteLocator?BookNoteLocator.fromRange(s.chapterIndex,Math.max(0,Number(s.start)-base),Math.max(0,Number(s.end)-base),s.text,{href:canon.href,fragment:canon.fragment,documentStart:Number(s.start)||0,documentEnd:Number(s.end)||Number(s.start)||0}):{chapterIndex:s.chapterIndex,offset:Math.max(0,Number(s.start)-base)})),epubLocator:s.epubLocator||((s.locator&&String(s.locator.type||'')==='epub')?s.locator:null)};var saved=await BookNoteReadestBridge.saveAnnotation(a);state.annotations.unshift(saved);renderSide();if(type==="highlight"){applyHighlight(saved)}if(type==="bookmark"){toast("已添加书签")}else if(type==="note"){toast("已保存笔记")}else toast("已保存高亮");clearSelection()}
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
function scrollResolvedPosition(res){if(!res||!res.range||!res.doc)return false;try{var r=res.range;if(r.collapsed){var probe=res.doc.createRange(),n=r.startContainer,o=Number(r.startOffset)||0;probe.setStart(n,o);if(n&&n.nodeType===3){var len=String(n.nodeValue||'').length;if(o<len)probe.setEnd(n,o+1);else if(o>0){probe.setStart(n,o-1);probe.setEnd(n,o);}}var rect=probe.getBoundingClientRect();if(scrollRectToReaderCenter(res.doc,rect))return true}var rect2=r.getBoundingClientRect();if(scrollRectToReaderCenter(res.doc,rect2))return true;r.scrollIntoView({block:'center'});if(state.runtime&&state.runtime.updateScrollState)state.runtime.updateScrollState();return true}catch(_){return false}}
function nextReaderFrame(doc){return new Promise(function(resolve){var win=doc&&doc.defaultView;if(!win||!win.requestAnimationFrame)return setTimeout(resolve,32);win.requestAnimationFrame(function(){win.requestAnimationFrame(resolve)})})}
function scrollHighlightMarkToCenter(doc,marks){if(!doc||!marks||!marks.length)return false;/* The first visual mark is the saved selection START. Never choose the largest
   fragment: a later line/paragraph can be larger and would make left-panel
   navigation appear inaccurate, especially for selections beginning at an
   indented paragraph boundary. */var first=marks[0];var rect=first.getBoundingClientRect();return scrollRectToReaderCenter(doc,rect)}
function unwrapAllReaderHighlightMarks(doc){if(!doc)return;try{readerSpeechDomMutationGuard(doc);doc.querySelectorAll("mark.reader-highlight").forEach(function(m){var p=m.parentNode;if(!p)return;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m)});readerSpeechNormalizeIfIdle(doc)}catch(e){console.warn("unwrap reader highlights failed",e)}}
async function renderChapterHighlights(doc,idx){if(!doc)return[];var token=++state.highlightRenderSeq,items=state.annotations.filter(function(a){return a&&a.type==="highlight"&&annotationBelongsToSection(a,idx)}).slice().sort(function(a,b){var sa=Number(a.start)||0,sb=Number(b.start)||0;if(sa!==sb)return sa-sb;var ea=Number(a.end)||sa,eb=Number(b.end)||sb;if(ea!==eb)return ea-eb;return String(a.id||"").localeCompare(String(b.id||""))});state.highlightRenderPromise=state.highlightRenderPromise.catch(function(){}).then(async function(){if(token!==state.highlightRenderSeq)return[];var out=[];for(var i=0;i<items.length;i++){if(token!==state.highlightRenderSeq)return out;var a=items[i],marks=findHighlightMarksById(doc,a.id);if(marks.length){out.push({annotation:a,marks:marks});continue;}var applied=null;/* EPUB pages are rebuilt asynchronously and a locator can be temporarily unavailable for one frame. Retry the same persisted locator without clearing any other annotation. */for(var retry=0;retry<4&&!applied;retry++){await nextReaderFrame(doc);if(token!==state.highlightRenderSeq)return out;if(state.runtime&&state.runtime.invalidatePositionMap)state.runtime.invalidatePositionMap(doc);applied=applyHighlight(a);}if(applied&&applied.marks&&applied.marks.length)out.push({annotation:a,marks:applied.marks});}await nextReaderFrame(doc);return out});return state.highlightRenderPromise}
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
 var absoluteStart=Number(pos.documentStart),absoluteEnd=Number(pos.documentEnd);if(!Number.isFinite(absoluteStart))return null;
 var located=globalThis.BookNoteLocator?BookNoteLocator.fromAbsolute(list,absoluteStart,Number.isFinite(absoluteEnd)?absoluteEnd:absoluteStart,String((pos.textQuote&&pos.textQuote.exact)||a.text||''),{textQuote:pos.textQuote}):null;
 if(!located)return null;
 var idx=Number(located.chapterIndex),canon=list[idx]||{},base=Number(canon.textStart)||0,start=Number(located.start),end=Number(located.end),query=String((pos.textQuote&&pos.textQuote.exact)||a.text||'');
 if(!Number.isFinite(start))return null;
 start=Math.max(base,Math.min(Number(canon.textEnd)!=null?Number(canon.textEnd):base+String(canon.text||'').length,start));
 end=Number.isFinite(end)?Math.max(start,Math.min(Number(canon.textEnd)!=null?Number(canon.textEnd):base+String(canon.text||'').length,end)):start;
 if(state.runtime.currentIndex!==idx)return null;
 if(state.runtime.invalidatePositionMap)state.runtime.invalidatePositionMap(state.runtime.iframe.contentDocument);
 var mapped=state.runtime.canonicalToDom(idx,start-base,end-base,query);if(!mapped||!mapped.start)return null;
 if(mapped.confidence!=='normalized-exact'&&mapped.confidence!=='quote-ordinal'&&mapped.confidence!=='quote-context'&&mapped.confidence!=='source-anchor-exact'&&mapped.confidence!=='txt-source-annotated-exact'&&mapped.confidence!=='unique-quote-exact')return null;
 var doc=state.runtime.iframe.contentDocument;if(!doc)return null;var r=doc.createRange();try{r.setStart(mapped.start.node,mapped.start.offset);r.setEnd((mapped.end&&mapped.end.node)||mapped.start.node,(mapped.end&&mapped.end.offset)!=null?mapped.end.offset:mapped.start.offset)}catch(_){return null}
 if(query&&strictReaderText(r.toString())!==strictReaderText(query))return null;
 return {doc:doc,mapped:mapped,range:r,index:idx,start:absoluteStart,end:Number.isFinite(absoluteEnd)?absoluteEnd:absoluteStart};
}
function applyHighlight(a){if(!state.runtime||!state.runtime.iframe||!a)return false;try{var res=resolveReaderPosition(a);if(!res||res.range.collapsed)return false;removeHighlightMarks(a.id);var color=getHighlightColorMeta(a.color).key;if(!wrapReaderRange(res.doc,res.mapped.start,res.mapped.end,'reader-highlight','data-annotation-id',a.id,String(a.text||'')))return false;readerSpeechDomMutationGuard(res.doc);var marks=res.doc.querySelectorAll('mark.reader-highlight[data-annotation-id="'+CSS.escape(String(a.id))+'"]');if(!marks.length)return false;var bgDay={yellow:"#FFE58A",red:"#F6B4B4",pink:"#F5C2DA",green:"#BFE3C5",blue:"#B9DCF0",purple:"#D7BEEB"},fgDay={yellow:"#20252B",red:"#2B1717",pink:"#351421",green:"#132318",blue:"#10212A",purple:"#24162D"},bgNight={yellow:"#8F7A22",red:"#7A4247",pink:"#7A465F",green:"#45664D",blue:"#405E70",purple:"#5B476C"},fgNight={yellow:"#FFF8D7",red:"#FFF0F0",pink:"#FFF0F7",green:"#F0FFF3",blue:"#F0FAFF",purple:"#F8F0FF"},palette=(state.themeMode==="night"?bgNight:bgDay),foreground=(state.themeMode==="night"?fgNight:fgDay);marks.forEach(function(m){m.setAttribute('data-color',color);var bg=palette[color]||palette.yellow,fg=foreground[color]||foreground.yellow;m.style.setProperty('background-color',bg,'important');m.style.setProperty('background',bg,'important');m.style.setProperty('color',fg,'important');m.style.setProperty('-webkit-text-fill-color',fg,'important');m.style.setProperty('text-shadow','none','important')});if(state.runtime.invalidatePositionMap)state.runtime.invalidatePositionMap(res.doc);return {doc:res.doc,marks:marks,resolved:res}}catch(err){console.warn('applyHighlight failed',err);return false}}
function contentAnnotationMarkerLayer(doc){var host=$("viewport");if(!host)return null;var layer=document.getElementById("booknoteContentAnnotationMarkerLayer");if(layer&&layer.parentNode===host)return layer;if(layer)layer.remove();layer=document.createElement("div");layer.id="booknoteContentAnnotationMarkerLayer";layer.className="booknote-content-annotation-marker-layer";layer.setAttribute("aria-hidden","false");host.appendChild(layer);return layer}
function clearContentAnnotationMarkers(){try{var layer=document.getElementById("booknoteContentAnnotationMarkerLayer");if(layer)layer.remove()}catch(_){} }
function contentAnnotationMarkerRect(doc,range){return bookmarkStartRect(doc,range)}
function contentAnnotationUnderlineBackground(style){var m=getContentAnnotationStyle(style),p=m.palette||[],svg,colors=p.map(function(c){return c.replace(/&/g,"&amp;").replace(/"/g,"&quot;")});if(m.key==="focus"){svg='<svg xmlns="http://www.w3.org/2000/svg" width="60" height="2" viewBox="0 0 60 2"><path d="M0 0H2 M6 0H8 M12 0H14 M18 0H20 M24 0H26 M30 0H32 M36 0H38 M42 0H44 M48 0H50 M54 0H56" stroke="'+colors[0]+'" stroke-width="2" stroke-linecap="butt"/></svg>';}else if(m.key==="insight"){svg='<svg xmlns="http://www.w3.org/2000/svg" width="60" height="2" viewBox="0 0 60 2"><path d="M1 1h0 M7 1h0 M13 1h0 M19 1h0 M25 1h0 M31 1h0 M37 1h0 M43 1h0 M49 1h0 M55 1h0" stroke="'+colors[0]+'" stroke-width="2" stroke-linecap="round"/></svg>';}else if(m.key==="receive"){svg='<svg xmlns="http://www.w3.org/2000/svg" width="60" height="2" viewBox="0 0 60 2"><defs><linearGradient id="g" x1="0" y1="0" x2="60" y2="0" gradientUnits="userSpaceOnUse">'+colors.map(function(c,i){return '<stop offset="'+(i/(colors.length-1)*100)+'%" stop-color="'+c+'"/>'}).join("")+'</linearGradient></defs><path d="M0 1H60" stroke="url(#g)" stroke-width="2" stroke-linecap="butt" stroke-dasharray="6 4" fill="none"/></svg>';}else return '';return 'url("data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg)+'")'}
function contentAnnotationUnderlineRects(doc,range){return bookmarkUnderlineRects(doc,range)}
function contentAnnotationMarkerFromRange(doc,a,range,idx,layer){if(!doc||!range||!layer)return null;var style=getContentAnnotationStyle(contentAnnotationStyleKey(a)),underlines=[],lineRects=contentAnnotationUnderlineRects(doc,range);for(var ui=0;ui<lineRects.length;ui++){var underline=document.createElement('div');underline.className='booknote-content-annotation-underline booknote-content-annotation-underline-'+style.key;underline.setAttribute('aria-hidden','true');underline.style.setProperty('--content-note-color',style.color);underline.style.backgroundImage=contentAnnotationUnderlineBackground(style.key);layer.appendChild(underline);underlines.push(underline)}var img=document.createElement("div");img.className="booknote-content-annotation-marker booknote-content-annotation-marker-"+style.key;img.setAttribute("role","button");img.setAttribute("aria-label","内容注释："+style.label);img.title="点击编辑内容注释";img.dataset.aid=String(a.id||"");img.innerHTML=contentAnnotationStyleIcon(style.key,"booknote-content-annotation-marker-image");img.__contentAnnotationAnchor={doc:doc,range:range,layer:layer,iframe:state.runtime&&state.runtime.iframe,annotation:a,underlines:underlines};layer.appendChild(img);img.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();openContentAnnotationEditor(a)},true);positionContentAnnotationMarker(img);return img}
function readerMarkerVisibleBottom(host,hostRect){var bottom=Math.max(0,host.clientHeight||0),nav=document.getElementById("bottomNavigator");if(nav&&nav.isConnected){var nr=nav.getBoundingClientRect(),overlapTop=nr.top-hostRect.top,overlapBottom=nr.bottom-hostRect.top;if(overlapTop>0&&overlapTop<bottom&&overlapBottom>overlapTop){bottom=Math.min(bottom,overlapTop)}}return bottom}
function positionContentAnnotationMarker(el){var meta=el&&el.__contentAnnotationAnchor;if(!meta)return false;var doc=meta.doc,range=meta.range,layer=meta.layer,iframe=meta.iframe,host=$("viewport");if(!doc||!range||!layer||!iframe||!host||!layer.isConnected||!iframe.isConnected)return false;var r=contentAnnotationMarkerRect(doc,range);if(!r)return false;var fr=iframe.getBoundingClientRect(),vr=host.getBoundingClientRect(),
      // v7.18.05: content annotations use the same compact marker geometry and
    // the same fixed gap to the marked text's first-line left boundary as bookmarks.
      size=40,markerHeight=40,markerGap=35;
    var contentLineMetrics=bookmarkLineMetrics(doc,range.startContainer,r);
    var contentLineTop=Number.isFinite(contentLineMetrics&&contentLineMetrics.top)?contentLineMetrics.top:r.top;
    var contentLineHeight=Number.isFinite(contentLineMetrics&&contentLineMetrics.height)?contentLineMetrics.height:r.height;
    var textStartX=fr.left+r.left-vr.left;
    var x=Math.max(4,textStartX-markerGap-size),y=fr.top+contentLineTop-vr.top+(contentLineHeight-markerHeight)/2;
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
    }catch(_){}
    el=el.parentElement;
  }
  return {height:fallback,top:rect.top};
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
  // v7.18.05: anchor the marker to the actual START OF THE FIRST VISUAL LINE
  // of the marked content.  Do not use a fixed reader gutter: narrow/medium/
  // wide layouts can have different text edges.  Both bookmark and content-
  // annotation markers use the same fixed gap from that edge.
  var markerGap=10;
  var textStartX=iframeRect.left+innerRect.left-hostRect.left;
  var x=Math.max(4,textStartX-markerGap-dims.width);
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
  var e=epubAnnotationSectionIndex(a);
  if(e!==null)return Number(e)===Number(idx);
  return Number(a&&a.chapterIndex)===Number(idx);
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
async function refreshAnnotations(){try{state.annotations=await BookNoteReadestBridge.listAnnotations(state.book.id);var repairs=[];state.annotations=state.annotations.map(function(a){var next=a;if(!validateIndependentPosition(a)){var p=buildIndependentPosition(a);if(p){next=Object.assign({},a,{position:p,positionVersion:2});repairs.push(next)}}if(isContentAnnotation(next)){var k=contentAnnotationStyleKey(next),m=getContentAnnotationStyle(k);next=Object.assign({},next,{contentAnnotationStyle:k,contentAnnotationColor:m.color,contentAnnotationLine:m.line,color:m.color})}return next});if(repairs.length){await Promise.all(repairs.map(function(a){return BookNoteReadestBridge.saveAnnotation(a).catch(function(e){console.warn('[Position Repair]',e)})}))}renderSide()}catch(e){console.warn(e)}}
function bnIcon(name,cls){return '<img class="bn-reader-icon ' +(cls||'') +'" src="'+browser.runtime.getURL("img/ui/"+name+".png")+'" alt="" aria-hidden="true">'}
async function jumpAnnotation(a){
  if(!a||!a.id)return;
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
    var abs=Number(pos.documentStart);
    var al=globalThis.BookNoteLocator?BookNoteLocator.fromAbsolute(list,abs,Number(pos.documentEnd),String((pos.textQuote&&pos.textQuote.exact)||fresh.text||''),{textQuote:pos.textQuote}):null;
    if(al){idx=Number(al.chapterIndex)||0;off=Math.max(0,Number(al.start)-(Number(list[idx]&&list[idx].textStart)||0));}
  }
  idx=Math.max(0,Math.min(state.chapters.length-1,Number.isFinite(idx)?idx:Number(fresh.chapterIndex)||0));
  if(state.runtime){
    var runtime=state.runtime;
    try{await runtime.show(idx,off,String(fresh.text||''));}catch(e){console.warn('annotation navigation failed',e);return;}
    if(Number(runtime.currentIndex)!==idx||!runtime.iframe){toast("记录定位失败");return;}
    var doc=runtime.iframe.contentDocument;
    await nextReaderFrame(doc);
    await refreshAnnotations();
    fresh=state.annotations.find(function(x){return String(x.id)===String(a.id)})||fresh;
    var resolved=resolveReaderPosition(fresh);
    if(!resolved){
      // One additional frame gives the EPUB live DOM/position map time to settle.
      await nextReaderFrame(doc);
      resolved=resolveReaderPosition(fresh);
    }
    if(resolved){
      if(fresh.type==='highlight'){
        await renderChapterHighlights(doc,idx);
        var marks=findHighlightMarksById(doc,fresh.id);
        if(marks.length)scrollHighlightMarkToCenter(doc,marks);else scrollResolvedPosition(resolved);
      }else if(fresh.type==='bookmark'){
        var bookmarkMarkers=await renderChapterBookmarks(doc,idx),targetMarker=bookmarkMarkers.find(function(x){return String(x.annotation.id)===String(fresh.id)});
        if(targetMarker&&targetMarker.range){var targetRect=bookmarkStartRect(doc,targetMarker.range);if(targetRect)scrollRectToReaderCenter(doc,targetRect);}
        else scrollResolvedPosition(resolved);
        refreshBookmarkMarkerPositions(doc);
      }else if(isContentAnnotation(fresh)){
        var contentMarkers=await renderChapterContentAnnotations(doc,idx),targetContent=contentMarkers.find(function(x){return String(x.annotation.id)===String(fresh.id)});
        if(targetContent&&targetContent.range){var cr=bookmarkStartRect(doc,targetContent.range);if(cr)scrollRectToReaderCenter(doc,cr);}else scrollResolvedPosition(resolved);
        refreshContentAnnotationMarkerPositions();
      }else{
        scrollResolvedPosition(resolved);
      }
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
    var a=await BookNoteReadestBridge.saveAnnotation({bookId:String(state.book.id),type:'bookmark',text:s?s.text:'',note:getBookmarkStarMeta(star).label,star:star,start:start,end:end,chapterIndex:idx,chapterLabel:(state.chapters[idx]||{}).label||'',progress:state.chapters.length?(idx+1)/state.chapters.length:0,position:buildIndependentPosition(s),positionVersion:2,locator:(s&&s.epubLocator?s.epubLocator:(globalThis.BookNoteLocator?BookNoteLocator.fromRange(idx,off,Math.max(off,Number(end)-base),s?s.text:'',{href:canon.href,fragment:canon.fragment,documentStart:Number(start)||0,documentEnd:Number(end)||Number(start)||0}):{chapterIndex:idx,offset:off})),epubLocator:s&&s.epubLocator?s.epubLocator:null});
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

var readerSpeechState={status:"idle",token:0,queue:[],index:0,utterance:null,/* Default: Word/Phrase visual follow ON; Sentence visual follow OFF. */sentenceFollowHighlight:false,wordFollowHighlight:true,source:null,selection:null,selectionKey:"",sessionId:0,currentSpeakText:"",currentSpeechItem:null,currentSentenceMark:null,currentLiveRange:null,currentWordAbsStart:-1,currentWordAbsEnd:-1,currentBoundaryIndex:0,currentBoundaryLength:0,lastBoundaryTimeStamp:-1,speechCharacterMap:null,lastFollowScrollAt:0,lastFollowScrollTop:null,followInitialCenter:true};
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
 $("readHomeBtn").onclick=function(){readerSpeechExplicitRestart(readerSpeechAllText(),{useEpub:true,sectionIndex:0,offset:0});};
 $("readCurrentBtn").onclick=function(){var s=state.selected||selectionOffsets();if(s&&s.text&&state.runtime&&state.runtime.isEpubMulti&&state.runtime.isEpubMulti()&&s.epubLocator){readerSpeechStart(s.text,{useEpub:true,sectionIndex:Number(s.epubLocator.sectionIndex)||0,offset:Number(s.epubLocator.start)||0,source:"selection-position",selection:s});}else{var selected=readerSpeechSelected();if(selected){var all=readerSpeechFromCurrent(),pos=all.indexOf(selected);readerSpeechStart(pos>=0?all.slice(pos):all,{source:"current-selection"});}else readerSpeechStart(readerSpeechFromCurrent());}};
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
        }else if(!dragging){state.selected=null;var tb=$('selectionToolbar');if(tb)tb.hidden=true;}},delay||20)}d.addEventListener('mousedown',function(e){if(e.button!==0)return;dragging=true;seq++;var tb=$('selectionToolbar');if(tb)tb.hidden=true;},true);d.addEventListener('mousemove',function(){if(dragging) scheduleUpdate(45);},true);d.addEventListener('mouseup',function(){dragging=false;scheduleUpdate(0);},true);d.addEventListener('pointerup',function(){dragging=false;scheduleUpdate(0);},true);d.addEventListener('keyup',function(){scheduleUpdate(0);},true);d.addEventListener('selectionchange',function(){scheduleUpdate(dragging?45:0);},true);d.addEventListener("keydown",function(e){readerSpeechHandleSpaceKey(e);},true);d.addEventListener('click',function(e){if(dragging)return;var s=d.getSelection&&d.getSelection();if(!s||s.isCollapsed){clearSelection();}},true);d.addEventListener('scroll',function(){seq++;var tb=$('selectionToolbar');if(tb)tb.hidden=true;refreshBookmarkMarkerPositions(d);refreshContentAnnotationMarkerPositions();}, {passive:true});
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
   if(officeRebuilt.length>=1&&(officeExisting.length<=1||officeGap||officeRebuilt.length>officeExisting.length)){
     state.chapters=officeRebuilt;
   }
 }
 if(String(m.documentFormat||'').toLowerCase()==='txt'){var txtTitle=String(m.documentTitle||m.name||'').trim(),txtText=String(c&&c.text||''),txtRebuilt=recoverTxtReaderChapters(c,txtTitle);/* TXT v3.0: the strict source-text detector is authoritative. If structure cannot be proven, replace any legacy/false TOC with one complete body section. */if(txtRebuilt.length){state.chapters=txtRebuilt;}else{state.chapters=[{index:0,label:txtTitle||'正文',href:'',textStart:0,textEnd:txtText.length,text:txtText,html:String(c&&c.html||''),headingLevel:0,isNavigation:false}];}}
 if(globalThis.BookNoteTxtCanonical&&state.chapters.length){state.chapters=BookNoteTxtCanonical.normalize({title:txtTitle,text:String(c&&c.text||''),html:String(c&&c.html||''),chapters:state.chapters});var __tv=BookNoteTxtCanonical.validate(state.chapters,String(c&&c.text||'').length);if(!__tv.ok)console.warn('[BookNote Canonical TXT] validation failed',__tv.errors);}
 if(globalThis.BookNoteReadestRuntime){var progressState=await BookNoteReadestBridge.loadProgress(m.id),savedLocator=progressState&&progressState.locator||{},isSavedEpub=String(savedLocator.type||savedLocator.format||'')==='epub',savedChapter=Number(isSavedEpub?(savedLocator.sectionIndex!=null?savedLocator.sectionIndex:savedLocator.spineIndex):savedLocator.chapterIndex),savedOffset=Number(isSavedEpub?(savedLocator.start!=null?savedLocator.start:savedLocator.localStart):savedLocator.start!=null?savedLocator.start:savedLocator.offset)||0;var hasSaved=!!(progressState&&progressState.locator&&Number.isFinite(savedChapter)&&savedChapter>=0&&(savedOffset>0||Number(progressState.progress)>0));var initialChapter=hasSaved?savedChapter:requestedChapter;var initialOffset=hasSaved?savedOffset:0;$('content').classList.add('runtime-active');clearTimeout(state.readingSaveTimer);state.readingSaveTimer=null;state.readingLastSavedKey="";state.runtime=new BookNoteReadestRuntime.ReadestRuntime({viewport:$('viewport'),content:$('content'),toc:$('sideContent')});state.runtime.initialIndex=Number.isFinite(initialChapter)?initialChapter:0;state.runtime.initialOffset=initialOffset;state.runtime.setDisplayMode("scroll");state.runtime.setTheme({name:state.themeName,mode:state.themeMode});state.runtime.addEventListener('scrollstate',function(e){var d=e.detail||{};state.currentChapter=Number(d.index)||0;var sec=state.chapters[state.currentChapter]||{};$('chapter').textContent=sec.label||"";updateTocActive();$('progress').textContent=Math.round(readerProgressForPosition(state.currentChapter,Number(d.offset)||0)*100)+"%";updateScrollSlider();syncManagedSideToReader();persistReaderPosition(false);});state.runtime.addEventListener('relocate',function(e){var d=e.detail||{},sec=d.section||state.chapters[d.index]||{};state.currentChapter=Number(d.index)||0;$('chapter').textContent=sec.label||"";state.tocActiveIndex=-1;updateTocActive();$('progress').textContent=Math.round(readerProgressForPosition(state.currentChapter,Number(d.offset)||0)*100)+"%";updateScrollSlider();syncManagedSideToReader();persistReaderPosition(true);});state.canonicalChapters=(state.chapters&&state.chapters.length)?state.chapters:((state.content&&Array.isArray(state.content.chapters)&&state.content.chapters.length)?state.content.chapters:[]);if(typeof BookNoteCanonical!=="undefined"&&state.canonicalChapters.length){var __cv=BookNoteCanonical.validateCoverage(state.canonicalChapters,state.canonicalChapters[state.canonicalChapters.length-1].textEnd);if(!__cv.ok)console.warn("[BookNote Canonical] reader chapter coverage validation failed",__cv.errors);}if(state.runtime.setCanonicalSections)state.runtime.setCanonicalSections(state.canonicalChapters);buildCanonicalDocumentModel();var runtimeContent=c;
    // DOCX/TXT: their raw source-open paths would rebuild the book as a single
    // section and discard our normalized chapters. Use the indexed HTML + stored
    // chapters so their TOC/navigation chain reaches the same Reader path as ODT.
    if((String(m.documentFormat||'').toLowerCase()==='docx' || String(m.documentFormat||'').toLowerCase()==='txt') && state.chapters.length){
      runtimeContent=Object.assign({},c,{chapters:state.chapters});
    }
    var book;try{
      var runtimeFormat=String(m.documentFormat||'').toLowerCase();
      book=((runtimeFormat==='docx' || runtimeFormat==='txt'))
        ? await state.runtime.openContent(runtimeContent,m)
        : (state.source&&state.source.blob?await state.runtime.open(state.source,m):await state.runtime.openContent(c,m));
    }catch(runtimeError){console.warn('Readest runtime source open failed; falling back to indexed content',runtimeError);book=await state.runtime.openContent(runtimeContent,m)}
    state.chapters=book.sections;state.toc=Array.isArray(book.toc)?book.toc:[];if(!state.canonicalChapters.length)state.canonicalChapters=state.chapters;if(state.runtime.setCanonicalSections)state.runtime.setCanonicalSections(state.canonicalChapters);buildCanonicalDocumentModel();$("content").hidden=false;await refreshAnnotations();renderSide();bindFrameSelection();openDefaultDirectory();if(state.runtime.setDisplayMode)state.runtime.setDisplayMode("scroll");if(requestedStart!=null)state.runtime.jumpGlobal(Number(requestedStart),requestedQuery||'');if(requestedQuery){$("searchBar").hidden=false;$("searchInput").value=requestedQuery;runSearch(requestedQuery)}return}
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
