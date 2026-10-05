/* BookNote Canonical Locator Engine v1.0.
 * Phase 3: shared locator persistence for bookmarks, annotations and reading position.
 * DOM Range objects are never persisted; only logical positions + quote anchors.
 */
(function(root){
  'use strict';
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function s(v){return String(v==null?'':v);}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function quoteFrom(text,start,end){
    var t=s(text),a=clamp(n(start,0),0,t.length),b=clamp(n(end,a),a,t.length);
    return {exact:t.slice(a,b),prefix:t.slice(Math.max(0,a-48),a),suffix:t.slice(b,Math.min(t.length,b+48))};
  }
  function normalizeQuote(q){q=q||{};return {exact:s(q.exact),prefix:s(q.prefix),suffix:s(q.suffix)};}
  function reflow(o){
    o=o||{};
    var start=n(o.start,o.offset!=null?n(o.offset,0):0), end=n(o.end,start);
    return {type:'reflow',chapterIndex:Math.max(0,n(o.chapterIndex,0)),start:Math.max(0,start),end:Math.max(Math.max(0,start),end),documentStart:o.documentStart!=null?n(o.documentStart,0):null,documentEnd:o.documentEnd!=null?n(o.documentEnd,Math.max(0,start)):null,href:s(o.href),fragment:s(o.fragment),textQuote:normalizeQuote(o.textQuote||o.quote)};
  }
  function fixed(o){
    o=o||{};var r=o.rect||{};
    return {type:'fixed',page:Math.max(0,n(o.page,0)),rect:{x:n(r.x,0),y:n(r.y,0),width:Math.max(0,n(r.width,0)),height:Math.max(0,n(r.height,0))},textQuote:normalizeQuote(o.textQuote||o.quote)};
  }
  function fromRange(chapterIndex,start,end,text,extra){
    extra=extra||{};return reflow({chapterIndex:chapterIndex,start:start,end:end,documentStart:extra.documentStart,documentEnd:extra.documentEnd,href:extra.href,fragment:extra.fragment,textQuote:extra.textQuote||quoteFrom(text,start,end)});
  }
  function fromAbsolute(chapters,start,end,text,extra){
    var list=Array.isArray(chapters)?chapters:[],p=n(start,0),e=n(end,p),idx=0;
    for(var i=0;i<list.length;i++){
      var c=list[i]||{},cs=n(c.textStart,0),ce=n(c.textEnd,cs+s(c.text).length);
      if(p>=cs&&p<=ce){idx=i;break;}
    }
    var c=list[idx]||{},base=n(c.textStart,0),localStart=Math.max(0,p-base),localEnd=Math.max(localStart,e-base),sourceText=s(c.text||text),quote=(extra&&extra.textQuote)||quoteFrom(sourceText,localStart,localEnd);
    return reflow({chapterIndex:idx,start:Math.max(0,p-base),end:Math.max(0,e-base),documentStart:p,documentEnd:e,href:c.href,fragment:c.fragment,textQuote:quote});
  }
  function toAbsolute(locator,chapters){
    var l=reflow(locator),c=(Array.isArray(chapters)?chapters:[])[l.chapterIndex]||{},base=n(c.textStart,0),len=Math.max(0,n(c.textEnd,base+s(c.text).length)-base);
    var useGlobal=l.documentStart!=null&&Number.isFinite(Number(l.documentStart));
    var a=useGlobal?clamp(Number(l.documentStart)-base,0,len):clamp(l.start,0,len),b=useGlobal?(l.documentEnd!=null?clamp(Number(l.documentEnd)-base,a,len):a):clamp(l.end,a,len);
    return {chapterIndex:l.chapterIndex,start:base+a,end:base+b,offset:a,href:l.href||s(c.href),fragment:l.fragment||s(c.fragment),textQuote:l.textQuote};
  }
  function resolve(locator,chapters){
    if(!locator||locator.type==='fixed')return null;
    return toAbsolute(locator,chapters);
  }
  function fixedFromSelection(page,rect,text,start,end){return fixed({page:page,rect:rect,textQuote:(start!=null?quoteFrom(text,start,end):{exact:s(text),prefix:'',suffix:''})});}
  root.BookNoteLocator={version:'1.2.0',quoteFrom:quoteFrom,normalizeQuote:normalizeQuote,reflow:reflow,fixed:fixed,fromRange:fromRange,fromAbsolute:fromAbsolute,toAbsolute:toAbsolute,resolve:resolve,fixedFromSelection:fixedFromSelection};
})(typeof window!=='undefined'?window:self);
