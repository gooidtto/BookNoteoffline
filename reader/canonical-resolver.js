/* BookNote Unified Locator Resolver v1.0.
 * Single resolution boundary for reflow/fixed locators.
 * Does not alter Search Worker or document opening paths.
 */
(function(root){
  'use strict';
  function n(v,d){var x=Number(v);return Number.isFinite(x)?x:d;}
  function s(v){return String(v==null?'':v);}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function quoteOf(locator){return locator&&locator.textQuote?s(locator.textQuote.exact):'';}
  function resolveReflow(locator,chapters){
    var L=root.BookNoteLocator;if(!L||!locator||locator.type==='fixed')return null;
    var a=L.resolve(locator,chapters||[]);if(!a)return null;
    return {type:'reflow',chapterIndex:a.chapterIndex,start:a.offset,end:a.end-a.start,absoluteStart:a.start,absoluteEnd:a.end,quote:quoteOf(locator),href:a.href||'',fragment:a.fragment||'',locator:locator};
  }
  function resolveFixed(locator){
    if(!locator||locator.type!=='fixed')return null;
    var r=locator.rect||{};
    return {type:'fixed',page:Math.max(0,n(locator.page,0)),rect:{x:n(r.x,0),y:n(r.y,0),width:Math.max(0,n(r.width,0)),height:Math.max(0,n(r.height,0))},quote:quoteOf(locator),locator:locator};
  }
  function resolveSearchHit(hit,chapters){
    hit=hit||{};
    // EPUB hits use their own multi-module coordinate system. Do not pass an
    // EPUB locator through the generic reflow resolver: an EPUB locator has
    // spineIndex/sectionIndex + local offsets, not canonical chapterIndex +
    // absolute offsets. Doing so previously collapsed every EPUB hit onto
    // chapter 0 and caused the final DOM locator to fail.
    if(hit.locator&&hit.locator.type==='epub'){
      var el=hit.locator;
      var sec=el.sectionIndex!=null?el.sectionIndex:(el.spineIndex!=null?el.spineIndex:hit.sectionIndex);
      var ls=el.start!=null?Number(el.start):(hit.localStart!=null?Number(hit.localStart):Number(hit.start)||0);
      var le=el.end!=null?Number(el.end):(hit.localEnd!=null?Number(hit.localEnd):ls);
      return {type:'epub',kind:'search-hit',chapterIndex:Math.max(0,Math.floor(n(sec,0))),start:Math.max(0,ls),end:Math.max(Math.max(0,ls),le),quote:quoteOf(el)||s(hit.quote||hit.text),locator:el,hit:hit};
    }
    if(hit.locator){
      var r=hit.locator.type==='fixed'?resolveFixed(hit.locator):resolveReflow(hit.locator,chapters);
      if(r)return Object.assign(r,{kind:'search-hit',hit:hit});
    }
    var idx=Math.max(0,Math.floor(n(hit.chapterIndex,0))), c=(chapters||[])[idx]||{},base=n(c.textStart,0),start=n(hit.start,base),end=n(hit.end,start);
    return {type:'reflow',kind:'search-hit',chapterIndex:idx,start:Math.max(0,start-base),end:Math.max(0,end-start),absoluteStart:start,absoluteEnd:end,quote:s(hit.quote||hit.text),locator:null,hit:hit};
  }
  function resolveAnnotation(item,chapters){
    if(!item)return null;
    if(item.locator)return item.locator.type==='fixed'?resolveFixed(item.locator):resolveReflow(item.locator,chapters);
    return resolveSearchHit(item,chapters);
  }
  root.BookNoteLocatorResolver={version:'1.0.0',resolveReflow:resolveReflow,resolveFixed:resolveFixed,resolveSearchHit:resolveSearchHit,resolveAnnotation:resolveAnnotation};
})(typeof window!=='undefined'?window:self);
