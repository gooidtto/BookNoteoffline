/* BookNote v7.17.05 — Speech Highlight Core
 * Scope: speech visualisation only.
 * Does not alter EPUB/ODT/DOCX/TXT parsing, import/export, or canonical data.
 * Positioning is immutable-source -> live Range; painting is a non-DOM overlay.
 */
(function(global){
  'use strict';
  var active={doc:null,range:null,kind:null,root:null,scrollHandler:null};
  var LEGACY=/^reader-speech-(?:hit|anchor|word-hit)$/;
  /* v7.17.05: reader.js already contains the strict TXT absolute-character
     resolver (including the high-frequency run lock).  The visual core must
     never replace that TXT coordinate contract with a generic token resolver.
     Capture it before installing the core API and delegate TXT to it. */
  var originalIndependentWordRange=global.readerSpeechIndependentWordRange;

  function getDoc(){return active.doc||(global.state&&global.state.runtime&&global.state.runtime.iframe&&global.state.runtime.iframe.contentDocument)||null;}
  function clearOverlay(doc){
    doc=doc||getDoc();
    if(!doc)return;
    try{var root=doc.getElementById('booknote-speech-overlay');if(root&&root.parentNode)root.parentNode.removeChild(root);}catch(_){ }
    if(active.scrollHandler){try{doc.removeEventListener('scroll',active.scrollHandler,true);}catch(_){} }
    active={doc:null,range:null,kind:null,root:null,scrollHandler:null};
  }
  function ensureRoot(doc){
    var root=doc.getElementById('booknote-speech-overlay');
    if(root)return root;
    root=doc.createElement('div');
    root.id='booknote-speech-overlay';
    root.setAttribute('aria-hidden','true');
    root.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483646;overflow:hidden;';
    (doc.documentElement||doc.body).appendChild(root);
    return root;
  }
  function paintRange(doc,range,kind){
    if(!doc||!range||range.collapsed)return false;
    var text='';try{text=String(range.toString()||'');}catch(_){return false;}
    if(!text)return false;
    clearOverlay(doc);
    var root=ensureRoot(doc),rects=[];
    try{rects=Array.prototype.slice.call(range.getClientRects()).filter(function(r){return r&&r.width>0&&r.height>0;});}catch(_){rects=[];}
    if(!rects.length)return false;
    var frag=doc.createDocumentFragment();
    rects.forEach(function(r){
      var box=doc.createElement('i');
      box.className='booknote-speech-overlay-'+kind;
      box.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+Math.max(1,r.height)+'px;background:var(--reader-accent,#5B8CFF);opacity:.42;border-radius:2px;pointer-events:none;box-sizing:border-box;';
      frag.appendChild(box);
    });
    root.appendChild(frag);
    active={doc:doc,range:range.cloneRange(),kind:kind,root:root,scrollHandler:null};
    var onScroll=function(){
      if(!active.range||active.doc!==doc)return;
      var saved=active.range.cloneRange(),k=active.kind;
      try{paintRange(doc,saved,k);}catch(_){ }
    };
    active.scrollHandler=onScroll;
    try{doc.addEventListener('scroll',onScroll,true);}catch(_){ }
    return true;
  }
  function removeLegacySpeechMarks(doc){
    if(!doc)return;
    try{
      doc.querySelectorAll('mark.reader-speech-hit,mark.reader-speech-anchor,mark.reader-speech-word-hit').forEach(function(m){
        var p=m.parentNode;if(!p)return;
        while(m.firstChild)p.insertBefore(m.firstChild,m);
        p.removeChild(m);
      });
    }catch(_){ }
  }
  function normalizeSourceText(s){return String(s==null?'':s);}
  function cjkCodeUnitEnd(text,i){
    var cp=String(text).codePointAt(i);return i+(cp!=null&&cp>0xFFFF?2:1);
  }
  function tokenEnd(text,ci,cl){
    var q=normalizeSourceText(text),n=q.length;
    ci=Math.max(0,Math.min(n,Math.floor(Number(ci)||0)));
    cl=Math.max(0,Math.floor(Number(cl)||0));
    if(ci>=n)return null;
    if(cl>0)return {start:ci,end:Math.min(n,ci+cl)};
    var ch=q.charAt(ci),cjk=/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(ch);
    if(cjk)return {start:ci,end:cjkCodeUnitEnd(q,ci)};
    if(/[\s\u00a0]/.test(ch))return {start:ci,end:Math.min(n,ci+1)};
    var punct=/[，。！？；：、,.!?;:"'“”‘’()（）\[\]【】<>《》]/;
    var e=ci;
    while(e<n){
      var c=q.charAt(e);
      if(/\s|\u00a0/.test(c)||punct.test(c))break;
      e++;
    }
    return {start:ci,end:Math.max(ci+1,e)};
  }
  function makeRange(doc,item,text,ci,cl){
    if(!doc||!item)return null;
    var seg=tokenEnd(text,ci,cl);if(!seg)return null;
    var idx=Math.max(0,Number(item.sectionIndex)||0);
    var start=Number(item.start)||0;
    var s=start+seg.start,e=start+seg.end;
    try{
      var rt=global.state&&global.state.runtime;
      if(rt&&rt.isEpubMulti&&rt.isEpubMulti()){
        var sec=rt.book&&rt.book.sections&&rt.book.sections[idx],api=global.BookNoteEpubMultiModule;
        if(!sec||!api||!api.buildSection||!api.rangeFor)return null;
        var model=api.buildSection(sec,doc),raw=model&&model.textIndex;
        if(!raw)return null;
        var localS=s,localE=e;
        if(localS<0||localE>raw.text.length||localE<=localS)return null;
        var pts=api.rangeFor(raw,localS,localE);if(!pts)return null;
        var rr=doc.createRange();rr.setStart(pts.start.node,pts.start.offset);rr.setEnd(pts.end.node,pts.end.offset);
        if(rr.collapsed||String(rr.toString())!==String(text).slice(seg.start,seg.end))return null;
        return {range:rr,absoluteStart:s,absoluteEnd:e,boundarySourceStart:s};
      }
      if(!rt||!rt.canonicalToDom)return null;
      var mapped=rt.canonicalToDom(idx,s,e,String(text).slice(seg.start,seg.end),{strict:true});
      if(!mapped||!mapped.start||!mapped.end)return null;
      var r=doc.createRange();r.setStart(mapped.start.node,mapped.start.offset);r.setEnd(mapped.end.node,mapped.end.offset);
      if(r.collapsed)return null;
      if(global.strictReaderText&&global.strictReaderText(r.toString())!==global.strictReaderText(String(text).slice(seg.start,seg.end)))return null;
      return {range:r,absoluteStart:s,absoluteEnd:e,boundarySourceStart:s};
    }catch(_){return null;}
  }
  function makeSentenceRange(item,text,doc){
    if(!item||!doc)return null;
    var idx=Math.max(0,Number(item.sectionIndex)||0),s=Math.max(0,Number(item.start)||0),e=Math.max(s,Number(item.end));
    if(!(e>s))e=s+String(text||'').length;
    try{
      var rt=global.state&&global.state.runtime;
      if(rt&&rt.isEpubMulti&&rt.isEpubMulti()){
        var sec=rt.book&&rt.book.sections&&rt.book.sections[idx],api=global.BookNoteEpubMultiModule;
        if(!sec||!api)return null;
        var model=api.buildSection(sec,doc),pts=api.rangeFor(model.textIndex,s,e);if(!pts)return null;
        var er=doc.createRange();er.setStart(pts.start.node,pts.start.offset);er.setEnd(pts.end.node,pts.end.offset);
        return er.collapsed?null:er;
      }
      if(!rt||!rt.canonicalToDom)return null;
      var mapped=rt.canonicalToDom(idx,s,e,String(text||''),{strict:true});if(!mapped)return null;
      var r=doc.createRange();r.setStart(mapped.start.node,mapped.start.offset);r.setEnd(mapped.end.node,mapped.end.offset);
      if(r.collapsed)return null;
      return r;
    }catch(_){return null;}
  }

  var originalWrap=global.wrapReaderRange;
  global.wrapReaderRange=function(doc,start,end,className,attrName,attrValue,expectedText){
    if(className==='reader-speech-word-hit'||className==='reader-speech-hit'||className==='reader-speech-anchor'){
      try{
        var r=doc.createRange();r.setStart(start.node,start.offset);r.setEnd(end.node,end.offset);
        if(r.collapsed)return null;
        if(expectedText!=null&&global.strictReaderText&&global.strictReaderText(r.toString())!==global.strictReaderText(expectedText))return null;
        return paintRange(doc,r,className==='reader-speech-word-hit'?'word':'sentence');
      }catch(_){return null;}
    }
    return originalWrap?originalWrap.apply(this,arguments):null;
  };

  global.readerSpeechResolveFollowScrollRoot=function(doc){
    if(!doc)return null;
    try{
      var body=doc.body,sc=doc.scrollingElement,win=doc.defaultView||window;
      if(body){var by=String(win.getComputedStyle(body).overflowY||'').toLowerCase();if((by==='auto'||by==='scroll')&&body.scrollHeight>body.clientHeight+2)return body;}
      if(sc&&sc.scrollHeight>sc.clientHeight+2)return sc;
      if(body&&body.scrollHeight>body.clientHeight+2)return body;
      return sc||doc.documentElement||body;
    }catch(_){return doc.scrollingElement||doc.documentElement||doc.body;}
  };

  global.readerSpeechIndependentWordRange=function(item,text,charIndex,charLength){
    var doc=global.state&&global.state.runtime&&global.state.runtime.iframe&&global.state.runtime.iframe.contentDocument;
    if(doc&&doc.body&&doc.body.classList&&doc.body.classList.contains('reader-format-txt')&&typeof originalIndependentWordRange==='function'){
      /* TXT is the one format whose Speech boundary must remain bound to the
         immutable UTF-16 source map.  In particular, high-frequency chars
         must use the absolute-position run lock in reader.js. */
      try{return originalIndependentWordRange(item,text,charIndex,charLength);}catch(_){return null;}
    }
    return makeRange(doc,item,String(text||''),charIndex,charLength);
  };
  global.readerSpeechPaintWordRange=function(doc,range){return paintRange(doc,range,'word');};
  global.readerSpeechResolveLiveRange=function(item){
    var doc=global.state&&global.state.runtime&&global.state.runtime.iframe&&global.state.runtime.iframe.contentDocument;
    return makeSentenceRange(item,item&&item.text||'',doc);
  };
  global.clearSpeechWordMarks=function(){
    var doc=getDoc();clearOverlay(doc);if(doc)removeLegacySpeechMarks(doc);
    try{var win=doc&&doc.defaultView;if(win&&win.CSS&&win.CSS.highlights)win.CSS.highlights.delete('booknote-speech-word');}catch(_){ }
    try{if(global.state&&global.state.runtime&&global.state.runtime.invalidatePositionMap)global.state.runtime.invalidatePositionMap(doc);}catch(_){ }
    if(global.readerSpeechInvalidateCharacterMap)global.readerSpeechInvalidateCharacterMap();
  };
  global.readerSpeechPurgeSentenceVisual=function(doc){clearOverlay(doc);if(doc)removeLegacySpeechMarks(doc);};
  global.clearSpeechMarks=function(){var doc=getDoc();clearOverlay(doc);if(doc)removeLegacySpeechMarks(doc);};
  global.scrollSpeechHighlight=function(){
    var doc=getDoc(),r=active.range;if(!doc||!r)return;
    try{
      var root=global.readerSpeechResolveFollowScrollRoot(doc),rect=r.getBoundingClientRect();
      if(!root||!rect)return;
      var isDocumentScroller=(root===doc.scrollingElement||root===doc.documentElement||root===doc.body);
      var vr=(!isDocumentScroller&&root.getBoundingClientRect)?root.getBoundingClientRect():null;
      var top=vr?Number(vr.top)||0:0;
      var h=Math.max(1,root.clientHeight||doc.defaultView.innerHeight);
      var t=(rect.top-top),b=(rect.bottom-top);
      var safeTop=h*0.12,safeBottom=h*0.88,delta=0;
      if(t<safeTop)delta=t-safeTop;
      else if(b>safeBottom)delta=b-safeBottom;
      if(Math.abs(delta)<=1)return;
      var current=Number(root.scrollTop)||0,max=Math.max(0,(Number(root.scrollHeight)||0)-h);
      var target=Math.max(0,Math.min(max,current+delta));
      root.scrollTo({top:target,left:Number(root.scrollLeft)||0,behavior:'auto'});
    }catch(_){ }
  };

  global.__BookNoteSpeechHighlightCoreV1700={version:'7.17.00',clear:clearOverlay,paint:paintRange,range:makeRange,sentenceRange:makeSentenceRange};
})(typeof globalThis!=='undefined'?globalThis:window);
